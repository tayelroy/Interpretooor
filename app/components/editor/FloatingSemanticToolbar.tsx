'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, type EditorState } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  Bold,
  Code2,
  Highlighter,
  Italic,
  MessageSquareText,
  Pilcrow,
  Quote,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { $createSemanticNode } from './SemanticNode';

type FloatingToolbarPosition = {
  left: number;
  top: number;
};

type SemanticAction = {
  semanticTag: string;
  notePrompt: string;
};

interface FloatingSemanticToolbarProps {
  isPreview?: boolean;
  onPreviewChange?: (preview: boolean) => void;
}

const TOOLBAR_DELAY_MS = 200;
const TOOLBAR_OFFSET_PX = 56;

export default function FloatingSemanticToolbar(_props: FloatingSemanticToolbarProps) {
  const [editor] = useLexicalComposerContext();
  const timeoutRef = useRef<number | null>(null);
  const [position, setPosition] = useState<FloatingToolbarPosition | null>(null);

  const clearToolbar = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setPosition(null);
  };

  const scheduleToolbar = (_editorState: EditorState) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    timeoutRef.current = window.setTimeout(() => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          clearToolbar();
          return;
        }

        if (selection.getTextContent() === '') {
          clearToolbar();
          return;
        }

        const nativeSelection = window.getSelection();

        if (!nativeSelection || nativeSelection.rangeCount === 0) {
          clearToolbar();
          return;
        }

        const range = nativeSelection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (rect.width === 0 && rect.height === 0) {
          clearToolbar();
          return;
        }

        setPosition({
          left: Math.min(Math.max(rect.left + rect.width / 2, 16), window.innerWidth - 16),
          top: Math.max(rect.top - TOOLBAR_OFFSET_PX, 8),
        });
      });

      timeoutRef.current = null;
    }, TOOLBAR_DELAY_MS);
  };

  useEffect(() => {
    const unregisterUpdateListener = editor.registerUpdateListener(({ editorState }) => {
      let selectionText = '';

      editorState.read(() => {
        const selection = $getSelection();

        if ($isRangeSelection(selection) && !selection.isCollapsed()) {
          selectionText = selection.getTextContent();
        }
      });

      if (selectionText === '') {
        clearToolbar();
        return;
      }

      scheduleToolbar(editorState);
    });

    return () => {
      unregisterUpdateListener();

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [editor]);

  const applyFormat = (format: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const applySemanticAction = (action: SemanticAction) => {
    const note = window.prompt(action.notePrompt, '');

    if (note === null) {
      return;
    }

    editor.update(() => {
      const selection = $getSelection();

      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        return;
      }

      const selectedText = selection.getTextContent();

      if (selectedText === '') {
        return;
      }

      const semanticNode = $createSemanticNode(selectedText, action.semanticTag, note.trim());
      selection.insertNodes([semanticNode]);
    });
  };

  if (!position || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed z-50 flex -translate-x-1/2 items-center rounded-md bg-gray-900 p-1 text-white shadow-lg ring-1 ring-black/20"
      style={{ left: position.left, top: position.top }}
      role="toolbar"
      aria-label="Floating formatting and semantic toolbar"
    >
      <div className="flex items-center space-x-1">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyFormat('bold')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-sm text-white transition-colors hover:bg-white/10"
          aria-label="Bold"
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyFormat('italic')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-sm text-white transition-colors hover:bg-white/10"
          aria-label="Italic"
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyFormat('underline')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-sm text-white transition-colors hover:bg-white/10"
          aria-label="Underline"
          title="Underline"
        >
          <Underline className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyFormat('strikethrough')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-sm text-white transition-colors hover:bg-white/10"
          aria-label="Strikethrough"
          title="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-1 h-6 w-px bg-white/10" aria-hidden="true" />

      <div className="flex items-center space-x-1">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applySemanticAction({ semanticTag: 'idiom', notePrompt: 'Add a note for this idiom:' })}
          className="inline-flex h-9 items-center gap-2 rounded-sm px-3 text-xs font-medium text-white transition-colors hover:bg-white/10"
          aria-label="Mark as Idiom"
          title="Mark as Idiom"
        >
          <Quote className="h-4 w-4" />
          <span className="hidden sm:inline">Mark as Idiom</span>
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applySemanticAction({ semanticTag: 'tone', notePrompt: 'What tone should be recorded for this selection?' })}
          className="inline-flex h-9 items-center gap-2 rounded-sm px-3 text-xs font-medium text-white transition-colors hover:bg-white/10"
          aria-label="Set Tone"
          title="Set Tone"
        >
          <Highlighter className="h-4 w-4" />
          <span className="hidden sm:inline">Set Tone</span>
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applySemanticAction({ semanticTag: 'intent', notePrompt: 'What intent should be recorded for this selection?' })}
          className="inline-flex h-9 items-center gap-2 rounded-sm px-3 text-xs font-medium text-white transition-colors hover:bg-white/10"
          aria-label="Identify Intent"
          title="Identify Intent"
        >
          <MessageSquareText className="h-4 w-4" />
          <span className="hidden sm:inline">Identify Intent</span>
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applySemanticAction({ semanticTag: 'context', notePrompt: 'Add a context note for this selection:' })}
          className="inline-flex h-9 items-center gap-2 rounded-sm px-3 text-xs font-medium text-white transition-colors hover:bg-white/10"
          aria-label="Context"
          title="Context"
        >
          <Pilcrow className="h-4 w-4" />
          <span className="hidden sm:inline">Context</span>
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applySemanticAction({ semanticTag: 'code', notePrompt: 'Add a code note for this selection:' })}
          className="inline-flex h-9 items-center gap-2 rounded-sm px-3 text-xs font-medium text-white transition-colors hover:bg-white/10"
          aria-label="Code"
          title="Code"
        >
          <Code2 className="h-4 w-4" />
          <span className="hidden sm:inline">Code</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}