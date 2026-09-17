import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { dbEnabled, ensureSchema, pool as db } from '@/lib/db';
import { dbc } from '@/lib/dbc';
import { SPECIES, type Species } from '@/lib/pets';
import type { Launch } from '@/lib/pet-math';

// A backer telling us they went through with it, so the owner opens the app to "Someone backed you"
// rather than to silence.
//
// The claim is checked before it is written: the signature has to be a transaction that succeeded
// and that actually touched this pet's pool. Otherwise anyone could post any string and write a
// line into somebody else's diary.

type Body = { id: string; sig: string; amount: number };

export async function POST(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false });

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { id, sig, amount } = body;
  if (!id || !sig || sig.length < 32 || sig.length > 100) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  try {
    await ensureSchema();
    const { rows } = await db().query<{ species: string; launch: Launch | null }>(
      `select species, launch from pets where id = $1`, [id],
    );
    if (!rows.length || !rows[0].launch?.pool) return NextResponse.json({ ok: false, reason: 'not public' });

    const { conn } = dbc();
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    if (!tx) return NextResponse.json({ ok: false, reason: 'transaction not found' });
    if (tx.meta?.err) return NextResponse.json({ ok: false, reason: 'that transaction failed' });

    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
    const poolKey = new PublicKey(rows[0].launch.pool);
    const touchedPool = [...keys.staticAccountKeys, ...(keys.accountKeysFromLookups?.writable ?? []), ...(keys.accountKeysFromLookups?.readonly ?? [])]
      .some((k) => k.equals(poolKey));
    if (!touchedPool) return NextResponse.json({ ok: false, reason: 'that transaction did not touch this pool' });

    const sp = SPECIES[rows[0].species as Species['id']];
    const ticker = sp?.quoteMint ? sp.ticker : 'USDC';
    const size = Number.isFinite(amount) && amount > 0 ? `${amount} ${ticker}` : ticker;

    // Keyed on the signature's block time so a resend is a no-op, like every other diary write.
    const ts = new Date((tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
    await db().query(
      `insert into pet_entries (pet_id, ts, kind, body, sig, paper)
       values ($1, $2, 'system', $3, $4, false) on conflict (pet_id, ts, kind) do nothing`,
      [id, ts, `Someone backed you with ${size}.`, sig],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message });
  }
}
