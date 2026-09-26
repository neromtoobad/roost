import { NextResponse } from 'next/server';
import { SPECIES, type Species } from '@/lib/pets';
import { planBuy } from '@/lib/preflight';

// What to sign to feed a Fledgling for real, and whether it would go through.
//
// POST { species, usd, wallet } → { preflight, approval, swap }. The owner's wallet signs
// `approval` (when present) and then `swap`; Roost never signs anything. See lib/preflight.ts for
// the simulation and for the checks a transaction has to pass before it is handed over at all.
//
// Signing only ever happens in the browser, against the wallet the Fledgling is bound to — this
// route just builds. A transaction built for someone else's address is useless to anyone but them.

type Body = { species?: Species['id']; usd?: number; wallet?: string };

export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ error: 'expected a JSON body' }, { status: 400 }); }

  const sp = body.species ? SPECIES[body.species] : undefined;
  if (!sp) return NextResponse.json({ error: 'unknown species' }, { status: 400 });
  if (!/^0x[a-fA-F0-9]{40}$/.test(body.wallet ?? '')) {
    return NextResponse.json({ error: 'a wallet address is required — the transaction is built for it' }, { status: 400 });
  }
  const usd = Number(body.usd);
  if (!Number.isFinite(usd) || usd < 1 || usd > 10_000) {
    return NextResponse.json({ error: 'usd must be between 1 and 10000' }, { status: 400 });
  }

  const plan = await planBuy(sp, Math.round(usd * 100) / 100, body.wallet!);
  // Never cached: a plan is a simulation against this block, and a stale one is a wrong one.
  return NextResponse.json(plan, { headers: { 'Cache-Control': 'no-store' } });
}
