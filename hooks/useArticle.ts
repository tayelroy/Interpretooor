'use client';

import { useEffect, useState } from 'react';
import { parseMdh, type ParsedMdh } from '@/lib/mdh-utils';
import { parseMdhBlocks } from '@/lib/mdh-block-parser';

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

// Arweave TX IDs use base64url and contain _ or -; Solana pubkeys use base58 (no _ or -)
function isArweaveTxId(id: string): boolean {
  return /[_-]/.test(id);
}

function extractTitleFromMdh(rawContent: string, parsedMdh: ParsedMdh): string {
  const blocks = parseMdhBlocks(rawContent, parsedMdh.tags);
  const firstHeading = blocks.find((b) => b.type === 'heading');
  return firstHeading?.type === 'heading' ? firstHeading.text : '';
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
        const gateway =
          process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz';

        let arweaveTxId: string;
        let title = '';
        let author = '';

        if (isArweaveTxId(assetId)) {
          // Arweave TX ID passed directly — skip DAS lookup
          arweaveTxId = assetId;
        } else {
          // Metaplex asset ID — resolve via Helius DAS
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

          title = result?.content?.metadata?.name ?? '';
          author = result?.ownership?.owner ?? '';
          arweaveTxId = extractTxId(result?.content?.json_uri ?? '');

          if (!arweaveTxId) throw new Error('Asset has no Arweave TX ID');
        }

        // Fetch raw .mdh from gateway
        const mdhRes = await fetch(`${gateway}/${arweaveTxId}`);
        if (!mdhRes.ok) throw new Error(`Gateway fetch failed: ${mdhRes.status}`);

        const rawContent = await mdhRes.text();
        const parsedMdh = parseMdh(rawContent);

        // Fall back to first heading in the .mdh if DAS gave no title
        if (!title) {
          title = extractTitleFromMdh(rawContent, parsedMdh) || 'Untitled';
        }

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
