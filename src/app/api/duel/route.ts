import { NextResponse } from 'next/server';
import { dbEnabled, ensureSchema, ownerHash, pool } from '@/lib/db';
import { challenge, listDuels } from '@/lib/duels';

// Challenge a rival, or read the card. You can only put up a Stockling you own: the owner key goes
// in the body, is hashed server-side, and has to match the row.

export async function GET() {
  if (!dbEnabled()) return NextResponse.json({ duels: [] });
  try {
    await ensureSchema();
    return NextResponse.json({ duels: await listDuels() }, { headers: { 'Cache-Control': 's-maxage=15' } });
  } catch {
    return NextResponse.json({ duels: [] });
  }
}

type Body = { ownerKey: string; id: string; rivalId: string };

export async function POST(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: 'The board is offline.' });

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { ownerKey, id, rivalId } = body;
  if (!ownerKey || ownerKey.length < 16 || !id || !rivalId) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  try {
    await ensureSchema();
    const mine = await pool().query(`select 1 from pets where id=$1 and owner_hash=$2`, [id, ownerHash(ownerKey)]);
    if (!mine.rowCount) return NextResponse.json({ ok: false, reason: 'not-owner' }, { status: 403 });

    return NextResponse.json(await challenge(id, rivalId));
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message });
  }
}
