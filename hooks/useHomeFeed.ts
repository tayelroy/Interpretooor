'use client';

import { useCallback, useEffect, useState } from 'react';
import { parseMdh } from '@/lib/mdh-utils';
import { parseMdhBlocks } from '@/lib/mdh-block-parser';
import { stripTags } from '@/lib/mdh-utils';
import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BOUNTY_IDL = require('../lib/idl/translation_bounty.json');

export interface HomeFeedPost {
  assetId: string;
  originalTxId: string;
  authorShort: string;
  authorFull: string;
  title: string;
  excerpt: string;
  readingTime: number;
  tagCount: number;
  tagKeys: string[];
  timestamp?: number;
  isTranslation?: boolean;
}

const ARWEAVE_GRAPHQL =
  (process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz') + '/graphql';

const PROGRAM_ID =
  process.env.NEXT_PUBLIC_BOUNTY_PROGRAM_ID ?? '5kRPV7z2BUQn5rEXAhAPbBdHGU4KAYKo8FXBwmG3ahiP';

const FEED_QUERY = `
  query InterpretooorFeed($first: Int!) {
    transactions(
      tags: [
        { name: "App-Name",       values: ["Interpretooor"] }
        { name: "Content-Format", values: ["mdh"] }
        { name: "Doc-Type",       values: ["article", "translation"] }
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

interface Preview {
  title: string;
  excerpt: string;
  readingTime: number;
  tagCount: number;
  tagKeys: string[];
}

function extractPreview(rawContent: string): Preview {
  const { tags } = parseMdh(rawContent);
  const blocks = parseMdhBlocks(rawContent, tags);

  const firstHeading = blocks.find((b) => b.type === 'heading');
  const title = firstHeading?.type === 'heading' ? firstHeading.text : '';

  const firstPara = blocks.find((b) => b.type === 'paragraph');
  const excerpt =
    firstPara?.type === 'paragraph'
      ? stripTags(firstPara.rawText).slice(0, 200).replace(/\n/g, ' ').trim()
      : '';

  const wordCount = stripTags(rawContent).split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));
  const tagCount = tags.length;
  const tagKeys = [...new Set(tags.map((t) => t.key))];

  return { title, excerpt, readingTime, tagCount, tagKeys };
}

export function useHomeFeed() {
  const [posts, setPosts] = useState<HomeFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch all bounties to know which translations are Paid
      const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL!, 'confirmed');
      const dummyKey = Keypair.generate();
      const dummyWallet = {
        publicKey: dummyKey.publicKey,
        signTransaction: async <T>(tx: T) => tx,
        signAllTransactions: async <T>(txs: T[]) => txs,
      };
      const provider = new anchor.AnchorProvider(connection, dummyWallet as any, { commitment: 'confirmed' });
      const idl = { ...(BOUNTY_IDL as any), address: PROGRAM_ID };
      const program = new anchor.Program(idl as any, provider);
      
      const allBounties = await (program.account as any).bountyAccount.all();
      const paidTranslationIds = new Set<string>();
      allBounties.forEach((b: any) => {
        if ('paid' in b.account.status && b.account.translatedTxId) {
          paidTranslationIds.add(b.account.translatedTxId);
        }
      });

      // 2. Query Arweave
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
          const docType = node.tags.find((t) => t.name === 'Doc-Type')?.value ?? 'article';
          const timestampTag = node.tags.find((t) => t.name === 'Timestamp')?.value;
          const timestamp = timestampTag ? parseInt(timestampTag, 10) : undefined;
          
          if (docType === 'translation' && !paidTranslationIds.has(txId)) {
            return null; // Not verified yet, do not show on home page
          }

          let title = '';
          let excerpt = '';
          let readingTime = 1;
          let tagCount = 0;
          let tagKeys: string[] = [];

          try {
            const mdhRes = await fetch(`${gateway}/${txId}`);
            if (!mdhRes.ok) return null;
            const raw = await mdhRes.text();
            const preview = extractPreview(raw);
            title = preview.title;
            excerpt = preview.excerpt;
            readingTime = preview.readingTime;
            tagCount = preview.tagCount;
            tagKeys = preview.tagKeys;
          } catch {
            return null;
          }

          if (!title) title = `${txId.slice(0, 12)}…`;

          return {
            assetId: txId,
            originalTxId: txId,
            authorShort: uploader.slice(0, 8),
            authorFull: uploader,
            title,
            excerpt,
            readingTime,
            tagCount,
            tagKeys,
            timestamp,
            isTranslation: docType === 'translation',
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
