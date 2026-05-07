"use client";

import { useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

function abbreviateAddress(address: string) {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function ConnectWalletButton() {
  const { login, logout, authenticated, user } = usePrivy();
  const { wallets, ready } = useWallets();

  const connectedAddress = useMemo(() => {
  // 1. Try to find a wallet explicitly labeled as 'solana'
  // In many Privy versions, this is stored in wallet.chainType
  const solanaWallet = wallets.find((w: any) => w.chainType === 'solana');
  
  if (solanaWallet) return solanaWallet.address;

  // 2. Fallback: If no explicit solana wallet is found in the list, 
  // use the primary wallet linked to the user profile
  const primaryWallet = user?.linkedAccounts.find(
    (account: any) => account.type === 'wallet' && account.chainType === 'solana'
  );

  return (primaryWallet as any)?.address ?? user?.wallet?.address ?? null;
}, [user, wallets]);

  if (!ready) {
    return (
      <button className="text-sm font-semibold tracking-tight text-ink px-6 py-2 rounded-full bg-parchment hover:bg-white transition-colors opacity-70">
        Connecting...
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {!authenticated ? (
        <button
          onClick={login}
          className="text-sm font-semibold tracking-tight text-ink px-6 py-2 rounded-full bg-parchment hover:bg-white transition-colors"
        >
          Privy Login
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm text-stone-300 border border-white/10">
          <span className="font-medium text-white">{abbreviateAddress(connectedAddress ?? "connected")}</span>
          <button
            onClick={() => logout()}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-stone-200 transition-colors hover:bg-white/15"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}