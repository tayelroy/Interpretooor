"use client";

import { useState } from 'react';
import { motion } from 'motion/react';
import { PublicKey } from '@solana/web3.js';
import { Loader2, PlusCircle, Languages } from 'lucide-react';
import Dashboard from '../../pages/Dashboard';
import Verification from '../../pages/Verification';
import CreateBounty from '../../pages/CreateBounty';
import { useMyArticles, type MyArticle } from '../../../hooks/useMyArticles';

type View =
  | { type: 'board' }
  | { type: 'verification'; bountyPda: PublicKey }
  | { type: 'create'; article: MyArticle };

export default function TranslatePage() {
  const [view, setView] = useState<View>({ type: 'board' });
  const { articles, loading: articlesLoading } = useMyArticles();

  if (view.type === 'verification') {
    return (
      <Verification
        bountyPda={view.bountyPda}
        onBack={() => setView({ type: 'board' })}
      />
    );
  }

  if (view.type === 'create') {
    return (
      <CreateBounty
        article={view.article}
        onBack={() => setView({ type: 'board' })}
        onSuccess={() => setView({ type: 'board' })}
      />
    );
  }

  const hasArticles = articlesLoading || articles.length > 0;

  return (
    <>
      {/* Author strip — only renders if the connected wallet has published articles */}
      {hasArticles && (
        <div className="bg-parchment pt-40 pb-0 px-8">
          <div className="max-w-7xl mx-auto mb-8">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl text-ink">Your Articles</h2>
              <span className="text-xs uppercase tracking-widest text-stone-400 font-medium">
                Ready to translate?
              </span>
            </div>

            {articlesLoading ? (
              <div className="flex items-center gap-2 text-stone-400 py-6">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Loading your articles…</span>
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-none">
                {articles.map((article, i) => (
                  <motion.div
                    key={article.assetId}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="flex-shrink-0 w-72 bg-white rounded-[24px] p-6 border border-stone-200 shadow-sm flex flex-col gap-3"
                  >
                    <Languages size={16} className="text-stone-400" />
                    <p className="text-ink font-medium leading-snug line-clamp-2">
                      {article.title}
                    </p>
                    <p className="font-mono text-xs text-stone-400">
                      {article.arweaveTxId.slice(0, 12)}…{article.arweaveTxId.slice(-6)}
                    </p>
                    <button
                      onClick={() => setView({ type: 'create', article })}
                      className="mt-auto flex items-center gap-2 px-4 py-2.5 bg-pale-lavender text-ink rounded-xl text-sm font-semibold hover:opacity-80 transition-opacity active:scale-95"
                    >
                      <PlusCircle size={14} />
                      Create Bounty
                    </button>
                  </motion.div>
                ))}
              </div>
            )}

            <div className="h-px bg-stone-200 mt-8" />
          </div>
        </div>
      )}

      <Dashboard
        onJobSelect={(pda) => setView({ type: 'verification', bountyPda: pda })}
        containerClassName={
          hasArticles
            ? 'bg-parchment min-h-screen pt-10 pb-20 px-8'
            : undefined
        }
      />
    </>
  );
}
