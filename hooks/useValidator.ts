'use client';

/**
 * useValidator — React hook for validator operations:
 *   - stakeUsdc / requestUnstake / completeUnstake  (persistent stake vault)
 *   - registerValidator  (locks stake for a specific bounty)
 *   - submitAttestation  (Arweave upload + on-chain attestation)
 */

import { useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth/solana';
import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { createPrivyToSolanaAdapter } from '@/lib/solana/privy-adapter';
import {
  deriveValidationPda,
  deriveVaultPda,
  deriveValidatorStakePda,
  deriveValidatorStakeVaultPda,
  type BountyAccount,
} from './useBounty';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BOUNTY_IDL = require('../lib/idl/translation_bounty.json');

// ─── Constants ───────────────────────────────────────────────────────────────

const BOUNTY_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_BOUNTY_PROGRAM_ID ??
    '5kRPV7z2BUQn5rEXAhAPbBdHGU4KAYKo8FXBwmG3ahiP'
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
  validator1Stake: anchor.BN;
  validator2Stake: anchor.BN;
}

export interface ValidatorStakeAccountData {
  publicKey: PublicKey;
  owner: PublicKey;
  amount: anchor.BN;
  locked: anchor.BN;
  unlockAt: anchor.BN;
  unlockAmount: anchor.BN;
  bump: number;
  vaultBump: number;
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

  // ── Stake account fetch ───────────────────────────────────────────────────

  const fetchStakeAccount = useCallback(
    async (validatorPubkey: PublicKey): Promise<ValidatorStakeAccountData | null> => {
      const provider = buildProvider();
      const program = buildProgram(provider);
      const [stakeAccountPda] = deriveValidatorStakePda(validatorPubkey);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await (program.account as any)['validatorStakeAccount'].fetch(stakeAccountPda);
        return {
          publicKey: stakeAccountPda,
          owner: raw.owner,
          amount: raw.amount,
          locked: raw.locked,
          unlockAt: raw.unlockAt,
          unlockAmount: raw.unlockAmount,
          bump: raw.bump,
          vaultBump: raw.vaultBump,
        };
      } catch {
        return null;
      }
    },
    [buildProvider, buildProgram]
  );

  // ── Validation record fetch ───────────────────────────────────────────────

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
        validator1: (!raw.validator1 || raw.validator1.equals(PublicKey.default)) ? null : raw.validator1,
        validator2: (!raw.validator2 || raw.validator2.equals(PublicKey.default)) ? null : raw.validator2,
        attestationId1: raw.attestationId1 ?? null,
        attestationId2: raw.attestationId2 ?? null,
        vote1: raw.vote1 ?? null,
        vote2: raw.vote2 ?? null,
        bump: raw.bump,
        validator1Stake: raw.validator1Stake ?? new anchor.BN(0),
        validator2Stake: raw.validator2Stake ?? new anchor.BN(0),
      };
    },
    [buildProvider, buildProgram]
  );

  // ── Stake USDC into the persistent validator vault ────────────────────────

  const stakeUsdc = useCallback(
    async (amountUsdc: number): Promise<string> => {
      const provider = buildProvider();
      const program = buildProgram(provider);
      const validatorPubkey = provider.wallet.publicKey;

      const amountRaw = new anchor.BN(Math.floor(amountUsdc * 1_000_000));
      const [stakeAccount] = deriveValidatorStakePda(validatorPubkey);
      const [stakeVault] = deriveValidatorStakeVaultPda(validatorPubkey);
      const validatorTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, validatorPubkey);

      const preInstructions: anchor.web3.TransactionInstruction[] = [];
      try {
        await getAccount(provider.connection, validatorTokenAccount);
      } catch {
        preInstructions.push(
          createAssociatedTokenAccountInstruction(
            validatorPubkey,
            validatorTokenAccount,
            validatorPubkey,
            USDC_MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      const sig = await program.methods
        .stake(amountRaw)
        .accounts({
          validator: validatorPubkey,
          stakeAccount,
          stakeVault,
          validatorTokenAccount,
          stakeMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .preInstructions(preInstructions)
        .rpc();

      console.log('stake tx:', sig);
      return sig;
    },
    [buildProvider, buildProgram]
  );

  // ── Request to begin the 3-day unstake cooldown ───────────────────────────

  const requestUnstake = useCallback(
    async (amountUsdc: number): Promise<string> => {
      const provider = buildProvider();
      const program = buildProgram(provider);
      const validatorPubkey = provider.wallet.publicKey;

      const amountRaw = new anchor.BN(Math.floor(amountUsdc * 1_000_000));
      const [stakeAccount] = deriveValidatorStakePda(validatorPubkey);

      const sig = await program.methods
        .requestUnstake(amountRaw)
        .accounts({
          validator: validatorPubkey,
          stakeAccount,
        })
        .rpc();

      console.log('requestUnstake tx:', sig);
      return sig;
    },
    [buildProvider, buildProgram]
  );

  // ── Complete unstake after lockup ─────────────────────────────────────────

  const completeUnstake = useCallback(
    async (): Promise<string> => {
      const provider = buildProvider();
      const program = buildProgram(provider);
      const validatorPubkey = provider.wallet.publicKey;

      const [stakeAccount] = deriveValidatorStakePda(validatorPubkey);
      const [stakeVault] = deriveValidatorStakeVaultPda(validatorPubkey);
      const validatorTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, validatorPubkey);

      const sig = await program.methods
        .completeUnstake()
        .accounts({
          validator: validatorPubkey,
          stakeAccount,
          stakeVault,
          validatorTokenAccount,
          stakeMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log('completeUnstake tx:', sig);
      return sig;
    },
    [buildProvider, buildProgram]
  );

  // ── Register as validator (locks stake, no USDC transfer) ────────────────

  const registerValidator = useCallback(
    async (bountyPda: PublicKey): Promise<string> => {
      const provider = buildProvider();
      const program = buildProgram(provider);
      const validatorPubkey = provider.wallet.publicKey;

      const [validationRecord] = deriveValidationPda(bountyPda);
      const [validatorStakeAccount] = deriveValidatorStakePda(validatorPubkey);

      const sig = await program.methods
        .registerValidator()
        .accounts({
          validator: validatorPubkey,
          bountyAccount: bountyPda,
          validationRecord,
          validatorStakeAccount,
        })
        .rpc();

      console.log('registerValidator tx:', sig);
      return sig;
    },
    [buildProvider, buildProgram]
  );

  // ── Submit attestation ────────────────────────────────────────────────────

  /**
   * Attestation flow:
   *   1. Upload assessment JSON to Arweave → permanent immutable record
   *   2. POST to /api/validate/hash → SHA-256 of the assessment (on-chain commitment)
   *   3. Call submit_validator_attestation — validator's Solana key signs the tx.
   *
   * On the 2nd attestation, the program settles automatically:
   *   - both approve → pays each validator 40% from bounty vault; stake unlocked
   *   - both reject  → pays 2% each; 96% refunded to author; stake unlocked
   *   - split        → status = Disputed; AI oracle resolves via crank
   */
  const submitAttestation = useCallback(
    async (params: {
      bountyPda: PublicKey;
      bountyData: BountyAccount;
      validationRecord: ValidationRecord;
      tagDecisions: TagDecision[];
      approve: boolean;
    }): Promise<{ assessmentArweaveTxId: string; sig: string }> => {
      const { bountyPda, bountyData, validationRecord, tagDecisions, approve } = params;

      const provider = buildProvider();
      const program = buildProgram(provider);
      const validatorPubkey = provider.wallet.publicKey.toBase58();

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
            'X-Doc-Type': 'attestation',
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

      // ── 3. Build accounts for on-chain settlement ─────────────────────────
      const [validationRecordPda] = deriveValidationPda(bountyPda);
      const [vault] = deriveVaultPda(bountyPda);

      if (!validationRecord.validator1) {
        throw new Error('No validators registered on this bounty');
      }

      // validator2 may not have registered yet — use a placeholder so accounts are valid
      const v2 = validationRecord.validator2 ?? validationRecord.validator1;

      const validator1TokenAccount = getAssociatedTokenAddressSync(USDC_MINT, validationRecord.validator1);
      const validator2TokenAccount = getAssociatedTokenAddressSync(USDC_MINT, v2);
      const authorTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, bountyData.author);

      const adminPubkey = new PublicKey(
        process.env.NEXT_PUBLIC_ADMIN_PUBKEY ?? '3Wyri2aFCDQt9GdTyqahvYzzRkipo7NEign2kGkP5JVm'
      );
      const protocolTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, adminPubkey);

      const [validator1StakeAccount] = deriveValidatorStakePda(validationRecord.validator1);
      const [validator2StakeAccount] = deriveValidatorStakePda(v2);

      // ── 4. Ensure all payout ATAs exist (separate txs — bundling would exceed tx size limit) ──
      const ataChecks: Array<{ ata: PublicKey; owner: PublicKey }> = [
        { ata: validator1TokenAccount, owner: validationRecord.validator1 },
        { ata: validator2TokenAccount, owner: v2 },
        { ata: authorTokenAccount, owner: bountyData.author },
        { ata: protocolTokenAccount, owner: adminPubkey },
      ];

      for (const { ata, owner } of ataChecks) {
        try {
          await getAccount(provider.connection, ata);
        } catch {
          console.log(`[submitAttestation] Creating missing ATA for owner ${owner.toBase58()}: ${ata.toBase58()}`);
          const createIx = createAssociatedTokenAccountInstruction(
            provider.wallet.publicKey,
            ata,
            owner,
            USDC_MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
          const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
          const createTx = new anchor.web3.Transaction({ blockhash, lastValidBlockHeight }).add(createIx);
          createTx.feePayer = provider.wallet.publicKey;
          const signedCreate = await provider.wallet.signTransaction(createTx);
          const createSig = await provider.connection.sendRawTransaction(signedCreate.serialize(), { skipPreflight: true });
          console.log(`[submitAttestation] ATA create tx: ${createSig}`);
          const result = await provider.connection.confirmTransaction({ signature: createSig, blockhash, lastValidBlockHeight }, 'confirmed');
          if (result.value.err) throw new Error(`Failed to create ATA for ${owner.toBase58()}: ${JSON.stringify(result.value.err)}`);
          console.log(`[submitAttestation] ATA confirmed: ${ata.toBase58()}`);
        }
      }

      // ── 5. Record on-chain ────────────────────────────────────────────────
      const sig = await program.methods
        .submitValidatorAttestation(assessmentHash, approve)
        .accounts({
          validator: provider.wallet.publicKey,
          bountyAccount: bountyPda,
          validationRecord: validationRecordPda,
          vault,
          validator1TokenAccount,
          validator2TokenAccount,
          authorTokenAccount,
          protocolTokenAccount,
          validator1StakeAccount,
          validator2StakeAccount,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true, commitment: 'confirmed' });

      console.log('submitValidatorAttestation tx:', sig, 'arweave:', assessmentArweaveTxId);
      return { assessmentArweaveTxId, sig };
    },
    [buildProvider, buildProgram, solanaWallets]
  );

  return {
    fetchValidationRecord,
    fetchStakeAccount,
    stakeUsdc,
    requestUnstake,
    completeUnstake,
    registerValidator,
    submitAttestation,
    deriveValidationPda,
    deriveValidatorStakePda,
    deriveValidatorStakeVaultPda,
  };
}
