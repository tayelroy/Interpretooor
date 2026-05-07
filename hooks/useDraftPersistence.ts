import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'interpretooor_draft';
const AUTHOR_KEY = 'interpretooor_author_pubkey';

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

function createInitialDraft(): DraftDocument {
  if (typeof window === 'undefined') return defaultDraft;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const authorPubkey = window.localStorage.getItem(AUTHOR_KEY) ?? defaultDraft.metadata.authorPubkey;
    return { ...defaultDraft, metadata: { ...defaultDraft.metadata, authorPubkey } };
  }

  try {
    const parsed = JSON.parse(stored) as DraftDocument;
    return {
      ...defaultDraft,
      ...parsed,
      metadata: {
        ...defaultDraft.metadata,
        ...parsed.metadata,
        authorPubkey:
          parsed.metadata?.authorPubkey ??
          window.localStorage.getItem(AUTHOR_KEY) ??
          defaultDraft.metadata.authorPubkey,
      },
    };
  } catch {
    return defaultDraft;
  }
}

/**
 * Owns all draft state and localStorage persistence for the editor.
 * Accepts the active wallet address so the stored author pubkey stays in
 * sync with whoever is signed in.
 */
export function useDraftPersistence(walletAddress?: string) {
  const [isReady, setIsReady] = useState(false);
  const [draft, setDraft] = useState<DraftDocument>(defaultDraft);
  const [title, setTitle] = useState(defaultDraft.metadata.title);
  const [sourceLanguage, setSourceLanguage] = useState(defaultDraft.metadata.sourceLanguage);
  const [authorPubkey, setAuthorPubkey] = useState(defaultDraft.metadata.authorPubkey);

  // Holds the latest Lexical editor content between debounce ticks
  const latestContentRef = useRef<unknown>(null);
  // Holds the initial content from localStorage so metadata-change effects
  // can reference it without stale closure over `draft`
  const initialContentRef = useRef<unknown>(null);
  const saveTimerRef = useRef<number | null>(null);

  const activeAuthorPubkey = useMemo(
    () => walletAddress ?? authorPubkey,
    [walletAddress, authorPubkey]
  );

  // Hydrate from localStorage once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const initialDraft = createInitialDraft();
    initialContentRef.current = initialDraft.content;
    setDraft(initialDraft);
    setTitle(initialDraft.metadata.title);
    setSourceLanguage(initialDraft.metadata.sourceLanguage);
    setAuthorPubkey(initialDraft.metadata.authorPubkey);
    setIsReady(true);
  }, []);

  // Keep author pubkey in localStorage in sync with the active wallet
  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(AUTHOR_KEY, activeAuthorPubkey);
  }, [activeAuthorPubkey, isReady]);

  const persistDraft = useCallback(
    (content: unknown) => {
      if (typeof window === 'undefined') return;
      const next: DraftDocument = {
        content,
        metadata: { authorPubkey: activeAuthorPubkey, sourceLanguage, title },
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setDraft(next);
    },
    [activeAuthorPubkey, sourceLanguage, title]
  );

  // Re-persist when metadata (title / language / author) changes so the stored
  // draft always reflects the latest metadata even without new content edits.
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

  return {
    isReady,
    draft,
    title,
    setTitle,
    sourceLanguage,
    setSourceLanguage,
    activeAuthorPubkey,
    schedulePersist,
  };
}
