/**
 * Bounty Crank — Automated Payout + AI Oracle Dispute Resolver
 *
 * Runs every hour. Two sweeps:
 *   1. PendingReview: executes payout once 48-hour optimistic window expires (legacy).
 *   2. Disputed: fetches original + translation from Arweave, calls AI oracle (GPT-5.4-mini),
 *      and submits resolve_dispute with the backend keypair.
 */

import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import OpenAI from 'openai';
import cron from 'node-cron';
import 'dotenv/config';

// ─── Config ─────────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey(
  process.env.BOUNTY_PROGRAM_ID ?? '5kRPV7z2BUQn5rEXAhAPbBdHGU4KAYKo8FXBwmG3ahiP'
);
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
);
const IRYS_GATEWAY = process.env.IRYS_GATEWAY ?? 'https://devnet.irys.xyz';
const RELAYER_URL = process.env.RELAYER_URL ?? 'http://localhost:4001';
const REVIEW_WINDOW_SECS = 48 * 60 * 60;
const VALIDATION_STALE_SECS = 7 * 24 * 60 * 60;
const CRON_SCHEDULE = process.env.CRANK_SCHEDULE ?? '0 * * * *';

// ─── IDL ─────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const IDL = require('../../lib/idl/translation_bounty.json');

// ─── AI Oracle ───────────────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ORACLE_RUBRIC = `You are the final arbiter of a translation quality dispute.
Given the original text and its translation, return ONLY a JSON object: {"approve": true}  or  {"approve": false}
Criteria for approve=true (all must hold):
  - Semantic intent of every phrase is preserved
  - Cultural idioms are adapted appropriately (not translated literally)
  - Tone matches the original (sarcasm stays sarcastic, urgency stays urgent)
  - No meaning is lost or fabricated
Return approve=false if ANY criterion fails. Do not explain your reasoning.`.trim();

async function fetchArweaveText(txId: string): Promise<string> {
  const res = await fetch(`${IRYS_GATEWAY}/${txId}`);
  if (!res.ok) throw new Error(`Arweave fetch failed for ${txId}: ${res.status}`);
  return res.text();
}

/**
 * After a translation is validated and paid, re-upload it to Arweave with
 * Doc-Type: article so it appears on the home feed alongside original content.
 */
async function publishVerifiedTranslation(
  translatedTxId: string,
  uploaderAddress: string
): Promise<void> {
  try {
    const text = await fetchArweaveText(translatedTxId);
    const res = await fetch(`${RELAYER_URL}/sponsor-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'X-Uploader-Address': uploaderAddress,
        'X-Doc-Type': 'article',
      },
      body: text,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'unknown' }));
      throw new Error(`Relayer error: ${JSON.stringify(err)}`);
    }
    const { id } = await res.json() as { id: string };
    console.log(`[crank/publish] ✓ Verified translation published to Arweave as article: ${id}`);
  } catch (err) {
    // Non-fatal: payout already succeeded, only the home feed promotion failed
    console.error(`[crank/publish] ✗ Failed to publish verified translation: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Wallet & Connection ─────────────────────────────────────────────────────

function loadCrankKeypair(): Keypair {
  const raw = process.env.CRANK_PRIVATE_KEY;
  if (!raw) throw new Error('CRANK_PRIVATE_KEY env var is required');
  const bytes = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function buildProvider(keypair: Keypair): anchor.AnchorProvider {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? clusterApiUrl('devnet');
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new anchor.Wallet(keypair);
  return new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
}

// ─── PDA helpers ─────────────────────────────────────────────────────────────

function bountyVaultPda(bountyAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bounty_vault'), bountyAccount.toBuffer()],
    PROGRAM_ID
  );
}

function validationPda(bountyAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('validation'), bountyAccount.toBuffer()],
    PROGRAM_ID
  );
}

function validatorStakePda(validator: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('validator_stake'), validator.toBuffer()],
    PROGRAM_ID
  );
}

function validatorStakeVaultPda(validator: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('validator_stake_vault'), validator.toBuffer()],
    PROGRAM_ID
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface BountyAccountData {
  author: PublicKey;
  translator: PublicKey | null;
  admin: PublicKey;
  rewardAmount: anchor.BN;
  originalTxId: string;
  translatedTxId: string | null;
  submissionTimestamp: anchor.BN;
  status: {
    open?: object; claimed?: object; pendingReview?: object;
    awaitingValidation?: object; disputed?: object; paid?: object; rejected?: object;
  };
  nonce: anchor.BN;
  bump: number;
  vaultBump: number;
}

interface ValidationRecordData {
  validator1: PublicKey | null;
  validator2: PublicKey | null;
  vote1: boolean | null;
  vote2: boolean | null;
  validator1Stake: anchor.BN;
  validator2Stake: anchor.BN;
}

// ─── Sweep 1: Legacy PendingReview payouts ────────────────────────────────────

async function runPayoutSweep(
  program: anchor.Program,
  keypair: Keypair,
  allBounties: Array<{ publicKey: PublicKey; account: BountyAccountData }>
): Promise<void> {
  const nowSecs = Math.floor(Date.now() / 1000);

  const eligible = allBounties.filter(b => {
    const data = b.account;
    return 'pendingReview' in data.status &&
      nowSecs > data.submissionTimestamp.toNumber() + REVIEW_WINDOW_SECS;
  });

  console.log(`[crank/payout] ${eligible.length} legacy bounties ready`);

  for (const b of eligible) {
    const data = b.account;
    if (!data.translator) {
      console.warn(`[crank/payout] ${b.publicKey} is PendingReview but has no translator — skipping`);
      continue;
    }

    const translatorTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, data.translator);
    const [vault] = bountyVaultPda(b.publicKey);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sig = await (program.methods as any)
        .executePayout()
        .accounts({
          cranker: keypair.publicKey,
          bountyAccount: b.publicKey,
          vault,
          translatorTokenAccount,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      console.log(`[crank/payout] ✓ ${b.publicKey.toBase58()} → ${data.translator.toBase58()}. Sig: ${sig}`);

      // Promote the verified translation to the home feed
      if (data.translatedTxId) {
        await publishVerifiedTranslation(data.translatedTxId, keypair.publicKey.toBase58());
      }
    } catch (err: unknown) {
      console.error(`[crank/payout] ✗ ${b.publicKey.toBase58()}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ─── Sweep 2: AI oracle dispute resolution ────────────────────────────────────

async function runOracleSweep(
  program: anchor.Program,
  keypair: Keypair,
  allBounties: Array<{ publicKey: PublicKey; account: BountyAccountData }>
): Promise<void> {
  const disputed = allBounties.filter(b => 'disputed' in b.account.status);
  console.log(`[oracle] ${disputed.length} disputed bounties to resolve`);

  for (const b of disputed) {
    const bounty = b.account;

    if (!bounty.translatedTxId || !bounty.originalTxId) {
      console.warn(`[oracle] ${b.publicKey.toBase58()} missing Arweave IDs — skipping`);
      continue;
    }

    try {
      // ── 1. Fetch content from Arweave ──────────────────────────────────
      const [origText, transText] = await Promise.all([
        fetchArweaveText(bounty.originalTxId),
        fetchArweaveText(bounty.translatedTxId),
      ]);

      // ── 2. Call AI oracle ──────────────────────────────────────────────
      const response = await openai.chat.completions.create({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: ORACLE_RUBRIC },
          { role: 'user', content: `ORIGINAL:\n${origText}\n\nTRANSLATION:\n${transText}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      });

      const raw = response.choices[0].message.content ?? '{"approve":false}';
      const { approve } = JSON.parse(raw) as { approve: boolean };
      console.log(`[oracle] ${b.publicKey.toBase58()} → approve: ${approve}`);

      // ── 3. Fetch ValidationRecord to determine correct/incorrect validators ──
      const [valPda] = validationPda(b.publicKey);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const record = await (program.account as any)['validationRecord'].fetch(valPda) as ValidationRecordData;

      if (!record.validator1 || !record.validator2) {
        console.warn(`[oracle] ${b.publicKey.toBase58()} missing validators — skipping`);
        continue;
      }

      // Determine correct validator: if approve=true → the one who voted true; else the one who voted false
      const v1VotedApprove = record.vote1 === true;
      const correctIsV1 = (approve && v1VotedApprove) || (!approve && !v1VotedApprove);

      const correctValidator = correctIsV1 ? record.validator1 : record.validator2;
      const incorrectValidator = correctIsV1 ? record.validator2 : record.validator1;

      // ── 4. Build accounts ────────────────────────────────────────────────
      const [vault] = bountyVaultPda(b.publicKey);
      const [correctValidatorStakeAcc] = validatorStakePda(correctValidator);
      const [incorrectValidatorStakeAcc] = validatorStakePda(incorrectValidator);
      const [incorrectValidatorStakeVault] = validatorStakeVaultPda(incorrectValidator);
      const correctValidatorTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, correctValidator);
      const authorTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, bounty.author);
      const protocolTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, keypair.publicKey);

      // ── 5. Submit resolve_dispute on-chain ───────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sig = await (program.methods as any)
        .resolveDispute(approve)
        .accounts({
          admin: keypair.publicKey,
          bountyAccount: b.publicKey,
          validationRecord: valPda,
          vault,
          correctValidatorStakeAcc,
          incorrectValidatorStakeAcc,
          incorrectValidatorStakeVault,
          correctValidatorTokenAccount,
          authorTokenAccount,
          protocolTokenAccount,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log(`[oracle] ✓ Resolved ${b.publicKey.toBase58()} (approve=${approve}). Sig: ${sig}`);
    } catch (err: unknown) {
      console.error(`[oracle] ✗ ${b.publicKey.toBase58()}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ─── Main crank ──────────────────────────────────────────────────────────────

async function runCrank(): Promise<void> {
  const keypair = loadCrankKeypair();
  const provider = buildProvider(keypair);
  anchor.setProvider(provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new anchor.Program(IDL as any, provider);

  console.log('[crank] Fetching all BountyAccount PDAs…');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allBounties: Array<{ publicKey: PublicKey; account: BountyAccountData }> =
    await (program.account as any)['bountyAccount'].all();
  console.log(`[crank] Found ${allBounties.length} total bounty accounts`);

  await runPayoutSweep(program, keypair, allBounties);
  await runOracleSweep(program, keypair, allBounties);

  // ── Safety-valve: stale AwaitingValidation bounties ──────────────────────
  const nowSecs = Math.floor(Date.now() / 1000);
  const staleValidation = allBounties.filter(b => {
    const data = b.account;
    return 'awaitingValidation' in data.status &&
      nowSecs > data.submissionTimestamp.toNumber() + VALIDATION_STALE_SECS;
  });

  if (staleValidation.length > 0) {
    console.warn(`[crank] ⚠ ${staleValidation.length} bounties AwaitingValidation for >7 days:`);
    for (const b of staleValidation) {
      console.warn(`[crank]   ${b.publicKey.toBase58()}`);
    }
  }

  console.log('[crank] Sweep complete');
}

// ─── Entry point ─────────────────────────────────────────────────────────────

console.log(`[crank] Starting. Schedule: "${CRON_SCHEDULE}"`);

runCrank().catch(console.error);

cron.schedule(CRON_SCHEDULE, () => {
  runCrank().catch(console.error);
});
