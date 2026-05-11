import { NextResponse } from 'next/server';
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import OpenAI from 'openai';
import { parseMdh } from '@/lib/mdh-utils';
import { interpretMdh } from '@/lib/ai/openai-interpreter';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const IDL = require('../../../lib/idl/translation_bounty.json');

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_BOUNTY_PROGRAM_ID ?? '5kRPV7z2BUQn5rEXAhAPbBdHGU4KAYKo8FXBwmG3ahiP'
);
const IRYS_GATEWAY = process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz';
const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL ?? 'http://localhost:4001';

function loadBackendKeypair(): Keypair {
  const raw = process.env.CRANK_PRIVATE_KEY;
  if (!raw) throw new Error('CRANK_PRIVATE_KEY env var is required for auto-translation');
  const bytes = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function buildProvider(keypair: Keypair): anchor.AnchorProvider {
  const rpcUrl = process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? clusterApiUrl('devnet');
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new anchor.Wallet(keypair);
  return new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
}

function deriveValidationPda(bountyPda: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('validation'), bountyPda.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export async function POST(request: Request) {
  try {
    const { bountyPda: bountyPdaStr, originalTxId, targetLanguage } = await request.json() as {
      bountyPda: string;
      originalTxId: string;
      targetLanguage: string;
    };

    if (!bountyPdaStr || !originalTxId || !targetLanguage) {
      return NextResponse.json({ error: 'Missing bountyPda, originalTxId, or targetLanguage' }, { status: 400 });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }

    const keypair = loadBackendKeypair();
    const provider = buildProvider(keypair);
    anchor.setProvider(provider);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const program = new anchor.Program(IDL as any, provider);
    const bountyPda = new PublicKey(bountyPdaStr);

    // ── Step 1: Claim the bounty with the backend keypair ──────────────────
    console.log('[auto-translate] Claiming bounty…', bountyPdaStr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (program.methods as any)
      .claimBounty()
      .accounts({
        translator: keypair.publicKey,
        bountyAccount: bountyPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log('[auto-translate] Bounty claimed.');

    // ── Step 2: Fetch original .mdh from Arweave ───────────────────────────
    console.log('[auto-translate] Fetching original content from Arweave…');
    const res = await fetch(`${IRYS_GATEWAY}/${originalTxId}`);
    if (!res.ok) throw new Error(`Failed to fetch original content: ${res.status}`);
    const originalRaw = await res.text();
    const parsed = parseMdh(originalRaw);

    // ── Step 3: Call OpenAI to translate ───────────────────────────────────
    console.log(`[auto-translate] Running AI translation to ${targetLanguage}…`);
    const client = new OpenAI({ apiKey: openaiKey });
    const result = await interpretMdh(parsed, targetLanguage, client);

    const translatedContent = `# ${result.translatedText.split('\n')[0]}\n\n${result.translatedText}`;

    // ── Step 4: Upload translation to Arweave tagged as 'translation' ──────
    console.log('[auto-translate] Uploading translation to Arweave…');
    const uploadRes = await fetch(`${RELAYER_URL}/sponsor-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'X-Uploader-Address': keypair.publicKey.toBase58(),
        'X-Doc-Type': 'translation',
      },
      body: translatedContent,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({ error: 'unknown' }));
      throw new Error(`Relayer upload failed: ${(err as { error: string }).error}`);
    }
    const { id: translatedTxId } = await uploadRes.json() as { id: string };
    console.log('[auto-translate] Translation uploaded:', translatedTxId);

    // ── Step 5: Submit translation on-chain (Claimed → AwaitingValidation) ─
    console.log('[auto-translate] Submitting translation on-chain…');
    const validationRecord = deriveValidationPda(bountyPda);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sig = await (program.methods as any)
      .submitTranslation(translatedTxId)
      .accounts({
        translator: keypair.publicKey,
        bountyAccount: bountyPda,
        validationRecord,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log('[auto-translate] ✓ Submitted on-chain. Sig:', sig);

    return NextResponse.json({ success: true, translatedTxId, sig });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auto-translate] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
