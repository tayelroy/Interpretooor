"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallets } from '@privy-io/react-auth/solana';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import ConnectWalletButton from './ConnectWalletButton';

const navItems = [
  { label: 'Home',      href: '/app' },
  { label: 'Translate', href: '/app/translate' },
  { label: 'Validate',  href: '/app/validate' },
  { label: 'Write',     href: '/app/write' },
  { label: 'Dashboard', href: '/app/dashboard' },
];

export default function AppNav() {
  const pathname = usePathname();
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;

  return (
    <nav className="fixed top-0 left-0 w-full z-[100] h-20 bg-ink/80 backdrop-blur-xl border-b border-white/5 px-8 flex items-center justify-between">
      <Link
        href="/app"
        className="text-2xl font-serif italic text-white hover:opacity-80 transition-opacity"
      >
        Interpretooor
      </Link>

      <div className="hidden md:flex gap-8">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'text-sm uppercase tracking-widest transition-all duration-300 relative py-1',
                active ? 'text-pale-lavender' : 'text-stone-400 hover:text-white'
              )}
            >
              {item.label}
              {active && (
                <motion.div
                  layoutId="app-nav-underline"
                  className="absolute bottom-0 left-0 w-full h-px bg-pale-lavender"
                />
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        {walletAddress && (
          <Link
            href={`/app/profile/${walletAddress}`}
            className="w-8 h-8 rounded-full bg-pale-lavender/20 border border-pale-lavender/40 flex items-center justify-center text-pale-lavender text-xs font-mono hover:bg-pale-lavender/30 transition-colors"
            title="My Profile"
          >
            {walletAddress.slice(0, 2)}
          </Link>
        )}
        <ConnectWalletButton />
      </div>
    </nav>
  );
}
