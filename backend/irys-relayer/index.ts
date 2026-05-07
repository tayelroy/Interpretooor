/**
 * Irys Sponsor Relayer
 *
 * Receives a signed data payload from the client and sponsors the Arweave
 * upload fee using the platform's server-side Irys node. Users never need to
 * fund an Irys account or hold AR/SOL for storage — the platform covers the
 * fraction-of-a-cent cost per upload.
 *
 * Endpoint: POST /sponsor-upload
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import Irys from '@irys/sdk';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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

// ─── Types ───────────────────────────────────────────────────────────────────

interface SponsorUploadBody {
  /** Raw JSON payload to upload (serialized on the client) */
  data: string;
  /** Optional Irys tags e.g. [{ name: 'Content-Type', value: 'application/json' }] */
  tags?: Array<{ name: string; value: string }>;
  /** Wallet address of the uploader — logged for audit purposes */
  uploaderAddress: string;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /sponsor-upload
 *
 * Body: SponsorUploadBody
 * Returns: { id: string } — the Arweave transaction ID
 *
 * The client should:
 *   1. Serialise their document to JSON
 *   2. POST it here with appropriate tags
 *   3. Use the returned `id` as the `original_tx_id` or `translated_tx_id`
 *      passed to the Solana program instructions
 */
app.post('/sponsor-upload', async (req: Request, res: Response) => {
  try {
    const { data, tags = [], uploaderAddress } = req.body as SponsorUploadBody;

    if (!data) {
      res.status(400).json({ error: '`data` field is required' });
      return;
    }
    if (!uploaderAddress) {
      res.status(400).json({ error: '`uploaderAddress` field is required' });
      return;
    }

    const defaultTags = [{ name: 'Content-Type', value: 'application/json' }];
    const allTags = [
      ...defaultTags,
      ...tags,
      { name: 'App-Name', value: 'Interpretooor' },
      { name: 'Uploader', value: uploaderAddress },
    ];

    const node = await getIrysNode();

    // Estimate upload cost and top up if needed
    const dataBuffer = Buffer.from(data, 'utf-8');
    const price = await node.getPrice(dataBuffer.byteLength);
    const balance = await node.getLoadedBalance();

    if (balance.isLessThan(price)) {
      console.log(`Topping up Irys node. Required: ${price}, Balance: ${balance}`);
      await node.fund(price.minus(balance).multipliedBy(1.1).integerValue());
    }

    const receipt = await node.upload(dataBuffer, { tags: allTags });

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

const PORT = process.env.PORT ?? 4001;

app.listen(PORT, async () => {
  // Pre-warm the Irys connection on startup
  try {
    await getIrysNode();
    console.log(`[irys-relayer] Irys node ready`);
  } catch (err) {
    console.error('[irys-relayer] Failed to pre-warm Irys node:', err);
  }
  console.log(`[irys-relayer] Listening on port ${PORT}`);
});
