"use client";

import Link from 'next/link';

const mockPosts = [
  {
    id: 'art-001',
    authorInitial: 'E',
    author: 'Elena Rostova',
    time: '2h ago',
    verified: true,
    title: 'The Ontology of Digital Artifacts in Web3 Spaces',
    excerpt:
      'A rigorous examination of how non-fungible tokens represent a fundamental shift in our philosophical understanding of ownership. While traditional property relies on physical exclusion, digital artifacts introduce a paradigm of verifiable scarcity decoupled from material form.',
    image:
      'https://lh3.googleusercontent.com/aida/ADBb0ui7TyuofWvAxfCpWoY4pwf6-PnPCRENrBdRo7FqzJXh2lsLLsTTK4TBZAq8_jll4fthRzB5pfoTJ6PXwY0uXNBVv5TW9Ek48FoXgRC2LTrzOug9YOAwmyh2cJ3RjZoX-O-Zk2Ps-MKoP14ehPZdr68DjJo_Y0xQhymomcbYzy-jZy_RMmQYNhIiilZ4ouv1ybDZxCAIcydRBjyHsCbPRuzuB-MSlrYrgJGD6feLXMZLn1UvZApE5o7S0OZyCJhO_mgvhHUfIj0_VA',
    likes: 245,
    comments: 42,
  },
  {
    id: 'art-002',
    authorInitial: 'D',
    author: 'Dr. Aris Thorne',
    time: '5h ago',
    verified: true,
    title: 'Navigating the Labyrinth: Consensus Mechanisms Decoded',
    excerpt:
      'An elegant deconstruction of Byzantine Fault Tolerance, translated with meticulous attention to the mathematical analogies presented in the original text. We explore how trust is mathematically enforced in trustless environments.',
    image: null,
    likes: 128,
    comments: 16,
  },
  {
    id: 'art-003',
    authorInitial: 'M',
    author: 'M. Leclerc',
    time: '1d ago',
    verified: false,
    title: 'On the Politics of Translation',
    excerpt:
      'Every act of translation is also an act of interpretation. Who decides what is equivalent, and what power does that choice confer? A deep examination of linguistic power structures.',
    image: null,
    likes: 89,
    comments: 11,
  },
];

const upNext = [
  { title: "Satoshi's Literary Style: A Linguistic Analysis", author: 'The Archivist' },
  { title: 'Smart Contracts as Poetry: Translating Code to Stanza', author: 'Maria Chen' },
];

const recommendedTranslators = [
  { initial: 'K', name: 'Kenji Sato', specialty: 'JP to EN Specialist' },
  { initial: 'L', name: 'Lumière Nodes', specialty: 'FR Academic' },
];

const sidebarNavItems = [
  { icon: 'home', label: 'Home', href: '/app', active: true },
  { icon: 'inbox', label: 'Subscriptions', href: '/app/subscriptions', active: false },
  { icon: 'chat', label: 'Chat', href: '/app/chat', active: false },
  { icon: 'notifications', label: 'Activity', href: '/app/activity', active: false },
  { icon: 'explore', label: 'Explore', href: '/app/explore', active: false },
  { icon: 'dashboard', label: 'Dashboard', href: '/app/dashboard', active: false },
  { icon: 'person', label: 'Profile', href: '/app/profile', active: false },
];

export default function HomeFeed() {
  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 pt-28 pb-8 flex gap-16 items-start relative">

      {/* Left Sidebar */}
      <aside className="hidden lg:flex w-56 flex-col gap-8 sticky top-[100px]">
        <nav className="flex flex-col gap-1">
          {sidebarNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 px-4 py-2 rounded-lg font-sans text-[16px] transition-colors ${
                item.active
                  ? 'bg-surface-container text-on-surface font-medium'
                  : 'hover:bg-surface-container text-on-surface-variant'
              }`}
            >
              <span className="material-symbols-outlined" style={item.active ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                {item.icon}
              </span>
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
      <main className="flex-1 max-w-[600px] mx-auto w-full flex flex-col gap-4">
        {mockPosts.map((post) => (
          <Link key={post.id} href={`/app/article/${post.id}`}>
            <article className="bg-parchment rounded-[32px] p-8 border border-stone-200 shadow-sm flex flex-col gap-4 cursor-pointer hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface-dim flex items-center justify-center text-on-surface font-sans text-sm">
                    {post.authorInitial}
                  </div>
                  <span className="font-sans text-sm font-medium text-on-surface">{post.author}</span>
                  <span className="text-on-surface-variant text-sm">·</span>
                  <span className="text-on-surface-variant text-sm">{post.time}</span>
                </div>
                {post.verified && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-pale-lavender/20 border border-pale-lavender text-on-surface font-sans text-xs">
                    <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                      verified
                    </span>
                    Verified Translation
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 className="font-serif not-italic text-[32px] leading-tight text-on-surface tracking-tight">
                {post.title}
              </h2>

              {/* Excerpt */}
              <p className="font-sans text-[16px] text-on-surface-variant line-clamp-3 mt-1">
                {post.excerpt}
              </p>

              {/* Image */}
              {post.image && (
                <div className="mt-2 w-full h-[280px] rounded-xl overflow-hidden bg-surface-dim">
                  <img src={post.image} alt="" className="w-full h-full object-cover" />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-8 mt-2 pt-3 border-t border-stone-200">
                <button
                  className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface transition-colors"
                  onClick={(e) => e.preventDefault()}
                >
                  <span className="material-symbols-outlined">favorite_border</span>
                  <span className="font-sans text-sm">{post.likes}</span>
                </button>
                <button
                  className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface transition-colors"
                  onClick={(e) => e.preventDefault()}
                >
                  <span className="material-symbols-outlined">chat_bubble_outline</span>
                  <span className="font-sans text-sm">{post.comments}</span>
                </button>
                <div className="flex-1" />
                <button
                  className="text-on-surface-variant hover:text-on-surface transition-colors"
                  onClick={(e) => e.preventDefault()}
                >
                  <span className="material-symbols-outlined">bookmark_border</span>
                </button>
                <button
                  className="text-on-surface-variant hover:text-on-surface transition-colors"
                  onClick={(e) => e.preventDefault()}
                >
                  <span className="material-symbols-outlined">more_horiz</span>
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
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
            search
          </span>
          <input
            className="w-full bg-surface-container-low border border-stone-200 rounded-full py-2 pl-10 pr-4 font-sans text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-pale-lavender focus:border-transparent transition-all"
            placeholder="Search verified translations..."
            type="text"
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
