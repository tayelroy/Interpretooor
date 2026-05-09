"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowRight, BadgeCheck, Languages, Clock, AlertCircle, Loader2, Globe } from 'lucide-react';
import { PublicKey } from '@solana/web3.js';
import { useBounty, type BountyAccount } from '../../hooks/useBounty';

// ─── Status badge helpers ─────────────────────────────────────────────────────

function statusLabel(status: BountyAccount['status']): string {
  if ('open' in status) return 'Open';
  if ('claimed' in status) return 'Claimed';
  if ('pendingReview' in status) return 'Pending Review';
  if ('awaitingValidation' in status) return 'Awaiting Validation';
  if ('disputed' in status) return 'Disputed';
  if ('paid' in status) return 'Paid';
  return 'Unknown';
}

function statusColor(status: BountyAccount['status']): string {
  if ('open' in status) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if ('claimed' in status) return 'bg-blue-100 text-blue-800 border-blue-200';
  if ('pendingReview' in status) return 'bg-amber-100 text-amber-800 border-amber-200';
  if ('awaitingValidation' in status) return 'bg-violet-100 text-violet-800 border-violet-200';
  if ('disputed' in status) return 'bg-red-100 text-red-800 border-red-200';
  if ('paid' in status) return 'bg-stone-100 text-stone-500 border-stone-200';
  return '';
}

function usdcAmount(rawAmount: { toNumber: () => number }): string {
  return (rawAmount.toNumber() / 1_000_000).toFixed(2);
}

function timeAgo(submissionTs: number): string {
  if (submissionTs === 0) return 'N/A';
  const diffSecs = Math.floor(Date.now() / 1000) - submissionTs;
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
  return `${Math.floor(diffSecs / 86400)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DashboardProps {
  onJobSelect: (bountyPda: PublicKey) => void;
  containerClassName?: string;
}

async function fetchArticleTitle(txId: string): Promise<string> {
  const gateway = process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz';
  try {
    const res = await fetch(`${gateway}/${txId}`, { headers: { Range: 'bytes=0-150' } });
    const text = await res.text();
    const match = text.match(/^#\s+(.+)/m);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

export default function Dashboard({ onJobSelect, containerClassName }: DashboardProps) {
  const router = useRouter();
  const { fetchAllBounties, isDisputeWindowOpen } = useBounty();

  const [bounties, setBounties] = useState<BountyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});

  const loadBounties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchAllBounties();
      const active = all.filter(
        (b) => 'open' in b.status || 'claimed' in b.status
      );
      setBounties(active);

      // Fetch titles in parallel after bounties are set
      const entries = await Promise.all(
        active.map(async (b) => [b.originalTxId, await fetchArticleTitle(b.originalTxId)] as const)
      );
      setTitles(Object.fromEntries(entries));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [fetchAllBounties]);

  useEffect(() => {
    loadBounties();
  }, [loadBounties]);

  return (
    <div className={containerClassName ?? 'bg-parchment min-h-screen pt-40 pb-20 px-8'}>
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 flex justify-between items-end">
          <div>
            <h1 className="text-5xl text-ink leading-none mb-4">Pending Jobs</h1>
            <div className="h-1 w-24 bg-pale-lavender" />
          </div>
          <div className="flex gap-4">
            <div className="px-6 py-2 bg-white rounded-full border border-stone-200 text-stone-500 text-sm flex items-center gap-2">
              <BadgeCheck size={16} />
              On-Chain Escrow
            </div>
            <button
              onClick={loadBounties}
              className="px-6 py-2 bg-white rounded-full border border-stone-200 text-stone-500 text-sm hover:border-stone-300 transition-colors"
            >
              Refresh
            </button>
          </div>
        </header>

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-stone-400">
            <Loader2 size={32} className="animate-spin" />
            <p className="text-sm">Fetching on-chain bounties…</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 mb-8">
            <AlertCircle size={20} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && bounties.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-stone-400">
            <Languages size={48} className="opacity-30" />
            <p className="text-sm">No open bounties right now. Check back soon.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bounties.map((bounty, i) => (
            <motion.div
              key={bounty.publicKey.toBase58()}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              onClick={() => router.push(`/app/article/${bounty.originalTxId}`)}
              className="bg-white rounded-[32px] p-8 border border-stone-200/60 shadow-sm hover:shadow-md transition-all group flex flex-col h-full cursor-pointer"
            >
              {/* Header row */}
              <div className="flex justify-between items-start mb-6">
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full border ${statusColor(bounty.status)}`}
                >
                  {statusLabel(bounty.status)}
                </span>
                <div className="flex items-center gap-1 text-ink font-bold text-lg">
                  <span>{usdcAmount(bounty.rewardAmount)}</span>
                  <span className="text-stone-400 text-sm font-normal">USDC</span>
                </div>
              </div>

              {/* Title + language */}
              <div className="flex flex-col gap-2 mb-6 flex-grow">
                <p className="text-ink font-medium leading-snug line-clamp-2 text-base">
                  {titles[bounty.originalTxId] ?? (
                    <span className="inline-block h-4 w-40 rounded bg-stone-100 animate-pulse" />
                  )}
                </p>
                {bounty.targetLanguage && (
                  <div className="flex items-center gap-2 text-xs text-stone-500 font-medium">
                    <Globe size={12} />
                    <span>→ {bounty.targetLanguage}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-stone-400 font-mono">
                  <ArrowRight size={12} />
                  <span className="truncate">{bounty.originalTxId}</span>
                </div>

                {'pendingReview' in bounty.status && (
                  <div className="flex items-center gap-2 text-xs mt-2">
                    <Clock
                      size={12}
                      className={
                        isDisputeWindowOpen(bounty)
                          ? 'text-amber-500'
                          : 'text-emerald-500'
                      }
                    />
                    <span
                      className={
                        isDisputeWindowOpen(bounty)
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }
                    >
                      {isDisputeWindowOpen(bounty)
                        ? 'Review window open'
                        : 'Window expired — payout ready'}
                    </span>
                  </div>
                )}
              </div>

              {/* Footer row */}
              <div className="flex justify-between items-center mt-auto">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-stone-400 font-mono truncate w-28">
                    {bounty.author.toBase58().slice(0, 8)}…
                  </span>
                  {'open' in bounty.status && (
                    <span className="text-xs text-stone-400">
                      {timeAgo(bounty.submissionTimestamp.toNumber())}
                    </span>
                  )}
                </div>

                {'open' in bounty.status && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onJobSelect(bounty.publicKey); }}
                    className="px-8 py-3 bg-pale-lavender text-ink rounded-xl font-semibold hover:bg-opacity-80 transition-all active:scale-95"
                  >
                    Claim
                  </button>
                )}

                {'claimed' in bounty.status && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onJobSelect(bounty.publicKey); }}
                    className="px-8 py-3 bg-stone-100 text-stone-600 rounded-xl font-semibold hover:bg-stone-200 transition-all active:scale-95"
                  >
                    View
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
