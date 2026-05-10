import { Upload, AlertCircle } from 'lucide-react';
import type { ParsedMdh } from '@/lib/mdh-utils';
import type { InterpretationResult } from '@/lib/ai/gemini-interpreter';
import MdhRenderer from '@/app/components/MdhRenderer';
import AiSuggestionPanel from './AiSuggestionPanel';

interface Props {
  targetLanguage: string | null | undefined;
  translatedParsed: ParsedMdh | null;
  aiLoading: boolean;
  aiSuggestion: InterpretationResult | null;
  importError: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImportChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onApplyAiSuggestion: () => void;
}

export default function TranslationEditorPanel({
  targetLanguage,
  translatedParsed,
  aiLoading,
  aiSuggestion,
  importError,
  fileInputRef,
  onImportChange,
  onApplyAiSuggestion,
}: Props) {
  return (
    <div className="flex-1 bg-white p-10 rounded-[32px] border border-stone-200/50 shadow-sm flex flex-col">
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-stone-100">
        <h3 className="text-xl text-ink">Your Translation</h3>
        <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">
          {targetLanguage ?? 'Target'}
        </span>
      </div>

      <AiSuggestionPanel
        aiLoading={aiLoading}
        aiSuggestion={aiSuggestion}
        onApply={onApplyAiSuggestion}
      />

      <div className="mb-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".mdh,.md"
          onChange={onImportChange}
          className="hidden"
          id="mdh-import"
        />
        <label
          htmlFor="mdh-import"
          className="flex items-center gap-2 px-5 py-3 bg-stone-100 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-200 transition-colors cursor-pointer w-fit"
        >
          <Upload size={14} />
          Import Translated .mdh / .md
        </label>
        {importError && (
          <div className="flex items-center gap-2 mt-3 text-red-600 text-sm">
            <AlertCircle size={14} className="shrink-0" />
            {importError}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-[200px]">
        {translatedParsed ? (
          <MdhRenderer parsedMdh={translatedParsed} />
        ) : (
          <div className="flex items-center justify-center h-full text-stone-300 text-sm text-center px-8">
            Import a .mdh or .md file to preview your translation here
          </div>
        )}
      </div>
    </div>
  );
}
