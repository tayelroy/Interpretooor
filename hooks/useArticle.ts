'use client';

import { useEffect, useState } from 'react';
import { parseMdh, type ParsedMdh } from '@/lib/mdh-utils';

export interface ArticleData {
  title: string;
  author: string;
  arweaveTxId: string;
  parsedMdh: ParsedMdh;
}

function extractTxId(uri: string): string {
  const match = uri.match(/([A-Za-z0-9_-]{43,44})(?:[/?#]|$)/);
  return match ? match[1] : uri;
}

export function useArticle(assetId: string) {
  const [data, setData] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 1. Resolve Metaplex asset → Arweave TX ID + metadata
        const dasRes = await fetch(process.env.NEXT_PUBLIC_HELIUS_RPC_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAsset',
            params: { id: assetId },
          }),
        });

        if (!dasRes.ok) throw new Error(`DAS API error: ${dasRes.status}`);
        const { result } = await dasRes.json();

        const title: string = result?.content?.metadata?.name ?? 'Untitled';
        const author: string = result?.ownership?.owner ?? '';
        const arweaveTxId = extractTxId(result?.content?.json_uri ?? '');

        if (!arweaveTxId) throw new Error('Asset has no Arweave TX ID');

        // 2. Fetch raw .mdh from the Irys/Arweave gateway
        const gateway =
          process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz';
        const mdhRes = await fetch(`${gateway}/${arweaveTxId}`);
        if (!mdhRes.ok) throw new Error(`Gateway fetch failed: ${mdhRes.status}`);

        const rawContent = await mdhRes.text();
        const parsedMdh = parseMdh(rawContent);

        if (!cancelled) setData({ title, author, arweaveTxId, parsedMdh });
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [assetId]);

  return { data, loading, error };
}
