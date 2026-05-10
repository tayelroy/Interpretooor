'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Search, Coins, Languages, FileText, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useBounty, type BountyAccount } from '@/hooks/useBounty';
import { useHomeFeed, type HomeFeedPost } from '@/hooks/useHomeFeed';

const TAG_KEY_COLORS: Record<string, string> = {
  tone:    'bg-amber-100 text-amber-800',
  culture: 'bg-teal-100 text-teal-800',
  intent:  'bg-purple-100 text-purple-800',
  idiom:   'bg-orange-100 text-orange-800',
};

type ViewTab = 'bounties' | 'articles';

function usdcAmt(raw: { toNumber: () => number }) {
  return (raw.toNumber() / 1_000_000).toFixed(2);
}

// ─── Bounty card ─────────────────────────────────────────────────────────────

const IRYS_GATEWAY = process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz';

async function fetchTitle(txId: string): Promise<string> {
  try {
    const res = await fetch(`${IRYS_GATEWAY}/${txId}`, { headers: { Range: 'bytes=0-150' } });
    const text = await res.text();
    const match = text.match(/^#\s+(.+)/m);
    return match ? match[1].trim() : txId.slice(0, 12) + '…';
  } catch {
    return txId.slice(0, 12) + '…';
  }
}

function BountyCard({ bounty, title }: { bounty: BountyAccount; title: string }) {
  const router = useRouter();
  const isOpen = 'open' in bounty.status;
  return (
    <div
      onClick={() => router.push(`/app/bounty/${bounty.publicKey.toBase58()}`)}
      className="bg-white border border-stone-200 rounded-[24px] p-5 cursor-pointer hover:shadow-md hover:border-stone-300 transition-all flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-ink text-sm line-clamp-2 flex-1">{title}</h3>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
          isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'
        }`}>
          {isOpen ? 'Open' : 'Validating'}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-stone-500">
        <span className="flex items-center gap-1"><Languages size={11} /> {bounty.targetLanguage}</span>
        <span className="flex items-center gap-1 font-semibold text-emerald-700">
          <Coins size={11} /> ${usdcAmt(bounty.rewardAmount)} USDC
        </span>
      </div>
      {isOpen && (
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/app/bounty/${bounty.publicKey.toBase58()}`); }}
          className="w-full py-2 rounded-xl text-xs font-semibold bg-ink text-parchment hover:opacity-90 transition-opacity mt-1"
        >
          Claim Job
        </button>
      )}
    </div>
  );
}

// ─── Article card ─────────────────────────────────────────────────────────────

function ArticleCard({ post }: { post: HomeFeedPost }) {
  return (
    <Link href={`/app/article/${post.originalTxId}`}>
      <div className="bg-white border border-stone-200 rounded-[24px] p-5 hover:shadow-md hover:border-stone-300 transition-all flex flex-col gap-3 h-full">
        <h3 className="font-semibold text-ink text-sm line-clamp-2">{post.title}</h3>
        {post.excerpt && (
          <p className="text-xs text-stone-500 line-clamp-2">{post.excerpt}</p>
        )}
        <div className="flex items-center gap-2 mt-auto pt-2 flex-wrap">
          {post.tagKeys.slice(0, 3).map((k) => (
            <span key={k} className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${TAG_KEY_COLORS[k] ?? 'bg-stone-100 text-stone-500'}`}>
              {k}
            </span>
          ))}
          <span className="ml-auto text-xs text-stone-400 font-mono">{post.authorShort}…</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExplorePage() {
  const { fetchAllBounties } = useBounty();
  const { posts: articles, loading: articlesLoading } = useHomeFeed();

  const [tab, setTab] = useState<ViewTab>('bounties');
  const [allBounties, setAllBounties] = useState<BountyAccount[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [bountiesLoading, setBountiesLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [minReward, setMinReward] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  const loadBounties = useCallback(async () => {
    setBountiesLoading(true);
    try {
      const all = await fetchAllBounties();
      const active = all.filter((b) => 'open' in b.status || 'awaitingValidation' in b.status);
      setAllBounties(active);
      const titleEntries = await Promise.all(
        active.map(async (b) => [b.publicKey.toBase58(), await fetchTitle(b.originalTxId)] as const)
      );
      setTitles(Object.fromEntries(titleEntries));
    } finally {
      setBountiesLoading(false);
    }
  }, [fetchAllBounties]);

  useEffect(() => { loadBounties(); }, [loadBounties]);

  // Derived filter lists
  const allLanguages = useMemo(() => {
    const langs = [...new Set(allBounties.map((b) => b.targetLanguage).filter(Boolean))];
    return langs.sort();
  }, [allBounties]);

  const allTagKeys = useMemo(() => {
    const keys = [...new Set(articles.flatMap((p) => p.tagKeys))];
    return keys.sort();
  }, [articles]);

  const filteredBounties = useMemo(() => {
    return allBounties.filter((b) => {
      const pda = b.publicKey.toBase58();
      const title = titles[pda] ?? '';
      if (searchQuery && !title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (langFilter && b.targetLanguage !== langFilter) return false;
      if (minReward) {
        const reward = b.rewardAmount.toNumber() / 1_000_000;
        if (reward < parseFloat(minReward)) return false;
      }
      return true;
    });
  }, [allBounties, titles, searchQuery, langFilter, minReward]);

  const filteredArticles = useMemo(() => {
    return articles.filter((p) => {
      if (searchQuery && !p.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !p.excerpt.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (tagFilter && !p.tagKeys.includes(tagFilter)) return false;
      return true;
    });
  }, [articles, searchQuery, tagFilter]);

  const loading = tab === 'bounties' ? bountiesLoading : articlesLoading;

  return (
    <div className="min-h-screen bg-parchment pt-32 pb-20 px-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-ink">Explore</h1>
          <p className="text-stone-500 text-sm mt-1">Browse open bounties and published articles.</p>
        </div>

        {/* Tabs + Search row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <div className="flex gap-1 bg-stone-100 rounded-2xl p-1">
            <button
              onClick={() => setTab('bounties')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                tab === 'bounties' ? 'bg-white text-ink shadow-sm' : 'text-stone-500 hover:text-ink'
              }`}
            >
              <Coins size={14} /> Bounties
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${tab === 'bounties' ? 'bg-stone-100 text-stone-600' : 'bg-stone-200 text-stone-500'}`}>
                {filteredBounties.length}
              </span>
            </button>
            <button
              onClick={() => setTab('articles')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                tab === 'articles' ? 'bg-white text-ink shadow-sm' : 'text-stone-500 hover:text-ink'
              }`}
            >
              <FileText size={14} /> Articles
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${tab === 'articles' ? 'bg-stone-100 text-stone-600' : 'bg-stone-200 text-stone-500'}`}>
                {filteredArticles.length}
              </span>
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-stone-200 bg-white text-sm text-ink focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <SlidersHorizontal size={14} className="text-stone-400" />

          {tab === 'bounties' && (
            <>
              <select
                value={langFilter}
                onChange={(e) => setLangFilter(e.target.value)}
                className="text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white text-stone-600 focus:outline-none focus:ring-2 focus:ring-violet-200"
              >
                <option value="">All languages</option>
                {allLanguages.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <select
                value={minReward}
                onChange={(e) => setMinReward(e.target.value)}
                className="text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white text-stone-600 focus:outline-none focus:ring-2 focus:ring-violet-200"
              >
                <option value="">Any reward</option>
                <option value="5">$5+ USDC</option>
                <option value="10">$10+ USDC</option>
                <option value="25">$25+ USDC</option>
                <option value="50">$50+ USDC</option>
              </select>
            </>
          )}

          {tab === 'articles' && allTagKeys.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white text-stone-600 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="">All tags</option>
              {allTagKeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          )}

          {(langFilter || minReward || tagFilter || searchQuery) && (
            <button
              onClick={() => { setLangFilter(''); setMinReward(''); setTagFilter(''); setSearchQuery(''); }}
              className="text-xs text-stone-400 hover:text-ink transition-colors underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center gap-3 text-stone-400 py-20 justify-center">
            <Loader2 size={22} className="animate-spin" />
            <span>Loading…</span>
          </div>
        ) : tab === 'bounties' ? (
          filteredBounties.length === 0 ? (
            <div className="text-center py-20 text-stone-400">
              <ShieldCheck size={40} className="mx-auto mb-4 opacity-30" />
              <p>No open bounties match your filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBounties.map((b) => (
                <BountyCard
                  key={b.publicKey.toBase58()}
                  bounty={b}
                  title={titles[b.publicKey.toBase58()] ?? '…'}
                />
              ))}
            </div>
          )
        ) : (
          filteredArticles.length === 0 ? (
            <div className="text-center py-20 text-stone-400">
              <FileText size={40} className="mx-auto mb-4 opacity-30" />
              <p>No articles match your filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredArticles.map((p) => (
                <ArticleCard key={p.originalTxId} post={p} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
