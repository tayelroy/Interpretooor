'use client';

import { useCallback, useEffect, useState } from 'react';
import { parseMdh } from '@/lib/mdh-utils';
import { parseMdhBlocks } from '@/lib/mdh-block-parser';
import { stripTags } from '@/lib/mdh-utils';

export interface HomeFeedPost {
  assetId: string;
  originalTxId: string;
  authorShort: string;
  title: string;
  excerpt: string;
}

const ARWEAVE_GRAPHQL =
  (process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz') + '/graphql';

const FEED_QUERY = `
  query InterpretooorFeed($first: Int!) {
    transactions(
      tags: [
        { name: "App-Name",       values: ["Interpretooor"] }
        { name: "Content-Format", values: ["mdh"] }
      ]
      first: $first
      order: DESC
    ) {
      edges {
        node {
          id
          tags { name value }
        }
      }
    }
  }
`;

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
  const [posts, setPosts] = useState<HomeFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Query Arweave GraphQL for all transactions tagged App-Name=Interpretooor + Content-Format=mdh.
      // This is the authoritative source — the relayer sets these tags on every upload.
      const gqlRes = await fetch(ARWEAVE_GRAPHQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: FEED_QUERY, variables: { first: 50 } }),
      });

      if (!gqlRes.ok) throw new Error(`Arweave GraphQL error: ${gqlRes.status}`);
      const { data, errors } = await gqlRes.json();
      if (errors?.length) throw new Error(errors[0].message);

      const edges: Array<{ node: { id: string; tags: { name: string; value: string }[] } }> =
        data?.transactions?.edges ?? [];

      const gateway = process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz';

      const enriched = await Promise.all(
        edges.map(async ({ node }): Promise<HomeFeedPost | null> => {
          const txId = node.id;
          const uploader = node.tags.find((t) => t.name === 'Uploader')?.value ?? '';

          let title = '';
          let excerpt = '';

          try {
            const mdhRes = await fetch(`${gateway}/${txId}`);
            if (!mdhRes.ok) return null;
            const raw = await mdhRes.text();
            const preview = extractPreview(raw);
            title = preview.title;
            excerpt = preview.excerpt;
          } catch {
            return null;
          }

          if (!title) title = `${txId.slice(0, 12)}…`;

          return {
            assetId: txId,
            originalTxId: txId,
            authorShort: uploader.slice(0, 8),
            title,
            excerpt,
          };
        })
      );

      setPosts(enriched.filter((p): p is HomeFeedPost => p !== null));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { posts, loading, error, refetch: load };
}
