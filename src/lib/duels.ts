import { pool } from './pg';
import { pricesFor } from './quote';

// Duels: two Stocklings, 24 hours, best percentage move wins.
//
// Neither owner trades — the pets do. Both portfolios are valued at the challenge and again at the
// bell, and both numbers are stored, so the result can be checked afterwards rather than believed.

export const DUEL_MS = 24 * 3600e3;

export type Duel = {
  id: string; a: string; b: string; startedAt: number; endsAt: number;
  aName: string; bName: string; aSpecies: string; bSpecies: string;
  aValue: number; bValue: number;
  aNow: number | null; bNow: number | null;
  winner: string | null; settledAt: number | null;
};

type ValueRow = { id: string; ticker: string; cash: string; held_qty: string; cost_basis: string };

/** Live portfolio value per pet: idle cash plus what it holds, marked at the exchange print. */
export async function valueOf(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;

  const { rows } = await pool().query<ValueRow>(
    `select p.id, p.ticker, p.cash,
            coalesce((select sum((l->>'qty')::numeric) from jsonb_array_elements(p.lots) l), 0) + p.yield_qty as held_qty,
            coalesce((select sum((l->>'qty')::numeric * (l->>'price')::numeric) from jsonb_array_elements(p.lots) l), 0) as cost_basis
       from pets p where p.id = any($1::uuid[])`,
    [ids],
  );

  const prices = await pricesFor(rows.map((r) => r.ticker));
  for (const r of rows) {
    const px = prices[r.ticker];
    const held = Number(r.held_qty) || 0;
    // No print available: fall back to what it paid, so a duel is never blocked by a quiet feed.
    const marked = px ? held * px : Number(r.cost_basis) || 0;
    out.set(r.id, Number(r.cash) + marked);
  }
  return out;
}

/** A pet can only be in one duel at a time — otherwise "best 24 hours" means nothing. */
export async function inDuel(ids: string[]): Promise<Set<string>> {
  const { rows } = await pool().query<{ a: string; b: string }>(
    `select a, b from duels where settled_at is null and (a = any($1::uuid[]) or b = any($1::uuid[]))`,
    [ids],
  );
  return new Set(rows.flatMap((r) => [r.a, r.b]));
}

export async function challenge(a: string, b: string): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (a === b) return { ok: false, reason: 'A Stockling cannot duel itself.' };

  const busy = await inDuel([a, b]);
  if (busy.has(a)) return { ok: false, reason: 'Yours is already in a duel.' };
  if (busy.has(b)) return { ok: false, reason: 'That one is already in a duel.' };

  const values = await valueOf([a, b]);
  const av = values.get(a), bv = values.get(b);
  if (av === undefined || bv === undefined) return { ok: false, reason: 'Unknown Stockling.' };
  if (av <= 0 || bv <= 0) return { ok: false, reason: 'Both need something to put on the line. Feed yours first.' };

  const { rows } = await pool().query<{ id: string }>(
    `insert into duels (a, b, ends_at, a_value, b_value)
     values ($1, $2, now() + interval '24 hours', $3, $4) returning id`,
    [a, b, av, bv],
  );
  return { ok: true, id: rows[0].id };
}

/** Close every duel past its bell. Called from the hourly tick. */
export async function settleDuels(now = Date.now()): Promise<string[]> {
  const db = pool();
  const { rows } = await db.query<{ id: string; a: string; b: string; a_value: string; b_value: string; a_name: string; b_name: string }>(
    `select d.id, d.a, d.b, d.a_value, d.b_value, pa.name as a_name, pb.name as b_name
       from duels d join pets pa on pa.id = d.a join pets pb on pb.id = d.b
      where d.settled_at is null and d.ends_at <= $1`,
    [new Date(now).toISOString()],
  );
  if (!rows.length) return [];

  const values = await valueOf(rows.flatMap((r) => [r.a, r.b]));
  const lines: string[] = [];

  for (const d of rows) {
    const aFinal = values.get(d.a) ?? Number(d.a_value);
    const bFinal = values.get(d.b) ?? Number(d.b_value);
    const pct = (final: number, start: number) => (start > 0 ? ((final - start) / start) * 100 : 0);
    const aPct = pct(aFinal, Number(d.a_value));
    const bPct = pct(bFinal, Number(d.b_value));
    const winner = aPct === bPct ? null : aPct > bPct ? d.a : d.b;

    await db.query(
      `update duels set a_final=$2, b_final=$3, winner=$4, settled_at=$5 where id=$1`,
      [d.id, aFinal, bFinal, winner, new Date(now).toISOString()],
    );

    const say = (self: string, selfPct: number, rival: string, rivalPct: number) =>
      winner === null
        ? `Dead heat with ${rival} over 24 hours. Both ${selfPct.toFixed(2)}%.`
        : `${selfPct > rivalPct ? 'Beat' : 'Lost to'} ${rival} over 24 hours — ${selfPct.toFixed(2)}% against ${rivalPct.toFixed(2)}%.`;

    for (const [id, text] of [
      [d.a, say(d.a_name, aPct, d.b_name, bPct)],
      [d.b, say(d.b_name, bPct, d.a_name, aPct)],
    ] as const) {
      await db.query(
        `insert into pet_entries (pet_id, ts, kind, body, paper)
         values ($1, $2, 'system', $3, true) on conflict (pet_id, ts, kind) do nothing`,
        [id, new Date(now).toISOString(), text],
      );
    }
    lines.push(`duel ${d.a_name} vs ${d.b_name}: ${aPct.toFixed(2)}% / ${bPct.toFixed(2)}%`);
  }
  return lines;
}

/** Open duels marked live, plus the last few results. */
export async function listDuels(limit = 12): Promise<Duel[]> {
  const { rows } = await pool().query<{
    id: string; a: string; b: string; started_at: Date; ends_at: Date;
    a_value: string; b_value: string; a_final: string | null; b_final: string | null;
    winner: string | null; settled_at: Date | null; a_name: string; b_name: string;
    a_species: string; b_species: string;
  }>(
    `select d.*, pa.name as a_name, pb.name as b_name, pa.species as a_species, pb.species as b_species
       from duels d join pets pa on pa.id = d.a join pets pb on pb.id = d.b
      order by (d.settled_at is null) desc, coalesce(d.settled_at, d.started_at) desc
      limit $1`,
    [limit],
  );
  if (!rows.length) return [];

  const live = rows.filter((r) => !r.settled_at);
  const values = live.length ? await valueOf(live.flatMap((r) => [r.a, r.b])) : new Map<string, number>();

  return rows.map((r) => ({
    id: r.id, a: r.a, b: r.b,
    startedAt: r.started_at.getTime(), endsAt: r.ends_at.getTime(),
    aName: r.a_name, bName: r.b_name, aSpecies: r.a_species, bSpecies: r.b_species,
    aValue: Number(r.a_value), bValue: Number(r.b_value),
    aNow: r.a_final !== null ? Number(r.a_final) : values.get(r.a) ?? null,
    bNow: r.b_final !== null ? Number(r.b_final) : values.get(r.b) ?? null,
    winner: r.winner, settledAt: r.settled_at ? r.settled_at.getTime() : null,
  }));
}
