import { runEngine } from './engine';
import { fetchBars } from './bars';
import { SPECIES, type Species } from './pets';
import type { Bar } from './strategy';
import type { Entry, Lot, PetState, Personality, Proposal } from './pet-math';
import { isDue, kept, type Schedule } from './care';
import { ensureSchema, pool } from './pg';
import { settleDuels } from './duels';

// One hour of the world happening to every Fledgling at once.
//
// This is the same deterministic engine the browser runs, pointed at Postgres instead of
// localStorage, so a pet behaves identically whether or not its owner has the app open. Called by
// the Railway cron service every hour, and by /api/tick on demand.

export type TickSummary = { at: number; pets: number; acted: number; waiting: number; fedOnSchedule: number; lines: string[] };

type Row = {
  id: string; species: string; ticker: string; token_address: string | null; name: string; personality: Personality;
  adopted_at: Date; streak: number; cash: string; lots: Lot[] | null;
  lent_qty: string; yield_qty: string; last_tick_at: Date | null;
  agent_id: string | null; wallet: string | null; proposal: Proposal | null; schedule: Schedule | null;
};

export async function runTick(now = Date.now()): Promise<TickSummary> {
  await ensureSchema();
  const db = pool();
  const lines: string[] = [];

  const { rows } = await db.query<Row>(
    `select id, species, ticker, token_address, name, personality, adopted_at, streak, cash, lots,
            lent_qty, yield_qty, last_tick_at, agent_id, wallet, proposal, schedule
       from pets order by updated_at desc limit 500`,
  );

  // The stock a row holds: its own token, or its species' signature stock.
  const stockKey = (r: Row) => (r.token_address ?? SPECIES[r.species as Species['id']]?.address ?? '').toLowerCase();

  // One fetch per stock, not per pet.
  const bars = new Map<string, Bar[]>();
  for (const r of rows) {
    const key = stockKey(r);
    if (!key || bars.has(key)) continue;
    const { bars: b, source } = await fetchBars({ ticker: r.ticker, address: key as `0x${string}` });
    bars.set(key, b);
    lines.push(`${r.ticker}: ${b.length} bars (${source})`);
  }

  let acted = 0, waiting = 0, fedOnSchedule = 0;
  for (const r of rows) {
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
      proposal: r.proposal,
      ...(r.schedule ? { schedule: r.schedule } : {}),
      ...(r.agent_id ? { agentId: r.agent_id } : {}),
      ...(r.wallet ? { wallet: r.wallet } : {}),
    };

    // A paper pet's feeding day is kept here, with nobody watching — the owner's standing
    // instruction, not the pet deciding. A live pet's is left due: only its owner can sign, and the
    // app and the Agentic Wallet both see it. Missed days are passed over, never stacked up.
    const fedToday: Entry[] = [];
    if (!r.wallet && r.schedule && isDue(r.schedule, now)) {
      const usd = r.schedule.usd;
      pet.schedule = kept(r.schedule, now);
      pet.cash += usd;
      fedToday.push({ ts: now, kind: 'feed', text: `Feeding day: $${usd}, on schedule (paper). Kept ${pet.schedule.kept} so far.`, usd, paper: true });
      fedOnSchedule++;
      lines.push(`${r.name} (${r.ticker}): fed $${usd} on schedule`);
    }

    // A pet holding an open question waits for its owner — the rule that matters most is the one
    // that still applies when nobody is watching. A feeding day still lands, and moves the
    // watermark, so the browser adopts it rather than pushing an older state over it.
    const b = bars.get(stockKey(r));
    if (r.proposal || !b?.length) {
      if (r.proposal) waiting++;
      if (fedToday.length) await write(r.id, { ...pet, lastTickAt: now }, fedToday);
      continue;
    }

    const res = runEngine(pet, b, now);
    const fresh = [...fedToday, ...res.fresh];
    if (!fresh.length && res.pet.lastTickAt === pet.lastTickAt) continue;

    await write(r.id, res.pet, fresh);
    if (res.fresh.length) {
      acted++;
      for (const e of res.fresh) lines.push(`${r.name} (${r.species}): ${e.kind} — ${e.text}`);
    }
  }

  // Duels end on the hour they were due, whether or not either owner is around to watch.
  lines.push(...await settleDuels(now));

  return { at: now, pets: rows.length, acted, waiting, fedOnSchedule, lines };
}

/** Only the engine-owned columns. Name, streak and feeding belong to the browser. */
async function write(id: string, pet: PetState, fresh: Entry[]) {
  const db = pool();
  await db.query(
    `update pets set cash=$2, lots=$3::jsonb, lent_qty=$4, yield_qty=$5, last_tick_at=$6,
                     proposal=$7::jsonb, schedule=$8::jsonb, updated_at=now()
       where id=$1`,
    [id, pet.cash, JSON.stringify(pet.lots), pet.lentQty, pet.yieldQty,
     new Date(pet.lastTickAt).toISOString(), pet.proposal ? JSON.stringify(pet.proposal) : null,
     pet.schedule ? JSON.stringify(pet.schedule) : null],
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
