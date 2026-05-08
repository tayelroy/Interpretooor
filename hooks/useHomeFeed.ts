'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBounty, type BountyAccount } from './useBounty';
import { parseMdh } from '@/lib/mdh-utils';
import { parseMdhBlocks } from '@/lib/mdh-block-parser';
import { stripTags } from '@/lib/mdh-utils';

export interface HomeFeedPost {
  originalTxId: string;
  targetLanguage: string;
  rewardUsdc: number;
  authorShort: string;
  isPaid: boolean;
  title: string;
  excerpt: string;
}

function extractPreview(rawContent: string): { title: string; excerpt: string } {
  const { tags } = parseMdh(rawContent);
  const blocks = parseMdhBlocks(rawContent, tags);

  const firstHeading = blocks.find((b) => b.type === 'heading');
  const title = firstHeading?.type === 'heading' ? firstHeading.text : '';

  const firstPara = blocks.find((b) => b.type === 'paragraph');
  const excerpt =
    firstPara?.type === 'paragraph'
      ? stripTags(firstPara.rawText).slice(0, 200).replace(/\n/g, ' ').trim()
      : '';

  return { title, excerpt };
}

export function useHomeFeed() {
  const { fetchAllBounties } = useBounty();
  const [posts, setPosts] = useState<HomeFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchAllBounties();
      const readable = all.filter(
        (b: BountyAccount) => 'paid' in b.status || 'pendingReview' in b.status
      );

      const gateway =
        process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz';

      const enriched = await Promise.all(
        readable.map(async (b: BountyAccount): Promise<HomeFeedPost> => {
          let title = '';
          let excerpt = '';
          try {
            const res = await fetch(`${gateway}/${b.originalTxId}`);
            if (res.ok) {
              ({ title, excerpt } = extractPreview(await res.text()));
            }
          } catch {
            // non-fatal — fall back to truncated TX ID
          }

          return {
            originalTxId: b.originalTxId,
            targetLanguage: b.targetLanguage,
            rewardUsdc: b.rewardAmount.toNumber() / 1_000_000,
            authorShort: b.author.toBase58().slice(0, 8),
            isPaid: 'paid' in b.status,
            title: title || `${b.originalTxId.slice(0, 12)}…`,
            excerpt,
          };
        })
      );

      setPosts(enriched);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchAllBounties]);

  useEffect(() => {
    void load();
  }, [load]);

  return { posts, loading, error, refetch: load };
}
