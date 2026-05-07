"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import AppNav from '../components/AppNav';
import AppFooter from '../components/AppFooter';
import SmoothScroll from '../components/SmoothScroll';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace('/');
    }
  }, [ready, authenticated, router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <span className="text-stone-500 text-sm uppercase tracking-widest animate-pulse">Loading...</span>
      </div>
    );
  }

  if (!authenticated) {
    return null;
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
