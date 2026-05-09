'use client';

/**
 * useValidator — React hook for Sign Protocol attestation + on-chain validator operations.
 *
 * Flow per validator:
 *   1. registerValidator(bountyPda)     — claim a slot on the ValidationRecord
 *   2. submitAttestation(params)        — upload assessment JSON to Arweave, create
 *                                         Sign Protocol off-chain attestation, then
 *                                         record the attestation ID hash on-chain.
 *                                         On the 2nd attestation + both approve → auto-pay.
 */

import { useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth/solana';
import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { createPrivyToSolanaAdapter } from '@/lib/solana/privy-adapter';
import { deriveValidationPda, deriveVaultPda, type BountyAccount } from './useBounty';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BOUNTY_IDL = require('../anchor/target/idl/translation_bounty.json');

// ─── Constants ───────────────────────────────────────────────────────────────

const BOUNTY_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_BOUNTY_PROGRAM_ID ??
    'EZs9aybYZxSdSL8t1fCD2iXcpYHidsYQa44KttCRZFAs'
);

const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ??
    '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidationRecord {
  publicKey: PublicKey;
  bounty: PublicKey;
  validator1: PublicKey | null;
  validator2: PublicKey | null;
  attestationId1: number[] | null;
  attestationId2: number[] | null;
  vote1: boolean | null;
  vote2: boolean | null;
  bump: number;
}

export interface TagDecision {
  tagKey: string;
  tagValue: string;
  originalPhrase: string;
  translatedPhrase: string;
  rationale: string;
}

export interface AssessmentPayload {
  bountyPda: string;
  translatedArweaveTxId: string;
  targetLanguage: string;
  tagDecisions: TagDecision[];
  approve: boolean;
  validatorPubkey: string;
  timestamp: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useValidator() {
  const { wallets: solanaWallets } = useWallets();

  const buildProvider = useCallback((): anchor.AnchorProvider => {
    const activeWallet = solanaWallets[0];
    if (!activeWallet) throw new Error('No Privy wallet connected');
    const adapterShim = createPrivyToSolanaAdapter(activeWallet);
    const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL!, 'confirmed');
    return new anchor.AnchorProvider(
      connection,
      adapterShim as unknown as anchor.Wallet,
      { commitment: 'confirmed' }
    );
  }, [solanaWallets]);

  const buildProgram = useCallback(
    (provider: anchor.AnchorProvider): anchor.Program => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const idl = { ...(BOUNTY_IDL as any), address: BOUNTY_PROGRAM_ID.toBase58() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new anchor.Program(idl as any, provider) as anchor.Program;
    },
    []
  );

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchValidationRecord = useCallback(
    async (bountyPda: PublicKey): Promise<ValidationRecord> => {
      const provider = buildProvider();
      const program = buildProgram(provider);
      const [validationPda] = deriveValidationPda(bountyPda);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await (program.account as any)['validationRecord'].fetch(validationPda);
      return {
        publicKey: validationPda,
        bounty: raw.bounty,
        validator1: raw.validator1 ?? null,
        validator2: raw.validator2 ?? null,
        attestationId1: raw.attestationId1 ?? null,
        attestationId2: raw.attestationId2 ?? null,
        vote1: raw.vote1 ?? null,
        vote2: raw.vote2 ?? null,
        bump: raw.bump,
      };
    },
    [buildProvider, buildProgram]
  );

  // ── Register ──────────────────────────────────────────────────────────────

  const registerValidator = useCallback(
    async (bountyPda: PublicKey): Promise<string> => {
      const provider = buildProvider();
      const program = buildProgram(provider);
      const [validationRecord] = deriveValidationPda(bountyPda);

      const sig = await program.methods
        .registerValidator()
        .accounts({
          validator: provider.wallet.publicKey,
          bountyAccount: bountyPda,
          validationRecord,
        })
        .rpc();

      console.log('registerValidator tx:', sig);
      return sig;
    },
    [buildProvider, buildProgram]
  );

  // ── Submit attestation ────────────────────────────────────────────────────

  /**
   * Attestation flow (Solana-native, no external attestation service):
   *   1. Upload assessment JSON to Arweave → permanent immutable record
   *   2. POST to /api/validate/hash → SHA-256 of the assessment (on-chain commitment)
   *   3. Call submit_validator_attestation on Anchor — validator's Solana key signs
   *      the tx, which is the cryptographic proof. The assessment hash + Arweave TX
   *      together form a complete, verifiable audit trail.
   */
  const submitAttestation = useCallback(
    async (params: {
      bountyPda: PublicKey;
      bountyData: BountyAccount;
      tagDecisions: TagDecision[];
      approve: boolean;
    }): Promise<{ assessmentArweaveTxId: string; sig: string }> => {
      const { bountyPda, bountyData, tagDecisions, approve } = params;

      const provider = buildProvider();
      const program = buildProgram(provider);
      const validatorPubkey = provider.wallet.publicKey.toBase58();

      if (!bountyData.translator) {
        throw new Error('Bounty has no translator — cannot submit attestation');
      }

      // ── 1. Upload assessment JSON to Arweave ─────────────────────────────
      const assessmentPayload: AssessmentPayload = {
        bountyPda: bountyPda.toBase58(),
        translatedArweaveTxId: bountyData.translatedTxId ?? '',
        targetLanguage: bountyData.targetLanguage,
        tagDecisions,
        approve,
        validatorPubkey,
        timestamp: Math.floor(Date.now() / 1000),
      };

      const activeWallet = solanaWallets[0];
      if (!activeWallet) throw new Error('No wallet connected');

      const relayRes = await fetch(
        `${process.env.NEXT_PUBLIC_RELAYER_URL}/sponsor-upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'X-Uploader-Address': activeWallet.address,
          },
          body: JSON.stringify(assessmentPayload),
        }
      );
      if (!relayRes.ok) {
        const { error } = await relayRes.json();
        throw new Error(`Assessment upload failed: ${error}`);
      }
      const { id: assessmentArweaveTxId } = await relayRes.json();

      // ── 2. Hash the assessment for on-chain commitment ────────────────────
      const hashRes = await fetch('/api/validate/hash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bountyPda: bountyPda.toBase58(),
          validatorPubkey,
          tagDecisions,
          approve,
        }),
      });
      if (!hashRes.ok) throw new Error('Failed to hash assessment');
      const { hash: assessmentHash } = await hashRes.json() as { hash: number[] };

      // ── 3. Record on-chain — validator's Solana key signs the tx ─────────
      const [validationRecord] = deriveValidationPda(bountyPda);
      const [vault] = deriveVaultPda(bountyPda);
      const translatorTokenAccount = getAssociatedTokenAddressSync(
        USDC_MINT,
        bountyData.translator
      );

      const sig = await program.methods
        .submitValidatorAttestation(assessmentHash, approve)
        .accounts({
          validator: provider.wallet.publicKey,
          bountyAccount: bountyPda,
          validationRecord,
          vault,
          translatorTokenAccount,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log('submitValidatorAttestation tx:', sig, 'arweave:', assessmentArweaveTxId);
      return { assessmentArweaveTxId, sig };
    },
    [buildProvider, buildProgram, solanaWallets]
  );

  return {
    fetchValidationRecord,
    registerValidator,
    submitAttestation,
    deriveValidationPda,
  };
}
