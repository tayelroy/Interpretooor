import { motion } from 'motion/react';
import { useState } from 'react';
import { ArrowLeft, CheckCircle, Sparkles, BrainCircuit, AlertTriangle } from 'lucide-react';
import { PublicKey } from '@solana/web3.js';
import { cn } from '../lib/utils';
import { useBounty } from '../../hooks/useBounty';

interface VerificationProps {
  bountyPda: PublicKey;
  onBack: () => void;
}

export default function Verification({ bountyPda, onBack }: VerificationProps) {
  const { disputeBounty, claimBounty } = useBounty();
  const [disputing, setDisputing] = useState(false);
  const [hoveredReason, setHoveredReason] = useState<string | null>(null);

  const handleDispute = async () => {
    setDisputing(true);
    try {
      await disputeBounty(bountyPda);
    } finally {
      setDisputing(false);
    }
  };

  const handleClaim = async () => {
    await claimBounty(bountyPda);
  };

  const mockReasoning = [
    { id: 'idiom-1', tag: 'idiom', source: '空気を読む (Kūki o yomu)', literal: 'Read the air', intent: 'Sense the prevailing mood or social context', decision: "Localized as 'Read the room' for natural professional tone.", indices: [32, 45] },
    { id: 'cultural-1', tag: 'cultural', source: '建前 (Tatemae)', concept: 'Public behavior vs true feelings', decision: "Translated as 'polite facade' to convey social expectation of superficial agreement.", indices: [70, 83] },
  ];

  return (
    <div className="bg-parchment min-h-screen pt-40 pb-20 px-8">
      <div className="max-w-7xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-stone-500 hover:text-ink transition-colors mb-8 group">
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          Back to Queue
        </button>

        <header className="mb-12">
          <h1 className="text-5xl text-ink leading-none mb-4">
            Verification{' '}
            <span className="text-stone-300 font-mono text-2xl not-italic tracking-normal">
              {bountyPda.toBase58().slice(0, 8)}…
            </span>
          </h1>
          <p className="text-stone-500 max-w-2xl leading-relaxed">
            Review the AI-generated translation against the original source text. Verify stylistic nuances and ensure context markers have been appropriately addressed.
          </p>
        </header>

        <div className="flex flex-col lg:flex-row gap-6 bg-stone-100 p-3 rounded-[40px]">
          <div className="flex-1 bg-white p-10 rounded-[32px] border border-stone-200/50 shadow-sm">
            <div className="flex justify-between items-center mb-10 pb-4 border-b border-stone-100">
              <h3 className="text-xl">Original Source</h3>
              <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">Japanese</span>
            </div>

            <p className="text-2xl leading-[2] text-ink font-light">
              彼はその会議で、
              <span className="px-3 py-1 border border-ink rounded-full bg-stone-50 relative group cursor-help ml-1 mr-1">
                空気を読む
                <span className="absolute -top-3 -right-2 bg-ink text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Idiom</span>
              </span>
              ことなく、自らの意見を直言した。その結果、周囲の
              <span className="px-3 py-1 border border-ink rounded-full bg-stone-50 relative group cursor-help ml-1 mr-1">
                建前
                <span className="absolute -top-3 -right-2 bg-ink text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Cultural</span>
              </span>
              に覆われた沈黙を破ることとなった。
            </p>
          </div>

          <div className="flex-1 bg-white p-10 rounded-[32px] border border-stone-200/50 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-center mb-10 pb-4 border-b border-stone-100">
              <h3 className="text-xl flex items-center gap-2">
                <Sparkles size={18} className="text-pale-lavender" />
                Interpreted Output
              </h3>
              <span className="text-xs uppercase tracking-widest text-pale-lavender font-bold flex items-center gap-1">
                <Sparkles size={10} />
                Gemini 1.5 Pro
              </span>
            </div>

            <p className="text-2xl leading-[2] text-ink font-light">
              During the meeting, he spoke his mind bluntly, without
              <span onMouseEnter={() => setHoveredReason('idiom-1')} onMouseLeave={() => setHoveredReason(null)} className={cn('ml-2 mr-1 underline decoration-pale-lavender decoration-4 underline-offset-8 cursor-help transition-all', hoveredReason === 'idiom-1' && 'bg-pale-lavender/20')}>
                trying to read the room
              </span>
              . As a result, he shattered the silence shrouded in the surrounding
              <span onMouseEnter={() => setHoveredReason('cultural-1')} onMouseLeave={() => setHoveredReason(null)} className={cn('ml-2 mr-1 underline decoration-pale-lavender decoration-4 underline-offset-8 cursor-help transition-all', hoveredReason === 'cultural-1' && 'bg-pale-lavender/20')}>
                polite facade
              </span>
              .
            </p>

            {hoveredReason && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-[60%] left-1/2 -translate-x-1/2 w-[80%] bg-ink text-stone-300 p-6 rounded-2xl shadow-2xl z-50 border border-white/10"
              >
                <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                  <BrainCircuit size={16} className="text-pale-lavender" />
                  <span className="text-[10px] uppercase font-bold tracking-widest text-white">Reasoning Trace</span>
                </div>
                <div className="font-mono text-xs space-y-2">
                  <div className="flex gap-4">
                    <span className="text-stone-500">TAG:</span>
                    <span className="text-pale-lavender">{mockReasoning.find((r) => r.id === hoveredReason)?.tag}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-stone-500">SOURCE:</span>
                    <span>{mockReasoning.find((r) => r.id === hoveredReason)?.source}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-stone-500">DECISION:</span>
                    <span className="text-white italic">&ldquo;{mockReasoning.find((r) => r.id === hoveredReason)?.decision}&rdquo;</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-between items-center">
          <button
            onClick={handleClaim}
            className="px-8 py-4 bg-pale-lavender text-ink rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <CheckCircle size={18} />
            Claim Job
          </button>
          <button
            onClick={handleDispute}
            disabled={disputing}
            className="px-8 py-4 border border-red-400 text-red-600 rounded-xl font-medium flex items-center gap-2 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <AlertTriangle size={18} />
            {disputing ? 'Filing Dispute…' : 'Dispute Translation'}
          </button>
        </div>
      </div>
    </div>
  );
}