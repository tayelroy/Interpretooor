import { useCallback, useEffect, useState } from 'react';
import { useWallets } from '@privy-io/react-auth/solana';

export interface MyArticle {
  assetId: string;
  title: string;
  arweaveTxId: string;
}

// Arweave TX IDs are 43 base64url chars; Irys devnet IDs are 44 chars
function extractTxId(uri: string): string {
  const match = uri.match(/([A-Za-z0-9_-]{43,44})(?:[/?#]|$)/);
  return match ? match[1] : uri;
}

export function useMyArticles() {
  const { wallets } = useWallets();
  const [articles, setArticles] = useState<MyArticle[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchArticles = useCallback(async () => {
    const wallet = wallets[0];
    if (!wallet || !process.env.NEXT_PUBLIC_HELIUS_RPC_URL) return;

    setLoading(true);
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_HELIUS_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: wallet.address,
            page: 1,
            limit: 100,
          },
        }),
      });

      const { result } = await res.json();
      const items: Array<{
        id: string;
        interface: string;
        content?: { json_uri?: string; metadata?: { name?: string } };
      }> = result?.items ?? [];

      setArticles(
        items
          .filter(
            (a) =>
              a.interface === 'MplCoreAsset' &&
              a.content?.json_uri &&
              // Only include assets whose URI looks like an Arweave TX ID
              /[A-Za-z0-9_-]{43}/.test(a.content.json_uri)
          )
          .map((a) => ({
            assetId: a.id,
            title: a.content?.metadata?.name ?? 'Untitled',
            arweaveTxId: extractTxId(a.content!.json_uri!),
          }))
      );
    } catch (err) {
      console.error('[useMyArticles] Failed to fetch articles:', err);
    } finally {
      setLoading(false);
    }
  }, [wallets]);

  useEffect(() => {
    if (wallets[0]) fetchArticles();
  }, [wallets, fetchArticles]);

  return { articles, loading, refetch: fetchArticles };
}
