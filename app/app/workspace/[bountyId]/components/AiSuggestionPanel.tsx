import { useState } from 'react';
import { Sparkles, Loader2, ChevronDown } from 'lucide-react';
import type { InterpretationResult } from '@/lib/ai/openai-interpreter';

interface Props {
  aiLoading: boolean;
  aiSuggestion: InterpretationResult | null;
  onApply: () => void;
}

export default function AiSuggestionPanel({ aiLoading, aiSuggestion, onApply }: Props) {
  const [reasoningOpen, setReasoningOpen] = useState(false);

  if (!aiLoading && !aiSuggestion) return null;

  return (
    <div className="mb-6 rounded-2xl border border-violet-200 bg-violet-50/60 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-violet-100">
        <div className="flex items-center gap-2 text-violet-700 text-sm font-medium">
          <Sparkles size={14} />
          AI Suggestion
        </div>
        {aiLoading && <Loader2 size={14} className="animate-spin text-violet-400" />}
        {aiSuggestion && (
          <button
            onClick={onApply}
            className="text-xs px-3 py-1.5 bg-violet-700 text-white rounded-lg hover:bg-violet-800 transition-colors"
          >
            Use as Starting Point
          </button>
        )}
      </div>

      {aiSuggestion && (
        <div className="px-5 py-4">
          <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
            {aiSuggestion.translatedText}
          </p>
          {aiSuggestion.reasoning.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setReasoningOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-violet-500 hover:text-violet-700 transition-colors"
              >
                <ChevronDown
                  size={12}
                  className={`transition-transform ${reasoningOpen ? 'rotate-180' : ''}`}
                />
                {aiSuggestion.reasoning.length} semantic decisions
              </button>
              {reasoningOpen && (
                <ul className="mt-2 space-y-2">
                  {aiSuggestion.reasoning.map((r, i) => (
                    <li
                      key={i}
                      className="text-xs text-stone-500 bg-white rounded-lg px-3 py-2 border border-violet-100"
                    >
                      <span className="font-mono text-violet-600">
                        {r.tagKey}={r.tagValue}
                      </span>
                      {' · '}
                      <span className="italic">&quot;{r.phrase}&quot;</span>
                      {r.explanation && <> — {r.explanation}</>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
