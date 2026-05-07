import Link from 'next/link';

export default function Navigation() {
  return (
    <nav className="fixed top-0 left-0 w-full z-[100] h-20 bg-ink/80 backdrop-blur-xl border-b border-white/5 px-8 flex items-center justify-between">
      <Link
        href="/"
        className="text-2xl font-serif italic text-white hover:opacity-80 transition-opacity"
      >
        Interpretooor
      </Link>

      <div className="hidden md:flex gap-8">
        <button className="text-sm uppercase tracking-widest text-stone-400 hover:text-white transition-colors">
          Docs
        </button>
        <button className="text-sm uppercase tracking-widest text-stone-400 hover:text-white transition-colors">
          Whitepaper
        </button>
      </div>

      <Link
        href="/app"
        className="text-sm font-sans tracking-tight text-ink px-6 py-2 rounded-full bg-parchment hover:scale-105 transition-transform"
      >
        Launch App
      </Link>
    </nav>
  );
}
