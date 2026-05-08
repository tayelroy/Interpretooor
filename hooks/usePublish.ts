import { useCallback, useMemo, useState } from 'react';
import type { LexicalEditor } from 'lexical';
import { useWallets } from '@privy-io/react-auth/solana';
import { Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import { createPrivyToSolanaAdapter } from '@/lib/solana/privy-adapter';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createSignerFromWalletAdapter } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { generateSigner, signerIdentity } from '@metaplex-foundation/umi';
import { createV2, mplCore } from '@metaplex-foundation/mpl-core';
import { Buffer } from 'buffer';
import { serialiseLexicalToMdh } from '@/lib/mdh-lexical-bridge';

type UsePublishParams = {
  authorPubkey: string;
  editor: LexicalEditor | null;
  sourceLanguage: string;
  title: string;
};

export function usePublish({ authorPubkey, editor, sourceLanguage, title }: UsePublishParams) {
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
      if (typeof window !== 'undefined') {
        (window as any).Buffer = (window as any).Buffer || Buffer;
      }

      const activeWallet = solanaWallets[0];
      if (!activeWallet) throw new Error('No Privy Solana wallet connected. Please sign in.');

      console.log('🟢 4. Building Privy shim for wallet:', activeWallet.address);
      const adapterShim = createPrivyToSolanaAdapter(activeWallet);

      // ── Serialise editor → .mdh ───────────────────────────────────────────
      const mdhContent = serialiseLexicalToMdh(editor);
      if (!mdhContent) throw new Error('Editor is empty — write something before publishing.');

      // ── Upload raw .mdh via the backend relayer ───────────────────────────
      console.log('🟢 5. Uploading .mdh to Irys via relayer...');
      const uploadRes = await fetch(
        `${process.env.NEXT_PUBLIC_RELAYER_URL}/sponsor-upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'X-Uploader-Address': activeWallet.address,
          },
          body: mdhContent,
        }
      );

      if (!uploadRes.ok) {
        const { error } = await uploadRes.json();
        throw new Error(`Relayer upload failed: ${error}`);
      }

      const { id: txId } = await uploadRes.json();
      console.log('🟢 7. Irys upload complete:', txId);

      // ── Mint Metaplex Core NFT ────────────────────────────────────────────
      console.log('🟢 8. Initializing Metaplex mint context...');
      const umi = createUmi(process.env.NEXT_PUBLIC_HELIUS_RPC_URL!).use(mplCore());
      const signer = createSignerFromWalletAdapter(adapterShim as any);
      umi.use(signerIdentity(signer));

      const asset = generateSigner(umi);
      console.log('🟢 9. Minting Metaplex asset...');

      const signatureBytes = await createV2(umi, {
        asset,
        authority: umi.identity,
        payer: umi.payer,
        owner: umi.identity.publicKey,
        updateAuthority: umi.identity.publicKey,
        name: title,
        uri: txId,
      }).send(umi);

      const sig = bs58.encode(signatureBytes);
      console.log('🟢 10. Tx sent, polling for confirmation. Signature:', sig);

      const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL!, 'confirmed');
      let confirmed = false;
      for (let attempt = 0; attempt < 30 && !confirmed; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { value } = await connection.getSignatureStatuses([sig]);
        const status = value[0];
        if (
          status &&
          !status.err &&
          (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')
        ) {
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
