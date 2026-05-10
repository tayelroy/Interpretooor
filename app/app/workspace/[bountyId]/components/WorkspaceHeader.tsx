import { ArrowLeft, Globe } from 'lucide-react';

interface Props {
  bountyId: string;
  targetLanguage: string | null | undefined;
  onBack: () => void;
}

export default function WorkspaceHeader({ bountyId, targetLanguage, onBack }: Props) {
  return (
    <div className="flex items-center justify-between mb-10">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-stone-500 hover:text-ink transition-colors group"
      >
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
        Bounty Detail
      </button>

      <div className="flex items-center gap-3 text-sm text-stone-500">
        {targetLanguage && (
          <span className="flex items-center gap-1.5">
            <Globe size={13} />
            {targetLanguage}
          </span>
        )}
        <span className="font-mono text-xs bg-stone-100 px-3 py-1 rounded-full">
          {bountyId.slice(0, 8)}…
        </span>
      </div>
    </div>
  );
}
