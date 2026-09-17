import { runEngine } from './engine';
import { fetchBars } from './bars';
import { SPECIES, type Species } from './pets';
import type { Bar } from './strategy';
import type { Entry, Lot, PetState, Personality, Proposal } from './pet-math';
import { ensureSchema, pool } from './pg';
import { settleDuels } from './duels';

// One hour of the world happening to every Stockling at once.
//
// This is the same deterministic engine the browser runs, pointed at Postgres instead of
// localStorage, so a pet behaves identically whether or not its owner has the app open. Called by
// the Railway cron service every hour, and by /api/tick on demand.

export type TickSummary = { at: number; pets: number; acted: number; waiting: number; lines: string[] };

type Row = {
  id: string; species: string; name: string; personality: Personality;
  adopted_at: Date; streak: number; cash: string; lots: Lot[] | null;
  lent_qty: string; yield_qty: string; last_tick_at: Date | null;
  agent_id: string | null; wallet: string | null; proposal: Proposal | null;
};

export async function runTick(now = Date.now()): Promise<TickSummary> {
  await ensureSchema();
  const db = pool();
  const lines: string[] = [];

  const { rows } = await db.query<Row>(
    `select id, species, name, personality, adopted_at, streak, cash, lots, lent_qty, yield_qty,
            last_tick_at, agent_id, wallet, proposal
       from pets order by updated_at desc limit 500`,
  );

  // One fetch per stock, not per pet.
  const bars = new Map<string, Bar[]>();
  for (const id of new Set(rows.map((r) => r.species))) {
    if (!SPECIES[id as Species['id']]) continue;
    const { bars: b, source } = await fetchBars(id as Species['id']);
    bars.set(id, b);
    lines.push(`${id}: ${b.length} bars (${source})`);
  }

  let acted = 0, waiting = 0;
  for (const r of rows) {
    // A pet holding an open question waits for its owner. The rule that matters most is the one
    // that still applies when nobody is watching.
    if (r.proposal) { waiting++; continue; }
    const b = bars.get(r.species);
    if (!b?.length) continue;

    const adoptedAt = r.adopted_at.getTime();
    const pet: PetState = {
      species: r.species as Species['id'],
      name: r.name,
      personality: r.personality,
      adoptedAt,
      lastFed: adoptedAt,          // the worker never writes these back; the browser owns them
      streak: r.streak,
      lastVisitDay: '',
      cash: Number(r.cash),
      lots: r.lots ?? [],
      lentQty: Number(r.lent_qty),
      yieldQty: Number(r.yield_qty),
      lastTickAt: r.last_tick_at ? r.last_tick_at.getTime() : adoptedAt,
      diary: [],
      proposal: null,
      ...(r.agent_id ? { agentId: r.agent_id } : {}),
      ...(r.wallet ? { wallet: r.wallet } : {}),
    };

    const res = runEngine(pet, b, now);
    if (!res.fresh.length && res.pet.lastTickAt === pet.lastTickAt) continue;

    await write(r.id, res.pet, res.fresh);
    if (res.fresh.length) {
      acted++;
      for (const e of res.fresh) lines.push(`${r.name} (${r.species}): ${e.kind} — ${e.text}`);
    }
  }

  // Duels end on the hour they were due, whether or not either owner is around to watch.
  lines.push(...await settleDuels(now));

  return { at: now, pets: rows.length, acted, waiting, lines };
}

/** Only the engine-owned columns. Name, streak and feeding belong to the browser. */
async function write(id: string, pet: PetState, fresh: Entry[]) {
  const db = pool();
  await db.query(
    `update pets set cash=$2, lots=$3::jsonb, lent_qty=$4, yield_qty=$5, last_tick_at=$6,
                     proposal=$7::jsonb, updated_at=now()
       where id=$1`,
    [id, pet.cash, JSON.stringify(pet.lots), pet.lentQty, pet.yieldQty,
     new Date(pet.lastTickAt).toISOString(), pet.proposal ? JSON.stringify(pet.proposal) : null],
  );
  if (!fresh.length) return;

  const values: unknown[] = [];
  const tuples = fresh.map((e, i) => {
    const b = i * 9;
    values.push(id, new Date(e.ts).toISOString(), e.kind, e.text, e.qty ?? null, e.price ?? null, e.usd ?? null, e.sig ?? null, e.paper ?? true);
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`;
  });
  await db.query(
    `insert into pet_entries (pet_id, ts, kind, body, qty, price, usd, sig, paper)
     values ${tuples.join(',')} on conflict (pet_id, ts, kind) do nothing`,
    values,
  );
}
