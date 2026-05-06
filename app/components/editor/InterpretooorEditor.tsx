'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(240,215,255,0.8),_transparent_30%),linear-gradient(180deg,#ffffeb_0%,#fffdf3_100%)] px-4 pb-32 pt-32 text-ink md:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-start">
        <section className="min-w-0 flex-1 rounded-[36px] border border-ink/10 bg-white/60 p-5 shadow-[0_30px_100px_rgba(26,26,26,0.08)] backdrop-blur-sm md:p-8 lg:p-10">
          <div className="flex flex-col gap-5 border-b border-ink/10 pb-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-ash">Writing View</p>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full border-none bg-transparent p-0 font-serif text-4xl italic leading-tight tracking-tight text-ink outline-none placeholder:text-ink/20 md:text-6xl"
                placeholder="Untitled Draft"
              />
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-ash">
                <span className="rounded-full border border-ink/10 bg-white px-3 py-1">.mdh draft</span>
                <span className="rounded-full border border-ink/10 bg-white px-3 py-1">Semantic spans</span>
                <span className="rounded-full border border-ink/10 bg-white px-3 py-1">Hover inspect</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <label className="space-y-2 text-xs uppercase tracking-[0.24em] text-muted-ash">
                <span>Source language</span>
                <select
                  value={sourceLanguage}
                  onChange={(event) => setSourceLanguage(event.target.value)}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm uppercase tracking-[0.16em] text-ink outline-none"
                >
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                  <option>Japanese</option>
                  <option>German</option>
                </select>
              </label>

              <label className="space-y-2 text-xs uppercase tracking-[0.24em] text-muted-ash">
                <span>Author pubkey</span>
                <input
                  value={authorPubkey}
                  onChange={(event) => setAuthorPubkey(event.target.value)}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm tracking-wide text-ink outline-none"
                  placeholder="anonymous-author"
                />
              </label>
            </div>
          </div>

          <LexicalComposer initialConfig={initialConfig}>
            <div className="relative mt-8 min-h-[520px] rounded-[32px] border border-dashed border-ink/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.78))] p-5 md:p-8 lg:min-h-[640px]">
              <RichTextPlugin
                contentEditable={
                  <ContentEditable className="min-h-[420px] w-full resize-none border-none bg-transparent text-[18px] leading-[1.85] text-ink outline-none placeholder:text-ink/25 focus:outline-none md:text-[20px] lg:text-[21px]" />
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

            <SemanticTooltipPlugin enabled={isPreview} />
            <FloatingSemanticToolbar isPreview={isPreview} onPreviewChange={setIsPreview} />
          </LexicalComposer>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-ink/10 bg-white px-4 py-3 text-xs text-muted-ash">
            <span>
              Saved locally as <strong className="text-ink">interpretooor_draft</strong>
            </span>
            <span>{draft.updatedAt ? `Last saved ${new Date(draft.updatedAt).toLocaleString()}` : 'Waiting for first save'}</span>
          </div>
        </section>

        <aside className="w-full rounded-[32px] border border-ink/10 bg-ink p-6 text-parchment shadow-[0_30px_100px_rgba(26,26,26,0.2)] lg:w-[340px] lg:sticky lg:top-28">
          <div className="text-[10px] uppercase tracking-[0.28em] text-pale-lavender/70">Current draft</div>
          <h2 className="mt-3 text-3xl font-serif italic text-parchment">{title || 'Untitled Draft'}</h2>
          <p className="mt-3 text-sm leading-relaxed text-parchment/70">
            This view replaces the old interpretation form. Use the toolbar to tag important spans, then switch to preview to inspect semantic notes without editing.
          </p>

          <div className="mt-8 space-y-4 border-t border-white/10 pt-6 text-sm text-parchment/80">
            <div className="flex items-center justify-between">
              <span>Mode</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em]">{isPreview ? 'Preview' : 'Edit'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Semantic nodes</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em]">Registered</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Draft format</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em]">.mdh</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}