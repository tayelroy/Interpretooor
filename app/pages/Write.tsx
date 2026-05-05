import { motion } from 'motion/react';
import { useState } from 'react';
import { Languages, Info, ChevronDown, Sparkles, Wand2, Loader2 } from 'lucide-react';
import { interpretText, type TranslationResult } from '../services/geminiService';
import { cn } from '../lib/utils';

export default function Write() {
  const [text, setText] = useState('');
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [targetLang, setTargetLang] = useState('Spanish');

  const handleInterpret = async () => {
    if (!text) return;
    setIsInterpreting(true);
    setResult(null);
    try {
      const res = await interpretText(text, targetLang);
      setResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsInterpreting(false);
    }
  };

  return (
    <div className="bg-parchment min-h-screen pt-40 pb-20 px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-12">
        <div className="flex-grow max-w-4xl space-y-8">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <h1 className="text-6xl text-ink leading-tight focus:outline-none" contentEditable suppressContentEditableWarning>
              Untitled Interpretation
            </h1>
            <div className="h-0.5 w-full bg-stone-200" />
          </motion.div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your message here... use idioms or cultural terms for better results."
            className="w-full min-h-[400px] bg-transparent border-none text-2xl font-light leading-relaxed text-ink placeholder:text-stone-300 focus:ring-0 resize-none"
          />

          {result && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-20 p-12 bg-white rounded-[40px] border border-pale-lavender shadow-xl">
              <div className="flex items-center gap-2 mb-8 text-pale-lavender font-bold uppercase tracking-widest text-xs">
                <Sparkles size={16} />
                Semantic Interpretation
              </div>
              <p className="text-3xl font-serif italic text-ink leading-relaxed">{result.translatedText}</p>

              <div className="mt-12 space-y-4">
                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-stone-400">Context Traces</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {result.reasoning.map((r, i) => (
                    <div key={i} className="p-6 bg-stone-50 rounded-2xl border border-stone-100">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold uppercase text-ink">{r.tag}</span>
                        <span className="text-xs text-stone-400 italic">&ldquo;{r.source}&rdquo;</span>
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed">{r.decision}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <aside className="w-full md:w-80 space-y-6">
          <div className="bg-white rounded-[32px] p-8 border border-stone-200 shadow-sm space-y-6">
            <h3 className="text-2xl flex items-center gap-2">
              <Languages size={20} className="text-stone-400" />
              Settings
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-stone-400">Target Language</label>
              <div className="relative group">
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 appearance-none focus:ring-pale-lavender focus:border-pale-lavender transition-all"
                >
                  <option>Spanish</option>
                  <option>Japanese</option>
                  <option>French</option>
                  <option>Korean</option>
                  <option>German</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none group-hover:text-ink transition-colors" size={16} />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-stone-100">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-widest text-stone-400">Tone</span>
                <button className="text-[10px] text-pale-lavender font-bold flex items-center gap-1">
                  <Sparkles size={10} /> AUTO
                </button>
              </div>
              <div className="flex gap-2">
                <div className="px-3 py-1 bg-ink text-white rounded-full text-[10px] font-bold">LITERAL</div>
                <div className="px-3 py-1 bg-stone-100 text-stone-500 rounded-full text-[10px] font-bold hover:bg-stone-200 transition-colors cursor-pointer">ACADEMIC</div>
              </div>
            </div>

            <div className="pt-6">
              <button
                onClick={handleInterpret}
                disabled={isInterpreting || !text}
                className={cn(
                  'w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95',
                  isInterpreting || !text ? 'bg-stone-100 text-stone-300 pointer-events-none' : 'bg-pale-lavender text-ink hover:opacity-90'
                )}
              >
                {isInterpreting ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Processing...
                  </>
                ) : (
                  <>
                    <Wand2 size={18} />
                    Interpret
                  </>
                )}
              </button>
              <div className="mt-4 flex items-center gap-2 text-[10px] text-stone-400 justify-center">
                <Info size={12} />
                Verify before publishing.
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}