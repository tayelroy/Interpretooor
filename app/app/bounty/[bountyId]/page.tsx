'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import { ArrowLeft, Download, CheckCircle, Loader2, AlertCircle, Globe } from 'lucide-react';
import { useBounty, type BountyAccount } from '@/hooks/useBounty';
import { parseMdh, exportToMdh, type ParsedMdh } from '@/lib/mdh-utils';
import MdhRenderer from '@/app/components/MdhRenderer';
import { toast } from 'sonner';

const ARWEAVE_GATEWAY = process.env.NEXT_PUBLIC_ARWEAVE_GATEWAY ?? 'https://arweave.net';

function usdcAmount(raw: { toNumber: () => number }): string {
  return (raw.toNumber() / 1_000_000).toFixed(2);
}

function statusLabel(status: BountyAccount['status']): string {
  if ('open' in status) return 'Open';
  if ('claimed' in status) return 'Claimed';
  if ('pendingReview' in status) return 'Pending Review';
  if ('disputed' in status) return 'Disputed';
  if ('paid' in status) return 'Paid';
  return 'Unknown';
}

function hoursRemaining(submissionTs: number): string {
  const expiresAt = (submissionTs + 48 * 60 * 60) * 1000;
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'Window expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m remaining`;
}

export default function BountyDetailPage() {
  const params = useParams();
  const bountyId = params.bountyId as string;
  const router = useRouter();
  const { wallets } = useWallets();
  const activeAddress = wallets[0]?.address;

  const { fetchBounty, claimBounty } = useBounty();

  const [bounty, setBounty] = useState<BountyAccount | null>(null);
  const [originalParsed, setOriginalParsed] = useState<ParsedMdh | null>(null);
  const [originalRaw, setOriginalRaw] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pda = new PublicKey(bountyId);
      const data = await fetchBounty(pda);
      setBounty(data);

      const res = await fetch(`${ARWEAVE_GATEWAY}/${data.originalTxId}`);
      if (!res.ok) throw new Error(`Failed to fetch content (${res.status})`);
      const raw = await res.text();
      setOriginalRaw(raw);
      setOriginalParsed(parseMdh(raw));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [bountyId, fetchBounty]);

  useEffect(() => { load(); }, [load]);

  const handleExport = () => {
    if (!originalRaw) return;
    try {
      exportToMdh(originalRaw, `bounty-${bountyId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleClaim = async () => {
    if (!bounty) return;
    setClaiming(true);
    try {
      await claimBounty(bounty.publicKey);
      router.push(`/workspace/${bountyId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to claim bounty');
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-parchment pt-40 flex items-center justify-center">
        <div className="flex items-center gap-3 text-stone-400">
          <Loader2 size={24} className="animate-spin" />
          <span>Loading bounty…</span>
        </div>
      </div>
    );
  }

  if (loadError || !bounty) {
    return (
      <div className="min-h-screen bg-parchment pt-40 px-8">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-stone-500 hover:text-ink mb-8">
            <ArrowLeft size={18} /> Back
          </button>
          <div className="flex items-start gap-3 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700">
            <AlertCircle size={20} className="mt-0.5 shrink-0" />
            <span>{loadError ?? 'Bounty not found'}</span>
          </div>
        </div>
      </div>
    );
  }

  const isAuthor = activeAddress === bounty.author.toBase58();
  const isOpen = 'open' in bounty.status;
  const isPendingReview = 'pendingReview' in bounty.status;

  return (
    <div className="min-h-screen bg-parchment pt-40 pb-20 px-8">
      <div className="max-w-4xl mx-auto">

        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-stone-500 hover:text-ink transition-colors mb-8 group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          Back to Board
        </button>

        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-semibold px-3 py-1 rounded-full border bg-stone-100 text-stone-600 border-stone-200">
              {statusLabel(bounty.status)}
            </span>
            {bounty.targetLanguage && (
              <span className="flex items-center gap-1.5 text-xs text-stone-500">
                <Globe size={12} />
                → {bounty.targetLanguage}
              </span>
            )}
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-xs text-stone-400 mb-1">
                {bounty.originalTxId.slice(0, 16)}…{bounty.originalTxId.slice(-8)}
              </p>
              <p className="text-stone-500 text-sm">
                Author: <span className="font-mono">{bounty.author.toBase58().slice(0, 8)}…</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-ink">{usdcAmount(bounty.rewardAmount)}</p>
              <p className="text-sm text-stone-400">USDC reward</p>
            </div>
          </div>
        </header>

        {/* Original content */}
        <div className="bg-white rounded-[32px] p-10 border border-stone-200 shadow-sm mb-6">
          <div className="flex justify-between items-center mb-8 pb-4 border-b border-stone-100">
            <h2 className="text-xl text-ink">Original Source</h2>
            <button
              onClick={handleExport}
              disabled={!originalRaw}
              className="flex items-center gap-2 px-4 py-2 bg-stone-100 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-200 transition-colors disabled:opacity-40"
            >
              <Download size={14} />
              Export Original .mdh
            </button>
          </div>

          {originalParsed ? (
            <MdhRenderer parsedMdh={originalParsed} />
          ) : (
            <p className="text-stone-400 text-sm">Content unavailable</p>
          )}
        </div>

        {/* Accept Job — shown only for Open bounties to non-authors */}
        {isOpen && (
          <div className="flex justify-end">
            {!activeAddress ? (
              <p className="text-sm text-stone-500 py-3">Connect your wallet to accept this job.</p>
            ) : isAuthor ? null : (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="flex items-center gap-2 px-8 py-4 bg-ink text-parchment rounded-2xl font-bold text-base hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {claiming ? (
                  <><Loader2 size={18} className="animate-spin" /> Accepting…</>
                ) : (
                  <><CheckCircle size={18} /> Accept Job</>
                )}
              </button>
            )}
          </div>
        )}

        {!isOpen && !isPendingReview && 'claimed' in bounty.status && (
          <div className="text-center py-4">
            <span className="inline-block px-6 py-3 bg-stone-100 text-stone-500 rounded-2xl text-sm font-medium">
              Job Taken — This bounty has been claimed
            </span>
          </div>
        )}

        {/* Pending review: show translated content */}
        {isPendingReview && <PendingReviewPanel bounty={bounty} bountyId={bountyId} isAuthor={isAuthor} onRefresh={load} />}

      </div>
    </div>
  );
}

// Separated out so it can be added cleanly in commit 6
function PendingReviewPanel(_props: { bounty: BountyAccount; bountyId: string; isAuthor: boolean; onRefresh: () => void }) {
  return null;
}
