import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LexicalEditor } from 'lexical';
import { deserialiseMdhToLexical } from '@/lib/mdh-lexical-bridge';

function draftCacheKey(walletAddress: string): string {
  return `draft-cache-${walletAddress}`;
}

export type DraftDocument = {
  id?: string; // Optional ID for Supabase persistence
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

export interface SavedDraftEntry {
  key: string;
  title: string;
  updatedAt: string;
}

/**
 * Owns all draft state and Supabase persistence for the editor.
 * Maintains a localStorage write-through cache for instant hydration.
 */
export function useDraftPersistence(walletAddress?: string, editor?: LexicalEditor | null) {
  const [isReady, setIsReady] = useState(false);
  const [draft, setDraft] = useState<DraftDocument>(defaultDraft);
  const [title, setTitle] = useState(defaultDraft.metadata.title);
  const [sourceLanguage, setSourceLanguage] = useState(defaultDraft.metadata.sourceLanguage);
  const [composerKey, setComposerKey] = useState(0);
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>();
  const [savedDrafts, setSavedDrafts] = useState<SavedDraftEntry[]>([]);

  const latestContentRef = useRef<unknown>(null);
  const initialContentRef = useRef<unknown>(null);
  const saveTimerRef = useRef<number | null>(null);

  const activeAuthorPubkey = useMemo(
    () => walletAddress ?? defaultDraft.metadata.authorPubkey,
    [walletAddress]
  );

  // Helper to sync to localStorage cache
  const updateCache = useCallback((doc: DraftDocument) => {
    if (typeof window === 'undefined' || !walletAddress) return;
    window.localStorage.setItem(draftCacheKey(walletAddress), JSON.stringify(doc));
  }, [walletAddress]);

  // Initial load and wallet change
  useEffect(() => {
    if (!walletAddress) {
      initialContentRef.current = defaultDraft.content;
      latestContentRef.current = null;
      setDraft(defaultDraft);
      setTitle(defaultDraft.metadata.title);
      setSourceLanguage(defaultDraft.metadata.sourceLanguage);
      setActiveDraftId(undefined);
      setSavedDrafts([]);
      setComposerKey((k) => k + 1);
      setIsReady(true);
      return;
    }

    const init = async () => {
      // 1. Instant hydration from cache
      const cached = window.localStorage.getItem(draftCacheKey(walletAddress));
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as DraftDocument;
          initialContentRef.current = parsed.content;
          setDraft(parsed);
          setTitle(parsed.metadata.title);
          setSourceLanguage(parsed.metadata.sourceLanguage);
          setActiveDraftId(parsed.id);
          setComposerKey((k) => k + 1);
        } catch (e) {
          console.error('Failed to parse cached draft', e);
        }
      }

      // 2. Fetch list from API
      try {
        const res = await fetch(`/api/drafts?wallet=${walletAddress}`);
        if (res.ok) {
          const list = await res.json();
          const mappedList: SavedDraftEntry[] = list.map((d: any) => ({
            key: d.id,
            title: d.title,
            updatedAt: d.updated_at,
          }));
          setSavedDrafts(mappedList);

          // 3. Load most recent draft if we don't have one or if cache is old
          if (list.length > 0) {
            const mostRecent = list[0];
            // Only auto-load if we don't have an active draft OR if the remote is newer
            if (!activeDraftId || new Date(mostRecent.updated_at) > new Date(draft.updatedAt)) {
              const detailRes = await fetch(`/api/drafts/${mostRecent.id}?wallet=${walletAddress}`);
              if (detailRes.ok) {
                const fullDraft = await detailRes.json();
                const doc: DraftDocument = {
                  id: fullDraft.id,
                  content: fullDraft.content,
                  metadata: {
                    authorPubkey: fullDraft.wallet,
                    sourceLanguage: fullDraft.source_lang,
                    title: fullDraft.title,
                  },
                  updatedAt: fullDraft.updated_at,
                  version: 1,
                };
                initialContentRef.current = doc.content;
                setDraft(doc);
                setTitle(doc.metadata.title);
                setSourceLanguage(doc.metadata.sourceLanguage);
                setActiveDraftId(doc.id);
                setComposerKey((k) => k + 1);
                updateCache(doc);
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch drafts', e);
      }
      setIsReady(true);
    };

    void init();
  }, [walletAddress]); // Intentionally omitting many deps to prevent infinite loops, init runs once per wallet change

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
    async (content: unknown) => {
      if (typeof window === 'undefined' || !walletAddress) return;

      const currentTitle = title;
      const currentLang = sourceLanguage;
      const currentId = activeDraftId;

      try {
        let savedId = currentId;
        if (currentId) {
          // PATCH
          const res = await fetch(`/api/drafts/${currentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet: walletAddress,
              title: currentTitle,
              content,
              source_lang: currentLang,
            }),
          });
          if (!res.ok) throw new Error('Failed to patch draft');
        } else {
          // POST
          const res = await fetch('/api/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet: walletAddress,
              title: currentTitle,
              content,
              source_lang: currentLang,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            savedId = data.id;
            setActiveDraftId(savedId);
          } else {
            throw new Error('Failed to create draft');
          }
        }

        const next: DraftDocument = {
          id: savedId,
          content,
          metadata: { authorPubkey: activeAuthorPubkey, sourceLanguage: currentLang, title: currentTitle },
          updatedAt: new Date().toISOString(),
          version: 1,
        };
        setDraft(next);
        updateCache(next);
        
        // Refresh list silently
        const listRes = await fetch(`/api/drafts?wallet=${walletAddress}`);
        if (listRes.ok) {
          const list = await listRes.json();
          setSavedDrafts(list.map((d: any) => ({
            key: d.id,
            title: d.title,
            updatedAt: d.updated_at,
          })));
        }
      } catch (e) {
        console.error('Persistence failed', e);
      }
    },
    [activeAuthorPubkey, sourceLanguage, title, walletAddress, activeDraftId, updateCache]
  );

  // Re-persist when metadata changes
  useEffect(() => {
    if (!isReady || !walletAddress) return;
    const content = latestContentRef.current ?? initialContentRef.current;
    persistDraft(content);
  }, [title, sourceLanguage]);

  const schedulePersist = useCallback(
    (content: unknown) => {
      latestContentRef.current = content;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        void persistDraft(content);
        saveTimerRef.current = null;
      }, 250);
    },
    [persistDraft]
  );

  const clearDraft = useCallback(async () => {
    if (typeof window === 'undefined' || !walletAddress) return;

    const res = await fetch('/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: walletAddress,
        title: defaultDraft.metadata.title,
        content: defaultDraft.content,
        source_lang: defaultDraft.metadata.sourceLanguage,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const fresh: DraftDocument = {
        id: data.id,
        content: defaultDraft.content,
        metadata: { ...defaultDraft.metadata, authorPubkey: walletAddress },
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      initialContentRef.current = fresh.content;
      latestContentRef.current = null;
      setDraft(fresh);
      setTitle(fresh.metadata.title);
      setSourceLanguage(fresh.metadata.sourceLanguage);
      setActiveDraftId(fresh.id);
      setComposerKey((k) => k + 1);
      updateCache(fresh);
      
      const listRes = await fetch(`/api/drafts?wallet=${walletAddress}`);
      if (listRes.ok) {
        const list = await listRes.json();
        setSavedDrafts(list.map((d: any) => ({
          key: d.id,
          title: d.title,
          updatedAt: d.updated_at,
        })));
      }
    }
  }, [walletAddress, activeDraftId, updateCache]);

  const getSavedDraftKeys = useCallback((): SavedDraftEntry[] => {
    return savedDrafts;
  }, [savedDrafts]);

  const loadDraftByKey = useCallback(async (id: string) => {
    if (typeof window === 'undefined' || !walletAddress) return;
    try {
      const res = await fetch(`/api/drafts/${id}?wallet=${walletAddress}`);
      if (res.ok) {
        const fullDraft = await res.json();
        const doc: DraftDocument = {
          id: fullDraft.id,
          content: fullDraft.content,
          metadata: {
            authorPubkey: fullDraft.wallet,
            sourceLanguage: fullDraft.source_lang,
            title: fullDraft.title,
          },
          updatedAt: fullDraft.updated_at,
          version: 1,
        };
        initialContentRef.current = doc.content;
        latestContentRef.current = null;
        setDraft(doc);
        setTitle(doc.metadata.title);
        setSourceLanguage(doc.metadata.sourceLanguage);
        setActiveDraftId(doc.id);
        setComposerKey((k) => k + 1);
        updateCache(doc);
      }
    } catch (e) {
      console.error('Failed to load draft', e);
    }
  }, [walletAddress, updateCache]);

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
