import { motion } from 'motion/react';
import { ArrowRight, ShieldCheck, Link as LinkIcon, Database } from 'lucide-react';

export default function Home() {
  const images = {
    hero: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAZnkxu_nRY_H0k0VS3E4op0zzVo_M5Lms6NkuUJi0EDC9bW_oOrQen2HJqKxrUZCtQx1Ejo_JhVZfelbYRo83u80YMWcODZgfyBXc3JZvbdjSI2SjtEqJ4vwwA0WPA2xKd40OZV_f9iRWIHuAPt9SgYV2zYFLkWZLL8Oc7EkYFxUDU9gihPwxv82MPeNRwzKVnGUrbV1Ctar6Y3qvuTZIA1ctGNTuCWj2_eT1nBQtbGJPP1Rn1XQ_EKXGhjKtu6rsGji8SbD6zo68',
    workspace: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCmb-OnsSn2F67jmphz1mQbfJl6YLeSwpo76C9m7_Cbwvv6IWE4ycLztjl35WQw6tohU4a7H67oS7d0NfGn2o4rLaS48rPEjGWPs3TwNbXzj8UeS48KZXgjaS4bgY6emxWjoY-lzHbFcpKP4srIUqqXzCPQfpTIM60R-WmAXKfkBZsL1M8BI7FisuUh6jD90wgAvx5mKonDS4wcsxnqkJFRZq9xb0PYrHtl1PCiZJ1aKpJhhkblWQ3rnOxfoBuHPaEetboEU1lz5sE',
  };

  const protocols = ['Solana', 'Circle', 'Sign Protocol', 'Ethereum', 'Polygon', 'Arbitrum', 'Base'];

  return (
    <div className="bg-ink min-h-screen">
      <section className="pt-40 pb-24 px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="font-serif text-[120px] leading-[0.8] tracking-tighter text-parchment"
        >
          Don&apos;t just translate.
          <br />
          <span className="italic text-stone-500">Interpret.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 1 }}
          className="mt-12 text-xl text-stone-400 max-w-2xl font-light tracking-tight"
        >
          The verifiable, nuance-aware protocol that turns your native voice into culturally accurate global content.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-12 flex gap-4"
        >
          <button className="bg-parchment text-ink px-12 py-4 rounded-full text-lg font-medium hover:scale-105 transition-transform">
            Launch App
          </button>
          <button className="bg-white/5 border border-white/10 text-white px-12 py-4 rounded-full text-lg font-medium hover:bg-white/10 transition-colors">
            Read Whitepaper
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
          className="mt-24 w-full aspect-[21/9] rounded-[40px] overflow-hidden border border-white/5 relative group"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-transparent z-10 opacity-60" />
          <img src={images.hero} alt="Abstract Flow" className="w-full h-full object-cover mix-blend-screen opacity-70 group-hover:scale-105 transition-transform duration-1000" />
        </motion.div>
      </section>

      <div className="py-12 border-y border-white/5 overflow-hidden flex bg-ink/50">
        <motion.div
          animate={{ x: [0, -1000] }}
          transition={{ repeat: Infinity, duration: 30, ease: 'linear' }}
          className="flex gap-20 whitespace-nowrap px-10 items-center"
        >
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-20 items-center">
              <span className="text-stone-600 uppercase tracking-widest text-xs font-bold">Supported Protocols</span>
              {protocols.map((p) => (
                <span key={p} className="text-stone-400 font-serif italic text-2xl opacity-60 hover:opacity-100 transition-opacity cursor-default">
                  {p}
                </span>
              ))}
            </div>
          ))}
        </motion.div>
      </div>

      <section className="bg-parchment rounded-t-[80px] py-32 mt-[-40px] relative z-20">
        <div className="max-w-7xl mx-auto px-8">
          <div className="text-center mb-20">
            <h2 className="text-5xl text-ink leading-none mb-4">Protocol Mechanisms</h2>
            <p className="text-stone-500 text-lg">Designing communication layers people want to use.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="col-span-1 bg-white p-12 rounded-[32px] flex flex-col gap-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-16 h-16 rounded-full bg-pale-lavender/30 flex items-center justify-center text-ink">
                <Database size={32} />
              </div>
              <div>
                <h3 className="text-3xl mb-4">Semantic Context Markup</h3>
                <p className="text-stone-500 leading-relaxed">
                  Our SCM tags preserve the precise emotional and intellectual intent of your original text, ensuring validators grasp meaning, not just words.
                </p>
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 bg-ink p-12 rounded-[32px] flex flex-col justify-between relative overflow-hidden text-parchment group">
              <div className="absolute top-0 right-0 w-96 h-96 bg-pale-lavender/5 rounded-full blur-[100px] -mr-32 -mt-32" />
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                <ShieldCheck size={32} />
              </div>
              <div className="mt-20">
                <h3 className="text-4xl mb-6">Human-in-the-Loop Validation</h3>
                <p className="text-stone-400 text-lg max-w-xl leading-relaxed">
                  A decentralized network of culturally fluent validators reviews every output. Consensus mechanisms ensure idiomatic expressions are accurate.
                </p>
              </div>
            </div>

            <div className="col-span-1 md:col-span-3 bg-white p-12 rounded-[32px] flex flex-col md:flex-row gap-12 shadow-sm">
              <div className="flex-1 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center">
                    <LinkIcon size={24} />
                  </div>
                  <h3 className="text-3xl">On-Chain Proofs</h3>
                </div>
                <p className="text-stone-500 text-lg leading-relaxed">
                  Every interpreted string and its associated validator consensus is anchored via Solana-backed attestations. This creates an immutable, verifiable ledger of cultural accuracy.
                </p>
              </div>
              <div className="flex-1 bg-stone-50 rounded-2xl p-8 border border-stone-100 font-mono text-sm space-y-4">
                <div className="flex justify-between border-b border-stone-200 pb-2">
                  <span className="text-stone-400">TX_HASH</span>
                  <span className="text-ink">7aX8...b9Q2</span>
                </div>
                <div className="flex justify-between border-b border-stone-200 pb-2">
                  <span className="text-stone-400">CONSENSUS</span>
                  <span className="text-green-600 font-bold">98.4% MATCH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">STATUS</span>
                  <span className="text-ink">VERIFIED_VERIDICAL</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-parchment py-32 border-t border-stone-200/50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-8 grid grid-cols-1 md:grid-cols-2 gap-24 items-center">
          <motion.div
            whileInView={{ x: [100, 0], opacity: [0, 1] }}
            viewport={{ once: true }}
            className="aspect-square rounded-[80px] bg-stone-100 overflow-hidden relative"
          >
            <img src={images.workspace} className="w-full h-full object-cover mix-blend-multiply opacity-80" alt="Workspace" />
          </motion.div>
          <div className="space-y-8">
            <span className="px-4 py-1.5 rounded-full border border-stone-300 text-xs uppercase tracking-[0.2em] text-stone-500">For Writers</span>
            <h2 className="text-[80px] leading-[0.9] tracking-tight">Publish once,<br />reach everyone.</h2>
            <p className="text-stone-500 text-lg leading-relaxed max-w-md">
              Write in your native tongue. Let the protocol map your intent across languages without losing the essence of your thought.
            </p>
            <button className="flex items-center gap-3 text-lg font-medium hover:gap-6 transition-all group">
              Start Writing
              <ArrowRight className="text-pale-lavender group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </section>

      <footer className="bg-ink text-stone-500 py-32 px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 border-t border-white/5 pt-20">
          <div className="col-span-1 md:col-span-2">
            <h3 className="text-parchment text-3xl italic mb-6">Interpretooor</h3>
            <p className="text-stone-600 max-w-xs text-sm leading-relaxed tracking-tight">
              Deciphering nuance at scale. A protocol for building communication layers people want to use.
            </p>
          </div>
          <div>
            <h4 className="text-white text-sm uppercase tracking-widest mb-6">Protocol</h4>
            <ul className="space-y-4 text-sm">
              <li className="hover:text-parchment transition-colors cursor-pointer">Validators</li>
              <li className="hover:text-parchment transition-colors cursor-pointer">Writers</li>
              <li className="hover:text-parchment transition-colors cursor-pointer">Network Status</li>
            </ul>
          </div>
          <div>
            <h4 className="text-white text-sm uppercase tracking-widest mb-6">Community</h4>
            <ul className="space-y-4 text-sm">
              <li className="hover:text-parchment transition-colors cursor-pointer">GitHub</li>
              <li className="hover:text-parchment transition-colors cursor-pointer">Discord</li>
              <li className="hover:text-parchment transition-colors cursor-pointer">Twitter</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}