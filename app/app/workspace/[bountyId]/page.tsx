'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import { ArrowLeft, Upload, Loader2, AlertCircle, Globe } from 'lucide-react';
import { useBounty, type BountyAccount } from '@/hooks/useBounty';
import { parseMdh, type ParsedMdh } from '@/lib/mdh-utils';
import MdhRenderer from '@/app/components/MdhRenderer';
import { toast } from 'sonner';

const IRYS_GATEWAY = process.env.NEXT_PUBLIC_IRYS_NODE_URL ?? 'https://devnet.irys.xyz';

export default function WorkspacePage() {
  const params = useParams();
  const bountyId = params.bountyId as string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pda = new PublicKey(bountyId);
      const data = await fetchBounty(pda);
      setBounty(data);

      // Guard: only the claimed translator may access this page
      if (data.translator && activeAddress && data.translator.toBase58() !== activeAddress) {
        router.replace(`/app/bounty/${bountyId}`);
        return;
      }

      const res = await fetch(`${IRYS_GATEWAY}/${data.originalTxId}`);
      if (!res.ok) throw new Error(`Failed to fetch original content (${res.status})`);
      const raw = await res.text();
      setOriginalParsed(parseMdh(raw));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [bountyId, fetchBounty, activeAddress, router]);

  useEffect(() => { load(); }, [load]);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.mdh')) {
      setImportError('Please upload a .mdh file');
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
    // Reset input so re-importing the same file triggers onChange
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!translatedRaw || !bounty || submitting || submitSuccess) return;
    setSubmitting(true);
    try {
      // submitTranslation handles Irys upload via the platform relayer then
      // signs the submit_translation on-chain instruction in one call.
      await submitTranslation({ bountyPda: bounty.publicKey, translationData: translatedRaw });
      setSubmitSuccess(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-parchment pt-40 flex items-center justify-center">
        <div className="flex items-center gap-3 text-stone-400">
          <Loader2 size={24} className="animate-spin" />
          <span>Loading workspace…</span>
        </div>
      </div>
    );
  }

  if (loadError || !bounty) {
    return (
      <div className="min-h-screen bg-parchment pt-40 px-8">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-stone-500 hover:text-ink mb-8">
            <ArrowLeft size={18} /> Back
          </button>
          <div className="flex items-start gap-3 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700">
            <AlertCircle size={20} className="mt-0.5 shrink-0" />
            <span>{loadError ?? 'Workspace not found'}</span>
          </div>
        </div>
      </div>
    );
  }

  const canSubmit = !!translatedRaw && !submitting && !submitSuccess && 'claimed' in bounty.status;

  return (
    <div className="min-h-screen bg-parchment pt-32 pb-20 px-8">
      <div className="max-w-7xl mx-auto">

        {/* Nav */}
        <div className="flex items-center justify-between mb-10">
          <button
            onClick={() => router.push(`/app/bounty/${bountyId}`)}
            className="flex items-center gap-2 text-stone-500 hover:text-ink transition-colors group"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            Bounty Detail
          </button>

          <div className="flex items-center gap-3 text-sm text-stone-500">
            {bounty.targetLanguage && (
              <span className="flex items-center gap-1.5">
                <Globe size={13} />
                {bounty.targetLanguage}
              </span>
            )}
            <span className="font-mono text-xs bg-stone-100 px-3 py-1 rounded-full">
              {bountyId.slice(0, 8)}…
            </span>
          </div>
        </div>

        {/* Two-column split */}
        <div className="flex flex-col lg:flex-row gap-6 bg-stone-100 p-3 rounded-[40px]">

          {/* Left — Original */}
          <div className="flex-1 bg-white p-10 rounded-[32px] border border-stone-200/50 shadow-sm">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-stone-100">
              <h3 className="text-xl text-ink">Original Source</h3>
              <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">Original</span>
            </div>
            {originalParsed ? (
              <MdhRenderer parsedMdh={originalParsed} />
            ) : (
              <p className="text-stone-400 text-sm">Content unavailable</p>
            )}
          </div>

          {/* Right — Translation */}
          <div className="flex-1 bg-white p-10 rounded-[32px] border border-stone-200/50 shadow-sm flex flex-col">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-stone-100">
              <h3 className="text-xl text-ink">Your Translation</h3>
              <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">
                {bounty.targetLanguage ?? 'Target'}
              </span>
            </div>

            {/* File import */}
            <div className="mb-6">
              <input
                ref={fileInputRef}
                type="file"
                accept=".mdh"
                onChange={handleFileImport}
                className="hidden"
                id="mdh-import"
              />
              <label
                htmlFor="mdh-import"
                className="flex items-center gap-2 px-5 py-3 bg-stone-100 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-200 transition-colors cursor-pointer w-fit"
              >
                <Upload size={14} />
                Import Translated .mdh
              </label>

              {importError && (
                <div className="flex items-center gap-2 mt-3 text-red-600 text-sm">
                  <AlertCircle size={14} className="shrink-0" />
                  {importError}
                </div>
              )}
            </div>

            {/* Translated content preview */}
            <div className="flex-1 min-h-[200px]">
              {translatedParsed ? (
                <MdhRenderer parsedMdh={translatedParsed} />
              ) : (
                <div className="flex items-center justify-center h-full text-stone-300 text-sm">
                  Import a .mdh file to preview your translation here
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="mt-8 flex justify-end items-center gap-4">
          {submitSuccess && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-5 py-3 rounded-xl">
              Translation submitted. The 48-hour review window has started.
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-8 py-4 bg-ink text-parchment rounded-2xl font-bold text-base hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? (
              <><Loader2 size={18} className="animate-spin" /> Submitting…</>
            ) : (
              'Submit Translation'
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
