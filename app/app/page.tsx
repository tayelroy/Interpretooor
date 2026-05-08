"use client";

import Link from 'next/link';
import { useHomeFeed } from '@/hooks/useHomeFeed';
import { useState, useMemo } from 'react';
import {
  AlertCircle, Clock, Languages,
  Home, Inbox, MessageSquare, Bell, Compass, LayoutDashboard, User,
  Bookmark, Search,
} from 'lucide-react';

const TAG_KEY_COLORS: Record<string, string> = {
  tone:    'bg-amber-100 text-amber-800',
  culture: 'bg-teal-100 text-teal-800',
  intent:  'bg-purple-100 text-purple-800',
  idiom:   'bg-orange-100 text-orange-800',
};
const FALLBACK_TAG_COLOR = 'bg-stone-100 text-stone-600';

function formatTimestamp(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const upNext = [
  { title: "Satoshi's Literary Style: A Linguistic Analysis", author: 'The Archivist' },
  { title: 'Smart Contracts as Poetry: Translating Code to Stanza', author: 'Maria Chen' },
];

const recommendedTranslators = [
  { initial: 'K', name: 'Kenji Sato', specialty: 'JP to EN Specialist' },
  { initial: 'L', name: 'Lumière Nodes', specialty: 'FR Academic' },
];

const sidebarNavItems = [
  { Icon: Home,            label: 'Home',          href: '/app',              active: true  },
  { Icon: Inbox,           label: 'Subscriptions', href: '/app/subscriptions',active: false },
  { Icon: MessageSquare,   label: 'Chat',          href: '/app/chat',         active: false },
  { Icon: Bell,            label: 'Activity',      href: '/app/activity',     active: false },
  { Icon: Compass,         label: 'Explore',       href: '/app/explore',      active: false },
  { Icon: LayoutDashboard, label: 'Dashboard',     href: '/app/dashboard',    active: false },
  { Icon: User,            label: 'Profile',       href: '/app/profile',      active: false },
];

function PostSkeleton() {
  return (
    <div className="bg-parchment rounded-[32px] p-8 border border-stone-200 shadow-sm animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-stone-200" />
        <div className="h-3 w-24 bg-stone-200 rounded" />
        <div className="h-3 w-12 bg-stone-100 rounded" />
      </div>
      <div className="h-7 w-4/5 bg-stone-200 rounded mb-2" />
      <div className="h-7 w-3/5 bg-stone-100 rounded mb-4" />
      <div className="space-y-2">
        <div className="h-4 w-full bg-stone-100 rounded" />
        <div className="h-4 w-5/6 bg-stone-100 rounded" />
        <div className="h-4 w-4/6 bg-stone-100 rounded" />
      </div>
    </div>
  );
}

export default function HomeFeed() {
  const { posts, loading, error } = useHomeFeed();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return posts;
    const lowerQuery = searchQuery.toLowerCase();
    return posts.filter(post =>
      post.title.toLowerCase().includes(lowerQuery) ||
      post.excerpt.toLowerCase().includes(lowerQuery) ||
      post.tagKeys.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }, [posts, searchQuery]);

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 pt-28 pb-8 flex gap-16 items-start relative">

      {/* Left Sidebar */}
      <aside className="hidden lg:flex w-56 flex-col gap-8 sticky top-[100px]">
        <nav className="flex flex-col gap-1">
          {sidebarNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg font-sans text-[16px] transition-colors ${
                item.active
                  ? 'bg-surface-container text-on-surface font-medium'
                  : 'hover:bg-surface-container text-on-surface-variant'
              }`}
            >
              <item.Icon size={20} strokeWidth={item.active ? 2.5 : 1.75} />
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/app/write"
          className="bg-forest-canopy text-white rounded-full px-8 py-3 font-sans text-[16px] font-medium hover:opacity-90 transition-opacity text-center shadow-sm"
        >
          Create
        </Link>
      </aside>

      {/* Center Feed */}
      <main className="flex-1 min-w-0 max-w-[600px] w-full flex flex-col gap-4">

        {error && (
          <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {loading && (
          <>
            <PostSkeleton />
            <PostSkeleton />
          </>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-stone-400">
            <Languages size={48} className="opacity-30" />
            <p className="text-sm">No articles yet. Be the first to publish.</p>
          </div>
        )}

        {!loading && !error && posts.length > 0 && filteredPosts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-stone-400">
            <Search size={48} className="opacity-30" />
            <p className="text-sm">No results found for &quot;{searchQuery}&quot;</p>
          </div>
        )}

        {!loading && filteredPosts.map((post) => (
          <Link key={post.originalTxId} href={`/app/article/${post.originalTxId}`}>
            <article className="bg-parchment rounded-[32px] p-8 border border-stone-200 shadow-sm flex flex-col gap-4 cursor-pointer hover:shadow-md transition-shadow">
              {/* Header: author + timestamp */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface-dim flex items-center justify-center text-on-surface font-sans text-sm">
                    {post.authorShort[0].toUpperCase()}
                  </div>
                  <span className="font-sans text-sm font-medium text-on-surface font-mono">
                    {post.authorShort}…
                  </span>
                </div>
                {post.timestamp && (
                  <span className="font-sans text-xs text-stone-400">
                    {formatTimestamp(post.timestamp)}
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 className="font-serif not-italic text-[32px] leading-tight text-on-surface tracking-tight">
                {post.title}
              </h2>

              {/* Excerpt */}
              {post.excerpt && (
                <p className="font-sans text-[16px] text-on-surface-variant line-clamp-3 mt-1">
                  {post.excerpt}
                </p>
              )}

              {/* Footer: reading time + tags + bookmark */}
              <div className="flex items-center gap-3 mt-2 pt-3 border-t border-stone-200">
                <div className="flex items-center gap-1.5 text-stone-400">
                  <Clock size={13} />
                  <span className="font-sans text-xs">{post.readingTime} min read</span>
                </div>

                {post.tagKeys.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="w-1 h-1 bg-stone-300 rounded-full" />
                    {post.tagKeys.slice(0, 3).map((key) => (
                      <span
                        key={key}
                        className={`${TAG_KEY_COLORS[key] ?? FALLBACK_TAG_COLOR} text-[11px] font-mono px-2 py-0.5 rounded-full`}
                      >
                        {key}
                      </span>
                    ))}
                    {post.tagKeys.length > 3 && (
                      <span className="text-[11px] text-stone-400">+{post.tagKeys.length - 3}</span>
                    )}
                  </div>
                )}

                <div className="flex-1" />
                <button
                  className="text-on-surface-variant hover:text-on-surface transition-colors"
                  onClick={(e) => e.preventDefault()}
                >
                  <Bookmark size={18} strokeWidth={1.5} />
                </button>
              </div>
            </article>
          </Link>
        ))}
      </main>

      {/* Right Sidebar */}
      <aside className="hidden xl:flex w-72 flex-col gap-12 sticky top-[100px]">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            className="w-full bg-surface-container-low border border-stone-200 rounded-full py-2 pl-10 pr-4 font-sans text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-pale-lavender focus:border-transparent transition-all"
            placeholder="Search verified translations..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Up Next */}
        <div className="flex flex-col gap-4">
          <h3 className="font-sans not-italic text-[20px] font-medium text-on-surface pb-2 border-b border-stone-200">
            Up Next
          </h3>
          <div className="flex flex-col gap-3">
            {upNext.map((item) => (
              <a key={item.title} href="#" className="group flex flex-col gap-0.5">
                <span className="font-sans text-sm text-on-surface-variant group-hover:text-on-surface transition-colors">
                  {item.title}
                </span>
                <span className="font-sans text-sm text-surface-tint">by {item.author}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Recommended Translators */}
        <div className="flex flex-col gap-4">
          <h3 className="font-sans not-italic text-[20px] font-medium text-on-surface pb-2 border-b border-stone-200">
            Recommended Translators
          </h3>
          <div className="flex flex-col gap-4">
            {recommendedTranslators.map((translator) => (
              <div key={translator.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface-dim flex items-center justify-center text-on-surface font-sans text-sm">
                    {translator.initial}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-sans text-sm font-medium text-on-surface">{translator.name}</span>
                    <span className="font-sans text-sm text-surface-tint">{translator.specialty}</span>
                  </div>
                </div>
                <button className="bg-surface-container text-on-surface rounded-full px-3 py-1 font-sans text-xs hover:bg-stone-200 transition-colors">
                  Subscribe
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
