'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { CodeNode } from '@lexical/code';
import { ListNode, ListItemNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import type { LexicalEditor } from 'lexical';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type EditorState,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import StaticToolbarPlugin from './StaticToolbarPlugin';
import FloatingSemanticToolbar from './FloatingSemanticToolbar';
import SemanticTooltipPlugin from './SemanticTooltipPlugin';
import { SemanticNode } from './SemanticNode';
import { useWallets } from '@privy-io/react-auth/solana';
import { usePublish } from '@/hooks/usePublish';
import { useDraftPersistence } from '@/hooks/useDraftPersistence';

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

function PublishControls({
  disabled,
  isPublishing,
  onClick,
  statusText,
}: {
  disabled: boolean;
  isPublishing: boolean;
  onClick: () => void;
  statusText: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-[#F2DAFF] px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPublishing ? statusText : 'Continue'}
    </button>
  );
}

function EditorBridge({ onReady }: { onReady: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);

  return null;
}

function LexicalPreview() {
  const [editor] = useLexicalComposerContext();
  const [html, setHtml] = useState('');

  useEffect(() => {
    editor.getEditorState().read(() => {
      const root = editor.getRootElement();
      if (root) {
        setHtml(root.innerHTML);
      }
    });
  }, [editor]);

  return (
    <div
      className="min-h-[60vh] w-full border-none bg-transparent text-lg leading-relaxed text-ink/90 md:text-xl"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function InterpretooorEditor() {
  const router = useRouter();
  const { wallets: solanaWallets } = useWallets();
  const activeWallet = solanaWallets[0] || null;

  const [isPreview, setIsPreview] = useState(false);
  const [editor, setEditor] = useState<LexicalEditor | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);

  const {
    isReady,
    draft,
    title,
    setTitle,
    sourceLanguage,
    setSourceLanguage,
    activeAuthorPubkey,
    schedulePersist,
    composerKey,
    clearDraft,
    getSavedDraftKeys,
    loadDraftByKey,
  } = useDraftPersistence(activeWallet?.address);

  const { handlePublish, isPublishing, statusText } = usePublish({
    authorPubkey: activeAuthorPubkey,
    editor,
    sourceLanguage,
    title,
  });

  const onPublishClick = async () => {
    console.log('🟢 1. onPublishClick triggered!');

    // 3. Guard against missing Privy wallet instead of Solana adapter
    if (!activeWallet) {
      console.error('🔴 ERROR: Privy Solana wallet is not connected.');
      alert('Missing wallet connection. Make sure you are signed in.');
      return;
    }

    console.log('🟢 2. Privy wallet found. Calling handlePublish...');
    try {
      const assetId = await handlePublish();
      console.log('🟢 6. handlePublish returned assetId:', assetId);

      if (assetId) {
        console.log(`🟢 7. Final mint complete: ${assetId}`);
        console.log(`🟢 Solscan Devnet: https://solscan.io/token/${assetId}?cluster=devnet`);
        router.push(`/app/write/success?assetId=${assetId}`);
      }
    } catch (error) {
      console.error('🔴 ERROR in onPublishClick:', error);
    }
  };

  useEffect(() => {
    const handlePublishEvent = () => {
      void onPublishClick();
    };

    window.addEventListener('interpretooor:publish', handlePublishEvent);

    return () => {
      window.removeEventListener('interpretooor:publish', handlePublishEvent);
    };
  }, [handlePublish, isPublishing, onPublishClick]);

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
        quote: 'border-l-4 border-gray-300 pl-4 py-2 my-4 italic text-gray-700 bg-gray-50/50 rounded-r-lg',
        code: 'bg-gray-100 rounded-md px-1.5 py-0.5 font-mono text-[0.9em] text-red-600',
        horizontalRule: 'border-t border-gray-200 my-8',
        link: 'text-orange-600 underline underline-offset-4 hover:text-orange-700 transition-colors cursor-pointer',
        list: {
          nested: {
            listitem: 'list-none',
          },
          ol: 'list-decimal ml-8 mb-4 space-y-2',
          ul: 'list-disc ml-8 mb-4 space-y-2',
          listitem: 'pl-1 leading-relaxed',
        },
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
    <div className="min-h-screen bg-white text-ink pt-20">
      <header className="sticky top-20 z-40 w-full border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <StatusIndicator />
            <button
              type="button"
              onClick={clearDraft}
              className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
            >
              New Article
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDraftsOpen((o) => !o)}
                className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
              >
                Saved Drafts
              </button>
              {draftsOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1">
                  {getSavedDraftKeys().length === 0 ? (
                    <p className="px-4 py-2 text-xs text-gray-400">No saved drafts</p>
                  ) : (
                    getSavedDraftKeys().map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => { loadDraftByKey(d.key); setDraftsOpen(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 truncate"
                      >
                        {d.title}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <Link
              href="/app/translate"
              className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
            >
              Published
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPreview((current) => !current)}
              className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-200"
              aria-pressed={isPreview}
            >
              {isPreview ? 'Edit' : 'Preview'}
            </button>
            <PublishControls disabled={isPublishing} isPublishing={isPublishing} onClick={onPublishClick} statusText={statusText} />
          </div>
        </div>
      </header>

      <main className="pb-16">
        <LexicalComposer key={composerKey} initialConfig={initialConfig}>
          <EditorBridge onReady={setEditor} />
          {!isPreview && <StaticToolbarPlugin />}

          <div className="mx-auto mt-8 w-full max-w-3xl px-4">
            <div className={`space-y-4 ${isPreview ? 'hidden' : 'block'}`}>
              <p className="text-[10px] uppercase tracking-[0.34em] text-muted-ash">Writing View</p>
              <AutoSizingTitle value={title} onChange={setTitle} />
            </div>
            
            {isPreview && (
              <div className="space-y-4 mb-8">
                <p className="text-[10px] uppercase tracking-[0.34em] text-muted-ash">Preview View</p>
                <h1 className="font-serif text-5xl font-bold leading-tight tracking-tight text-ink md:text-6xl">{title || 'Untitled Draft'}</h1>
              </div>
            )}

            <div className="relative mt-8">
              <div className={isPreview ? 'hidden' : 'block'}>
                <RichTextPlugin
                  contentEditable={
                    <ContentEditable className="lexical-content min-h-[60vh] w-full border-none bg-transparent text-lg leading-relaxed outline-none caret-black focus:outline-none md:text-xl" />
                  }
                  placeholder={<EditorPlaceholder />}
                  ErrorBoundary={({ children }) => children}
                />
              </div>
              {isPreview && <LexicalPreview />}
              <HistoryPlugin />
              <ListPlugin />
              <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
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