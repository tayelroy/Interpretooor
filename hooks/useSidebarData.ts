'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBounty } from './useBounty';

export interface TopTranslator {
  address: string;
  short: string;
  completedCount: number;
  languages: string[];
}

export function useSidebarData() {
  const { fetchAllBounties } = useBounty();
  const [topTranslators, setTopTranslators] = useState<TopTranslator[]>([]);

  const load = useCallback(async () => {
    try {
      const paid = await fetchAllBounties('paid');
      const tally = new Map<string, { count: number; langs: Set<string> }>();
      for (const b of paid) {
        if (!b.translator) continue;
        const addr = b.translator.toBase58();
        const entry = tally.get(addr) ?? { count: 0, langs: new Set() };
        entry.count += 1;
        entry.langs.add(b.targetLanguage);
        tally.set(addr, entry);
      }
      const sorted = [...tally.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3)
        .map(([addr, { count, langs }]) => ({
          address: addr,
          short: addr.slice(0, 4) + '…' + addr.slice(-4),
          completedCount: count,
          languages: [...langs],
        }));
      setTopTranslators(sorted);
    } catch {
      // sidebar data is non-critical — fail silently
    }
  }, [fetchAllBounties]);

  useEffect(() => { load(); }, [load]);

  return { topTranslators };
}
