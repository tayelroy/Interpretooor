'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import {
  ArrowLeft, Loader2, AlertCircle, ShieldCheck,
  ShieldX, CheckCircle2, Globe, Lock,
} from 'lucide-react';
import Link from 'next/link';
import { useBounty, type BountyAccount } from '@/hooks/useBounty';
import { useValidator, type ValidationRecord, type TagDecision, type ValidatorStakeAccountData } from '@/hooks/useValidator';
import { parseMdh, type ParsedMdh, type SemanticTag } from '@/lib/mdh-utils';
import MdhRenderer from '@/app/components/MdhRenderer';
import { toast } from 'sonner';

const IRYS_GATEWAY = process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz';

// ─── Local helpers ────────────────────────────────────────────────────────────

function tagColor(key: string): string {
  const map: Record<string, string> = {
    tone: 'bg-amber-100 text-amber-800 border-amber-200',
    culture: 'bg-teal-100 text-teal-800 border-teal-200',
    intent: 'bg-purple-100 text-purple-800 border-purple-200',
    idiom: 'bg-orange-100 text-orange-800 border-orange-200',
  };
  return map[key] ?? 'bg-stone-100 text-stone-600 border-stone-200';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ValidateAssessmentPage() {
  const params = useParams();
  const bountyId = params.bountyId as string;
  const router = useRouter();
  const { wallets } = useWallets();
  const activeAddress = wallets[0]?.address;

  const { fetchBounty } = useBounty();
  const { fetchValidationRecord, fetchStakeAccount, registerValidator, submitAttestation } = useValidator();

  // ── State ─────────────────────────────────────────────────────────────────

  const [bounty, setBounty] = useState<BountyAccount | null>(null);
  const [record, setRecord] = useState<ValidationRecord | null>(null);
  const [originalParsed, setOriginalParsed] = useState<ParsedMdh | null>(null);
  const [translatedParsed, setTranslatedParsed] = useState<ParsedMdh | null>(null);

  const [stakeAccount, setStakeAccount] = useState<ValidatorStakeAccountData | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [registering, setRegistering] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [stakeAcknowledged, setStakeAcknowledged] = useState(false);
  const [showStakeWarning, setShowStakeWarning] = useState(false);

  // Assessment form state
  const [decisions, setDecisions] = useState<Record<number, { translatedPhrase: string; rationale: string }>>({});
  const [overallVote, setOverallVote] = useState<boolean | null>(null);

  // Refs for scroll-to-error
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pda = new PublicKey(bountyId);
      const [data, rec] = await Promise.all([
        fetchBounty(pda),
        fetchValidationRecord(pda).catch(() => null),
      ]);
      setBounty(data);
      setRecord(rec);

      // Fetch validator's stake account if a wallet is connected
      if (activeAddress) {
        const stakeAcc = await fetchStakeAccount(new PublicKey(activeAddress)).catch(() => null);
        setStakeAccount(stakeAcc);
      }

      const validStatuses = ['awaitingValidation', 'disputed', 'rejected'] as const;
      if (!validStatuses.some(s => s in data.status)) {
        toast.error('This bounty is not awaiting validation');
        router.replace(`/app/bounty/${bountyId}`);
        return;
      }

      // Fetch original and translation content in parallel
      const [origRes, transRes] = await Promise.all([
        fetch(`${IRYS_GATEWAY}/${data.originalTxId}`),
        data.translatedTxId ? fetch(`${IRYS_GATEWAY}/${data.translatedTxId}`) : null,
      ]);

      if (!origRes.ok) throw new Error(`Failed to fetch original (${origRes.status})`);
      const origRaw = await origRes.text();
      setOriginalParsed(parseMdh(origRaw));

      if (transRes && transRes.ok) {
        const transRaw = await transRes.text();
        setTranslatedParsed(parseMdh(transRaw));

        // Pre-fill decision translated phrases from the translation
        const transTags = parseMdh(transRaw).tags;
        const origTags = parseMdh(origRaw).tags;
        const prefilled: Record<number, { translatedPhrase: string; rationale: string }> = {};
        origTags.forEach((_, idx) => {
          prefilled[idx] = {
            translatedPhrase: transTags[idx]?.phrase ?? '',
            rationale: '',
          };
        });
        setDecisions(prefilled);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [bountyId, fetchBounty, fetchValidationRecord, router]);

  useEffect(() => { load(); }, [load]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const isRegistered =
    activeAddress &&
    record &&
    (record.validator1?.toBase58() === activeAddress ||
      record.validator2?.toBase58() === activeAddress);

  const hasAlreadyAttested = (() => {
    if (!isRegistered || !record) return false;
    if (record.validator1?.toBase58() === activeAddress) return record.attestationId1 !== null;
    return record.attestationId2 !== null;
  })();

  const canRegister =
    !isRegistered &&
    record &&
    !(record.validator1 && record.validator2) &&
    bounty?.translator?.toBase58() !== activeAddress &&
    bounty?.author?.toBase58() !== activeAddress;

  const tags: SemanticTag[] = originalParsed?.tags ?? [];
  const isDisputed = bounty && 'disputed' in bounty.status;

  // Stake requirement derived values
  const rewardRaw = bounty?.rewardAmount.toNumber() ?? 0;
  const stakeRequiredRaw = Math.floor(rewardRaw * 1.5);
  const stakeRequiredUsdc = (stakeRequiredRaw / 1_000_000).toFixed(2);
  const reward40pctUsdc = (rewardRaw * 0.4 / 1_000_000).toFixed(2);
  const availableStake = stakeAccount
    ? stakeAccount.amount.toNumber() - stakeAccount.locked.toNumber() - stakeAccount.unlockAmount.toNumber()
    : 0;
  const hasInsufficientStake = availableStake < stakeRequiredRaw;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRegister = async () => {
    if (!bounty || registering) return;
    if (hasInsufficientStake) {
      setShowStakeWarning(true);
      return;
    }
    setRegistering(true);
    try {
      await registerValidator(bounty.publicKey);
      toast.success('Registered as validator');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  const handleSubmit = async () => {
    if (!bounty || !isRegistered || submitting || done || overallVote === null) return;

    // Authenticity gate — block low-effort submissions
    const TRIVIAL = new Set(['na', 'n/a', 'ok', 'yes', 'no', 'good', 'fine', '-', '.']);
    for (let idx = 0; idx < tags.length; idx++) {
      const tag = tags[idx];
      const d = decisions[idx];
      const phrase = (d?.translatedPhrase ?? '').trim();
      const rationale = (d?.rationale ?? '').trim();

      if (!phrase || TRIVIAL.has(phrase.toLowerCase())) {
        toast.error(`Tag ${idx + 1} (${tag.key}=${tag.value}): provide a real translated phrase`);
        return;
      }
      if (phrase.toLowerCase() === tag.phrase.toLowerCase()) {
        toast.error(`Tag ${idx + 1} (${tag.key}=${tag.value}): translated phrase must differ from the original`);
        return;
      }
      if (rationale.length < 30 || TRIVIAL.has(rationale.toLowerCase())) {
        toast.error(`Tag ${idx + 1} (${tag.key}=${tag.value}): write a meaningful assessment (min 30 characters)`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const tagDecisions: TagDecision[] = tags.map((tag, idx) => ({
        tagKey: tag.key,
        tagValue: tag.value,
        originalPhrase: tag.phrase,
        translatedPhrase: decisions[idx]?.translatedPhrase ?? '',
        rationale: decisions[idx]?.rationale ?? '',
      }));

      const { assessmentArweaveTxId } = await submitAttestation({
        bountyPda: bounty.publicKey,
        bountyData: bounty,
        validationRecord: record!,
        tagDecisions,
        approve: overallVote,
      });

      // --- MEMORY SYSTEM INTEGRATION ---
      try {
        if (translatedParsed) {
          const transTags = translatedParsed.tags;
          await Promise.all(
            tags.map((tag, idx) => {
              const aiTranslation = transTags[idx]?.phrase ?? '';
              const validatorCorrection = decisions[idx]?.translatedPhrase ?? '';
              const rationale = decisions[idx]?.rationale ?? '';

              if (!validatorCorrection || !rationale) return Promise.resolve();

              return fetch('/api/corrections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  targetLang: bounty.targetLanguage,
                  originalPhrase: tag.phrase,
                  aiTranslation,
                  validatorCorrection,
                  reasoning: rationale,
                  semanticTags: [{ key: tag.key, value: tag.value }],
                }),
              });
            })
          );
        }
      } catch (err) {
        console.error('Failed to save to memory system:', err);
      }
      // --- END MEMORY SYSTEM INTEGRATION ---

      setDone(true);
      toast.success(
        overallVote
          ? 'Assessment attested on-chain — if both validators approved, bounty is paid!'
          : 'Rejection recorded — if both validators rejected, author is refunded. Otherwise AI oracle resolves.',
        { duration: 6000 }
      );
      console.log('Assessment on Arweave:', assessmentArweaveTxId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-parchment pt-40 flex items-center justify-center">
        <div className="flex items-center gap-3 text-stone-400">
          <Loader2 size={22} className="animate-spin" />
          <span>Loading assessment…</span>
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
            <span>{loadError ?? 'Bounty not found'}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parchment pt-32 pb-20 px-6">
      {/* Stake Warning Modal */}
      {showStakeWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[28px] p-8 max-w-md w-full shadow-xl transform transition-all">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertCircle size={28} />
              <h2 className="text-xl font-bold">Insufficient Stake</h2>
            </div>
            <p className="text-stone-600 mb-6">
              You need at least <strong>{stakeRequiredUsdc} USDC</strong> in available stake to validate this job, but you only have <strong>{(availableStake / 1_000_000).toFixed(2)} USDC</strong> available.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowStakeWarning(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-stone-200 text-stone-600 font-semibold hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <Link
                href="/app/stake"
                className="flex-1 py-3 px-4 rounded-xl bg-violet-700 text-white font-semibold text-center hover:bg-violet-800 transition-colors"
              >
                Add Stake
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-screen-xl mx-auto">

        {/* Nav */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push('/app/validate')}
            className="flex items-center gap-2 text-stone-500 hover:text-ink transition-colors group"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            Validator Board
          </button>
          <div className="flex items-center gap-2 text-sm text-stone-400">
            <Globe size={13} />
            <span>{bounty.targetLanguage}</span>
            <span className="ml-2 font-mono text-xs bg-stone-100 px-2 py-1 rounded-full">
              {bountyId.slice(0, 8)}…
            </span>
          </div>
        </div>

        {/* Registration banner */}
        {canRegister && (
          <div className="mb-6 p-5 bg-violet-50 border border-violet-200 rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-violet-800">Register as a Validator</p>
                <p className="text-xs text-violet-600 mt-0.5">
                  Claim one of {record?.validator1 ? '1 remaining slot' : '2 available slots'} to validate this translation.
                </p>
                <div className="mt-3 space-y-1 text-xs text-violet-700">
                  <div className="flex items-center gap-1.5">
                    <Lock size={11} />
                    <span>Stake locked: <strong>{stakeRequiredUsdc} USDC</strong> (3-day unstake period)</span>
                  </div>
                  <p className="text-emerald-700">If correct majority: earn {reward40pctUsdc} USDC + stake stays</p>
                  <p className="text-red-600">If wrong minority: lose {stakeRequiredUsdc} USDC stake</p>
                </div>
                <label className="flex items-center gap-2 mt-3 text-xs text-violet-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={stakeAcknowledged}
                    onChange={e => setStakeAcknowledged(e.target.checked)}
                    className="rounded"
                  />
                  I understand I risk losing my stake if I vote in the minority
                </label>
              </div>
              <button
                onClick={handleRegister}
                disabled={registering || !stakeAcknowledged}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-700 text-white rounded-xl text-sm font-semibold hover:bg-violet-800 transition-colors disabled:opacity-60 shrink-0 self-start mt-1"
              >
                {registering ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                {registering ? 'Registering…' : 'Register & Lock Stake'}
              </button>
            </div>
          </div>
        )}

        {/* Rejected by both validators */}
        {bounty && 'rejected' in bounty.status && (
          <div className="mb-6 flex items-center gap-3 p-5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-700">
            <ShieldX size={18} className="shrink-0" />
            <span className="text-sm font-medium">
              Both validators rejected this translation. The AI will re-generate and re-submit.
            </span>
          </div>
        )}

        {/* Already attested */}
        {hasAlreadyAttested && !done && !isDisputed && (
          <div className="mb-6 flex items-center gap-3 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700">
            <CheckCircle2 size={18} className="shrink-0" />
            <span className="text-sm font-medium">You have already submitted your attestation for this bounty.</span>
          </div>
        )}

        {/* Disputed Banner */}
        {isDisputed && (
          <div className="mb-6 flex items-start gap-4 p-6 bg-red-50 border border-red-200 rounded-[28px] text-red-800">
            <AlertCircle size={24} className="shrink-0 mt-1" />
            <div>
              <p className="font-bold text-lg">Bounty Disputed</p>
              <p className="text-sm mt-1 text-red-700/80">
                This translation has been rejected by a validator or author. It is now awaiting final resolution by a platform admin.
                Original and translated content are shown below for reference.
              </p>
            </div>
          </div>
        )}

        {/* Done */}
        {done && (
          <div className="mb-6 flex items-center gap-3 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700">
            <CheckCircle2 size={18} className="shrink-0" />
            <span className="text-sm font-medium">
              Attestation submitted on-chain. Thank you!
            </span>
          </div>
        )}

        {/* Two-column layout */}
        <div className="flex flex-col xl:flex-row gap-5">

          {/* Left: side-by-side original + translation */}
          <div className="xl:flex-[3] flex flex-col lg:flex-row gap-5 max-h-[calc(100vh-120px)] sticky top-6">
            <div className="flex-1 bg-white rounded-[28px] border border-stone-200 p-8 shadow-sm overflow-y-auto">
              <div className="flex justify-between items-center mb-6 pb-3 border-b border-stone-100">
                <h3 className="text-lg font-semibold text-ink">Original</h3>
                <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">Source</span>
              </div>
              {originalParsed ? (
                <MdhRenderer parsedMdh={originalParsed} />
              ) : (
                <p className="text-stone-400 text-sm">Content unavailable</p>
              )}
            </div>

            <div className="flex-1 bg-white rounded-[28px] border border-stone-200 p-8 shadow-sm overflow-y-auto">
              <div className="flex justify-between items-center mb-6 pb-3 border-b border-stone-100">
                <h3 className="text-lg font-semibold text-ink">Translation</h3>
                <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">
                  {bounty.targetLanguage}
                </span>
              </div>
              {translatedParsed ? (
                <MdhRenderer parsedMdh={translatedParsed} />
              ) : (
                <p className="text-stone-400 text-sm">Translation not yet available</p>
              )}
            </div>
          </div>

          {/* Right: assessment form — sticky so vote buttons are always visible */}
          <div className="xl:flex-[2] bg-white rounded-[28px] border border-stone-200 p-8 shadow-sm flex flex-col sticky top-6 self-start max-h-[calc(100vh-120px)]">
            <div className="pb-4 mb-6 border-b border-stone-100">
              <h3 className="text-lg font-semibold text-ink mb-1">
                {isDisputed ? 'Assessment Details' : 'Semantic Assessment'}
              </h3>
              <p className="text-xs text-stone-400">
                {isDisputed 
                  ? 'Review the contested semantic handling below.'
                  : 'Evaluate how well the translator handled each semantic-tagged phrase.'
                }
              </p>
            </div>

            {tags.length === 0 ? (
              <p className="text-stone-400 text-sm flex-1 flex items-center justify-center">
                No semantic tags in this article.
              </p>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-5 pr-1">
                {tags.map((tag, idx) => {
                  const d = decisions[idx];
                  const phrase = (d?.translatedPhrase ?? '').trim();
                  const rationale = (d?.rationale ?? '').trim();
                  const TRIVIAL = new Set(['na', 'n/a', 'ok', 'yes', 'no', 'good', 'fine', '-', '.']);
                  const isComplete =
                    phrase &&
                    !TRIVIAL.has(phrase.toLowerCase()) &&
                    phrase.toLowerCase() !== tag.phrase.toLowerCase() &&
                    rationale.length >= 30 &&
                    !TRIVIAL.has(rationale.toLowerCase());

                  return (
                    <div
                      key={idx}
                      ref={(el) => { cardRefs.current[idx] = el; }}
                      className={`p-4 rounded-2xl border transition-all space-y-3 ${
                        isComplete ? 'border-emerald-200 bg-emerald-50/30' : 'border-stone-100 bg-stone-50'
                      }`}
                    >
                      {/* Tag badge */}
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${tagColor(tag.key)}`}>
                          {tag.key}={tag.value}
                        </span>
                        {isComplete && <CheckCircle2 size={14} className="text-emerald-600" />}
                      </div>
                      {/* Original phrase */}
                      <div>
                        <label className="text-xs text-stone-400 uppercase tracking-widest">Original phrase</label>
                        <p className="text-sm text-ink mt-0.5 italic">&quot;{tag.phrase}&quot;</p>
                      </div>
                      {/* Translated phrase */}
                      <div>
                        <label className="text-xs text-stone-400 uppercase tracking-widest block mb-1">
                          Translated phrase
                        </label>
                        <input
                          type="text"
                          value={decisions[idx]?.translatedPhrase ?? ''}
                          onChange={(e) =>
                            setDecisions((prev) => ({
                              ...prev,
                              [idx]: { ...prev[idx], translatedPhrase: e.target.value },
                            }))
                          }
                          placeholder="Translated equivalent…"
                          disabled={Boolean(!isRegistered || hasAlreadyAttested || done || isDisputed)}
                          className="w-full text-sm px-3 py-2 rounded-xl border border-stone-200 bg-white focus:outline-none focus:border-violet-400 disabled:opacity-50"
                        />
                      </div>
                      {/* Rationale */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-stone-400 uppercase tracking-widest">
                            Your assessment
                          </label>
                          <span className={`text-[10px] font-mono ${rationale.length >= 30 ? 'text-emerald-600' : 'text-stone-400'}`}>
                            {rationale.length}/30
                          </span>
                        </div>
                        <textarea
                          value={decisions[idx]?.rationale ?? ''}
                          onChange={(e) =>
                            setDecisions((prev) => ({
                              ...prev,
                              [idx]: { ...prev[idx], rationale: e.target.value },
                            }))
                          }
                          placeholder="Does this translation preserve the semantic intent? Note any issues…"
                          rows={2}
                          disabled={Boolean(!isRegistered || hasAlreadyAttested || done || isDisputed)}
                          className="w-full text-sm px-3 py-2 rounded-xl border border-stone-200 bg-white focus:outline-none focus:border-violet-400 resize-none disabled:opacity-50"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Overall vote */}
            {isRegistered && !hasAlreadyAttested && !done && !isDisputed && (
              <div className="mt-6 pt-5 border-t border-stone-100 space-y-4">
                <p className="text-sm font-semibold text-ink">Overall verdict</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setOverallVote(true)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all ${
                      overallVote === true
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-stone-200 text-stone-600 hover:border-emerald-400 hover:text-emerald-700'
                    }`}
                  >
                    <ShieldCheck size={15} />
                    Approve
                  </button>
                  <button
                    onClick={() => setOverallVote(false)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all ${
                      overallVote === false
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'border-stone-200 text-stone-600 hover:border-red-400 hover:text-red-700'
                    }`}
                  >
                    <ShieldX size={15} />
                    Reject
                  </button>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={submitting || overallVote === null}
                  className="w-full py-3.5 bg-ink text-parchment rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><Loader2 size={15} className="animate-spin" /> Attesting…</>
                  ) : (
                    <><ShieldCheck size={15} /> Submit &amp; Attest</>
                  )}
                </button>
                <p className="text-xs text-stone-400 text-center">
                  Your assessment will be uploaded to Arweave and recorded on-chain.
                </p>
              </div>
            )}

            {/* Not registered yet */}
            {!isRegistered && !canRegister && bounty && (
              <p className="mt-6 text-xs text-stone-400 text-center pt-4 border-t border-stone-100">
                {bounty.author?.toBase58() === activeAddress
                  ? "Authors cannot validate their own articles."
                  : bounty.translator?.toBase58() === activeAddress
                  ? "Translators cannot validate their own submission."
                  : "You cannot validate this submission."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
