import { Loader2 } from 'lucide-react';

export default function WorkspaceLoadingState() {
  return (
    <div className="min-h-screen bg-parchment pt-40 flex items-center justify-center">
      <div className="flex items-center gap-3 text-stone-400">
        <Loader2 size={24} className="animate-spin" />
        <span>Loading workspace…</span>
      </div>
    </div>
  );
}
