'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import { parseMdh, type ParsedMdh } from '@/lib/mdh-utils';
import { useBounty, type BountyAccount } from '@/hooks/useBounty';
import { toast } from 'sonner';
import type { InterpretationResult } from '@/lib/ai/openai-interpreter';

export type { InterpretationResult as AiSuggestion };

const IRYS_GATEWAY = process.env.NEXT_PUBLIC_IRYS_NODE_URL ?? 'https://devnet.irys.xyz';

export interface WorkspaceState {
  bounty: BountyAccount | null;
  originalParsed: ParsedMdh | null;
  translatedParsed: ParsedMdh | null;
  translatedRaw: string | null;
  loading: boolean;
  loadError: string | null;
  submitting: boolean;
  submitSuccess: boolean;
  aiSuggestion: InterpretationResult | null;
  aiLoading: boolean;
  importError: string | null;
  canSubmit: boolean;
  actions: {
    importFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
    applyAiSuggestion: () => void;
    submit: () => Promise<void>;
    reload: () => void;
  };
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function useWorkspaceTranslation(bountyId: string): WorkspaceState {
  const router = useRouter();
  const { wallets } = useWallets();
  const activeAddress = wallets[0]?.address;
  const { fetchBounty, submitTranslation } = useBounty();

  const [bounty, setBounty] = useState<BountyAccount | null>(null);
  const [originalParsed, setOriginalParsed] = useState<ParsedMdh | null>(null);
  const [translatedParsed, setTranslatedParsed] = useState<ParsedMdh | null>(null);
  const [translatedRaw, setTranslatedRaw] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<InterpretationResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pda = new PublicKey(bountyId);
      const data = await fetchBounty(pda);
      setBounty(data);

      if (data.translator && activeAddress && data.translator.toBase58() !== activeAddress) {
        router.replace(`/app/bounty/${bountyId}`);
        return;
      }

      const res = await fetch(`${IRYS_GATEWAY}/${data.originalTxId}`);
      if (!res.ok) throw new Error(`Failed to fetch original content (${res.status})`);
      const raw = await res.text();
      const parsed = parseMdh(raw);
      setOriginalParsed(parsed);

      // AI suggestion: best-effort, fires in background after content is ready
      setAiLoading(true);
      fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsedMdh: parsed, targetLang: data.targetLanguage }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((result: InterpretationResult) => setAiSuggestion(result))
        .catch(() => { /* silent — AI suggestion is best-effort */ })
        .finally(() => setAiLoading(false));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [bountyId, fetchBounty, activeAddress, router]);

  useEffect(() => { load(); }, [load]);

  const importFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.mdh') && !file.name.endsWith('.md')) {
      setImportError('Please upload a .mdh or .md file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const raw = ev.target?.result as string;
      try {
        const parsed = parseMdh(raw);
        setTranslatedParsed(parsed);
        setTranslatedRaw(raw);
        setImportError(null);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Failed to parse file');
        setTranslatedParsed(null);
        setTranslatedRaw(null);
      }
    };
    reader.readAsText(file);
    // Reset so re-importing the same file triggers onChange
    e.target.value = '';
  }, []);

  const applyAiSuggestion = useCallback(() => {
    if (!aiSuggestion) return;
    const raw = aiSuggestion.translatedText;
    setTranslatedRaw(raw);
    setTranslatedParsed(parseMdh(raw));
    toast.success('AI suggestion loaded as starting point');
  }, [aiSuggestion]);

  const submit = useCallback(async () => {
    if (!translatedRaw || !bounty || submitting || submitSuccess) return;
    setSubmitting(true);
    try {
      await submitTranslation({ bountyPda: bounty.publicKey, translationData: translatedRaw });
      setSubmitSuccess(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed — please try again');
    } finally {
      setSubmitting(false);
    }
  }, [translatedRaw, bounty, submitting, submitSuccess, submitTranslation]);

  const canSubmit = !!translatedRaw && !submitting && !submitSuccess && !!bounty && 'claimed' in bounty.status;

  return {
    bounty,
    originalParsed,
    translatedParsed,
    translatedRaw,
    loading,
    loadError,
    submitting,
    submitSuccess,
    aiSuggestion,
    aiLoading,
    importError,
    canSubmit,
    actions: { importFile, applyAiSuggestion, submit, reload: load },
    fileInputRef,
  };
}
