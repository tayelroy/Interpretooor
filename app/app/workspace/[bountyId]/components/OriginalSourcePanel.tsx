import type { ParsedMdh } from '@/lib/mdh-utils';
import MdhRenderer from '@/app/components/MdhRenderer';

interface Props {
  parsedMdh: ParsedMdh | null;
}

export default function OriginalSourcePanel({ parsedMdh }: Props) {
  return (
    <div className="flex-1 bg-white p-10 rounded-[32px] border border-stone-200/50 shadow-sm">
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-stone-100">
        <h3 className="text-xl text-ink">Original Source</h3>
        <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">Original</span>
      </div>
      {parsedMdh ? (
        <MdhRenderer parsedMdh={parsedMdh} />
      ) : (
        <p className="text-stone-400 text-sm">Content unavailable</p>
      )}
    </div>
  );
}
