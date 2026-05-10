import { ArrowLeft, AlertCircle } from 'lucide-react';

interface Props {
  message: string | null;
  onBack: () => void;
}

export default function WorkspaceErrorState({ message, onBack }: Props) {
  return (
    <div className="min-h-screen bg-parchment pt-40 px-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-stone-500 hover:text-ink mb-8"
        >
          <ArrowLeft size={18} /> Back
        </button>
        <div className="flex items-start gap-3 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700">
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <span>{message ?? 'Workspace not found'}</span>
        </div>
      </div>
    </div>
  );
}
