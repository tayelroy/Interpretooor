import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "ws",
    "@coral-xyz/anchor",
    "@irys/sdk",
    "@solana/web3.js",
    "@solana/kit",
  ],
  // @solana/kit-plugin-payer's browser bundle has a spurious `import 'fs'`
  // from the payerFromFile export. Stub it out for the client bundle.
  turbopack: {
    root: path.resolve(__dirname),
    resolveAlias: {
      fs: { browser: "./empty-module.js" },
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    }
    return config;
  },
};

export default nextConfig;
