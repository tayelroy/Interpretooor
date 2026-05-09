'use client';

import { BadgeCheck, DollarSign, AlertCircle, Clock, Tag } from 'lucide-react';
import { useArticle } from '@/hooks/useArticle';
import { parseMdhBlocks, type ParagraphBlock } from '@/lib/mdh-block-parser';
import { stripTags } from '@/lib/mdh-utils';
import type { SemanticTag } from '@/lib/mdh-utils';

const KEY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  tone:    { bg: 'bg-amber-200/70',  text: 'text-amber-900',  label: 'Tone' },
  culture: { bg: 'bg-teal-200/70',   text: 'text-teal-900',   label: 'Cultural ref' },
  intent:  { bg: 'bg-purple-200/70', text: 'text-purple-900', label: 'Intent' },
  idiom:   { bg: 'bg-orange-200/70', text: 'text-orange-900', label: 'Idiom' },
};
const FALLBACK = { bg: 'bg-stone-200/70', text: 'text-stone-700', label: 'Annotation' };

function readingTime(rawContent: string): number {
  const words = stripTags(rawContent).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function TagLegend({ tags }: { tags: SemanticTag[] }) {
  const uniqueKeys = [...new Set(tags.map((t) => t.key))];
  if (uniqueKeys.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 px-5 bg-white/60 border border-stone-200 rounded-2xl text-sm">
      <div className="flex items-center gap-1.5 text-stone-400 shrink-0">
        <Tag size={13} />
        <span className="text-xs font-medium uppercase tracking-widest">Semantic annotations</span>
      </div>
      {uniqueKeys.map((key) => {
        const style = KEY_COLORS[key] ?? FALLBACK;
        return (
          <span key={key} className={`${style.bg} ${style.text} text-xs font-mono px-2.5 py-1 rounded-full`}>
            {style.label}
          </span>
        );
      })}
      <span className="text-xs text-stone-400 ml-auto shrink-0">{tags.length} annotation{tags.length !== 1 ? 's' : ''}</span>
    </div>
  );
}

function renderInlineContent(block: { rawText: string; tags: SemanticTag[]; startOffset: number }): React.ReactNode[] {
  const { rawText, tags, startOffset } = block;
  const nodes: React.ReactNode[] = [];
  let pos = 0;

  for (const tag of tags) {
    const relStart = tag.startIndex - startOffset;
    const relEnd   = tag.endIndex  - startOffset + 1;

    if (relStart > pos) {
      nodes.push(<span key={`t-${pos}`}>{rawText.slice(pos, relStart)}</span>);
    }

    const style = KEY_COLORS[tag.key] ?? FALLBACK;
    nodes.push(
      <span
        key={`h-${tag.startIndex}`}
        className={`${style.bg} ${style.text} rounded px-0.5 cursor-help`}
        title={`${tag.key}: ${tag.value}`}
      >
        {tag.phrase}
      </span>
    );

    pos = relEnd;
  }

  if (pos < rawText.length) {
    nodes.push(<span key="t-tail">{rawText.slice(pos)}</span>);
  }

  return nodes;
}

export default function Reader({ assetId }: { assetId: string }) {
  const { data, loading, error } = useArticle(assetId);

  const mins = data ? readingTime(data.parsedMdh.rawContent) : null;
  const blocks = data ? parseMdhBlocks(data.parsedMdh.rawContent, data.parsedMdh.tags) : [];

  return (
    <div className="bg-parchment min-h-screen pt-32 pb-24 px-6">
      <article className="max-w-2xl mx-auto">

        {/* Header */}
        <header className="mb-12 space-y-6">
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white border border-stone-200 rounded-full shadow-sm">
              <BadgeCheck size={15} className="text-forest-canopy" />
              <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-ink">
                Verified by Interpretooor
              </span>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4 animate-pulse text-center">
              <div className="h-14 bg-stone-200 rounded-2xl w-3/4 mx-auto" />
              <div className="h-10 bg-stone-100 rounded-2xl w-1/2 mx-auto" />
            </div>
          ) : (
            <h1 className="text-6xl font-serif leading-[1.05] tracking-tighter text-center text-ink">
              {data?.title ?? 'Untitled'}
            </h1>
          )}

          {!loading && data && (
            <>
              <div className="flex items-center justify-center gap-3 text-sm text-stone-400">
                <div className="w-7 h-7 rounded-full bg-surface-dim flex items-center justify-center text-on-surface text-xs font-medium">
                  {data.author ? data.author.slice(0, 1).toUpperCase() : '?'}
                </div>
                <span className="font-mono">{data.author ? `${data.author.slice(0, 8)}…` : 'Unknown author'}</span>
                <span className="w-1 h-1 bg-stone-300 rounded-full" />
                {mins !== null && (
                  <>
                    <Clock size={13} />
                    <span>{mins} min read</span>
                    <span className="w-1 h-1 bg-stone-300 rounded-full" />
                  </>
                )}
                <span className="font-mono text-xs">{data.arweaveTxId.slice(0, 10)}…</span>
              </div>

              <div className="h-px bg-stone-200 w-full" />

              <TagLegend tags={data.parsedMdh.tags} />
            </>
          )}
        </header>

        {error && (
          <div className="flex items-center gap-3 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 mb-12">
            <AlertCircle size={20} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {loading && (
          <div className="space-y-6 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-3">
                <div className="h-5 bg-stone-200 rounded w-full" />
                <div className="h-5 bg-stone-200 rounded w-5/6" />
                <div className="h-5 bg-stone-100 rounded w-4/6" />
              </div>
            ))}
          </div>
        )}

        {/* Article body */}
        {!loading && data && (
          <div className="prose-article">
            {blocks.map((block, i) => {
              if (block.type === 'heading') {
                if (block.level === 1) {
                  return (
                    <h2 key={i} className="text-4xl font-serif text-ink mt-12 mb-4 leading-tight tracking-tight">
                      {block.text}
                    </h2>
                  );
                }
                if (block.level === 2) {
                  return (
                    <h3 key={i} className="text-2xl font-serif text-ink mt-10 mb-3 leading-snug">
                      {block.text}
                    </h3>
                  );
                }
                return (
                  <h4 key={i} className="text-xl font-sans font-semibold text-ink mt-8 mb-2">
                    {block.text}
                  </h4>
                );
              }

              if (block.type === 'list') {
                const ListTag = block.ordered ? 'ol' : 'ul';
                return (
                  <ListTag
                    key={i}
                    className={`ml-6 mb-6 space-y-3 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
                  >
                    {block.items.map((item, j) => (
                      <li key={j} className="font-sans text-[18px] leading-[1.8] text-charcoal-text font-light tracking-tight">
                        {item.tags.length > 0 ? renderInlineContent(item) : item.rawText}
                      </li>
                    ))}
                  </ListTag>
                );
              }

              const strippedRaw = block.rawText.replace(/!\[.*?\]\(.*?\)/g, '').trim();
              if (!strippedRaw) return null;
              const strippedBlock = { ...block, rawText: strippedRaw };

              const isFirst = i === blocks.findIndex((b) => b.type === 'paragraph');

              return (
                <p
                  key={i}
                  className={`font-sans text-[18px] leading-[1.8] text-charcoal-text font-light tracking-tight mb-6 ${
                    isFirst ? 'text-[20px] leading-[1.75] text-ink/90' : ''
                  }`}
                >
                  {strippedBlock.tags.length > 0 ? renderInlineContent(strippedBlock) : strippedRaw}
                </p>
              );
            })}
          </div>
        )}


        {/* Footer */}
        {!loading && data && (
          <footer className="mt-16 pt-8 border-t border-stone-200 space-y-10">

            {data.parsedMdh.tags.length > 0 && (
              <div className="text-center text-sm text-stone-400 space-y-1">
                <p>
                  This article contains{' '}
                  <span className="font-medium text-stone-600">{data.parsedMdh.tags.length} semantic annotation{data.parsedMdh.tags.length !== 1 ? 's' : ''}</span>{' '}
                  to guide AI translation.
                </p>
                <p className="text-xs">Highlighted phrases carry intent, tone, or cultural context that a translator should preserve.</p>
              </div>
            )}

            <div className="p-10 bg-white rounded-[32px] border border-stone-200 text-center space-y-5 shadow-sm">
              <h3 className="text-3xl text-ink font-serif">Tip the Writer</h3>
              <p className="text-stone-500 max-w-sm mx-auto text-base leading-relaxed">
                Support the original author and the translation protocol.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <button className="px-8 py-3.5 bg-pale-lavender text-ink rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                  <DollarSign size={16} />
                  Tip 1 USDC
                </button>
                <button className="px-8 py-3.5 border border-ink text-ink rounded-lg font-medium hover:bg-stone-50 transition-colors">
                  Tip 5 USDC
                </button>
              </div>
            </div>
          </footer>
        )}

      </article>
    </div>
  );
}
