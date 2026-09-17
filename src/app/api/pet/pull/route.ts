import { NextResponse } from 'next/server';
import { dbEnabled, ensureSchema, ownerHash, pool } from '@/lib/db';
import type { Entry, Lot, Proposal } from '@/lib/pet-math';

// What the Stockling did while the app was closed.
//
// The hourly worker ticks the server copy, so its watermark can be ahead of the browser's. The
// client pulls before it pushes: if the server is ahead, the worker's result is the truth and the
// browser adopts it, diary and all. If it isn't, the browser stays authoritative and pushes as
// usual. The owner key travels in the body, never in the URL.

type Body = { ownerKey: string; id: string; since?: number };

export async function POST(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: 'no-db' });

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { ownerKey, id, since = 0 } = body;
  if (!ownerKey || ownerKey.length < 16 || !id) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  try {
    await ensureSchema();
    const db = pool();
    const { rows } = await db.query<{
      cash: string; lots: Lot[]; lent_qty: string; yield_qty: string;
      last_tick_at: Date | null; proposal: Proposal | null;
    }>(
      `select cash, lots, lent_qty, yield_qty, last_tick_at, proposal
         from pets where id=$1 and owner_hash=$2`,
      [id, ownerHash(ownerKey)],
    );
    if (!rows.length) return NextResponse.json({ ok: false, reason: 'not-owner' }, { status: 403 });

    const row = rows[0];
    const lastTickAt = row.last_tick_at ? row.last_tick_at.getTime() : 0;
    if (lastTickAt <= since) return NextResponse.json({ ok: true, ahead: false });

    const entries = await db.query<{ ts: Date; kind: string; body: string; qty: string | null; price: string | null; usd: string | null; sig: string | null; paper: boolean | null }>(
      `select ts, kind, body, qty, price, usd, sig, paper
         from pet_entries where pet_id=$1 and ts > $2 order by ts asc limit 200`,
      [id, new Date(since).toISOString()],
    );

    return NextResponse.json({
      ok: true,
      ahead: true,
      pet: {
        cash: Number(row.cash),
        lots: row.lots ?? [],
        lentQty: Number(row.lent_qty),
        yieldQty: Number(row.yield_qty),
        lastTickAt,
        proposal: row.proposal,
      },
      entries: entries.rows.map((e): Entry => ({
        ts: e.ts.getTime(),
        kind: e.kind as Entry['kind'],
        text: e.body,
        ...(e.qty !== null ? { qty: Number(e.qty) } : {}),
        ...(e.price !== null ? { price: Number(e.price) } : {}),
        ...(e.usd !== null ? { usd: Number(e.usd) } : {}),
        ...(e.sig ? { sig: e.sig } : {}),
        paper: e.paper ?? true,
      })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message });
  }
}
