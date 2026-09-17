import { NextResponse } from 'next/server';
import { dbEnabled } from '@/lib/db';
import { runTick } from '@/lib/tick';

// The same hourly tick, on demand — for verifying a deploy and for demoing without waiting for the
// top of the hour. Off unless TICK_SECRET is set, and the secret travels in a header, never a URL.

export async function POST(req: Request) {
  const secret = process.env.TICK_SECRET;
  if (!secret || !dbEnabled()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (req.headers.get('x-tick-secret') !== secret) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    return NextResponse.json(await runTick());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
