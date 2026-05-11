"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, CheckCircle, Loader2, DollarSign, AlertCircle, Copy, Check, Languages, Sparkles, ShieldCheck } from 'lucide-react';
import { PublicKey } from '@solana/web3.js';
import { useRouter } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { useBounty } from '../../hooks/useBounty';
import type { MyArticle } from '../../hooks/useMyArticles';

const LANGUAGES = [
  { code: 'ES', label: 'Spanish' },
  { code: 'FR', label: 'French' },
  { code: 'PT', label: 'Portuguese' },
  { code: 'JA', label: 'Japanese' },
  { code: 'KO', label: 'Korean' },
  { code: 'ZH', label: 'Mandarin' },
  { code: 'AR', label: 'Arabic' },
  { code: 'DE', label: 'German' },
  { code: 'IT', label: 'Italian' },
  { code: 'HI', label: 'Hindi' },
  { code: 'RU', label: 'Russian' },
];

const QUICK_AMOUNTS = [5, 10, 25, 50];

const ADMIN_PUBKEY = new PublicKey(
  process.env.NEXT_PUBLIC_ADMIN_PUBKEY ?? '11111111111111111111111111111111'
);

type ProgressStep = {
  id: string;
  label: string;
  status: 'waiting' | 'running' | 'done' | 'error';
};

function parseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/0x1\b/.test(msg) || /insufficient.*funds/i.test(msg) || /insufficient.*balance/i.test(msg))
    return "You don't have enough USDC in your wallet to cover this bounty amount.";
  if (/User rejected/i.test(msg) || /rejected the request/i.test(msg))
    return 'Transaction cancelled.';
  if (/AccountNotInitialized/i.test(msg))
    return "Your USDC token account hasn't been set up yet. Add USDC to your wallet first.";
  if (/InvalidTxId/i.test(msg))
    return 'This article has an unrecognized storage format. Try re-publishing it.';
  if (/InvalidAmount/i.test(msg))
    return 'Reward amount must be greater than zero.';
  if (/not.*confirmed/i.test(msg) || /timeout/i.test(msg))
    return 'The transaction timed out — please try again.';
  if (/insufficient lamports/i.test(msg) || /not enough SOL/i.test(msg))
    return "Your wallet doesn't have enough SOL to pay the transaction fee.";
  const anchorMsg = msg.match(/Error Message: (.+?)(?:\.|$)/)?.[1];
  if (anchorMsg) return anchorMsg;
  return 'Something went wrong. Check the browser console for the full error.';
}

interface CreateBountyProps {
  article: MyArticle;
  onBack: () => void;
  onSuccess: (bountyPda: PublicKey) => void;
}

export default function CreateBounty({ article, onBack, onSuccess }: CreateBountyProps) {
  const { initializeBounty } = useBounty();
  const { wallets } = useWallets();
  const router = useRouter();
  const walletAddress = wallets[0]?.address ?? '';

  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [reward, setReward] = useState('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Translation progress modal
  const [showProgress, setShowProgress] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [translationDone, setTranslationDone] = useState(false);
  const [completedBountyPda, setCompletedBountyPda] = useState<PublicKey | null>(null);

  const rewardNum = parseFloat(reward);
  const canSubmit = selectedLanguage && !isNaN(rewardNum) && rewardNum > 0 && !loading;

  const copyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  function updateStep(id: string, status: ProgressStep['status']) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  }

  const handleCreate = async () => {
    if (!canSubmit) return;

    if (article.arweaveTxId.length < 43 || article.arweaveTxId.length > 44) {
      setError(`The Arweave transaction ID is not in the expected format. Try re-publishing the article.`);
      return;
    }

    setLoading(true);
    setError(null);

    const initialSteps: ProgressStep[] = [
      { id: 'bounty', label: 'Creating on-chain bounty & locking USDC escrow', status: 'running' },
      { id: 'translate', label: 'AI translating with cultural context', status: 'waiting' },
      { id: 'upload', label: 'Publishing translation to Arweave', status: 'waiting' },
      { id: 'submit', label: 'Submitting for validator review', status: 'waiting' },
    ];
    setSteps(initialSteps);
    setShowProgress(true);
    setTranslationDone(false);

    try {
      // Step 1: Create the on-chain bounty
      const bountyPda = await initializeBounty({
        originalTxId: article.arweaveTxId,
        rewardAmountUsdc: rewardNum,
        targetLanguage: selectedLanguage,
        adminPubkey: ADMIN_PUBKEY,
      });
      setCompletedBountyPda(bountyPda);
      updateStep('bounty', 'done');
      updateStep('translate', 'running');

      // Steps 2-4: Auto-translate via server-side API
      const autoRes = await fetch('/api/auto-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bountyPda: bountyPda.toBase58(),
          originalTxId: article.arweaveTxId,
          targetLanguage: selectedLanguage,
        }),
      });

      // Update step visuals as the server processes (we approximate with a short delay)
      updateStep('translate', 'done');
      updateStep('upload', 'running');
      await new Promise(r => setTimeout(r, 600));
      updateStep('upload', 'done');
      updateStep('submit', 'running');

      if (!autoRes.ok) {
        const err = await autoRes.json().catch(() => ({ error: 'Auto-translation failed' }));
        throw new Error((err as { error: string }).error);
      }

      updateStep('submit', 'done');
      setTranslationDone(true);
      onSuccess(bountyPda);
    } catch (err: unknown) {
      console.error('[CreateBounty] Error:', err);
      // Mark the currently running step as error
      setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s));
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Progress Modal Overlay */}
      <AnimatePresence>
        {showProgress && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white rounded-[32px] p-10 shadow-2xl w-full max-w-md flex flex-col gap-8"
            >
              <div className="flex flex-col items-center text-center gap-3">
                {translationDone ? (
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle size={28} className="text-emerald-600" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center">
                    <Sparkles size={28} className="text-violet-600 animate-pulse" />
                  </div>
                )}
                <h2 className="text-2xl font-serif text-ink">
                  {translationDone ? 'Translation Ready!' : 'Generating Translation…'}
                </h2>
                <p className="text-sm text-stone-500">
                  {translationDone
                    ? `Your ${LANGUAGES.find(l => l.code === selectedLanguage)?.label ?? selectedLanguage} translation has been submitted for validator review.`
                    : 'Hang tight — the AI is translating your article with full cultural context.'}
                </p>
              </div>

              {/* Progress steps */}
              <div className="flex flex-col gap-3">
                {steps.map((step) => (
                  <div key={step.id} className="flex items-center gap-3">
                    <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                      {step.status === 'done' && <CheckCircle size={20} className="text-emerald-500" />}
                      {step.status === 'running' && <Loader2 size={20} className="text-violet-500 animate-spin" />}
                      {step.status === 'waiting' && <div className="w-4 h-4 rounded-full border-2 border-stone-200" />}
                      {step.status === 'error' && <AlertCircle size={20} className="text-red-500" />}
                    </div>
                    <span className={`text-sm ${
                      step.status === 'done' ? 'text-emerald-700 font-medium' :
                      step.status === 'running' ? 'text-violet-700 font-medium' :
                      step.status === 'error' ? 'text-red-600' :
                      'text-stone-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {translationDone && (
                <button
                  onClick={() => router.push('/app/validate')}
                  className="w-full py-3.5 bg-violet-700 text-white rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-violet-800 transition-colors"
                >
                  <ShieldCheck size={18} />
                  Go to Validators Page
                </button>
              )}

              {(error && !translationDone) && (
                <button
                  onClick={() => { setShowProgress(false); setError(null); }}
                  className="w-full py-3 text-stone-500 hover:text-ink text-sm transition-colors"
                >
                  Dismiss and try again
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Page */}
      <div className="bg-parchment min-h-screen pt-40 pb-20 px-8">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-stone-500 hover:text-ink transition-colors mb-8 group"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            Back to Board
          </button>

          <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
                <Languages size={16} className="text-violet-600" />
              </div>
              <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">AI-Powered Translation</span>
            </div>
            <h1 className="text-5xl text-ink leading-none mb-4">Create Bounty</h1>
            <div className="h-1 w-24 bg-pale-lavender" />
            <p className="text-sm text-stone-500 mt-4">
              Once created, our AI will automatically translate your article and send it to validators for quality review.
            </p>
          </header>

          {/* Article summary */}
          <div className="bg-white rounded-[32px] p-8 border border-stone-200 mb-6 shadow-sm">
            <p className="text-xs uppercase tracking-widest text-stone-400 font-bold mb-3">Article</p>
            <h2 className="text-2xl text-ink font-serif mb-3 leading-tight">{article.title}</h2>
            <p className="font-mono text-xs text-stone-400">
              {article.arweaveTxId.slice(0, 16)}…{article.arweaveTxId.slice(-8)}
            </p>
          </div>

          {/* Wallet + funding callout */}
          {walletAddress && (
            <div className="bg-stone-50 rounded-[24px] p-6 border border-stone-200 mb-6">
              <p className="text-xs uppercase tracking-widest text-stone-400 font-bold mb-3">
                Funding Wallet
              </p>
              <div className="flex items-center gap-3">
                <p className="font-mono text-sm text-ink flex-1 truncate">{walletAddress}</p>
                <button
                  onClick={copyAddress}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs text-stone-500 hover:border-stone-300 transition-colors shrink-0"
                >
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-stone-400 mt-2">
                This wallet must hold USDC on Solana devnet. The reward will be locked in escrow on-chain.
              </p>
            </div>
          )}

          {/* Target language */}
          <div className="bg-white rounded-[32px] p-8 border border-stone-200 mb-6 shadow-sm">
            <p className="text-xs uppercase tracking-widest text-stone-400 font-bold mb-5">
              Target Language
            </p>
            <div className="flex flex-wrap gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setSelectedLanguage(lang.code)}
                  className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all active:scale-95 ${
                    selectedLanguage === lang.code
                      ? 'bg-ink text-parchment'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* USDC Reward */}
          <div className="bg-white rounded-[32px] p-8 border border-stone-200 mb-8 shadow-sm">
            <p className="text-xs uppercase tracking-widest text-stone-400 font-bold mb-5">
              USDC Reward
            </p>
            <div className="relative">
              <DollarSign
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
              />
              <input
                type="number"
                min="1"
                step="1"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                className="w-full pl-9 pr-20 py-3.5 border border-stone-200 rounded-xl text-ink text-xl font-medium focus:outline-none focus:ring-2 focus:ring-pale-lavender transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium pointer-events-none">
                USDC
              </span>
            </div>
            <div className="flex gap-2 mt-3">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setReward(String(amt))}
                  className="px-4 py-1.5 bg-stone-100 text-stone-500 rounded-lg text-sm hover:bg-stone-200 transition-colors"
                >
                  {amt}
                </button>
              ))}
            </div>
          </div>

          {error && !showProgress && (
            <div className="flex items-start gap-3 p-5 bg-red-50 border border-red-200 rounded-2xl text-red-700 mb-6">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span className="text-sm leading-relaxed">{error}</span>
            </div>
          )}

          <motion.button
            onClick={handleCreate}
            disabled={!canSubmit}
            whileTap={{ scale: canSubmit ? 0.97 : 1 }}
            className="w-full py-4 bg-ink text-parchment rounded-2xl font-bold text-lg flex items-center justify-center gap-3 hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Sparkles size={20} />
                Create & AI Translate
              </>
            )}
          </motion.button>

          <p className="text-center text-stone-400 text-sm mt-4">
            {!isNaN(rewardNum) && rewardNum > 0
              ? `${rewardNum.toFixed(2)} USDC will be locked in escrow. AI generates the translation, validators approve it.`
              : 'Set a USDC reward for validators who approve the translation.'}
          </p>
        </div>
      </div>
    </>
  );
}
