'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallets } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import {
  Loader2, AlertCircle, Shield, Lock, Unlock, ArrowDownCircle, Clock,
} from 'lucide-react';
import { useValidator, type ValidatorStakeAccountData } from '@/hooks/useValidator';
import { toast } from 'sonner';

function usdcAmount(raw: number): string {
  return (raw / 1_000_000).toFixed(2);
}

function formatUnlockCountdown(unlockAt: number): string {
  const nowSecs = Math.floor(Date.now() / 1000);
  const remaining = unlockAt - nowSecs;
  if (remaining <= 0) return 'Ready to withdraw';
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

export default function StakePage() {
  const { wallets } = useWallets();
  const activeAddress = wallets[0]?.address;
  const { fetchStakeAccount, stakeUsdc, requestUnstake, completeUnstake } = useValidator();

  const [stakeAccount, setStakeAccount] = useState<ValidatorStakeAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');

  const [staking, setStaking] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    if (!activeAddress) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const acc = await fetchStakeAccount(new PublicKey(activeAddress));
      setStakeAccount(acc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stake account');
    } finally {
      setLoading(false);
    }
  }, [activeAddress, fetchStakeAccount]);

  useEffect(() => { load(); }, [load]);

  const handleStake = async () => {
    const amount = parseFloat(stakeAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setStaking(true);
    try {
      await stakeUsdc(amount);
      toast.success(`Staked ${amount} USDC`);
      setStakeAmount('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Stake failed');
    } finally {
      setStaking(false);
    }
  };

  const handleRequestUnstake = async () => {
    const amount = parseFloat(unstakeAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setRequesting(true);
    try {
      await requestUnstake(amount);
      toast.success(`Unstake requested for ${amount} USDC — available in 3 days`);
      setUnstakeAmount('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setRequesting(false);
    }
  };

  const handleCompleteUnstake = async () => {
    setCompleting(true);
    try {
      await completeUnstake();
      toast.success('Unstake complete — USDC returned to your wallet');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Complete unstake failed');
    } finally {
      setCompleting(false);
    }
  };

  const amount = stakeAccount?.amount.toNumber() ?? 0;
  const locked = stakeAccount?.locked.toNumber() ?? 0;
  const unlockAmount = stakeAccount?.unlockAmount.toNumber() ?? 0;
  const unlockAt = stakeAccount?.unlockAt.toNumber() ?? 0;
  const available = amount - locked - unlockAmount;
  const canCompleteUnstake = unlockAt > 0 && Math.floor(Date.now() / 1000) >= unlockAt;
  const hasPendingUnstake = unlockAt > 0;

  return (
    <div className="min-h-screen bg-parchment pt-32 pb-20 px-8">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <Shield size={24} className="text-ink" />
            <h1 className="text-3xl font-bold text-ink">Validator Stake</h1>
          </div>
          <p className="text-stone-500 text-sm max-w-lg">
            Stake USDC to unlock validation jobs. Your stake is at risk if you vote in the minority —
            it is returned if you vote correctly. Unstaking takes 3 days.
          </p>
        </div>

        {!activeAddress ? (
          <div className="p-6 bg-stone-50 border border-stone-200 rounded-2xl text-stone-500 text-sm text-center">
            Connect your wallet to manage stake.
          </div>
        ) : loading ? (
          <div className="flex items-center gap-3 text-stone-400 py-20 justify-center">
            <Loader2 size={22} className="animate-spin" />
            <span>Loading stake account…</span>
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="space-y-5">

            {/* Balance overview */}
            <div className="bg-white border border-stone-200 rounded-[28px] p-6">
              <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-widest mb-4">
                Your Stake
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-stone-400 mb-1">Total Staked</p>
                  <p className="text-xl font-bold text-ink">${usdcAmount(amount)}</p>
                  <p className="text-xs text-stone-400">USDC</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400 mb-1 flex items-center gap-1">
                    <Lock size={10} /> Locked in Jobs
                  </p>
                  <p className="text-xl font-bold text-amber-600">${usdcAmount(locked)}</p>
                  <p className="text-xs text-stone-400">USDC</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400 mb-1 flex items-center gap-1">
                    <Unlock size={10} /> Available
                  </p>
                  <p className="text-xl font-bold text-emerald-600">${usdcAmount(available)}</p>
                  <p className="text-xs text-stone-400">USDC</p>
                </div>
              </div>

              {hasPendingUnstake && (
                <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-stone-500">
                    <Clock size={14} />
                    <span>
                      <strong>${usdcAmount(unlockAmount)} USDC</strong> queued for unstake —{' '}
                      {formatUnlockCountdown(unlockAt)}
                    </span>
                  </div>
                  {canCompleteUnstake && (
                    <button
                      onClick={handleCompleteUnstake}
                      disabled={completing}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60"
                    >
                      {completing ? <Loader2 size={13} className="animate-spin" /> : <ArrowDownCircle size={13} />}
                      {completing ? 'Withdrawing…' : 'Withdraw Now'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Stake more */}
            <div className="bg-white border border-stone-200 rounded-[28px] p-6">
              <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-widest mb-4">
                Add Stake
              </h2>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={stakeAmount}
                    onChange={e => setStakeAmount(e.target.value)}
                    placeholder="Amount in USDC"
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-violet-400"
                  />
                </div>
                <button
                  onClick={handleStake}
                  disabled={staking || !stakeAmount}
                  className="flex items-center gap-2 px-5 py-2.5 bg-ink text-parchment rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {staking ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
                  {staking ? 'Staking…' : 'Stake'}
                </button>
              </div>
              <p className="text-xs text-stone-400 mt-2">
                USDC will be transferred from your wallet to your stake vault.
              </p>
            </div>

            {/* Request unstake */}
            {!hasPendingUnstake && amount > 0 && (
              <div className="bg-white border border-stone-200 rounded-[28px] p-6">
                <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-widest mb-4">
                  Request Unstake
                </h2>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      max={available / 1_000_000}
                      step="1"
                      value={unstakeAmount}
                      onChange={e => setUnstakeAmount(e.target.value)}
                      placeholder={`Up to $${usdcAmount(available)} USDC`}
                      className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <button
                    onClick={handleRequestUnstake}
                    disabled={requesting || !unstakeAmount}
                    className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-40"
                  >
                    {requesting ? <Loader2 size={13} className="animate-spin" /> : <Unlock size={13} />}
                    {requesting ? 'Requesting…' : 'Request Unstake'}
                  </button>
                </div>
                <p className="text-xs text-stone-400 mt-2">
                  Locked stake (${usdcAmount(locked)} USDC in active jobs) cannot be unstaked until jobs resolve.
                  3-day cooldown applies.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
