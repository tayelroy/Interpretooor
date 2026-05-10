'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { Loader2 } from 'lucide-react';

export default function MyProfilePage() {
  const router = useRouter();
  const { wallets } = useWallets();

  useEffect(() => {
    const address = wallets[0]?.address;
    if (address) {
      router.replace(`/app/profile/${address}`);
    }
  }, [wallets, router]);

  return (
    <div className="min-h-screen bg-parchment pt-40 flex items-center justify-center">
      <div className="flex items-center gap-3 text-stone-400">
        <Loader2 size={22} className="animate-spin" />
        <span>Loading your profile…</span>
      </div>
    </div>
  );
}
