import { useCallback, useMemo, useState } from 'react';
import type { LexicalEditor } from 'lexical';
import { useWallets } from '@privy-io/react-auth/solana';
import { WebIrys } from '@irys/sdk';
import { Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import { createPrivyToSolanaAdapter } from '@/lib/solana/privy-adapter';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createSignerFromWalletAdapter } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { generateSigner, signerIdentity } from '@metaplex-foundation/umi';
import { createV2, mplCore } from '@metaplex-foundation/mpl-core';
import { Buffer } from 'buffer';

type PublishMetadata = {
  authorPubkey: string;
  sourceLanguage: string;
  title: string;
};

type PublishDocument = {
  content: unknown;
  metadata: PublishMetadata;
  updatedAt: string;
  version: 1;
};

type UsePublishParams = {
  authorPubkey: string;
  editor: LexicalEditor | null;
  sourceLanguage: string;
  title: string;
};

export function usePublish({ authorPubkey, editor, sourceLanguage, title }: UsePublishParams) {
  // THE PRIVY HOOK (Single source of truth)
  const { wallets: solanaWallets } = useWallets();
  const [isPublishing, setIsPublishing] = useState(false);

  const statusText = useMemo(() => {
    if (isPublishing) return 'Publishing...';
    return 'Continue';
  }, [isPublishing]);

  const handlePublish = useCallback(async () => {
    console.log('🟢 3. handlePublish hook executing!');

    if (!editor || typeof window === 'undefined') return null;
    setIsPublishing(true);

    try {
      // 0. The Magic Polyfill
      if (typeof window !== 'undefined') {
        (window as any).Buffer = (window as any).Buffer || Buffer;
      }

      // 1. Get Active Privy Wallet
      const activeWallet = solanaWallets[0];
      if (!activeWallet) {
        throw new Error('No Privy Solana wallet connected. Please sign in.');
      }

      console.log('🟢 4. Building Privy shim for wallet:', activeWallet.address);

      // 2. Bridge Privy's Wallet Standard interface to the adapter shape that
      //    Umi and Irys expect.
      const adapterShim = createPrivyToSolanaAdapter(activeWallet);

      console.log('🟢 5. Initializing Irys from Privy shim...');
      const irys = await WebIrys.init({
        url: 'https://devnet.irys.xyz',
        token: 'solana',
        provider: adapterShim as any,
        providerUrl: process.env.NEXT_PUBLIC_HELIUS_RPC_URL!,
      });

      await irys.ready();

      const content = editor.getEditorState().toJSON();
      const publishedDraft: PublishDocument = {
        content,
        metadata: { authorPubkey: activeWallet.address, sourceLanguage, title },
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      console.log('🟢 6. Uploading draft JSON to Irys...');
      const uploadResponse = await irys.upload(JSON.stringify(publishedDraft), {
        tags: [{ name: 'Content-Type', value: 'application/json' }],
      });

      console.log('🟢 7. Irys upload complete:', uploadResponse.id);

      console.log('🟢 8. Initializing Metaplex mint context...');
      const umi = createUmi(process.env.NEXT_PUBLIC_HELIUS_RPC_URL!).use(mplCore());

      // Pass our shim directly to Umi
      const signer = createSignerFromWalletAdapter(adapterShim as any);
      umi.use(signerIdentity(signer));

      const asset = generateSigner(umi);
      console.log('🟢 9. Minting Metaplex asset...');

      // sendAndConfirm uses WebSocket for confirmation, which the public devnet
      // RPC doesn't support reliably. We send the tx and poll via HTTP instead.
      const signatureBytes = await createV2(umi, {
        asset,
        authority: umi.identity,
        payer: umi.payer,
        owner: umi.identity.publicKey,
        updateAuthority: umi.identity.publicKey,
        name: title,
        uri: uploadResponse.id,
      }).send(umi);

      const sig = bs58.encode(signatureBytes);
      console.log('🟢 10. Tx sent, polling for confirmation. Signature:', sig);

      const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL!, 'confirmed');
      let confirmed = false;
      for (let attempt = 0; attempt < 30 && !confirmed; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { value } = await connection.getSignatureStatuses([sig]);
        const status = value[0];
        if (status && !status.err && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
          confirmed = true;
        }
      }

      if (!confirmed) throw new Error(`Transaction ${sig} not confirmed after 60s`);

      const assetId = asset.publicKey.toString();
      console.log('🟢 11. Metaplex mint confirmed:', assetId);
      return assetId;
    } catch (error) {
      console.error('🔴 FATAL ERROR inside usePublish:', error);
      return null;
    } finally {
      setIsPublishing(false);
    }
  }, [editor, solanaWallets, sourceLanguage, title]);

  return { handlePublish, isPublishing, statusText };
}