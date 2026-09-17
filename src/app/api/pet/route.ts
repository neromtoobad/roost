import { NextResponse } from 'next/server';
import { dbEnabled, ensureSchema, ownerHash, pool } from '@/lib/db';

// Mirror a Fledgling into Postgres. The browser posts its owner key here over same-origin HTTPS;
// only the hash is stored, and an update that doesn't match the hash is refused rather than
// silently forking a second pet.

type Body = {
  ownerKey: string;
  pet: {
    id?: string | null; species: string; ticker: string; name: string; personality: string;
    adoptedAt: number; streak: number; cash: number; lots: unknown[]; lentQty: number; yieldQty: number;
    lastTickAt: number; agentId?: string | null; wallet?: string | null; launch?: unknown; proposal?: unknown; paper: boolean;
  };
  entries?: { ts: number; kind: string; text: string; qty?: number | null; price?: number | null; usd?: number | null; sig?: string | null; paper?: boolean }[];
};

export async function POST(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: 'no-db' });

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { ownerKey, pet, entries = [] } = body;
  if (!ownerKey || ownerKey.length < 16 || !pet?.species) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  try {
    await ensureSchema();
    const db = pool();
    const hash = ownerHash(ownerKey);
    const iso = (ms: number) => new Date(ms).toISOString();
    let id = pet.id ?? null;

    if (id) {
      const r = await db.query(
        `update pets set name=$3, personality=$4, streak=$5, cash=$6, lots=$7::jsonb, lent_qty=$8,
                         yield_qty=$9, last_tick_at=$10, agent_id=$11, wallet=$12, launch=$13::jsonb,
                         paper=$14, proposal=$15::jsonb, updated_at=now()
           where id=$1 and owner_hash=$2
             and (last_tick_at is null or last_tick_at <= $10) returning id`,
        [id, hash, pet.name, pet.personality, pet.streak, pet.cash, JSON.stringify(pet.lots), pet.lentQty,
         pet.yieldQty, iso(pet.lastTickAt), pet.agentId ?? null, pet.wallet ?? null,
         pet.launch ? JSON.stringify(pet.launch) : null, pet.paper,
         pet.proposal ? JSON.stringify(pet.proposal) : null],
      );
      if (!r.rowCount) {
        // Either this isn't your pet, or the hourly worker has already ticked past the state the
        // browser is holding. Losing the worker's trades to a stale push would quietly undo the
        // autonomy, so the write is dropped and the client is told to pull instead.
        const own = await db.query(`select 1 from pets where id=$1 and owner_hash=$2`, [id, hash]);
        if (!own.rowCount) return NextResponse.json({ ok: false, reason: 'not-owner' }, { status: 403 });
        return NextResponse.json({ ok: true, id, stale: true });
      }
    } else {
      const r = await db.query(
        `insert into pets (owner_hash, species, ticker, name, personality, adopted_at, streak, cash,
                           lots, lent_qty, yield_qty, last_tick_at, agent_id, wallet, launch, paper, proposal)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15::jsonb,$16,$17::jsonb) returning id`,
        [hash, pet.species, pet.ticker, pet.name, pet.personality, iso(pet.adoptedAt), pet.streak, pet.cash,
         JSON.stringify(pet.lots), pet.lentQty, pet.yieldQty, iso(pet.lastTickAt), pet.agentId ?? null,
         pet.wallet ?? null, pet.launch ? JSON.stringify(pet.launch) : null, pet.paper,
         pet.proposal ? JSON.stringify(pet.proposal) : null],
      );
      id = r.rows[0].id as string;
    }

    if (entries.length) {
      const values: unknown[] = [];
      const tuples = entries.map((e, i) => {
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

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    // The cloud is a mirror; never break the app because it's unreachable.
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 200 });
  }
}
