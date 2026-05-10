'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

// ssr: false prevents Privy from initialising during server-side prerendering.
// Client Components are the only place where next/dynamic ssr:false is allowed.
const Providers = dynamic(() => import('./providers'), { ssr: false });

export default function ClientProviders({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
