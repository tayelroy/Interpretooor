export default function AppFooter() {
  return (
    <footer className="bg-ink border-t border-white/5 text-stone-500 py-16 px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between gap-12">
        <div>
          <h3 className="text-parchment text-2xl font-serif italic mb-3">Interpretooor</h3>
          <p className="text-stone-600 text-sm leading-relaxed max-w-xs tracking-tight">
            Deciphering nuance at scale.
          </p>
        </div>

        <div className="flex gap-20">
          <div>
            <h4 className="text-white text-xs uppercase tracking-widest mb-5">Resources</h4>
            <ul className="space-y-3 text-sm">
              <li className="hover:text-parchment transition-colors cursor-pointer">Docs</li>
              <li className="hover:text-parchment transition-colors cursor-pointer">Whitepaper</li>
              <li className="hover:text-parchment transition-colors cursor-pointer">Support</li>
            </ul>
          </div>
          <div>
            <h4 className="text-white text-xs uppercase tracking-widest mb-5">Community</h4>
            <ul className="space-y-3 text-sm">
              <li className="hover:text-parchment transition-colors cursor-pointer">GitHub</li>
              <li className="hover:text-parchment transition-colors cursor-pointer">Discord</li>
              <li className="hover:text-parchment transition-colors cursor-pointer">Twitter</li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
