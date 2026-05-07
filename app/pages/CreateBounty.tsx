"use client";

import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle, Loader2, DollarSign, AlertCircle, Copy, Check } from 'lucide-react';
import { PublicKey } from '@solana/web3.js';
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

// Translate raw Solana/Anchor errors into plain English
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

  // Strip raw program logs and return the first human-readable sentence
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
  const walletAddress = wallets[0]?.address ?? '';

  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [reward, setReward] = useState('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const rewardNum = parseFloat(reward);
  const canSubmit = selectedLanguage && !isNaN(rewardNum) && rewardNum > 0 && !loading;

  const copyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = async () => {
    if (!canSubmit) return;

    if (article.arweaveTxId.length !== 43) {
      setError(`The Arweave transaction ID for this article is not in the expected format (got ${article.arweaveTxId.length} characters instead of 43). Try re-publishing the article.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const bountyPda = await initializeBounty({
        originalTxId: article.arweaveTxId,
        rewardAmountUsdc: rewardNum,
        targetLanguage: selectedLanguage,
        adminPubkey: ADMIN_PUBKEY,
      });
      onSuccess(bountyPda);
    } catch (err: unknown) {
      console.error('[CreateBounty] initializeBounty failed:', err);
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
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
          <h1 className="text-5xl text-ink leading-none mb-4">Create Bounty</h1>
          <div className="h-1 w-24 bg-pale-lavender" />
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

        {error && (
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
              Initializing Bounty…
            </>
          ) : (
            <>
              <CheckCircle size={20} />
              Create Translation Bounty
            </>
          )}
        </motion.button>

        <p className="text-center text-stone-400 text-sm mt-4">
          {!isNaN(rewardNum) && rewardNum > 0
            ? `${rewardNum.toFixed(2)} USDC will be locked in escrow until the translation is approved or the 48-hour window expires.`
            : 'Set a USDC reward for the translator.'}
        </p>
      </div>
    </div>
  );
}
