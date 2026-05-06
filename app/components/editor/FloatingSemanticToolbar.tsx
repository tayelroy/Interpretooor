'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ChevronDown, Eye, Highlighter, PanelTop, Sparkles } from 'lucide-react';
import { $createSemanticNode } from './SemanticNode';

type SemanticOption = {
  description: string;
  label: string;
  value: string;
};

const semanticOptions: SemanticOption[] = [
  { label: 'Context', value: 'context', description: 'Background or framing detail' },
  { label: 'Entity', value: 'entity', description: 'People, names, brands, or places' },
  { label: 'Claim', value: 'claim', description: 'A factual or argumentative claim' },
  { label: 'Tone', value: 'tone', description: 'Sentiment, style, or rhetorical intent' },
];

interface FloatingSemanticToolbarProps {
  isPreview: boolean;
  onPreviewChange: (preview: boolean) => void;
}

export default function FloatingSemanticToolbar({ isPreview, onPreviewChange }: FloatingSemanticToolbarProps) {
  const [editor] = useLexicalComposerContext();
  const [activeTag, setActiveTag] = useState('context');
  const [note, setNote] = useState('');
  const [selectionText, setSelectionText] = useState('');

  const activeOption = useMemo(
    () => semanticOptions.find((option) => option.value === activeTag) ?? semanticOptions[0],
    [activeTag],
  );

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        editor.getEditorState().read(() => {
          const selection = $getSelection();

          if (!$isRangeSelection(selection) || selection.isCollapsed()) {
            setSelectionText('');
            return;
          }

          setSelectionText(selection.getTextContent());
        });

        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  const annotateSelection = () => {
    if (isPreview) {
      return;
    }

    editor.update(() => {
      const selection = $getSelection();

      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        return;
      }

      const text = selection.getTextContent().trim();

      if (!text) {
        return;
      }

      const semanticNode = $createSemanticNode(text, activeTag, note.trim());
      selection.insertNodes([semanticNode]);
      setNote('');
    });
  };

  return (
    <aside className="fixed bottom-4 left-4 right-4 z-40 md:bottom-auto md:left-auto md:right-8 md:top-28 md:w-[340px]">
      <div className="rounded-[28px] border border-ink/10 bg-ink/95 p-4 text-parchment shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-pale-lavender/80">
              <Sparkles size={12} />
              Semantic Toolbar
            </div>
            <p className="mt-2 text-sm text-parchment/70">
              Mark selected text with a semantic label and a short note.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onPreviewChange(!isPreview)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-parchment/80 transition-colors hover:bg-white/10"
          >
            <Eye size={12} />
            {isPreview ? 'Exit preview' : 'Preview'}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-[10px] uppercase tracking-[0.24em] text-parchment/55">Semantic label</label>
          <div className="relative">
            <select
              value={activeTag}
              onChange={(event) => setActiveTag(event.target.value)}
              className="w-full appearance-none rounded-2xl border border-white/10 bg-white/6 px-4 py-3 pr-10 text-sm text-parchment outline-none transition-colors focus:border-pale-lavender/50"
            >
              {semanticOptions.map((option) => (
                <option key={option.value} value={option.value} className="text-ink">
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-parchment/50" size={16} />
          </div>

          <label className="block text-[10px] uppercase tracking-[0.24em] text-parchment/55">Semantic note</label>
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={activeOption.description}
            className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-parchment placeholder:text-parchment/35 outline-none transition-colors focus:border-pale-lavender/50"
          />

          <button
            type="button"
            onClick={annotateSelection}
            disabled={isPreview || !selectionText.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-pale-lavender px-4 py-3 text-sm font-semibold text-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Highlighter size={16} />
            Mark selection
          </button>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-parchment/70">
            <span className="inline-flex items-center gap-2">
              <PanelTop size={14} />
              {selectionText ? `${selectionText.length} selected chars` : 'Select text to annotate'}
            </span>
            <span className="text-pale-lavender/80">{activeOption.label}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}