"use client";

import { usePrivy } from '@privy-io/react-auth';
import AppNav from '../components/AppNav';
import AppFooter from '../components/AppFooter';
import SmoothScroll from '../components/SmoothScroll';
import ConnectWalletButton from '../components/ConnectWalletButton';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();

  if (!ready) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <span className="text-stone-500 text-sm uppercase tracking-widest animate-pulse">Loading…</span>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-ink flex flex-col items-center justify-center gap-6">
        <p className="font-serif italic text-4xl text-parchment">Interpretooor</p>
        <p className="text-stone-400 text-sm">Connect your wallet to access the platform.</p>
        <ConnectWalletButton />
      </div>
    );
  }

  return (
    <SmoothScroll>
      <div className="min-h-screen bg-background flex flex-col selection:bg-pale-lavender selection:text-ink">
        <AppNav />
        <main className="flex-1">{children}</main>
        <AppFooter />
      </div>
    </SmoothScroll>
  );
}
