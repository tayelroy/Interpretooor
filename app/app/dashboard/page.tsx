'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import {
  Loader2, BookOpen, Languages, ShieldCheck, FileText,
  ArrowRight, Plus, AlertCircle, Clock,
} from 'lucide-react';
import { useBounty, type BountyAccount } from '@/hooks/useBounty';
import { useValidator, type ValidationRecord } from '@/hooks/useValidator';

const IRYS_GATEWAY = process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? 'https://devnet.irys.xyz';

type Tab = 'author' | 'translator' | 'validator';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function usdcAmt(raw: { toNumber: () => number }) {
  return (raw.toNumber() / 1_000_000).toFixed(2);
}

function StatusBadge({ status }: { status: BountyAccount['status'] }) {
  const key = Object.keys(status)[0];
  const map: Record<string, { label: string; cls: string }> = {
    open:               { label: 'Open',        cls: 'bg-emerald-100 text-emerald-700' },
    claimed:            { label: 'Claimed',      cls: 'bg-blue-100 text-blue-700' },
    pendingReview:      { label: 'Review',       cls: 'bg-amber-100 text-amber-700' },
    awaitingValidation: { label: 'Validating',   cls: 'bg-violet-100 text-violet-700' },
    disputed:           { label: 'Disputed',     cls: 'bg-red-100 text-red-700' },
    paid:               { label: 'Paid ✓',       cls: 'bg-stone-100 text-stone-500' },
  };
  const { label, cls } = map[key] ?? { label: key, cls: 'bg-stone-100 text-stone-500' };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
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

interface DraftItem { id: string; title: string; source_lang: string; updated_at: string; }

// ─── Sub-tables ───────────────────────────────────────────────────────────────

function BountyTable({
  bounties, titles, actionLabel, onAction,
}: {
  bounties: BountyAccount[];
  titles: Record<string, string>;
  actionLabel: (b: BountyAccount) => string;
  onAction: (b: BountyAccount) => void;
}) {
  if (bounties.length === 0) return (
    <p className="text-sm text-stone-400 py-6 text-center">Nothing here yet.</p>
  );
  return (
    <div className="overflow-hidden rounded-[16px] border border-stone-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-stone-50 border-b border-stone-100">
            <th className="text-left px-4 py-3 text-stone-400 font-medium">Article</th>
            <th className="text-left px-4 py-3 text-stone-400 font-medium hidden md:table-cell">Language</th>
            <th className="text-left px-4 py-3 text-stone-400 font-medium hidden md:table-cell">Reward</th>
            <th className="text-left px-4 py-3 text-stone-400 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {bounties.map((b) => {
            const pda = b.publicKey.toBase58();
            return (
              <tr key={pda} className="border-b border-stone-50 last:border-0">
                <td className="px-4 py-3 text-ink font-medium truncate max-w-[160px]">
                  {titles[pda] ?? '…'}
                </td>
                <td className="px-4 py-3 text-stone-500 text-xs font-mono hidden md:table-cell">
                  {b.targetLanguage}
                </td>
                <td className="px-4 py-3 text-stone-600 hidden md:table-cell">
                  ${usdcAmt(b.rewardAmount)}
                </td>
                <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onAction(b)}
                    className="text-xs text-violet-600 hover:text-violet-800 font-medium flex items-center gap-1 ml-auto"
                  >
                    {actionLabel(b)} <ArrowRight size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;

  const { fetchAllBounties } = useBounty();
  const { fetchValidationRecord } = useValidator();

  const [tab, setTab] = useState<Tab>('author');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [authorBounties, setAuthorBounties] = useState<BountyAccount[]>([]);
  const [translatorBounties, setTranslatorBounties] = useState<BountyAccount[]>([]);
  const [myValidations, setMyValidations] = useState<BountyAccount[]>([]);
  const [availableToValidate, setAvailableToValidate] = useState<BountyAccount[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<DraftItem[]>([]);

  const load = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const walletKey = new PublicKey(walletAddress);
      const all = await fetchAllBounties();

      const asAuthor = all.filter((b) => b.author.equals(walletKey));
      const asTranslator = all.filter((b) => b.translator?.equals(walletKey));
      const awaitingAll = all.filter((b) => 'awaitingValidation' in b.status);

      // Determine validator participation for awaiting bounties
      const recordResults = await Promise.allSettled(
        awaitingAll.map((b) => fetchValidationRecord(b.publicKey))
      );

      const myVals: BountyAccount[] = [];
      const available: BountyAccount[] = [];

      recordResults.forEach((r, i) => {
        const bounty = awaitingAll[i];
        const isTranslator = bounty.translator?.equals(walletKey);
        if (r.status === 'fulfilled') {
          const rec: ValidationRecord = r.value;
          const isRegistered = rec.validator1?.equals(walletKey) || rec.validator2?.equals(walletKey);
          const isFull = !!(rec.validator1 && rec.validator2);
          if (isRegistered) {
            myVals.push(bounty);
          } else if (!isFull && !isTranslator) {
            available.push(bounty);
          }
        } else if (!isTranslator) {
          // Record missing → no validators yet, slot available
          available.push(bounty);
        }
      });

      setAuthorBounties(asAuthor);
      setTranslatorBounties(asTranslator);
      setMyValidations(myVals);
      setAvailableToValidate(available);

      // Fetch titles for all bounties
      const relevant = [...asAuthor, ...asTranslator, ...myVals, ...available];
      const unique = [...new Map(relevant.map((b) => [b.publicKey.toBase58(), b])).values()];
      const titleEntries = await Promise.all(
        unique.map(async (b) => [b.publicKey.toBase58(), await fetchTitle(b.originalTxId)] as const)
      );
      setTitles(Object.fromEntries(titleEntries));

      // Fetch drafts
      const draftsRes = await fetch(`/api/drafts?wallet=${walletAddress}`);
      if (draftsRes.ok) setDrafts(await draftsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [walletAddress, fetchAllBounties, fetchValidationRecord]);

  useEffect(() => { load(); }, [load]);

  if (!walletAddress) {
    return (
      <div className="min-h-screen bg-parchment pt-40 flex items-center justify-center">
        <div className="text-center text-stone-400">
          <AlertCircle size={36} className="mx-auto mb-4 opacity-40" />
          <p className="text-sm">Connect your wallet to view your dashboard.</p>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof BookOpen; count: number }[] = [
    { id: 'author',     label: 'Author',     icon: BookOpen,    count: authorBounties.length },
    { id: 'translator', label: 'Translator', icon: Languages,   count: translatorBounties.length },
    { id: 'validator',  label: 'Validator',  icon: ShieldCheck, count: myValidations.length + availableToValidate.length },
  ];

  return (
    <div className="min-h-screen bg-parchment pt-32 pb-20 px-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-ink">Dashboard</h1>
          <p className="text-stone-500 text-sm mt-1 font-mono">{walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}</p>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-stone-400 py-20 justify-center">
            <Loader2 size={22} className="animate-spin" />
            <span>Loading your activity…</span>
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 p-5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-stone-100 rounded-2xl p-1 mb-6 w-fit">
              {tabs.map(({ id, label, icon: Icon, count }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    tab === id
                      ? 'bg-white text-ink shadow-sm'
                      : 'text-stone-500 hover:text-ink'
                  }`}
                >
                  <Icon size={15} />
                  {label}
                  {count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
                      tab === id ? 'bg-stone-100 text-stone-600' : 'bg-stone-200 text-stone-500'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Author Tab */}
            {tab === 'author' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-ink">Your Bounties</h2>
                  <button
                    onClick={() => router.push('/app/translate')}
                    className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium"
                  >
                    <Plus size={14} /> New Bounty
                  </button>
                </div>
                <BountyTable
                  bounties={authorBounties}
                  titles={titles}
                  actionLabel={(b) =>
                    'open' in b.status ? 'View' :
                    'disputed' in b.status ? 'View Dispute' : 'View'
                  }
                  onAction={(b) => router.push(`/app/bounty/${b.publicKey.toBase58()}`)}
                />
              </div>
            )}

            {/* Translator Tab */}
            {tab === 'translator' && (
              <div className="space-y-6">
                {/* Active job */}
                {translatorBounties.filter((b) => 'claimed' in b.status).length > 0 && (
                  <div>
                    <h2 className="text-base font-semibold text-ink mb-3 flex items-center gap-2">
                      <Clock size={15} className="text-blue-500" /> Active Job
                    </h2>
                    <BountyTable
                      bounties={translatorBounties.filter((b) => 'claimed' in b.status)}
                      titles={titles}
                      actionLabel={() => 'Open Workspace'}
                      onAction={(b) => router.push(`/app/workspace/${b.publicKey.toBase58()}`)}
                    />
                  </div>
                )}

                {/* Submitted / validating */}
                {translatorBounties.filter((b) => 'awaitingValidation' in b.status).length > 0 && (
                  <div>
                    <h2 className="text-base font-semibold text-ink mb-3 flex items-center gap-2">
                      <ShieldCheck size={15} className="text-violet-500" /> Awaiting Validators
                    </h2>
                    <BountyTable
                      bounties={translatorBounties.filter((b) => 'awaitingValidation' in b.status)}
                      titles={titles}
                      actionLabel={() => 'View'}
                      onAction={(b) => router.push(`/app/bounty/${b.publicKey.toBase58()}`)}
                    />
                  </div>
                )}

                {/* Completed */}
                {translatorBounties.filter((b) => 'paid' in b.status).length > 0 && (
                  <div>
                    <h2 className="text-base font-semibold text-ink mb-3">Completed</h2>
                    <BountyTable
                      bounties={translatorBounties.filter((b) => 'paid' in b.status)}
                      titles={titles}
                      actionLabel={() => 'View'}
                      onAction={(b) => router.push(`/app/bounty/${b.publicKey.toBase58()}`)}
                    />
                  </div>
                )}

                {translatorBounties.length === 0 && (
                  <div className="text-center py-12 text-stone-400">
                    <Languages size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No translation jobs yet.</p>
                    <button
                      onClick={() => router.push('/app/validate')}
                      className="mt-3 text-sm text-violet-600 hover:underline"
                    >
                      Browse open bounties →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Validator Tab */}
            {tab === 'validator' && (
              <div className="space-y-6">
                {availableToValidate.length > 0 && (
                  <div>
                    <h2 className="text-base font-semibold text-ink mb-3 flex items-center gap-2">
                      <ShieldCheck size={15} className="text-emerald-600" /> Available to Validate
                    </h2>
                    <BountyTable
                      bounties={availableToValidate}
                      titles={titles}
                      actionLabel={() => 'Review Job'}
                      onAction={(b) => router.push(`/app/validate/${b.publicKey.toBase58()}`)}
                    />
                  </div>
                )}

                {myValidations.length > 0 && (
                  <div>
                    <h2 className="text-base font-semibold text-ink mb-3 flex items-center gap-2">
                      <Clock size={15} className="text-violet-500" /> My Active Validations
                    </h2>
                    <BountyTable
                      bounties={myValidations}
                      titles={titles}
                      actionLabel={() => 'Continue Assessment'}
                      onAction={(b) => router.push(`/app/validate/${b.publicKey.toBase58()}`)}
                    />
                  </div>
                )}

                {availableToValidate.length === 0 && myValidations.length === 0 && (
                  <div className="text-center py-12 text-stone-400">
                    <ShieldCheck size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No validation jobs available right now.</p>
                    <button
                      onClick={() => router.push('/app/validate')}
                      className="mt-3 text-sm text-violet-600 hover:underline"
                    >
                      Check the validator board →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Drafts strip */}
            {drafts.length > 0 && (
              <div className="mt-10 pt-8 border-t border-stone-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-ink flex items-center gap-2">
                    <FileText size={15} className="text-stone-400" /> Drafts
                  </h2>
                  <button
                    onClick={() => router.push('/app/write')}
                    className="text-sm text-violet-600 hover:text-violet-800 font-medium flex items-center gap-1"
                  >
                    <Plus size={13} /> New Draft
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {drafts.slice(0, 6).map((d) => (
                    <button
                      key={d.id}
                      onClick={() => router.push(`/app/write?draft=${d.id}`)}
                      className="text-left p-4 bg-white border border-stone-200 rounded-[16px] hover:border-stone-300 hover:shadow-sm transition-all group"
                    >
                      <p className="text-sm font-medium text-ink truncate group-hover:text-violet-700 transition-colors">
                        {d.title || 'Untitled'}
                      </p>
                      <p className="text-xs text-stone-400 mt-1">
                        {new Date(d.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {d.source_lang ? ` · ${d.source_lang}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
