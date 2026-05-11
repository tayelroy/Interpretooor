import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

// Minimal duck-type for the Privy Solana wallet — avoids importing Privy internals.
interface PrivySolanaWallet {
  address: string;
  signMessage(args: { message: Uint8Array }): Promise<{ signature: Uint8Array }>;
  signTransaction(args: { transaction: Uint8Array }): Promise<{ signedTransaction: Uint8Array }>;
}

export interface PrivySolanaAdapter {
  publicKey: PublicKey;
  signMessage(msg: Uint8Array): Promise<Uint8Array>;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

/**
 * Bridges Privy's Wallet Standard interface to the @solana/wallet-adapter shape
 * that Anchor, Umi, and Irys all expect.
 *
 * Key mismatch: Privy's signTransaction expects { transaction: Uint8Array }
 * (Wallet Standard bytes), but Anchor/Umi/Irys hand it a web3.js Transaction.
 * We serialize → sign → deserialize to bridge the gap.
 */
export function createPrivyToSolanaAdapter(wallet: PrivySolanaWallet): PrivySolanaAdapter {
  const adapter: PrivySolanaAdapter = {
    publicKey: new PublicKey(wallet.address),

    signMessage: async (msg: Uint8Array) => {
      const result = await wallet.signMessage({ message: msg });
      return result.signature;
    },

    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      const isVersioned = 'version' in tx;
      console.log('[privy-adapter] signTransaction called. isVersioned:', isVersioned);
      try {
        const serialized: Uint8Array = isVersioned
          ? (tx as VersionedTransaction).serialize()
          : (tx as Transaction).serialize({ requireAllSignatures: false });

        console.log('[privy-adapter] calling wallet.signTransaction...');
        const { signedTransaction } = await wallet.signTransaction({ transaction: serialized });
        console.log('[privy-adapter] wallet.signTransaction returned successfully. Length:', signedTransaction.length);

        const deserialized = isVersioned
          ? VersionedTransaction.deserialize(signedTransaction)
          : Transaction.from(signedTransaction);
        console.log('[privy-adapter] successfully deserialized signed tx');
        return deserialized as T;
      } catch (err) {
        console.error('[privy-adapter] error in signTransaction:', err);
        throw err;
      }
    },

    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      return Promise.all(txs.map((tx) => adapter.signTransaction(tx)));
    },
  };

  return adapter;
}
