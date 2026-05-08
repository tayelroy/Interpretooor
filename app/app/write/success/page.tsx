'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, ArrowRight, ExternalLink } from 'lucide-react';

const REDIRECT_DELAY_SECS = 5;

export default function PublishSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assetId = searchParams.get('assetId') ?? '';

  const [countdown, setCountdown] = useState(REDIRECT_DELAY_SECS);

  useEffect(() => {
    if (!assetId) return;

    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(interval);
          router.push(`/app/article/${assetId}`);
        }
        return n - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [assetId, router]);

  return (
    <div className="min-h-screen bg-parchment flex flex-col items-center justify-center px-8">
      <div className="max-w-lg w-full flex flex-col items-center gap-8 text-center">

        <CheckCircle2 size={56} className="text-forest-canopy" strokeWidth={1.5} />

        <div className="space-y-3">
          <h1 className="text-5xl font-serif tracking-tight text-ink leading-none">
            Published.
          </h1>
          <p className="text-stone-500 text-lg leading-relaxed">
            Your article is permanently stored on Arweave and minted as an NFT on Solana.
          </p>
        </div>

        {assetId && (
          <div className="w-full bg-white border border-stone-200 rounded-2xl px-6 py-4 flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-medium">Asset ID</span>
            <span className="font-mono text-sm text-ink break-all">{assetId}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => router.push(`/app/article/${assetId}`)}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-ink text-parchment rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            Read Article
            <ArrowRight size={16} />
          </button>
          <a
            href={`https://solscan.io/token/${assetId}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white border border-stone-200 text-stone-600 rounded-xl font-medium hover:border-stone-300 transition-colors"
          >
            View on Solscan
            <ExternalLink size={14} />
          </a>
        </div>

        {assetId && (
          <p className="text-stone-400 text-sm">
            Redirecting to your article in {countdown}s…
          </p>
        )}
      </div>
    </div>
  );
}
