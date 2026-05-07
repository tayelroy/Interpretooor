'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import { ArrowLeft, Download, CheckCircle, Loader2, AlertCircle, Globe, XCircle } from 'lucide-react';
import { useBounty, type BountyAccount } from '@/hooks/useBounty';
import { parseMdh, exportToMdh, type ParsedMdh } from '@/lib/mdh-utils';
import MdhRenderer from '@/app/components/MdhRenderer';
import { toast } from 'sonner';

const IRYS_GATEWAY = process.env.NEXT_PUBLIC_IRYS_NODE_URL ?? 'https://devnet.irys.xyz';

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

  const { fetchBounty, claimBounty, cancelBounty, disputeBounty } = useBounty();

  const [bounty, setBounty] = useState<BountyAccount | null>(null);
  const [originalParsed, setOriginalParsed] = useState<ParsedMdh | null>(null);
  const [originalRaw, setOriginalRaw] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pda = new PublicKey(bountyId);
      const data = await fetchBounty(pda);
      setBounty(data);

      const contentUrl = `${IRYS_GATEWAY}/${data.originalTxId}`;
      console.log('[bounty] fetching content from:', contentUrl);
      const res = await fetch(contentUrl);
      if (!res.ok) throw new Error(`Failed to fetch content (${res.status}) from ${contentUrl}`);
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
      router.push(`/app/workspace/${bountyId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to claim bounty');
      setClaiming(false);
    }
  };

  const handleCancel = async () => {
    if (!bounty) return;
    setCancelling(true);
    try {
      await cancelBounty({ bountyPda: bounty.publicKey, bountyData: bounty });
      toast.success('Bounty cancelled — USDC refunded.');
      router.push('/app/translate');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel bounty');
      setCancelling(false);
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

        {/* Accept Job / Cancel — shown only for Open bounties */}
        {isOpen && (
          <div className="flex justify-between items-center">
            {/* Cancel — author only */}
            {isAuthor && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex items-center gap-2 px-6 py-3 border border-red-300 text-red-500 rounded-2xl text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {cancelling ? (
                  <><Loader2 size={16} className="animate-spin" /> Cancelling…</>
                ) : (
                  <><XCircle size={16} /> Cancel Bounty</>
                )}
              </button>
            )}

            {/* Accept — non-authors */}
            {!activeAddress ? (
              <p className="text-sm text-stone-500 py-3 ml-auto">Connect your wallet to accept this job.</p>
            ) : !isAuthor ? (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="flex items-center gap-2 px-8 py-4 bg-ink text-parchment rounded-2xl font-bold text-base hover:opacity-90 transition-opacity disabled:opacity-50 ml-auto"
              >
                {claiming ? (
                  <><Loader2 size={18} className="animate-spin" /> Accepting…</>
                ) : (
                  <><CheckCircle size={18} /> Accept Job</>
                )}
              </button>
            ) : null}
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

function PendingReviewPanel({
  bounty,
  bountyId,
  isAuthor,
  onRefresh,
}: {
  bounty: BountyAccount;
  bountyId: string;
  isAuthor: boolean;
  onRefresh: () => void;
}) {
  const { disputeBounty } = useBounty();
  const [translatedParsed, setTranslatedParsed] = useState<ParsedMdh | null>(null);
  const [loadingTranslation, setLoadingTranslation] = useState(true);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [disputed, setDisputed] = useState(false);

  useEffect(() => {
    if (!bounty.translatedTxId) { setLoadingTranslation(false); return; }
    const gateway = process.env.NEXT_PUBLIC_IRYS_NODE_URL ?? 'https://devnet.irys.xyz';
    fetch(`${gateway}/${bounty.translatedTxId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load translation (${r.status})`);
        return r.text();
      })
      .then((raw) => setTranslatedParsed(parseMdh(raw)))
      .catch((err) => setTranslationError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingTranslation(false));
  }, [bounty.translatedTxId]);

  const handleDispute = async () => {
    setDisputing(true);
    try {
      await disputeBounty(bounty.publicKey);
      setDisputed(true);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dispute failed');
    } finally {
      setDisputing(false);
    }
  };

  const submissionTs = bounty.submissionTimestamp.toNumber();
  const countdown = hoursRemaining(submissionTs);

  return (
    <div className="mt-6 space-y-6">
      {/* Timer banner */}
      <div className="flex items-center justify-between px-6 py-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-sm">
        <span className="font-medium">Review window: {countdown}</span>
        {bounty.translatedTxId && (
          <span className="font-mono text-xs opacity-70">
            TX: {bounty.translatedTxId.slice(0, 12)}…
          </span>
        )}
      </div>

      {/* Translated content */}
      <div className="bg-white rounded-[32px] p-10 border border-stone-200 shadow-sm">
        <div className="flex justify-between items-center mb-8 pb-4 border-b border-stone-100">
          <h2 className="text-xl text-ink">Submitted Translation</h2>
          <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">
            {bounty.targetLanguage ?? 'Target'}
          </span>
        </div>

        {loadingTranslation && (
          <div className="flex items-center gap-2 text-stone-400 py-8">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading translation…</span>
          </div>
        )}

        {translationError && (
          <div className="flex items-start gap-2 text-red-600 text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {translationError}
          </div>
        )}

        {translatedParsed && <MdhRenderer parsedMdh={translatedParsed} />}

        {!loadingTranslation && !translationError && !bounty.translatedTxId && (
          <p className="text-stone-400 text-sm">Translation content not yet available.</p>
        )}
      </div>

      {/* Dispute button — author only */}
      {isAuthor && (
        <div className="flex justify-end">
          {disputed ? (
            <p className="text-sm text-stone-600 bg-stone-100 px-5 py-3 rounded-xl">
              Dispute submitted. Funds are locked pending admin review.
            </p>
          ) : (
            <button
              onClick={handleDispute}
              disabled={disputing}
              className="flex items-center gap-2 px-8 py-4 border border-red-400 text-red-600 rounded-2xl font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {disputing ? (
                <><Loader2 size={18} className="animate-spin" /> Filing Dispute…</>
              ) : (
                'Dispute Translation'
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
