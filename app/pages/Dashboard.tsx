import { motion } from 'motion/react';
import { ArrowRight, BadgeCheck, Languages } from 'lucide-react';

interface Job {
  id: string;
  source: string;
  target: string;
  reward: number;
  preview: string;
  timestamp: string;
}

export default function Dashboard({ onJobSelect }: { onJobSelect: (id: string) => void }) {
  const pendingJobs: Job[] = [
    { id: 'TR-8924', source: 'Japanese', target: 'English', reward: 0.8, preview: '明日の会議での「空気を読む」姿勢が問われています。直接的すぎる表現は避け...', timestamp: '2 mins ago' },
    { id: 'TR-8925', source: 'French', target: 'English', reward: 1.2, preview: 'Protocol requirements dictate that all validator nodes must maintain an uptime...', timestamp: '12 mins ago' },
    { id: 'TR-8926', source: 'Spanish', target: 'English', reward: 0.5, preview: 'The new decentralized exchange features automated market making algorithms...', timestamp: '1 hour ago' },
    { id: 'TR-8927', source: 'Korean', target: 'English', reward: 1.5, preview: 'Analysis of recent on-chain data suggests a significant shift in liquidity...', timestamp: '3 hours ago' },
  ];

  return (
    <div className="bg-parchment min-h-screen pt-40 pb-20 px-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 flex justify-between items-end">
          <div>
            <h1 className="text-5xl text-ink leading-none mb-4">Pending Jobs</h1>
            <div className="h-1 w-24 bg-pale-lavender" />
          </div>
          <div className="flex gap-4">
            <div className="px-6 py-2 bg-white rounded-full border border-stone-200 text-stone-500 text-sm flex items-center gap-2">
              <BadgeCheck size={16} />
              Validator Verified
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pendingJobs.map((job, i) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-[32px] p-8 border border-stone-200/60 shadow-sm hover:shadow-md transition-all group flex flex-col h-full"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-stone-100 text-stone-900 border border-stone-200">
                  <Languages size={14} />
                  <span className="text-xs font-semibold uppercase tracking-wider">{job.source}</span>
                  <ArrowRight size={12} className="text-stone-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider">{job.target}</span>
                </div>
                <div className="flex items-center gap-1 text-ink font-bold text-lg">
                  <span>{job.reward.toFixed(2)}</span>
                  <span className="text-stone-400 text-sm font-normal">USDC</span>
                </div>
              </div>

              <p className="text-stone-600 mb-8 flex-grow leading-relaxed italic">&ldquo;{job.preview}&rdquo;</p>

              <div className="flex justify-between items-center mt-auto">
                <span className="text-xs text-stone-400 font-medium uppercase tracking-widest">{job.timestamp}</span>
                <button onClick={() => onJobSelect(job.id)} className="px-8 py-3 bg-pale-lavender text-ink rounded-xl font-semibold hover:bg-opacity-80 transition-all active:scale-95">
                  Review
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}