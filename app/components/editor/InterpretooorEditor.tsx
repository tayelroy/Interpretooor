'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { CodeNode } from '@lexical/code';
import { ListNode, ListItemNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type EditorState,
} from 'lexical';
import StaticToolbarPlugin from './StaticToolbarPlugin';
import FloatingSemanticToolbar from './FloatingSemanticToolbar';
import SemanticTooltipPlugin from './SemanticTooltipPlugin';
import { SemanticNode } from './SemanticNode';

const STORAGE_KEY = 'interpretooor_draft';
const AUTHOR_KEY = 'interpretooor_author_pubkey';

type DraftDocument = {
  content: unknown;
  metadata: {
    authorPubkey: string;
    sourceLanguage: string;
    title: string;
  };
  updatedAt: string;
  version: 1;
};

const defaultDraft: DraftDocument = {
  content: {
    root: {
      children: [
        {
          children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: '', type: 'text', version: 1 }],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  },
  metadata: {
    authorPubkey: 'anonymous-author',
    sourceLanguage: 'English',
    title: 'Untitled Draft',
  },
  updatedAt: new Date().toISOString(),
  version: 1,
};

function createInitialDraft(): DraftDocument {
  if (typeof window === 'undefined') {
    return defaultDraft;
  }

  const storedDraft = window.localStorage.getItem(STORAGE_KEY);

  if (!storedDraft) {
    const authorPubkey = window.localStorage.getItem(AUTHOR_KEY) ?? defaultDraft.metadata.authorPubkey;

    return {
      ...defaultDraft,
      metadata: {
        ...defaultDraft.metadata,
        authorPubkey,
      },
    };
  }

  try {
    const parsedDraft = JSON.parse(storedDraft) as DraftDocument;

    return {
      ...defaultDraft,
      ...parsedDraft,
      metadata: {
        ...defaultDraft.metadata,
        ...parsedDraft.metadata,
        authorPubkey:
          parsedDraft.metadata?.authorPubkey ?? window.localStorage.getItem(AUTHOR_KEY) ?? defaultDraft.metadata.authorPubkey,
      },
    };
  } catch {
    return defaultDraft;
  }
}

function emptyEditorState() {
  $getRoot().clear();

  const paragraph = $createParagraphNode();
  paragraph.append($createTextNode(''));
  $getRoot().append(paragraph);
}

function EditorPlaceholder() {
  return (
    <div className="pointer-events-none absolute left-0 top-0 px-1 py-2 text-sm text-ink/30 md:text-lg">
      Start writing, then highlight any span to mark semantic context.
    </div>
  );
}

function StatusIndicator() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      <span>Saved</span>
    </div>
  );
}

function AutoSizingTitle({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const titleRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const element = titleRef.current;

    if (!element) {
      return;
    }

    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={titleRef}
      value={value}
      rows={1}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Untitled Draft"
      spellCheck={false}
      className="w-full resize-none overflow-visible break-words whitespace-pre-wrap border-none bg-transparent p-0 font-serif text-5xl font-bold leading-tight tracking-tight text-ink outline-none placeholder:text-ink/20 md:text-6xl"
    />
  );
}

export default function InterpretooorEditor() {
  const [isReady, setIsReady] = useState(false);
  const [draft, setDraft] = useState<DraftDocument>(defaultDraft);
  const [title, setTitle] = useState(defaultDraft.metadata.title);
  const [sourceLanguage, setSourceLanguage] = useState(defaultDraft.metadata.sourceLanguage);
  const [authorPubkey, setAuthorPubkey] = useState(defaultDraft.metadata.authorPubkey);
  const [isPreview, setIsPreview] = useState(false);
  const latestContentRef = useRef<unknown>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const initialDraft = createInitialDraft();
    setDraft(initialDraft);
    setTitle(initialDraft.metadata.title);
    setSourceLanguage(initialDraft.metadata.sourceLanguage);
    setAuthorPubkey(initialDraft.metadata.authorPubkey);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    window.localStorage.setItem(AUTHOR_KEY, authorPubkey);
  }, [authorPubkey, isReady]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const content = latestContentRef.current ?? draft.content;

    const nextDraft: DraftDocument = {
      content,
      metadata: {
        authorPubkey,
        sourceLanguage,
        title,
      },
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDraft));
    setDraft(nextDraft);
  }, [authorPubkey, isReady, sourceLanguage, title]);

  const persistDraft = (content: unknown) => {
    if (typeof window === 'undefined') {
      return;
    }

    const nextDraft: DraftDocument = {
      content,
      metadata: {
        authorPubkey,
        sourceLanguage,
        title,
      },
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDraft));
    setDraft(nextDraft);
  };

  const schedulePersist = (content: unknown) => {
    latestContentRef.current = content;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      persistDraft(content);
      saveTimerRef.current = null;
    }, 250);
  };

  useEffect(() => {
    if (!isReady || !latestContentRef.current) {
      return;
    }

    persistDraft(latestContentRef.current);
  }, [authorPubkey, isReady, sourceLanguage, title]);

  const initialConfig: InitialConfigType = useMemo(
    () => ({
      editorState: draft.content ? JSON.stringify(draft.content) : emptyEditorState,
      namespace: 'InterpretooorEditor',
      nodes: [SemanticNode, HorizontalRuleNode, HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode],
      onError(error) {
        throw error;
      },
      theme: {
        heading: {
          h1: 'text-4xl font-serif italic font-normal tracking-tight text-ink',
          h2: 'text-3xl font-serif italic font-normal tracking-tight text-ink',
          h3: 'text-2xl font-serif italic font-normal tracking-tight text-ink',
        },
        paragraph: 'mb-4 leading-relaxed text-ink/90 text-[18px] md:text-[20px] lg:text-[21px]',
        text: {
          bold: 'font-semibold',
          italic: 'italic',
          underline: 'underline underline-offset-4',
          strikethrough: 'line-through',
        },
      },
    }),
    [draft.content],
  );

  if (!isReady) {
    return (
      <div className="min-h-screen bg-parchment px-6 pt-32 text-ink md:px-10">
        <div className="mx-auto max-w-5xl rounded-[32px] border border-stone-200 bg-white/70 p-8 shadow-sm">
          <div className="h-6 w-40 rounded-full bg-stone-100" />
          <div className="mt-8 h-12 w-2/3 rounded-2xl bg-stone-100" />
          <div className="mt-6 h-[420px] rounded-[28px] bg-stone-50" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="sticky top-0 z-40 w-full border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="text-xl leading-none text-gray-700 transition-colors hover:text-gray-900"
              aria-label="Go back"
            >
              &lt;
            </button>
            <StatusIndicator />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPreview((current) => !current)}
              className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-200"
              aria-pressed={isPreview}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => console.log('Publishing...')}
              className="rounded-full bg-[#F2DAFF] px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:opacity-95"
            >
              Continue
            </button>
          </div>
        </div>
      </header>

      <main className="pb-16">
        <LexicalComposer initialConfig={initialConfig}>
          <StaticToolbarPlugin />

          <div className="mx-auto mt-8 w-full max-w-3xl px-4">
            <div className="space-y-4">
              <p className="text-[10px] uppercase tracking-[0.34em] text-muted-ash">Writing View</p>
              <AutoSizingTitle value={title} onChange={setTitle} />
            </div>

            <div className="relative mt-8">
              <RichTextPlugin
                contentEditable={
                  <ContentEditable className="min-h-[60vh] w-full border-none bg-transparent text-lg leading-relaxed outline-none caret-black focus:outline-none md:text-xl" />
                }
                placeholder={<EditorPlaceholder />}
                ErrorBoundary={({ children }) => children}
              />
              <HistoryPlugin />
              <MarkdownShortcutPlugin />
              <OnChangePlugin
                onChange={(editorState: EditorState) => {
                  const content = editorState.toJSON();
                  schedulePersist(content);
                }}
              />
            </div>
          </div>

          <SemanticTooltipPlugin enabled={isPreview} />
          <FloatingSemanticToolbar disabled={isPreview} />
        </LexicalComposer>
      </main>
    </div>
  );
}