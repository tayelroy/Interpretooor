import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

/**
 * POST /api/validate/hash
 *
 * Computes a deterministic SHA-256 hash of the validator's assessment data.
 * Running this server-side guarantees consistent serialization regardless of
 * client-side JSON stringification quirks.
 *
 * Body: { bountyPda: string, validatorPubkey: string, tagDecisions: TagDecision[], approve: boolean }
 * Returns: { hash: number[] }  — 32-element byte array compatible with Anchor's [u8; 32]
 */
export async function POST(request: Request) {
  const body = await request.json();

  if (!body.bountyPda || typeof body.approve !== 'boolean') {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Sort keys for canonical, deterministic serialization
  const canonical = JSON.stringify(body, Object.keys(body).sort());
  const hash = createHash('sha256').update(canonical).digest();

  return NextResponse.json({ hash: Array.from(hash) });
}
