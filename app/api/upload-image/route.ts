import { NextResponse } from 'next/server';
import Irys from '@irys/sdk';

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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Image exceeds 5 MB limit' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const node = await getIrysNode();

    const price = await node.getPrice(buffer.byteLength);
    const balance = await node.getLoadedBalance();
    if (balance.isLessThan(price)) {
      await node.fund(price.minus(balance).multipliedBy(1.1).integerValue());
    }

    const tags = [
      { name: 'Content-Type', value: file.type },
      { name: 'App-Name', value: 'Interpretooor' },
      { name: 'File-Name', value: file.name },
    ];

    const receipt = await node.upload(buffer, { tags });

    const gatewayBase = process.env.IRYS_NODE_URL?.includes('devnet')
      ? 'https://gateway.irys.xyz'
      : 'https://arweave.net';

    return NextResponse.json({ url: `${gatewayBase}/${receipt.id}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[upload-image] Failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
