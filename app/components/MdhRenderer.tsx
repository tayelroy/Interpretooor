import type { ParsedMdh, SemanticTag } from '@/lib/mdh-utils';

interface MdhRendererProps {
  parsedMdh: ParsedMdh;
}

const KEY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  tone:    { bg: 'bg-amber-200/70',  text: 'text-amber-900',  label: 'Tone' },
  culture: { bg: 'bg-teal-200/70',   text: 'text-teal-900',   label: 'Cultural ref' },
  intent:  { bg: 'bg-purple-200/70', text: 'text-purple-900', label: 'Intent' },
  idiom:   { bg: 'bg-orange-200/70', text: 'text-orange-900', label: 'Idiom' },
};
const FALLBACK = { bg: 'bg-stone-200/70', text: 'text-stone-700', label: 'Annotation' };

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function SemanticHighlight({ tag }: { tag: SemanticTag }) {
  const style = KEY_STYLES[tag.key] ?? FALLBACK;
  const label = `${cap(style.label)}: ${cap(tag.value)}`;

  return (
    <span className="relative inline group/tag">
      <span className={`${style.bg} ${style.text} rounded px-0.5 cursor-help`}>
        {tag.phrase}
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover/tag:opacity-100 z-50">
        {label}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink" />
      </span>
    </span>
  );
}

export default function MdhRenderer({ parsedMdh }: MdhRendererProps) {
  const { rawContent, tags } = parsedMdh;
  const segments: React.ReactNode[] = [];
  let cursor = 0;

  for (const tag of tags) {
    if (tag.startIndex > cursor) {
      segments.push(
        <span key={`t-${cursor}`}>{rawContent.slice(cursor, tag.startIndex)}</span>
      );
    }

    segments.push(<SemanticHighlight key={`h-${tag.startIndex}`} tag={tag} />);
    cursor = tag.endIndex + 1;
  }

  if (cursor < rawContent.length) {
    segments.push(<span key={`t-${cursor}`}>{rawContent.slice(cursor)}</span>);
  }

  return (
    <div className="whitespace-pre-wrap leading-relaxed text-ink font-light text-lg">
      {segments}
    </div>
  );
}
