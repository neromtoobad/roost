import { NextResponse } from 'next/server';
import { dbEnabled, ensureSchema, pool as db } from '@/lib/db';
import { buildBack } from '@/lib/dbc';
import { SPECIES, type Species } from '@/lib/pets';
import type { Launch } from '@/lib/pet-math';

// Build the transaction that backs a Stockling: the backer's home stock in, the pet's token out.
//
// The caller names the Stockling, not the pool — the pool address is read from the database. A
// stranger's link can therefore only ever point at the pet it says it points at.

const MAX_BACK = 10_000;

type Body = { id: string; backer: string; amount: number; slippageBps?: number };

export async function POST(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ error: 'offline' }, { status: 503 });

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { id, backer, amount, slippageBps } = body;
  if (!id || !backer) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_BACK) {
    return NextResponse.json({ error: `Back between 0 and ${MAX_BACK}.` }, { status: 400 });
  }

  try {
    await ensureSchema();
    const { rows } = await db().query<{ species: string; launch: Launch | null; name: string }>(
      `select species, launch, name from pets where id = $1`, [id],
    );
    if (!rows.length) return NextResponse.json({ error: 'no such Stockling' }, { status: 404 });

    const { species, launch, name } = rows[0];
    if (!launch?.pool) return NextResponse.json({ error: `${name} has not gone public yet.` }, { status: 409 });

    const sp = SPECIES[species as Species['id']];
    if (!sp) return NextResponse.json({ error: 'unknown species' }, { status: 400 });

    const built = await buildBack({
      pool: launch.pool, backer, amount,
      quoteDecimals: sp.quoteMint ? sp.holdDecimals : 6,
      slippageBps,
    });
    return NextResponse.json({ ...built, quoteTicker: sp.quoteMint ? sp.ticker : 'USDC' });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
