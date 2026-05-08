/**
 * Irys Sponsor Relayer
 *
 * Receives a raw .mdh string from the client and sponsors the Arweave
 * upload fee using the platform's server-side Irys node. Users never need to
 * fund an Irys account or hold AR/SOL for storage — the platform covers the
 * fraction-of-a-cent cost per upload.
 *
 * Endpoint: POST /sponsor-upload
 *   Content-Type: text/plain
 *   X-Uploader-Address: <wallet pubkey>
 *   Body: raw .mdh string
 *
 * Returns: { id: string } — the Irys transaction ID
 */

import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import Irys from '@irys/sdk';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.text({ type: 'text/plain', limit: '10mb' }));

// ─── Irys node (singleton, lazily initialized) ───────────────────────────────

let irysNode: Irys | null = null;

async function getIrysNode(): Promise<Irys> {
  if (irysNode) return irysNode;

  const privateKey = process.env.IRYS_PRIVATE_KEY;
  const rpcUrl = process.env.SOLANA_RPC_URL;

  if (!privateKey) throw new Error('IRYS_PRIVATE_KEY env var is required');
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL env var is required');

  const node = new Irys({
    url: process.env.IRYS_NODE_URL ?? 'https://devnet.irys.xyz',
    token: 'solana',
    key: privateKey,
    config: { providerUrl: rpcUrl },
  });

  await node.ready();
  irysNode = node;
  return node;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /sponsor-upload
 *
 * Accepts a raw .mdh string body (Content-Type: text/plain).
 * Uploader wallet address is passed via the X-Uploader-Address header.
 *
 * Returns: { id: string } — the Irys transaction ID, used as
 *   `original_tx_id` or `translated_tx_id` in Solana program instructions.
 */
app.post('/sponsor-upload', async (req: Request, res: Response) => {
  try {
    const mdhContent = req.body as string;
    const uploaderAddress = req.headers['x-uploader-address'] as string | undefined;

    if (!mdhContent || typeof mdhContent !== 'string') {
      res.status(400).json({ error: 'Request body must be a non-empty text/plain .mdh string' });
      return;
    }
    if (!uploaderAddress) {
      res.status(400).json({ error: 'X-Uploader-Address header is required' });
      return;
    }

    const tags = [
      { name: 'Content-Type', value: 'text/plain' },
      { name: 'Content-Format', value: 'mdh' },
      { name: 'App-Name', value: 'Interpretooor' },
      { name: 'Uploader', value: uploaderAddress },
    ];

    const node = await getIrysNode();

    const dataBuffer = Buffer.from(mdhContent, 'utf-8');
    const price = await node.getPrice(dataBuffer.byteLength);
    const balance = await node.getLoadedBalance();

    if (balance.isLessThan(price)) {
      console.log(`[irys-relayer] Topping up. Required: ${price}, Balance: ${balance}`);
      await node.fund(price.minus(balance).multipliedBy(1.1).integerValue());
    }

    const receipt = await node.upload(dataBuffer, { tags });

    console.log(`[irys-relayer] Sponsored upload for ${uploaderAddress} → ${receipt.id}`);

    res.json({ id: receipt.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[irys-relayer] Upload failed:', message);
    res.status(500).json({ error: message });
  }
});

/** Health check */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = Number.parseInt(process.env.PORT ?? '4001', 10) || 4001;

app.listen(PORT, async () => {
  try {
    if (process.env.IRYS_PRIVATE_KEY && process.env.SOLANA_RPC_URL) {
      await getIrysNode();
      console.log(`[irys-relayer] Irys node ready`);
    } else {
      console.log('[irys-relayer] Skipping Irys pre-warm; missing IRYS_PRIVATE_KEY or SOLANA_RPC_URL');
    }
  } catch (err) {
    console.error('[irys-relayer] Failed to pre-warm Irys node:', err);
  }
  console.log(`[irys-relayer] Listening on port ${PORT}`);
});
