import { NextResponse } from 'next/server';
import { dbEnabled, ensureSchema, pool } from '@/lib/db';
import { nyseSession } from '@/lib/session';
import { pricesFor } from '@/lib/quote';
import { ALL_SPECIES } from '@/lib/pets';
import { cached } from '@/lib/swr';

// Ranked by real, unrealised P&L: quantity and cost basis come from the database, and the live
// price per ticker is applied here. Nothing in the ranking is self-reported.
//
// Served through lib/swr: the last board at once, refreshed after the response. A pet syncing
// clears it (api/pet), so your own feed shows on the next load rather than fifteen seconds later.

export async function GET() {
  if (!dbEnabled()) return NextResponse.json({ rows: [], pulse: null, cloud: false });

  try {
    return NextResponse.json(await cached('leaderboard', board), { headers: { 'Cache-Control': 's-maxage=30' } });
  } catch {
    return NextResponse.json({ rows: [], pulse: null, cloud: false });
  }
}

async function board() {
  await ensureSchema();
  // Three independent reads, so none waits on another: the two queries cross to the database's
  // region, and every pet's ticker is one of the six, so the prices need not wait for the rows.
  const [{ rows }, acts, prices] = await Promise.all([
    pool().query<{
      id: string; name: string; species: string; ticker: string; personality: string;
      streak: number; paper: boolean; is_public: boolean; held_qty: string; cost_basis: string; lent_qty: string;
    }>(
      `select p.id, p.name, p.species, p.ticker, p.personality, p.streak, p.paper,
              (p.launch is not null) as is_public,
              coalesce((select sum((l->>'qty')::numeric) from jsonb_array_elements(p.lots) l), 0) + p.yield_qty as held_qty,
              coalesce((select sum((l->>'qty')::numeric * (l->>'price')::numeric) from jsonb_array_elements(p.lots) l), 0) as cost_basis,
              p.lent_qty
         from pets p
        order by p.updated_at desc
        limit 100`,
    ),
    // Proof the pets act on their own: how much happened in the last day, and how much of it
    // happened while the NYSE was shut and nobody could have pressed a button.
    pool().query<{ ts: Date }>(
      `select ts from pet_entries
        where ts > now() - interval '24 hours' and kind in ('buy','lend','ask')
        order by ts desc limit 1000`,
    ),
    pricesFor(ALL_SPECIES.map((s) => s.ticker)),
  ]);
  const pulse = {
    actions: acts.rows.length,
    afterHours: acts.rows.filter((a) => nyseSession(a.ts) !== 'regular').length,
  };

  const ranked = rows
    .map((r) => {
      const px = prices[r.ticker] ?? null;
      const qty = Number(r.held_qty) || 0;
      const basis = Number(r.cost_basis) || 0;
      const value = px ? qty * px : null;
      const abs = value !== null ? value - basis : null;
      return {
        id: r.id, name: r.name, species: r.species, ticker: r.ticker, personality: r.personality,
        streak: r.streak, paper: r.paper, isPublic: r.is_public,
        qty, basis, value, price: px,
        pnlAbs: abs, pnlPct: abs !== null && basis > 0 ? (abs / basis) * 100 : null,
        lentQty: Number(r.lent_qty) || 0,
      };
    })
    .filter((r) => r.basis > 0)
    .sort((a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity));

  return { rows: ranked, pulse, cloud: true };
}
