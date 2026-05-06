'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { $getSelection, $isRangeSelection, $setSelection, type RangeSelection } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createSemanticNode } from './SemanticNode';

type FloatingToolbarPosition = {
  left: number;
  top: number;
};

type ToolbarMode = 'buttons' | 'note';

type SemanticAction = {
  semanticTag: string;
  label: string;
};

interface FloatingSemanticToolbarProps {
  disabled?: boolean;
}

const TOOLBAR_DELAY_MS = 200;
const TOOLBAR_OFFSET_PX = 56;

const semanticActions: SemanticAction[] = [
  { semanticTag: 'idiom', label: 'Mark as Idiom' },
  { semanticTag: 'tone', label: 'Set Tone' },
  { semanticTag: 'intent', label: 'Identify Intent' },
];

export default function FloatingSemanticToolbar({ disabled = false }: FloatingSemanticToolbarProps) {
  const [editor] = useLexicalComposerContext();
  const timeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const savedSelectionRef = useRef<RangeSelection | null>(null);
  const [mode, setMode] = useState<ToolbarMode>('buttons');
  const [activeAction, setActiveAction] = useState<SemanticAction | null>(null);
  const [note, setNote] = useState('');
  const [position, setPosition] = useState<FloatingToolbarPosition | null>(null);

  const isOpen = !disabled && position !== null;

  const clearToolbar = () => {
    setMode('buttons');
    setActiveAction(null);
    setNote('');
    savedSelectionRef.current = null;

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setPosition(null);
  };

  const captureSelection = () => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();

      if ($isRangeSelection(selection) && !selection.isCollapsed() && selection.getTextContent() !== '') {
        savedSelectionRef.current = selection.clone();
      }
    });
  };

  const scheduleToolbar = () => {
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

        if (mode === 'note') {
          timeoutRef.current = null;
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
    if (disabled) {
      clearToolbar();
      return;
    }

    const unregisterUpdateListener = editor.registerUpdateListener(() => {
      if (mode === 'note') {
        return;
      }

      scheduleToolbar();
    });

    return () => {
      unregisterUpdateListener();

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [disabled, editor, mode]);

  useEffect(() => {
    if (mode === 'note') {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [mode]);

  const beginSemanticAction = (action: SemanticAction) => {
    captureSelection();

    if (!savedSelectionRef.current) {
      return;
    }

    setActiveAction(action);
    setMode('note');
    setNote('');
  };

  const cancelSemanticAction = () => {
    setMode('buttons');
    setActiveAction(null);
    setNote('');
  };

  const saveSemanticAction = () => {
    if (!activeAction || !savedSelectionRef.current) {
      return;
    }

    const semanticNote = note.trim();

    editor.update(() => {
      const savedSelection = savedSelectionRef.current?.clone() ?? null;

      if (!savedSelection) {
        return;
      }

      $setSelection(savedSelection);

      const selectedText = savedSelection.getTextContent();

      if (!selectedText) {
        return;
      }

      const semanticNode = $createSemanticNode(selectedText, activeAction.semanticTag, semanticNote);
      savedSelection.insertNodes([semanticNode]);
    });

    cancelSemanticAction();
  };

  const semanticButton = (action: SemanticAction) => (
    <button
      key={action.semanticTag}
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => beginSemanticAction(action)}
      className="inline-flex h-8 items-center rounded-md bg-white/5 px-3 text-xs font-medium text-white transition-colors hover:bg-white/10"
      aria-label={action.label}
      title={action.label}
    >
      {action.label}
    </button>
  );

  const toolbarContent = useMemo(() => {
    if (mode === 'note' && activeAction) {
      return (
        <div className="flex items-center gap-2">
          <div className="max-w-[240px] rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
            Add a note for {activeAction.label}
          </div>
          <input
            ref={inputRef}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                saveSemanticAction();
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                cancelSemanticAction();
              }
            }}
            placeholder="Type note..."
            className="h-8 w-44 rounded-md border border-white/10 bg-gray-800 px-3 text-sm text-white outline-none placeholder:text-white/40"
          />
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={saveSemanticAction}
            className="inline-flex h-8 items-center rounded-md bg-orange-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-orange-400"
          >
            Save
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={cancelSemanticAction}
            className="inline-flex h-8 items-center rounded-md bg-white/5 px-3 text-xs font-medium text-white transition-colors hover:bg-white/10"
          >
            Back
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1">{semanticActions.map(semanticButton)}</div>
    );
  }, [activeAction, note, mode]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed z-50 flex -translate-x-1/2 items-center gap-2 rounded-md bg-gray-900 p-1 text-white shadow-lg ring-1 ring-black/20"
      style={{ left: position.left, top: position.top }}
      role="toolbar"
      aria-label="Floating formatting and semantic toolbar"
    >
      {toolbarContent}
    </div>,
    document.body,
  );
}