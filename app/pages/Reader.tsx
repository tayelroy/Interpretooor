import { BadgeCheck, DollarSign } from 'lucide-react';

export default function Reader() {
  return (
    <div className="bg-parchment min-h-screen pt-40 pb-24 px-8">
      <article className="max-w-3xl mx-auto space-y-12">
        <header className="text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-full shadow-sm">
            <BadgeCheck size={18} className="text-forest-canopy" />
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-ink">Verified by Interpretooor</span>
          </div>
          <h1 className="text-7xl font-serif leading-[0.8] tracking-tighter">
            The Solitude of the
            <br />
            <span className="italic text-stone-500">Immutable Ledger</span>
          </h1>
          <div className="h-0.5 w-16 bg-pale-lavender mx-auto" />
          <div className="flex items-center justify-center gap-4 text-sm text-stone-400 font-medium">
            <span>By Anonymous Node</span>
            <span className="w-1 h-1 bg-stone-300 rounded-full" />
            <span>Translated from French</span>
            <span className="w-1 h-1 bg-stone-300 rounded-full" />
            <span>Oct 24, 2024</span>
          </div>
        </header>

        <section className="space-y-8 font-sans text-xl leading-relaxed text-charcoal-text font-light tracking-tight">
          <p>
            To perceive the blockchain merely as a transactional engine is to ignore its more profound philosophical proposition: the construction of an immutable memory. In a digital epoch characterized by ephemeral data and constant revision, the ledger stands as a stoic monument. It does not forget, it does not forgive, and it cannot be coerced into altering its past.
          </p>
          <p>
            When a block is finalized, it enters a state of digital permanence that mimics the crystallization of amber. The data contained within—whether a financial transfer of monumental scale or a trivial string of text—is trapped forever in the cryptographic sequence.
          </p>

          <h2 className="text-4xl text-ink font-serif py-8">The Architecture of Truth</h2>

          <p>
            We must ask ourselves what it means for a society to possess an architecture of absolute truth. Historically, truth has been a malleable construct, shaped by victors and edited by regimes. The distributed ledger proposes a radical alternative: a truth verified not by authority, but by consensus and cryptographic proof.
          </p>
          <p>
            Yet, this absolute truth comes with a chilling realization. If the ledger is immutable, so too are our errors. A misplaced transaction, an exposed secret, a flawed contract—all are recorded with the same dispassionate fidelity as our greatest achievements.
          </p>
        </section>

        <section className="mt-24 p-12 bg-white rounded-[40px] border border-stone-200 text-center space-y-6 shadow-sm">
          <h3 className="text-3xl text-ink">Tip the Writer</h3>
          <p className="text-stone-500 max-w-md mx-auto text-lg leading-relaxed">
            Support the original author and the translation protocol to ensure the continued flow of high-quality editorial content.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <button className="px-10 py-4 bg-pale-lavender text-ink rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
              <DollarSign size={18} />
              Tip 1 USDC
            </button>
            <button className="px-10 py-4 border border-ink text-ink rounded-lg font-medium hover:bg-stone-50 transition-colors">
              Tip 5 USDC
            </button>
          </div>
        </section>
      </article>
    </div>
  );
}