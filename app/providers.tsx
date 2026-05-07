"use client";

import { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

function getPrivyAppId(): string {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!privyAppId) {
    throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is required to initialize Privy.");
  }

  return privyAppId;
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={getPrivyAppId()}
      config={{
        appearance: {
          walletList: ["phantom", "solflare", "backpack"],
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}