'use client';

import { BadgeCheck, DollarSign, AlertCircle } from 'lucide-react';
import { useArticle } from '@/hooks/useArticle';
import { parseMdhBlocks, type ParagraphBlock } from '@/lib/mdh-block-parser';

// Mirrors the color map in MdhRenderer
const KEY_COLORS: Record<string, string> = {
  tone:    'bg-amber-200/70',
  culture: 'bg-teal-200/70',
  intent:  'bg-purple-200/70',
  idiom:   'bg-orange-200/70',
};
const FALLBACK_COLOR = 'bg-stone-200/70';

const HEADING_CLASS: Record<number, string> = {
  1: 'text-5xl text-ink font-serif py-8',
  2: 'text-4xl text-ink font-serif py-8',
  3: 'text-3xl text-ink font-serif py-6',
};

function renderParagraphInline(block: ParagraphBlock): React.ReactNode[] {
  const { rawText, tags, startOffset } = block;
  const nodes: React.ReactNode[] = [];
  let pos = 0;

  for (const tag of tags) {
    const relStart = tag.startIndex - startOffset;
    const relEnd   = tag.endIndex  - startOffset + 1;

    if (relStart > pos) {
      nodes.push(<span key={`t-${pos}`}>{rawText.slice(pos, relStart)}</span>);
    }

    const color = KEY_COLORS[tag.key] ?? FALLBACK_COLOR;
    nodes.push(
      <span
        key={`h-${tag.startIndex}`}
        className={`${color} rounded px-0.5 cursor-help`}
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

  return (
    <div className="bg-parchment min-h-screen pt-40 pb-24 px-8">
      <article className="max-w-3xl mx-auto space-y-12">

        <header className="text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-full shadow-sm">
            <BadgeCheck size={18} className="text-forest-canopy" />
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-ink">
              Verified by Interpretooor
            </span>
          </div>

          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-14 bg-stone-200 rounded-2xl w-3/4 mx-auto" />
              <div className="h-14 bg-stone-100 rounded-2xl w-1/2 mx-auto" />
            </div>
          ) : (
            <h1 className="text-7xl font-serif leading-[0.8] tracking-tighter">
              {data?.title ?? 'Untitled'}
            </h1>
          )}

          <div className="h-0.5 w-16 bg-pale-lavender mx-auto" />

          {!loading && data && (
            <div className="flex items-center justify-center gap-4 text-sm text-stone-400 font-medium">
              <span>By {data.author.slice(0, 8)}…</span>
              <span className="w-1 h-1 bg-stone-300 rounded-full" />
              <span className="font-mono text-xs">{data.arweaveTxId.slice(0, 10)}…</span>
            </div>
          )}
        </header>

        {error && (
          <div className="flex items-center gap-3 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700">
            <AlertCircle size={20} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {loading && (
          <section className="space-y-8 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-3">
                <div className="h-5 bg-stone-200 rounded w-full" />
                <div className="h-5 bg-stone-200 rounded w-5/6" />
                <div className="h-5 bg-stone-100 rounded w-4/6" />
              </div>
            ))}
          </section>
        )}

        {!loading && data && (
          <section className="space-y-8 font-sans text-xl leading-relaxed text-charcoal-text font-light tracking-tight">
            {parseMdhBlocks(data.parsedMdh.rawContent, data.parsedMdh.tags).map((block, i) => {
              if (block.type === 'heading') {
                const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3';
                return <Tag key={i} className={HEADING_CLASS[block.level]}>{block.text}</Tag>;
              }
              // TODO: image hosting — strip markdown image syntax until a hosting solution is in place
              const strippedRaw = block.rawText.replace(/!\[.*?\]\(.*?\)/g, '').trim();
              if (!strippedRaw) return null;
              const strippedBlock = { ...block, rawText: strippedRaw };
              return (
                <p key={i}>
                  {strippedBlock.tags.length > 0 ? renderParagraphInline(strippedBlock) : strippedRaw}
                </p>
              );
            })}
          </section>
        )}

        <section className="mt-24 p-12 bg-white rounded-[40px] border border-stone-200 text-center space-y-6 shadow-sm">
          <h3 className="text-3xl text-ink">Tip the Writer</h3>
          <p className="text-stone-500 max-w-md mx-auto text-lg leading-relaxed">
            Support the original author and the translation protocol to ensure the continued flow of high-quality editorial content.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <button className="px-10 py-4 bg-pale-lavender text-ink rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
              <DollarSign size={18} />
              Tip 1 USDC
            </button>
            <button className="px-10 py-4 border border-ink text-ink rounded-lg font-medium hover:bg-stone-50 transition-colors">
              Tip 5 USDC
            </button>
          </div>
        </section>

      </article>
    </div>
  );
}
