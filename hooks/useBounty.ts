/**
 * useBounty — React hooks for all Translation Bounty program interactions.
 *
 * Pattern: mirrors usePublish.ts — uses Privy as the single wallet source,
 * builds an adapter shim to bridge Privy ↔ Anchor's wallet interface, then
 * calls the Anchor program instructions.
 */

import { useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth/solana';
import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import { createPrivyToSolanaAdapter } from '@/lib/solana/privy-adapter';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BOUNTY_IDL = require('../lib/idl/translation_bounty.json');

// ─── Constants ───────────────────────────────────────────────────────────────

const BOUNTY_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_BOUNTY_PROGRAM_ID ??
    '5kRPV7z2BUQn5rEXAhAPbBdHGU4KAYKo8FXBwmG3ahiP'
);

const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ??
    '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' // devnet USDC
);

const REVIEW_WINDOW_SECS = 48 * 60 * 60;

// ─── Types ───────────────────────────────────────────────────────────────────

export type BountyStatus =
  | { open: Record<string, never> }
  | { claimed: Record<string, never> }
  | { pendingReview: Record<string, never> }
  | { awaitingValidation: Record<string, never> }
  | { disputed: Record<string, never> }
  | { paid: Record<string, never> }
  | { rejected: Record<string, never> };

export interface BountyAccount {
  publicKey: PublicKey;
  author: PublicKey;
  translator: PublicKey | null;
  admin: PublicKey;
  rewardAmount: anchor.BN;
  originalTxId: string;
  targetLanguage: string;
  translatedTxId: string | null;
  submissionTimestamp: anchor.BN;
  status: BountyStatus;
  nonce: anchor.BN;
  bump: number;
  vaultBump: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// writeBigUInt64LE is unavailable on the browser Buffer polyfill — use plain Uint8Array
function bigintToLeBytes(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

// ─── PDA derivation (mirrors Rust seeds exactly) ──────────────────────────────

export function deriveBountyPda(
  author: PublicKey,
  nonce: bigint
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bounty'), author.toBuffer(), bigintToLeBytes(nonce)],
    BOUNTY_PROGRAM_ID
  );
}

export function deriveVaultPda(bountyAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bounty_vault'), bountyAccount.toBuffer()],
    BOUNTY_PROGRAM_ID
  );
}

export function deriveValidationPda(bountyAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('validation'), bountyAccount.toBuffer()],
    BOUNTY_PROGRAM_ID
  );
}

export function deriveValidatorStakePda(validator: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('validator_stake'), validator.toBuffer()],
    BOUNTY_PROGRAM_ID
  );
}

export function deriveValidatorStakeVaultPda(validator: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('validator_stake_vault'), validator.toBuffer()],
    BOUNTY_PROGRAM_ID
  );
}

// ─── Validation ──────────────────────────────────────────────────────────────

function isValidBountyAccount(b: BountyAccount): boolean {
  return (
    // Must have a real Arweave TX ID (43–44 base64url chars)
    /^[A-Za-z0-9_-]{43,44}$/.test(b.originalTxId) &&
    // Must have a non-zero reward
    b.rewardAmount.gtn(0) &&
    // Must have a real author pubkey (not default/zero)
    !b.author.equals(PublicKey.default) &&
    // Must have a valid status key
    (
      'open' in b.status ||
      'claimed' in b.status ||
      'pendingReview' in b.status ||
      'awaitingValidation' in b.status ||
      'disputed' in b.status ||
      'paid' in b.status ||
      'rejected' in b.status
    )
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useBounty() {
  const { wallets: solanaWallets } = useWallets();

  // Build an AnchorProvider from the active Privy wallet.
  // Mirrors the shim in usePublish.ts so Privy ↔ Anchor/web3.js bridge is consistent.
  const buildProvider = useCallback((): anchor.AnchorProvider => {
    const activeWallet = solanaWallets[0];
    if (!activeWallet) throw new Error('No Privy wallet connected');

    // Bridge Privy's Wallet Standard interface to the anchor.Wallet shape.
    // Cast required because anchor.Wallet refers to NodeWallet (adds `payer`),
    // but AnchorProvider only needs the Wallet interface — safe here.
    const adapterShim = createPrivyToSolanaAdapter(activeWallet);

    const connection = new Connection(
      process.env.NEXT_PUBLIC_HELIUS_RPC_URL!,
      'confirmed'
    );

    return new anchor.AnchorProvider(
      connection,
      adapterShim as unknown as anchor.Wallet,
      { commitment: 'confirmed' }
    );
  }, [solanaWallets]);

  const buildProgram = useCallback(
    (provider: anchor.AnchorProvider): anchor.Program => {
      // Always use BOUNTY_PROGRAM_ID as the authoritative address — overrides
      // whatever address the IDL file happens to contain after a redeploy.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const idl = { ...(BOUNTY_IDL as any), address: BOUNTY_PROGRAM_ID.toBase58() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new anchor.Program(idl as any, provider) as anchor.Program;
    },
    []
  );

  // Read-only program instance — no wallet needed, safe to call before login.
  const buildReadOnlyProgram = useCallback((): anchor.Program => {
    const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL!, 'confirmed');
    const dummyKey = Keypair.generate();
    // anchor.Wallet is Node-only; satisfy the interface inline for browser reads.
    const dummy = {
      publicKey: dummyKey.publicKey,
      signTransaction: async <T>(tx: T) => tx,
      signAllTransactions: async <T>(txs: T[]) => txs,
    };
    const provider = new anchor.AnchorProvider(connection, dummy as anchor.Wallet, { commitment: 'confirmed' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idl = { ...(BOUNTY_IDL as any), address: BOUNTY_PROGRAM_ID.toBase58() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new anchor.Program(idl as any, provider) as anchor.Program;
  }, []);

  // ── Sponsor upload via the backend relayer ──────────────────────────────────

  const sponsorUpload = useCallback(
    async (mdhContent: string): Promise<string> => {
      const activeWallet = solanaWallets[0];
      if (!activeWallet) throw new Error('No wallet connected');

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_RELAYER_URL}/sponsor-upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'X-Uploader-Address': activeWallet.address,
            'X-Doc-Type': 'translation',
          },
          body: mdhContent,
        }
      );

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(`Sponsor upload failed: ${error}`);
      }

      const { id } = await res.json();
      return id as string;
    },
    [solanaWallets]
  );

  // ── Phase 1: Author creates the bounty ────────────────────────────────────

  /**
   * `initializeBounty`
   *
   * Calls `initialize_bounty` on the program, funding the PDA vault with
   * `rewardAmountUsdc` USDC. The article is assumed to already be on Arweave
   * (uploaded at publish time) — pass its 43-char TX ID directly.
   *
   * @returns The bounty PDA public key (use as the job's unique identifier)
   */
  const initializeBounty = useCallback(
    async (params: {
      originalTxId: string;
      rewardAmountUsdc: number;
      targetLanguage: string;
      adminPubkey: PublicKey;
    }): Promise<PublicKey> => {
      const { originalTxId, rewardAmountUsdc, targetLanguage, adminPubkey } = params;

      const provider = buildProvider();
      const program = buildProgram(provider);
      const authorPubkey = provider.wallet.publicKey;

      // USDC has 6 decimals
      const rewardAmount = new anchor.BN(rewardAmountUsdc * 1_000_000);

      // Deterministic nonce: current unix timestamp (good enough for one-per-second cadence)
      const nonce = BigInt(Math.floor(Date.now() / 1000));
      const nonceBN = new anchor.BN(nonce.toString());

      const [bountyPda] = deriveBountyPda(authorPubkey, nonce);
      const [vault] = deriveVaultPda(bountyPda);
      const authorTokenAccount = getAssociatedTokenAddressSync(
        USDC_MINT,
        authorPubkey
      );

      // Create the author's USDC ATA if it doesn't exist yet
      const preInstructions: anchor.web3.TransactionInstruction[] = [];
      try {
        await getAccount(provider.connection, authorTokenAccount);
      } catch {
        preInstructions.push(
          createAssociatedTokenAccountInstruction(
            authorPubkey,
            authorTokenAccount,
            authorPubkey,
            USDC_MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sig = await (program.methods as any)
        .initializeBounty(nonceBN, originalTxId, rewardAmount, targetLanguage)
        .accounts({
          author: authorPubkey,
          bountyAccount: bountyPda,
          vault,
          authorTokenAccount,
          usdcMint: USDC_MINT,
          admin: adminPubkey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .preInstructions(preInstructions)
        .rpc();

      console.log('initializeBounty tx:', sig);
      return bountyPda;
    },
    [buildProvider, buildProgram]
  );

  // ── Phase 1b: Author cancels an open bounty ───────────────────────────────

  /**
   * `cancelBounty`
   *
   * Refunds the USDC escrow to the author and closes the PDA.
   * Only callable while status is Open (before any translator claims it).
   */
  const cancelBounty = useCallback(
    async (params: {
      bountyPda: PublicKey;
      bountyData: BountyAccount;
    }): Promise<string> => {
      const { bountyPda, bountyData } = params;
      const provider = buildProvider();
      const program = buildProgram(provider);
      const authorPubkey = provider.wallet.publicKey;

      const [vault] = deriveVaultPda(bountyPda);
      const authorTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, authorPubkey);

      const sig = await program.methods
        .cancelBounty()
        .accounts({
          author: authorPubkey,
          bountyAccount: bountyPda,
          vault,
          authorTokenAccount,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log('cancelBounty tx:', sig);
      return sig;
    },
    [buildProvider, buildProgram]
  );

  // ── Phase 2: Translator claims the job ────────────────────────────────────

  /**
   * `claimBounty`
   *
   * Translator signs a transaction locking them in as the job owner.
   * Status: Open → Claimed.
   */
  const claimBounty = useCallback(
    async (bountyPda: PublicKey): Promise<string> => {
      const provider = buildProvider();
      const program = buildProgram(provider);

      const sig = await program.methods
        .claimBounty()
        .accounts({
          translator: provider.wallet.publicKey,
          bountyAccount: bountyPda,
        })
        .rpc();

      console.log('claimBounty tx:', sig);
      return sig;
    },
    [buildProvider, buildProgram]
  );

  // ── Phase 3: Translator submits the translation ────────────────────────────

  /**
   * `submitTranslation`
   *
   * 1. Uploads `translationData` to Arweave → `translated_tx_id`
   * 2. Calls `submit_translation`, logging the on-chain timestamp.
   *    Status: Claimed → PendingReview. 48-hour clock starts.
   */
  const submitTranslation = useCallback(
    async (params: {
      bountyPda: PublicKey;
      translationData: unknown;
    }): Promise<string> => {
      const { bountyPda, translationData } = params;
      const provider = buildProvider();
      const program = buildProgram(provider);

      const translatedTxId = await sponsorUpload(translationData as string);

      const [validationRecord] = deriveValidationPda(bountyPda);

      const sig = await program.methods
        .submitTranslation(translatedTxId)
        .accounts({
          translator: provider.wallet.publicKey,
          bountyAccount: bountyPda,
          validationRecord,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log('submitTranslation tx:', sig);
      return sig;
    },
    [buildProvider, buildProgram, sponsorUpload]
  );

  // ── Phase 4a: Author disputes within 48h ──────────────────────────────────

  /**
   * `disputeBounty`
   *
   * Author calls this to freeze the funds and escalate to admin.
   * Status: PendingReview → Disputed.
   * Will revert on-chain if the 48-hour window has already expired.
   */
  const disputeBounty = useCallback(
    async (bountyPda: PublicKey): Promise<string> => {
      const provider = buildProvider();
      const program = buildProgram(provider);

      const sig = await program.methods
        .disputeBounty()
        .accounts({
          author: provider.wallet.publicKey,
          bountyAccount: bountyPda,
        })
        .rpc();

      console.log('disputeBounty tx:', sig);
      return sig;
    },
    [buildProvider, buildProgram]
  );

  // ── Phase 4b (admin only): Resolve a disputed bounty ──────────────────────

  /**
   * `resolveDispute`
   *
   * Only callable by the `admin_pubkey` stored in the BountyAccount.
   * `payTranslator = true` → funds go to translator (work was good).
   * `payTranslator = false` → funds refunded to author (work was bad).
   */
  const resolveDispute = useCallback(
    async (params: {
      bountyPda: PublicKey;
      bountyData: BountyAccount;
      approve: boolean;
      correctValidatorPubkey: PublicKey;
      incorrectValidatorPubkey: PublicKey;
    }): Promise<string> => {
      const { bountyPda, bountyData, approve, correctValidatorPubkey, incorrectValidatorPubkey } = params;
      const provider = buildProvider();
      const program = buildProgram(provider);

      const [vault] = deriveVaultPda(bountyPda);
      const [validationRecord] = deriveValidationPda(bountyPda);
      const [correctValidatorStakeAcc] = deriveValidatorStakePda(correctValidatorPubkey);
      const [incorrectValidatorStakeAcc] = deriveValidatorStakePda(incorrectValidatorPubkey);
      const [incorrectValidatorStakeVault] = deriveValidatorStakeVaultPda(incorrectValidatorPubkey);

      const correctValidatorTokenAccount = getAssociatedTokenAddressSync(
        USDC_MINT,
        correctValidatorPubkey
      );
      const authorTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, bountyData.author);

      const adminPubkey = new PublicKey(
        process.env.NEXT_PUBLIC_ADMIN_PUBKEY ?? '3Wyri2aFCDQt9GdTyqahvYzzRkipo7NEign2kGkP5JVm'
      );
      const protocolTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, adminPubkey);

      const sig = await program.methods
        .resolveDispute(approve)
        .accounts({
          admin: provider.wallet.publicKey,
          bountyAccount: bountyPda,
          validationRecord,
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

      console.log('resolveDispute tx:', sig);
      return sig;
    },
    [buildProvider, buildProgram]
  );

  // ── Phase 5: Permissionless crank (anyone can call after 48h) ─────────────

  /**
   * `executePayout`
   *
   * Permissionless instruction — any wallet (or the backend crank) can call
   * this once the 48-hour window has passed. Releases USDC to the translator.
   * Status: PendingReview → Paid.
   */
  const executePayout = useCallback(
    async (params: {
      bountyPda: PublicKey;
      bountyData: BountyAccount;
    }): Promise<string> => {
      const { bountyPda, bountyData } = params;
      const provider = buildProvider();
      const program = buildProgram(provider);

      if (!bountyData.translator) {
        throw new Error('Cannot execute payout: bounty has no translator');
      }

      const [vault] = deriveVaultPda(bountyPda);
      const translatorTokenAccount = getAssociatedTokenAddressSync(
        USDC_MINT,
        bountyData.translator
      );

      const sig = await program.methods
        .executePayout()
        .accounts({
          cranker: provider.wallet.publicKey,
          bountyAccount: bountyPda,
          vault,
          translatorTokenAccount,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log('executePayout tx:', sig);
      return sig;
    },
    [buildProvider, buildProgram]
  );

  // ── Read helpers ───────────────────────────────────────────────────────────

  /** Fetch a single BountyAccount by its PDA public key */
  const fetchBounty = useCallback(
    async (bountyPda: PublicKey): Promise<BountyAccount> => {
      const program = buildReadOnlyProgram();
      const raw = await // eslint-disable-next-line @typescript-eslint/no-explicit-any
(program.account as any)['bountyAccount'].fetch(bountyPda);
      const account: BountyAccount = { publicKey: bountyPda, ...(raw as Omit<BountyAccount, 'publicKey'>) };
      if (!isValidBountyAccount(account)) {
        throw new Error(`BountyAccount ${bountyPda.toBase58()} failed validation`);
      }
      return account;
    },
    [buildReadOnlyProgram]
  );

  /** Fetch all BountyAccounts, optionally filtered by status */
  const fetchAllBounties = useCallback(
    async (
      statusFilter?: 'open' | 'claimed' | 'pendingReview' | 'awaitingValidation' | 'disputed' | 'paid' | 'rejected'
    ): Promise<BountyAccount[]> => {
      const program = buildReadOnlyProgram();
      const all = await // eslint-disable-next-line @typescript-eslint/no-explicit-any
(program.account as any)['bountyAccount'].all();

      const mapped: BountyAccount[] = all.map(
        (b: { publicKey: PublicKey; account: unknown }) => ({
          publicKey: b.publicKey,
          ...(b.account as Omit<BountyAccount, 'publicKey'>),
        })
      );

      const valid = mapped.filter(isValidBountyAccount);

      if (!statusFilter) return valid;
      const filtered = valid.filter((b: BountyAccount) => statusFilter in b.status);
      const dropped = valid.filter((b: BountyAccount) => !(statusFilter in b.status));
      if (dropped.length) console.log('[fetchAllBounties] filtered out:', dropped.map(b => ({ pda: b.publicKey.toBase58().slice(0,8), status: JSON.stringify(b.status) })));
      return filtered;
    },
    [buildReadOnlyProgram]
  );

  /**
   * Check whether the 48-hour dispute window is still open for a given bounty.
   * Compares against local clock — the on-chain program uses `Clock::get()`.
   */
  const isDisputeWindowOpen = useCallback((bounty: BountyAccount): boolean => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const submissionTs = bounty.submissionTimestamp.toNumber();
    return nowSecs < submissionTs + REVIEW_WINDOW_SECS;
  }, []);

  return {
    // Mutations
    initializeBounty,
    cancelBounty,
    claimBounty,
    submitTranslation,
    disputeBounty,
    resolveDispute,
    executePayout,
    // Queries
    fetchBounty,
    fetchAllBounties,
    // Utils
    sponsorUpload,
    isDisputeWindowOpen,
    deriveBountyPda,
    deriveVaultPda,
    deriveValidationPda,
    deriveValidatorStakePda,
    deriveValidatorStakeVaultPda,
  };
}
