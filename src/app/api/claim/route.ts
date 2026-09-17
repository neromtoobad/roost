import { NextResponse } from 'next/server';
import { dbEnabled, ensureSchema, ownerHash, pool as db } from '@/lib/db';
import { buildClaim } from '@/lib/dbc';
import type { Launch } from '@/lib/pet-math';

// The pet collecting the fees its backers have paid it — real home stock, claimed on-chain.
//
// Only the owner can build this, and only for their own pet. The transaction still has to be
// signed by the wallet that created the pool, so the owner key alone moves nothing; the check is
// here to keep the claim button from being a way to probe other people's pools.

type Body = { ownerKey: string; id: string; creator: string };

export async function POST(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ error: 'offline' }, { status: 503 });

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { ownerKey, id, creator } = body;
  if (!ownerKey || ownerKey.length < 16 || !id || !creator) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  try {
    await ensureSchema();
    const { rows } = await db().query<{ launch: Launch | null }>(
      `select launch from pets where id = $1 and owner_hash = $2`, [id, ownerHash(ownerKey)],
    );
    if (!rows.length) return NextResponse.json({ error: 'not-owner' }, { status: 403 });
    if (!rows[0].launch?.pool) return NextResponse.json({ error: 'not public yet' }, { status: 409 });

    return NextResponse.json(await buildClaim(rows[0].launch.pool, creator));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
