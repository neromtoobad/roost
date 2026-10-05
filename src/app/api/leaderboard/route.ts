import { NextResponse } from 'next/server';
import { dbEnabled, ensureSchema, pool } from '@/lib/db';
import { nyseSession } from '@/lib/session';
import { changesByAddress, pricesByAddress } from '@/lib/quote';
import { stage, type Care, type Schedule } from '@/lib/care';
import { SPECIES, type Species } from '@/lib/pets';
import { cached } from '@/lib/swr';

// Ranked by real, unrealised P&L: quantity and cost basis come from the database, and the live
// price per ticker is applied here. Nothing in the ranking is self-reported. Each row also carries
// today's move on what it holds (the token's 24h change) and its growth from care, so the board can
// rank by the day, by all time, or by care alone.
//
// Served through lib/swr: the last board at once, refreshed after the response. A pet syncing
// clears it (api/pet), so your own feed shows on the next load rather than fifteen seconds later.

export async function GET() {
  if (!dbEnabled()) return NextResponse.json({ rows: [], pulse: null, cloud: false });

  try {
    return NextResponse.json(await cached('leaderboard', board), { headers: { 'Cache-Control': 's-maxage=30' } });
  } catch (e) {
    // An empty board and a broken one look identical from outside; say which in the logs.
    console.error('[board] load failed —', (e as Error).message);
    return NextResponse.json({ rows: [], pulse: null, cloud: false });
  }
}

/** Times one step of a load, so a slow one can say which part was slow. */
function timed<T>(ms: Record<string, number>, label: string, p: Promise<T>): Promise<T> {
  const start = Date.now();
  return p.finally(() => { ms[label] = Date.now() - start; });
}

async function board() {
  const ms: Record<string, number> = {};
  const start = Date.now();
  await timed(ms, 'schema', ensureSchema());
  // The two queries cross to the database's region, so they run together. Prices follow the rows:
  // a pet can hold any of ~450 stocks now, so which prints are needed is only known once they land.
  const [{ rows }, acts] = await Promise.all([
    timed(ms, 'pets', pool().query<{
      id: string; name: string; species: string; ticker: string; token_address: string | null; token_symbol: string | null; personality: string;
      streak: number; paper: boolean; is_public: boolean; held_qty: string; cost_basis: string; lent_qty: string;
      care: Care | null; schedule: Schedule | null;
    }>(
      `select p.id, p.name, p.species, p.ticker, p.token_address, p.token_symbol, p.personality, p.streak, p.paper,
              (p.launch is not null) as is_public,
              coalesce((select sum((l->>'qty')::numeric) from jsonb_array_elements(p.lots) l), 0) + p.yield_qty as held_qty,
              coalesce((select sum((l->>'qty')::numeric * (l->>'price')::numeric) from jsonb_array_elements(p.lots) l), 0) as cost_basis,
              p.lent_qty, p.care, p.schedule
         from pets p
        order by p.updated_at desc
        limit 100`,
    )),
    // Proof the pets act on their own: how much happened in the last day, and how much of it
    // happened while the NYSE was shut and nobody could have pressed a button.
    timed(ms, 'entries', pool().query<{ ts: Date }>(
      `select ts from pet_entries
        where ts > now() - interval '24 hours' and kind in ('buy','lend','ask')
        order by ts desc limit 1000`,
    )),
  ]);
  const addressOf = (r: { species: string; token_address: string | null }) =>
    (r.token_address ?? SPECIES[r.species as Species['id']]?.address ?? '').toLowerCase();
  const prices = await timed(ms, 'prices', pricesByAddress(rows.map(addressOf).filter(Boolean)));
  const changes = await changesByAddress(rows.map(addressOf).filter(Boolean)); // same batch, from cache
  const total = Date.now() - start;
  if (total > 1000) console.log(`[board] slow load ${total}ms — ${Object.entries(ms).map(([k, v]) => `${k} ${v}ms`).join(', ')}`);
  const pulse = {
    actions: acts.rows.length,
    afterHours: acts.rows.filter((a) => nyseSession(a.ts) !== 'regular').length,
  };

  const ranked = rows
    .map((r) => {
      const px = prices[addressOf(r)] ?? null;
      const qty = Number(r.held_qty) || 0;
      const basis = Number(r.cost_basis) || 0;
      const value = px ? qty * px : null;
      const abs = value !== null ? value - basis : null;
      const pct24h = changes[addressOf(r)] ?? null;
      const grown = stage(r.care ?? undefined, r.schedule ?? undefined);
      return {
        id: r.id, name: r.name, species: r.species, ticker: r.ticker, personality: r.personality,
        tokenSymbol: r.token_symbol ?? SPECIES[r.species as Species['id']]?.tokenSymbol ?? null,
        tokenAddress: addressOf(r) || null,
        streak: r.streak, paper: r.paper, isPublic: r.is_public,
        qty, basis, value, price: px,
        pnlAbs: abs, pnlPct: abs !== null && basis > 0 ? (abs / basis) * 100 : null,
        lentQty: Number(r.lent_qty) || 0,
        // Today: the token's 24h move applied to what is held now.
        pct24h, dayAbs: value !== null && pct24h !== null ? value - value / (1 + pct24h / 100) : null,
        growth: { stage: grown.name, points: grown.points },
      };
    })
    .filter((r) => r.basis > 0)
    .sort((a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity));

  return { rows: ranked, pulse, cloud: true };
}
