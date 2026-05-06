import { useCallback, useMemo, useState } from 'react';
import type { LexicalEditor } from 'lexical';
import { useWallet } from '@solana/wallet-adapter-react';
import { WebIrys } from '@irys/sdk';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createSignerFromWalletAdapter } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { generateSigner, signerIdentity } from '@metaplex-foundation/umi';
import { createV2, mplCore } from '@metaplex-foundation/mpl-core';

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
  const { connected, publicKey, wallet } = useWallet();
  const [isPublishing, setIsPublishing] = useState(false);

  const statusText = useMemo(() => {
    if (isPublishing) {
      return 'Publishing...';
    }

    return 'Continue';
  }, [isPublishing]);

  const handlePublish = useCallback(async () => {
    console.log('🟢 3. handlePublish hook executing!');

    if (!editor || typeof window === 'undefined') {
      return null;
    }

    setIsPublishing(true);

    try {
      if (!connected || !wallet || !publicKey) {
        throw new Error('Connect a Solana wallet before publishing.');
      }

      console.log('🟢 4. Initializing Irys from wallet adapter...');

      const irys = await WebIrys.init({
        url: 'https://devnet.irys.xyz',
        token: 'solana',
        provider: wallet.adapter as any,
        providerUrl: 'https://api.devnet.solana.com',
      });

      await irys.ready();

      const content = editor.getEditorState().toJSON();
      const publishedDraft: PublishDocument = {
        content,
        metadata: { authorPubkey: publicKey.toBase58(), sourceLanguage, title },
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      console.log('🟢 5. Uploading draft JSON to Irys...');
      const uploadResponse = await irys.upload(JSON.stringify(publishedDraft), {
        tags: [{ name: 'Content-Type', value: 'application/json' }],
      });

      console.log('🟢 6. Irys upload complete:', uploadResponse.id);

      console.log('🟢 7. Initializing Metaplex mint context...');
      const umi = createUmi('https://api.devnet.solana.com').use(mplCore());

      const signer = createSignerFromWalletAdapter(wallet.adapter);
      umi.use(signerIdentity(signer));

      const asset = generateSigner(umi);
      console.log('🟢 8. Minting Metaplex asset...');
      await createV2(umi, {
        asset,
        authority: umi.identity,
        payer: umi.payer,
        owner: umi.identity.publicKey,
        updateAuthority: umi.identity.publicKey,
        name: title,
        uri: uploadResponse.id,
      }).sendAndConfirm(umi);

      const assetId = asset.publicKey.toString();
      console.log('🟢 9. Metaplex mint successful:', assetId);
      return assetId;
    } catch (error) {
      console.error('🔴 FATAL ERROR inside usePublish:', error);
      return null;
    } finally {
      setIsPublishing(false);
    }
  }, [connected, editor, publicKey, sourceLanguage, title, wallet]);

  return {
    handlePublish,
    isPublishing,
    statusText,
  };
}