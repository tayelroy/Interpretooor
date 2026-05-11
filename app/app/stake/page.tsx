'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallets } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import { Loader2, AlertCircle, Clock, Lock, ArrowRight, Star } from 'lucide-react';
import { useValidator, type ValidatorStakeAccountData } from '@/hooks/useValidator';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Connection } from '@solana/web3.js';
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

type Tab = 'stake' | 'unstake';

export default function StakePage() {
  const { wallets } = useWallets();
  const activeAddress = wallets[0]?.address;
  const { fetchStakeAccount, stakeUsdc, requestUnstake, completeUnstake } = useValidator();

  const [stakeAccount, setStakeAccount] = useState<ValidatorStakeAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('stake');
  const [inputValue, setInputValue] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [kaminoApy, setKaminoApy] = useState<number | null>(null);
  const [walletUsdcBalance, setWalletUsdcBalance] = useState<number>(0);

  const load = useCallback(async () => {
    if (!activeAddress) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const acc = await fetchStakeAccount(new PublicKey(activeAddress));
      setStakeAccount(acc);

      // Fetch wallet USDC balance
      try {
        const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL!, 'confirmed');
        const USDC_MINT = new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
        const ata = getAssociatedTokenAddressSync(USDC_MINT, new PublicKey(activeAddress));
        const balanceRes = await connection.getTokenAccountBalance(ata);
        setWalletUsdcBalance(balanceRes.value.uiAmount || 0);
      } catch (err) {
        console.warn("Failed to fetch USDC balance:", err);
        setWalletUsdcBalance(0);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stake account');
    } finally {
      setLoading(false);
    }
  }, [activeAddress, fetchStakeAccount]);

  useEffect(() => { 
    load(); 
    
    fetch('https://yields.llama.fi/pools')
      .then((res) => res.json())
      .then((data) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pool = data.data.find((p: any) => p.project === 'kamino-lend' && p.symbol === 'USDC');
        if (pool && pool.apy) setKaminoApy(pool.apy);
      })
      .catch((err) => console.error("Failed to fetch Kamino APY:", err));
  }, [load]);

  const handleAction = async () => {
    const amt = parseFloat(inputValue);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    
    setIsProcessing(true);
    try {
      if (tab === 'stake') {
        await stakeUsdc(amt);
        toast.success(`Staked ${amt} USDC`);
      } else {
        await requestUnstake(amt);
        toast.success(`Unstake requested for ${amt} USDC — available in 3 days`);
      }
      setInputValue('');
      await load();
    } catch (err) {
      console.error('Stake transaction failed:', err);
      toast.error(err instanceof Error ? err.message : `${tab === 'stake' ? 'Stake' : 'Unstake'} failed`);
    } finally {
      setIsProcessing(false);
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

  const amountRaw = stakeAccount?.amount.toNumber() ?? 0;
  const lockedRaw = stakeAccount?.locked.toNumber() ?? 0;
  const unlockAmountRaw = stakeAccount?.unlockAmount.toNumber() ?? 0;
  const unlockAt = stakeAccount?.unlockAt.toNumber() ?? 0;
  
  const availableRaw = amountRaw - lockedRaw - unlockAmountRaw;
  const canCompleteUnstake = unlockAt > 0 && Math.floor(Date.now() / 1000) >= unlockAt;
  const hasPendingUnstake = unlockAt > 0;

  const handleMax = () => {
    if (tab === 'unstake') {
      setInputValue((availableRaw / 1_000_000).toString());
    } else {
      setInputValue(walletUsdcBalance.toString());
    }
  };

  if (!activeAddress) {
    return (
      <div className="min-h-screen pt-32 pb-20 px-8 flex items-center justify-center">
        <div className="p-6 bg-stone-50 border border-stone rounded-2xl text-stone-500 text-sm text-center">
          Connect your wallet to view the Validator Vault.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen pt-32 pb-20 flex items-center gap-3 text-stone-400 justify-center">
        <Loader2 size={22} className="animate-spin" />
        <span>Loading your vault…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen pt-32 pb-20 px-8 max-w-4xl mx-auto">
        <div className="flex items-start gap-3 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pt-32 pb-20 px-8">
      <main className="flex-grow max-w-6xl mx-auto w-full flex flex-col items-center gap-16">
        
        {/* Hero Vault Header */}
        <div className="text-center flex flex-col items-center max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-[#afefe2] text-[#306e65] px-4 py-1 rounded-full mb-6 border border-[#94d2c6] text-[14px]">
            <Lock size={16} />
            Validator Vault
          </div>
          <h1 className="font-serif italic text-[80px] md:text-[120px] leading-[0.85] tracking-[-0.13em] text-ink mb-2">
            {usdcAmount(amountRaw)}
          </h1>
          <h2 className="font-serif italic text-[36px] md:text-[48px] leading-[0.95] tracking-[-0.05em] text-ink opacity-80 mb-6">
            USDC Staked
          </h2>
          <p className="text-[16px] text-stone-500 max-w-lg mx-auto">
            Secure the Interpretooor protocol by delegating your tokens. Earn continuous yields while upholding the integrity of the translation network.
          </p>
        </div>

        {/* Stake Interaction & Stats Grid */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-16">
          
          {/* Staking Card */}
          <div className="md:col-span-7 bg-parchment rounded-[32px] p-8 md:p-10 border border-stone flex flex-col relative z-10 shadow-sm">
            {/* Tabs */}
            <div className="flex border-b border-stone mb-8 relative">
              <button
                onClick={() => { setTab('stake'); setInputValue(''); }}
                className={`flex-1 pb-4 text-center text-[22px] font-medium border-b-2 transition-colors ${
                  tab === 'stake' 
                    ? 'text-ink border-forest-canopy relative top-[1px]' 
                    : 'text-muted-ash border-transparent hover:text-ink'
                }`}
              >
                Stake
              </button>
              <button
                onClick={() => { setTab('unstake'); setInputValue(''); }}
                className={`flex-1 pb-4 text-center text-[22px] font-medium border-b-2 transition-colors ${
                  tab === 'unstake' 
                    ? 'text-ink border-forest-canopy relative top-[1px]' 
                    : 'text-muted-ash border-transparent hover:text-ink'
                }`}
              >
                Unstake
              </button>
            </div>

            {hasPendingUnstake && tab === 'unstake' && (
              <div className="bg-[#fff9e6] rounded-xl p-5 mb-8 flex flex-col gap-3 border border-[#ffdcbd]">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-[14px] text-amber-800">
                    <Clock size={16} />
                    <span><strong>{usdcAmount(unlockAmountRaw)} USDC</strong> requested</span>
                  </div>
                  <span className="text-[13px] font-mono text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                    {formatUnlockCountdown(unlockAt)}
                  </span>
                </div>
                {canCompleteUnstake && (
                  <button 
                    onClick={handleCompleteUnstake}
                    disabled={completing}
                    className="w-full bg-amber-600 text-white py-3 mt-2 rounded-xl text-[14px] font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50"
                  >
                    {completing ? 'Withdrawing...' : 'Withdraw to Wallet'}
                  </button>
                )}
                {!canCompleteUnstake && (
                  <p className="text-[13px] text-amber-700 mt-1">
                    Your unstake request is currently in the 3-day cooldown period. Once complete, you can withdraw the funds to your wallet.
                  </p>
                )}
              </div>
            )}

            {/* Input Area */}
            {!(hasPendingUnstake && tab === 'unstake') && (
              <>
                <div className="flex flex-col gap-2 mb-8">
                  <div className="flex justify-between items-end mb-2">
                    <label className="text-[14px] text-stone-500">
                      Amount to {tab === 'stake' ? 'Delegate' : 'Unstake'}
                    </label>
                    <span className="text-[14px] text-muted-ash">
                      {tab === 'stake' ? `Balance: ${walletUsdcBalance.toFixed(2)} USDC` : `Available: ${usdcAmount(availableRaw)} USDC`}
                    </span>
                  </div>
                  <div className="flex items-center bg-white border border-stone rounded-xl p-4 focus-within:border-ink transition-colors">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="0.00"
                      className="flex-grow bg-transparent border-none outline-none font-serif text-[32px] text-ink placeholder-muted-ash focus:ring-0 p-0"
                    />
                    {tab === 'unstake' ? (
                      <button 
                        onClick={handleMax}
                        className="text-[14px] text-[#29685f] bg-[#afefe2]/30 px-3 py-1 rounded-full hover:bg-[#afefe2]/50 transition-colors"
                      >
                        MAX
                      </button>
                    ) : (
                      <button 
                        onClick={handleMax}
                        className="text-[14px] text-[#29685f] bg-[#afefe2]/30 px-3 py-1 rounded-full hover:bg-[#afefe2]/50 transition-colors"
                      >
                        MAX
                      </button>
                    )}
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-surface-container-low rounded-xl p-5 mb-8 flex flex-col gap-3 border border-stone-200">
                  <div className="flex justify-between items-center">
                    <span className="text-[14px] text-stone-500">Estimated Network Fee</span>
                    <span className="text-[16px] text-ink">~ 0.002 SOL</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[14px] text-stone-500">Asset</span>
                    <span className="text-[16px] text-ink">USD Coin (USDC)</span>
                  </div>
                </div>
              </>
            )}

            {/* Action Button */}
            <button
              onClick={handleAction}
              disabled={isProcessing || (!inputValue && !(hasPendingUnstake && tab === 'unstake'))}
              className={`w-full py-4 rounded-[32px] text-[22px] font-medium transition-all flex justify-center items-center gap-2 group ${
                isProcessing || (!inputValue && !(hasPendingUnstake && tab === 'unstake'))
                  ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
                  : 'bg-forest-canopy text-white hover:opacity-90'
              }`}
            >
              {isProcessing 
                ? (tab === 'stake' ? 'Staking...' : 'Requesting...') 
                : (tab === 'stake' ? 'Grant Validator Status' : 'Initiate Unstake')}
              {!isProcessing && (
                <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
              )}
            </button>
          </div>

          {/* Stats Column */}
          <div className="md:col-span-5 flex flex-col gap-6">
            {/* APY Card */}
            <div className="bg-white rounded-[32px] p-8 border border-stone flex flex-col justify-center items-center text-center relative overflow-hidden shadow-sm">
              <div className="absolute top-0 left-0 w-full h-1 bg-pale-lavender"></div>
              <p className="text-[16px] text-stone-500 mb-2 mt-2">Current Yield</p>
              <p className="font-serif italic text-[64px] leading-tight pt-3 pb-2 px-4 tracking-[-0.07em] text-transparent bg-clip-text bg-gradient-to-br from-ink to-primary">
                {kaminoApy !== null ? `${kaminoApy.toFixed(1)}%` : '--%'}
              </p>
              <p className="text-[14px] text-[#29685f] mt-4 bg-[#afefe2] px-3 py-1 rounded-full inline-block font-medium">
                APY
              </p>
            </div>

            {/* Dual Stats Row */}
            <div className="grid grid-cols-2 gap-6">
              {/* Rewards */}
              <div className="bg-white rounded-[24px] p-6 border border-stone flex flex-col shadow-sm">
                <Star size={28} className="text-sunburst mb-6" />
                <div>
                  <p className="text-[14px] text-stone-500 mb-1">Your Rewards</p>
                  <div className="flex items-baseline gap-1">
                    <span className="font-serif italic text-[32px] leading-none text-ink">0</span>
                    <span className="text-[16px] text-stone-500">USDC</span>
                  </div>
                </div>
              </div>
              
              {/* Locked / Active Jobs */}
              <div className="bg-white rounded-[24px] p-6 border border-stone flex flex-col shadow-sm">
                <Lock size={28} className="text-primary mb-6" />
                <div>
                  <p className="text-[14px] text-stone-500 mb-1">Locked in Jobs</p>
                  <p className="font-serif italic text-[32px] leading-none text-ink">${usdcAmount(lockedRaw)}</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
