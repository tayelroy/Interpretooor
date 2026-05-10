'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import { Loader2, Copy, Check, ArrowLeft, Languages, Coins, ShieldCheck, BookOpen } from 'lucide-react';
import { useBounty, type BountyAccount } from '@/hooks/useBounty';
import { useValidator, type ValidationRecord } from '@/hooks/useValidator';

const IRYS_GATEWAY = process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz';

function usdcAmount(raw: { toNumber: () => number }): number {
  return raw.toNumber() / 1_000_000;
}

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function StatusBadge({ status }: { status: BountyAccount['status'] }) {
  const key = Object.keys(status)[0];
  const colors: Record<string, string> = {
    open: 'bg-emerald-100 text-emerald-700',
    claimed: 'bg-blue-100 text-blue-700',
    pendingReview: 'bg-amber-100 text-amber-700',
    awaitingValidation: 'bg-violet-100 text-violet-700',
    disputed: 'bg-red-100 text-red-700',
    paid: 'bg-stone-100 text-stone-600',
  };
  const labels: Record<string, string> = {
    open: 'Open',
    claimed: 'Claimed',
    pendingReview: 'Review',
    awaitingValidation: 'Validating',
    disputed: 'Disputed',
    paid: 'Paid',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[key] ?? 'bg-stone-100 text-stone-600'}`}>
      {labels[key] ?? key}
    </span>
  );
}

async function fetchTitle(txId: string): Promise<string> {
  try {
    const res = await fetch(`${IRYS_GATEWAY}/${txId}`, { headers: { Range: 'bytes=0-150' } });
    const text = await res.text();
    const match = text.match(/^#\s+(.+)/m);
    return match ? match[1].trim() : txId.slice(0, 12) + '…';
  } catch {
    return txId.slice(0, 12) + '…';
  }
}

interface ProfileData {
  asAuthor: BountyAccount[];
  asTranslator: BountyAccount[];
  validatedPdas: string[];
  titles: Record<string, string>;
}

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const walletParam = params.wallet as string;

  const { fetchAllBounties } = useBounty();
  const { fetchValidationRecord } = useValidator();

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let walletKey: PublicKey;
      try {
        walletKey = new PublicKey(walletParam);
      } catch {
        setError('Invalid wallet address');
        return;
      }

      const all = await fetchAllBounties();
      const asAuthor = all.filter((b) => b.author.equals(walletKey));
      const asTranslator = all.filter((b) => b.translator?.equals(walletKey));

      // Check validator participation on paid + awaiting bounties
      const checkBounties = all.filter(
        (b) => 'paid' in b.status || 'awaitingValidation' in b.status
      );
      const recordResults = await Promise.allSettled(
        checkBounties.map((b) => fetchValidationRecord(b.publicKey))
      );
      const validatedPdas: string[] = [];
      recordResults.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          const rec: ValidationRecord = r.value;
          const pda = checkBounties[i].publicKey.toBase58();
          if (rec.validator1?.equals(walletKey) || rec.validator2?.equals(walletKey)) {
            validatedPdas.push(pda);
          }
        }
      });

      // Fetch titles for all involved bounties
      const involvedTxIds = [
        ...asAuthor.map((b) => [b.publicKey.toBase58(), b.originalTxId] as const),
        ...asTranslator.map((b) => [b.publicKey.toBase58(), b.originalTxId] as const),
      ];
      const titleEntries = await Promise.all(
        involvedTxIds.map(async ([pda, txId]) => [pda, await fetchTitle(txId)] as const)
      );

      setData({
        asAuthor,
        asTranslator,
        validatedPdas,
        titles: Object.fromEntries(titleEntries),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [walletParam, fetchAllBounties, fetchValidationRecord]);

  useEffect(() => { load(); }, [load]);

  const copyAddress = () => {
    navigator.clipboard.writeText(walletParam);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-parchment pt-40 flex items-center justify-center">
        <div className="flex items-center gap-3 text-stone-400">
          <Loader2 size={22} className="animate-spin" />
          <span>Loading profile…</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-parchment pt-40 px-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-red-600">{error ?? 'Profile not found'}</p>
        </div>
      </div>
    );
  }

  const completedTranslations = data.asTranslator.filter((b) => 'paid' in b.status);
  const usdcEarned = completedTranslations.reduce((sum, b) => sum + usdcAmount(b.rewardAmount), 0);
  const languages = [...new Set([
    ...data.asTranslator.map((b) => b.targetLanguage),
    ...data.asAuthor.flatMap((b) => [b.targetLanguage]),
  ])].filter(Boolean);

  const statCards = [
    { icon: BookOpen, label: 'Bounties Posted', value: data.asAuthor.length, color: 'text-amber-600' },
    { icon: Languages, label: 'Translations Done', value: completedTranslations.length, color: 'text-blue-600' },
    { icon: ShieldCheck, label: 'Validations Done', value: data.validatedPdas.length, color: 'text-violet-600' },
    { icon: Coins, label: 'USDC Earned', value: `$${usdcEarned.toFixed(2)}`, color: 'text-emerald-600' },
  ];

  return (
    <div className="min-h-screen bg-parchment pt-32 pb-20 px-8">
      <div className="max-w-4xl mx-auto">

        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-stone-400 hover:text-ink mb-8 text-sm transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>

        {/* Header */}
        <div className="bg-white border border-stone-200 rounded-[28px] p-8 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="w-14 h-14 rounded-full bg-ink flex items-center justify-center text-parchment font-serif text-2xl mb-4">
                {walletParam.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg text-ink font-semibold">{shortAddr(walletParam)}</span>
                <button onClick={copyAddress} className="text-stone-400 hover:text-ink transition-colors">
                  {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                </button>
              </div>
              {languages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {languages.map((lang) => (
                    <span key={lang} className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-mono">
                      {lang}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {statCards.map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-white border border-stone-200 rounded-[20px] p-5">
              <Icon size={18} className={`${color} mb-3`} />
              <div className="text-2xl font-bold text-ink">{value}</div>
              <div className="text-xs text-stone-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Bounties as Translator */}
        {data.asTranslator.length > 0 && (
          <section className="mb-6">
            <h2 className="text-base font-semibold text-ink mb-3 flex items-center gap-2">
              <Languages size={16} className="text-blue-600" /> Translation Jobs
            </h2>
            <div className="bg-white border border-stone-200 rounded-[20px] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100">
                    <th className="text-left px-5 py-3 text-stone-400 font-medium">Article</th>
                    <th className="text-left px-5 py-3 text-stone-400 font-medium">Language</th>
                    <th className="text-left px-5 py-3 text-stone-400 font-medium">Reward</th>
                    <th className="text-left px-5 py-3 text-stone-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.asTranslator.map((b) => (
                    <tr
                      key={b.publicKey.toBase58()}
                      className="border-b border-stone-50 hover:bg-stone-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/app/bounty/${b.publicKey.toBase58()}`)}
                    >
                      <td className="px-5 py-3 text-ink truncate max-w-[200px]">
                        {data.titles[b.publicKey.toBase58()] ?? '…'}
                      </td>
                      <td className="px-5 py-3 font-mono text-stone-500 text-xs">{b.targetLanguage}</td>
                      <td className="px-5 py-3 text-stone-600">${usdcAmount(b.rewardAmount).toFixed(2)}</td>
                      <td className="px-5 py-3"><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Bounties as Author */}
        {data.asAuthor.length > 0 && (
          <section className="mb-6">
            <h2 className="text-base font-semibold text-ink mb-3 flex items-center gap-2">
              <BookOpen size={16} className="text-amber-600" /> Posted Bounties
            </h2>
            <div className="bg-white border border-stone-200 rounded-[20px] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100">
                    <th className="text-left px-5 py-3 text-stone-400 font-medium">Article</th>
                    <th className="text-left px-5 py-3 text-stone-400 font-medium">Language</th>
                    <th className="text-left px-5 py-3 text-stone-400 font-medium">Reward</th>
                    <th className="text-left px-5 py-3 text-stone-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.asAuthor.map((b) => (
                    <tr
                      key={b.publicKey.toBase58()}
                      className="border-b border-stone-50 hover:bg-stone-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/app/bounty/${b.publicKey.toBase58()}`)}
                    >
                      <td className="px-5 py-3 text-ink truncate max-w-[200px]">
                        {data.titles[b.publicKey.toBase58()] ?? '…'}
                      </td>
                      <td className="px-5 py-3 font-mono text-stone-500 text-xs">{b.targetLanguage}</td>
                      <td className="px-5 py-3 text-stone-600">${usdcAmount(b.rewardAmount).toFixed(2)}</td>
                      <td className="px-5 py-3"><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Validations */}
        {data.validatedPdas.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-ink mb-3 flex items-center gap-2">
              <ShieldCheck size={16} className="text-violet-600" /> Validated Jobs
            </h2>
            <div className="bg-white border border-stone-200 rounded-[20px] p-5">
              <p className="text-sm text-stone-500">
                This validator attested <span className="font-semibold text-ink">{data.validatedPdas.length}</span> translation{data.validatedPdas.length !== 1 ? 's' : ''}.
              </p>
            </div>
          </section>
        )}

        {data.asAuthor.length === 0 && data.asTranslator.length === 0 && data.validatedPdas.length === 0 && (
          <div className="text-center py-20 text-stone-400">
            <Languages size={40} className="mx-auto mb-4 opacity-30" />
            <p>No on-chain activity yet for this wallet.</p>
          </div>
        )}

      </div>
    </div>
  );
}
