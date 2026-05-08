import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LexicalEditor } from 'lexical';
import { deserialiseMdhToLexical } from '@/lib/mdh-lexical-bridge';

function draftKey(walletAddress: string): string {
  return `draft-${walletAddress}`;
}

export type DraftDocument = {
  content: unknown;
  metadata: {
    authorPubkey: string;
    sourceLanguage: string;
    title: string;
  };
  updatedAt: string;
  version: 1;
};

export const defaultDraft: DraftDocument = {
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

function loadFromStorage(walletAddress: string): DraftDocument {
  if (typeof window === 'undefined') return defaultDraft;
  const stored = window.localStorage.getItem(draftKey(walletAddress));
  if (!stored) {
    return { ...defaultDraft, metadata: { ...defaultDraft.metadata, authorPubkey: walletAddress } };
  }
  try {
    const parsed = JSON.parse(stored) as DraftDocument;
    return {
      ...defaultDraft,
      ...parsed,
      metadata: { ...defaultDraft.metadata, ...parsed.metadata },
    };
  } catch {
    return { ...defaultDraft, metadata: { ...defaultDraft.metadata, authorPubkey: walletAddress } };
  }
}

export interface SavedDraftEntry {
  key: string;
  title: string;
  updatedAt: string;
}

/**
 * Owns all draft state and localStorage persistence for the editor.
 * Draft storage is keyed per wallet: draft-${walletAddress}.
 * When walletAddress changes the hook reloads from the new wallet's key
 * and bumps composerKey so LexicalComposer remounts with fresh content.
 */
export function useDraftPersistence(walletAddress?: string, editor?: LexicalEditor | null) {
  const [isReady, setIsReady] = useState(false);
  const [draft, setDraft] = useState<DraftDocument>(defaultDraft);
  const [title, setTitle] = useState(defaultDraft.metadata.title);
  const [sourceLanguage, setSourceLanguage] = useState(defaultDraft.metadata.sourceLanguage);
  // Bumping this causes LexicalComposer to remount with the current draft.content
  const [composerKey, setComposerKey] = useState(0);

  const latestContentRef = useRef<unknown>(null);
  const initialContentRef = useRef<unknown>(null);
  const saveTimerRef = useRef<number | null>(null);

  const activeAuthorPubkey = useMemo(
    () => walletAddress ?? defaultDraft.metadata.authorPubkey,
    [walletAddress]
  );

  // Reload from wallet-scoped key whenever the connected wallet changes
  useEffect(() => {
    if (!walletAddress) {
      initialContentRef.current = defaultDraft.content;
      latestContentRef.current = null;
      setDraft(defaultDraft);
      setTitle(defaultDraft.metadata.title);
      setSourceLanguage(defaultDraft.metadata.sourceLanguage);
      setComposerKey((k) => k + 1);
      setIsReady(true);
      return;
    }

    const loaded = loadFromStorage(walletAddress);
    initialContentRef.current = loaded.content;
    latestContentRef.current = null;
    setDraft(loaded);
    setTitle(loaded.metadata.title);
    setSourceLanguage(loaded.metadata.sourceLanguage);
    setComposerKey((k) => k + 1);
    setIsReady(true);
  }, [walletAddress]);

  // Hydrate editor when content was saved as a raw .mdh string
  useEffect(() => {
    if (!isReady || !editor) return;
    const content = initialContentRef.current;
    const isLegacyFormat =
      typeof content === 'object' && content !== null && 'root' in (content as object);
    if (!isLegacyFormat && typeof content === 'string') {
      deserialiseMdhToLexical(content, editor);
    }
  }, [isReady, editor]);

  const persistDraft = useCallback(
    (content: unknown) => {
      if (typeof window === 'undefined' || !walletAddress) return;
      const next: DraftDocument = {
        content,
        metadata: { authorPubkey: activeAuthorPubkey, sourceLanguage, title },
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      window.localStorage.setItem(draftKey(walletAddress), JSON.stringify(next));
      setDraft(next);
    },
    [activeAuthorPubkey, sourceLanguage, title, walletAddress]
  );

  // Re-persist when metadata (title / language) changes
  useEffect(() => {
    if (!isReady) return;
    persistDraft(latestContentRef.current ?? initialContentRef.current);
  }, [isReady, persistDraft]);

  const schedulePersist = useCallback(
    (content: unknown) => {
      latestContentRef.current = content;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        persistDraft(content);
        saveTimerRef.current = null;
      }, 250);
    },
    [persistDraft]
  );

  /** Clear the current draft and start fresh. Remounts the editor. */
  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined' || !walletAddress) return;
    window.localStorage.removeItem(draftKey(walletAddress));
    const fresh: DraftDocument = {
      ...defaultDraft,
      metadata: { ...defaultDraft.metadata, authorPubkey: walletAddress },
    };
    initialContentRef.current = fresh.content;
    latestContentRef.current = null;
    setDraft(fresh);
    setTitle(fresh.metadata.title);
    setSourceLanguage(fresh.metadata.sourceLanguage);
    setComposerKey((k) => k + 1);
  }, [walletAddress]);

  /** List all localStorage drafts for the current wallet, newest first. */
  const getSavedDraftKeys = useCallback((): SavedDraftEntry[] => {
    if (typeof window === 'undefined' || !walletAddress) return [];
    const prefix = `draft-${walletAddress}`;
    return Object.keys(window.localStorage)
      .filter((k) => k.startsWith(prefix))
      .map((k) => {
        try {
          const d = JSON.parse(window.localStorage.getItem(k) ?? '{}') as DraftDocument;
          return { key: k, title: d.metadata?.title ?? 'Untitled', updatedAt: d.updatedAt ?? '' };
        } catch {
          return { key: k, title: 'Untitled', updatedAt: '' };
        }
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [walletAddress]);

  /** Load a specific draft by its localStorage key. Remounts the editor. */
  const loadDraftByKey = useCallback((storageKey: string) => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as DraftDocument;
      const loaded = {
        ...defaultDraft,
        ...parsed,
        metadata: { ...defaultDraft.metadata, ...parsed.metadata },
      };
      initialContentRef.current = loaded.content;
      latestContentRef.current = null;
      setDraft(loaded);
      setTitle(loaded.metadata.title);
      setSourceLanguage(loaded.metadata.sourceLanguage);
      setComposerKey((k) => k + 1);
    } catch {
      // ignore corrupt data
    }
  }, []);

  return {
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
  };
}
