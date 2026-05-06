import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import ConnectWalletButton from './ConnectWalletButton';

interface NavigationProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export default function Navigation({ currentPath, onNavigate }: NavigationProps) {
  const navItems = [
    { label: 'Protocol', path: 'home', type: 'internal' },
    { label: 'Validators', path: 'dashboard', type: 'internal' },
    { label: 'Writers', path: 'write', type: 'internal' },
    { label: 'Docs', path: 'reader', type: 'internal' },
  ];

  return (
    <nav className="fixed top-0 left-0 w-full z-[100] h-20 bg-ink/80 backdrop-blur-xl border-b border-white/5 px-8 flex items-center justify-between">
      <button
        onClick={() => onNavigate('home')}
        className="text-2xl font-serif italic text-white hover:opacity-80 transition-opacity"
      >
        Interpretooor
      </button>

      <div className="hidden md:flex gap-8">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => onNavigate(item.path)}
            className={cn(
              'text-sm uppercase tracking-widest transition-all duration-300 relative py-1',
              currentPath === item.path ? 'text-pale-lavender' : 'text-stone-400 hover:text-white'
            )}
          >
            {item.label}
            {currentPath === item.path && (
              <motion.div layoutId="nav-underline" className="absolute bottom-0 left-0 w-full h-px bg-pale-lavender" />
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {currentPath === 'write' && (
          <button
            type="button"
            onClick={() => {
              console.log('Global publish button clicked!');
              window.dispatchEvent(new CustomEvent('interpretooor:publish'));
            }}
            className="hidden sm:block text-sm font-sans tracking-tight text-ink px-6 py-2 rounded-full bg-pale-lavender hover:opacity-90 transition-colors"
          >
            Publish
          </button>
        )}
        <button className="hidden sm:block text-sm font-sans tracking-tight text-stone-300 px-6 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
          Whitepaper
        </button>
        <ConnectWalletButton />
      </div>
    </nav>
  );
}