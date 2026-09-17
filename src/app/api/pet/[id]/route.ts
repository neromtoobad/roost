import { NextResponse } from 'next/server';
import { dbEnabled, ensureSchema, pool } from '@/lib/db';
import type { Lot, Personality, Launch } from '@/lib/pet-math';

// A Fledgling as a stranger sees it, for the backing page. Public by design — it is the thing you
// send to a friend — so it carries nothing private: no owner hash, no agent id, no wallet.

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!dbEnabled()) return NextResponse.json({ error: 'offline' }, { status: 503 });

  try {
    await ensureSchema();
    const { rows } = await pool().query<{
      id: string; name: string; species: string; ticker: string; personality: Personality;
      adopted_at: Date; streak: number; paper: boolean; launch: Launch | null;
      lots: Lot[] | null; yield_qty: string; lent_qty: string; cash: string;
    }>(
      `select id, name, species, ticker, personality, adopted_at, streak, paper, launch,
              lots, yield_qty, lent_qty, cash
         from pets where id = $1`,
      [id],
    );
    if (!rows.length) return NextResponse.json({ error: 'no such Fledgling' }, { status: 404 });

    const r = rows[0];
    const lots = r.lots ?? [];
    const recent = await pool().query<{ ts: Date; kind: string; body: string }>(
      `select ts, kind, body from pet_entries
        where pet_id = $1 and kind in ('buy','lend','ask','system') order by ts desc limit 5`,
      [id],
    );

    return NextResponse.json({
      id: r.id, name: r.name, species: r.species, ticker: r.ticker, personality: r.personality,
      adoptedAt: r.adopted_at.getTime(), streak: r.streak, paper: r.paper, launch: r.launch,
      qty: lots.reduce((s, l) => s + l.qty, 0) + Number(r.yield_qty),
      basis: lots.reduce((s, l) => s + l.qty * l.price, 0),
      lentQty: Number(r.lent_qty), cash: Number(r.cash),
      recent: recent.rows.map((e) => ({ ts: e.ts.getTime(), kind: e.kind, text: e.body })),
    }, { headers: { 'Cache-Control': 's-maxage=20' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
