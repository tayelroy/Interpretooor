'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
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

export default function ValidatePage() {
  const router = useRouter();
  const { fetchAllBounties } = useBounty();
  const { fetchValidationRecord } = useValidator();

  const [bounties, setBounties] = useState<BountyAccount[]>([]);
  const [records, setRecords] = useState<Record<string, ValidationRecord | null>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchAllBounties('awaitingValidation');
      setBounties(all);

      // Fetch titles and validation records in parallel
      const titleEntries = await Promise.all(
        all.map(async (b) => [b.publicKey.toBase58(), await fetchArticleTitle(b.originalTxId)] as const)
      );
      setTitles(Object.fromEntries(titleEntries));

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bounties');
    } finally {
      setLoading(false);
    }
  }, [fetchAllBounties, fetchValidationRecord]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-parchment pt-32 pb-20 px-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
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
        ) : bounties.length === 0 ? (
          <div className="text-center py-20 text-stone-400">
            <ShieldCheck size={40} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg">No jobs awaiting validation right now.</p>
            <p className="text-sm mt-1">Check back soon or post a bounty to get things moving.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {bounties.map((bounty, i) => {
              const pda = bounty.publicKey.toBase58();
              const record = records[pda] ?? null;
              const title = titles[pda] ?? '…';
              const isFull = record
                ? !!(record.validator1 && record.validator2)
                : false;

              return (
                <motion.div
                  key={pda}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => router.push(`/app/validate/${pda}`)}
                  className="bg-white border border-stone-200 rounded-[28px] p-6 cursor-pointer hover:shadow-md hover:border-stone-300 transition-all group"
                >
                  {/* Title */}
                  <h3 className="font-semibold text-ink text-base mb-4 line-clamp-2 group-hover:text-violet-700 transition-colors">
                    {title}
                  </h3>

                  {/* Meta */}
                  <div className="space-y-2 mb-5">
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
                    onClick={(e) => { e.stopPropagation(); router.push(`/app/validate/${pda}`); }}
                    disabled={isFull}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors
                      bg-ink text-parchment hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isFull ? 'Full — Verifying' : 'Review Job'}
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
