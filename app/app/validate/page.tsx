'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useWallets } from '@privy-io/react-auth/solana';
import { ShieldCheck, Languages, Coins, Loader2, AlertCircle, Users, Lock } from 'lucide-react';
import { PublicKey } from '@solana/web3.js';
import { useBounty, type BountyAccount } from '@/hooks/useBounty';
import { useValidator, type ValidationRecord } from '@/hooks/useValidator';

const IRYS_GATEWAY = process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz';

function usdcAmount(rawAmount: { toNumber: () => number }): string {
  return (rawAmount.toNumber() / 1_000_000).toFixed(2);
}

async function fetchArticleTitle(txId: string): Promise<string> {
  try {
    const res = await fetch(`${IRYS_GATEWAY}/${txId}`, { headers: { Range: 'bytes=0-150' } });
    const text = await res.text();
    const match = text.match(/^#\s+(.+)/m);
    return match ? match[1].trim() : txId.slice(0, 12) + '…';
  } catch {
    return txId.slice(0, 12) + '…';
  }
}

function slotLabel(record: ValidationRecord | null): string {
  if (!record) return '0/2 slots filled';
  const count = (record.validator1 ? 1 : 0) + (record.validator2 ? 1 : 0);
  if (count === 2) return 'Slots full — verifying';
  return `${count}/2 slots filled`;
}

function slotColor(record: ValidationRecord | null): string {
  if (!record) return 'text-emerald-600';
  const count = (record.validator1 ? 1 : 0) + (record.validator2 ? 1 : 0);
  if (count === 2) return 'text-amber-600';
  if (count === 1) return 'text-blue-600';
  return 'text-emerald-600';
}

function isValidationFull(record: ValidationRecord | null): boolean {
  return !!record?.validator1 && !!record?.validator2;
}

function statusBadgeLabel(record: ValidationRecord | null, bounty: BountyAccount): string {
  if (record && isValidationFull(record)) return 'Settled';
  if ('paid' in bounty.status) return 'Settled';
  if ('rejected' in bounty.status) return 'Settled';
  if ('disputed' in bounty.status) return 'Disputed';
  if ('awaitingValidation' in bounty.status) return 'Awaiting Validation';
  return 'Open';
}

function statusBadgeClass(record: ValidationRecord | null, bounty: BountyAccount): string {
  if (record && isValidationFull(record)) return 'bg-emerald-100 text-emerald-800';
  if ('paid' in bounty.status || 'rejected' in bounty.status) return 'bg-stone-100 text-stone-700';
  if ('disputed' in bounty.status) return 'bg-red-100 text-red-800';
  if ('awaitingValidation' in bounty.status) return 'bg-amber-100 text-amber-800';
  return 'bg-blue-100 text-blue-800';
}

export default function ValidatePage() {
  const router = useRouter();
  const { fetchAllBounties } = useBounty();
  const { fetchValidationRecord } = useValidator();
  const { wallets } = useWallets();
  const activeAddress = wallets[0]?.address;

  const [bounties, setBounties] = useState<BountyAccount[]>([]);
  const [records, setRecords] = useState<Record<string, ValidationRecord | null>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const all = await fetchAllBounties('awaitingValidation');
      console.log('[validate board] setBounties count:', all.length, all.map(b => b.publicKey.toBase58().slice(0,8)));
      setBounties(all);

      // Fetch records immediately — drives slot counts
      const recordEntries = await Promise.all(
        all.map(async (b) => {
          try {
            const rec = await fetchValidationRecord(b.publicKey);
            return [b.publicKey.toBase58(), rec] as const;
          } catch {
            return [b.publicKey.toBase58(), null] as const;
          }
        })
      );
      setRecords(Object.fromEntries(recordEntries));

      // Fetch titles only for new bounties we haven't seen yet
      setTitles(prev => {
        const missing = all.filter(b => !prev[b.publicKey.toBase58()]);
        if (missing.length === 0) return prev;
        Promise.all(
          missing.map(async (b) => [b.publicKey.toBase58(), await fetchArticleTitle(b.originalTxId)] as const)
        ).then(entries => setTitles(t => ({ ...t, ...Object.fromEntries(entries) })));
        return prev;
      });
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load bounties');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fetchAllBounties, fetchValidationRecord]);

  useEffect(() => {
    load();
  }, [load]);

  // A bounty is "live" only if on-chain status is awaitingValidation AND
  // at least one validator slot is still open for registration/attestation.
  // Once both validator slots are filled, the job is terminal for the board
  // even if the status field still lags behind settlement.
  const activeBounties = bounties.filter(b => {
    if (!('awaitingValidation' in b.status)) return false;
    const rec = records[b.publicKey.toBase58()];
    if (isValidationFull(rec)) return false;
    return true;
  });
  const myBounties = activeBounties.filter(b => b.author.toBase58() === activeAddress);
  const pendingBounties = activeBounties.filter(b => b.author.toBase58() !== activeAddress);

  const renderBountyCard = (bounty: BountyAccount, i: number, isHorizontal: boolean) => {
    const pda = bounty.publicKey.toBase58();
    const record = records[pda] ?? null;
    const title = titles[pda] ?? '…';
    
    const isVal1 = record?.validator1?.toBase58() === activeAddress;
    const isVal2 = record?.validator2?.toBase58() === activeAddress;
    const isMyValidatorJob = !!activeAddress && (isVal1 || isVal2);
    
    const isFull = isValidationFull(record);
    const isLockedOut = isFull;
    const badgeLabel = statusBadgeLabel(record, bounty);
    const badgeClass = statusBadgeClass(record, bounty);
    
    const hasVoted = isVal1 ? record?.attestationId1 !== null : (isVal2 ? record?.attestationId2 !== null : false);
    
    let btnText = 'Review Job';
    if (isLockedOut) btnText = 'Full — Verifying';
    else if (isMyValidatorJob && !hasVoted) btnText = 'Complete Validation';
    else if (isMyValidatorJob && hasVoted) btnText = 'Validation Submitted';

    return (
      <motion.div
        key={pda}
        initial={isHorizontal ? { opacity: 0, x: 20 } : { opacity: 0, y: 16 }}
        animate={isHorizontal ? { opacity: 1, x: 0 } : { opacity: 1, y: 0 }}
        transition={{ delay: i * 0.05 }}
        onClick={() => !isLockedOut && router.push(`/app/validate/${pda}`)}
        className={`bg-white border border-stone-200 p-6 ${isLockedOut ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:shadow-md hover:border-stone-300'} transition-all group ${
          isHorizontal 
            ? 'flex-shrink-0 w-80 rounded-[24px] flex flex-col' 
            : 'rounded-[28px]'
        }`}
      >
        {/* Title */}
        <h3 className={`font-semibold text-ink text-base mb-4 line-clamp-2 transition-colors ${!isLockedOut ? 'group-hover:text-violet-700' : ''}`}>
          {title}
        </h3>

        {/* Meta */}
        <div className={`space-y-2 mb-5 ${isHorizontal ? 'mt-auto' : ''}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest ${badgeClass}`}>
              {badgeLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Languages size={13} />
            <span>{bounty.targetLanguage}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Coins size={13} />
            <span>${usdcAmount(bounty.rewardAmount)} USDC reward</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <Lock size={13} />
            <span>Stake required: ${(bounty.rewardAmount.toNumber() / 1_000_000 * 1.5).toFixed(2)} USDC</span>
          </div>
          <div className={`flex items-center gap-2 text-sm font-medium ${slotColor(record)}`}>
            <Users size={13} />
            <span>{slotLabel(record)}</span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={(e) => { e.stopPropagation(); if (!isLockedOut) router.push(`/app/validate/${pda}`); }}
          disabled={isLockedOut || (isMyValidatorJob && hasVoted)}
          className="w-full mt-auto py-2.5 rounded-xl text-sm font-semibold transition-colors bg-ink text-parchment hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {btnText}
        </button>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Section for "Your Translated Articles" */}
      {myBounties.length > 0 && (
        <div className="bg-parchment pt-32 pb-0 px-8">
          <div className="max-w-6xl mx-auto mb-10">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <ShieldCheck size={24} className="text-ink" />
                  <h1 className="text-3xl font-bold text-ink">Validator Board</h1>
                </div>
                <p className="text-stone-500 text-sm max-w-xl">
                  Earn rewards by validating translation quality. Review the semantic-tagged phrases,
                  assess cultural accuracy, and attest your verdict on-chain.
                </p>
              </div>
            </div>

            <div className="mt-10">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-2xl text-ink font-serif italic">Your Translated Articles</h2>
                <span className="text-xs uppercase tracking-widest text-stone-400 font-medium">
                  Live queue
                </span>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-none">
                {myBounties.map((bounty, i) => renderBountyCard(bounty, i, true))}
              </div>
            </div>
            <div className="h-px bg-stone-200 mt-8" />
          </div>
        </div>
      )}

      {/* Main Section for "Pending Jobs" */}
      <div className={`flex-grow bg-parchment ${myBounties.length > 0 ? 'pt-8' : 'pt-32'} pb-20 px-8`}>
        <div className="max-w-6xl mx-auto">
          {myBounties.length === 0 && (
            <div className="mb-10">
              <div className="flex items-center gap-3 mb-2">
                <ShieldCheck size={24} className="text-ink" />
                <h1 className="text-3xl font-bold text-ink">Validator Board</h1>
              </div>
              <p className="text-stone-500 text-sm max-w-xl">
                Earn rewards by validating translation quality. Review the semantic-tagged phrases,
                assess cultural accuracy, and attest your verdict on-chain.
              </p>
            </div>
          )}

          {myBounties.length > 0 && (
            <h2 className="text-4xl text-ink font-serif italic mb-8">Pending Jobs</h2>
          )}

          {/* Content */}
          {loading ? (
            <div className="flex items-center gap-3 text-stone-400 py-20 justify-center">
              <Loader2 size={22} className="animate-spin" />
              <span>Loading open jobs…</span>
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : pendingBounties.length === 0 ? (
            <div className="text-center py-20 text-stone-400">
              <ShieldCheck size={40} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg">No pending jobs awaiting validation right now.</p>
              <p className="text-sm mt-1">Check back soon or post a bounty to get things moving.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {pendingBounties.map((bounty, i) => renderBountyCard(bounty, i, false))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
