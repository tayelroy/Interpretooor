import type { ParsedMdh } from '@/lib/mdh-utils';

interface MdhRendererProps {
  parsedMdh: ParsedMdh;
}

const KEY_COLORS: Record<string, string> = {
  tone: 'bg-amber-200/60 dark:bg-amber-800/40',
  culture: 'bg-teal-200/60 dark:bg-teal-800/40',
  intent: 'bg-purple-200/60 dark:bg-purple-800/40',
  idiom: 'bg-orange-200/60 dark:bg-orange-800/40',
};

const FALLBACK_COLOR = 'bg-gray-200/60 dark:bg-gray-700/40';

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

    const color = KEY_COLORS[tag.key] ?? FALLBACK_COLOR;
    segments.push(
      <span
        key={`h-${tag.startIndex}`}
        className={`${color} rounded px-1 py-0.5 cursor-help`}
        title={`${tag.key}=${tag.value}`}
        data-tag={`${tag.key}=${tag.value}`}
      >
        {tag.phrase}
      </span>
    );

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
