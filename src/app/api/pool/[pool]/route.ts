import { NextResponse } from 'next/server';
import { poolState, backers } from '@/lib/dbc';
import { SPECIES, USDC, type Species } from '@/lib/pets';

// Live state of a Stockling's bonding curve: how far along it is, what it costs, and how much of
// the home stock its backers have already paid it.

export async function GET(req: Request, { params }: { params: Promise<{ pool: string }> }) {
  const { pool } = await params;
  const id = new URL(req.url).searchParams.get('species') as Species['id'] | null;
  const sp = id ? SPECIES[id] : null;
  if (!sp) return NextResponse.json({ error: 'unknown species' }, { status: 400 });

  // Quoted in the home stock when it has one on-chain, otherwise USDC — the same choice /api/launch makes.
  const quoteDecimals = sp.quoteMint ? sp.holdDecimals : 6;
  const quoteTicker = sp.quoteMint ? sp.ticker : 'USDC';

  try {
    const state = await poolState(pool, quoteDecimals);
    return NextResponse.json(
      { ...state, quoteTicker, quoteDecimals, backers: await backers(state.baseMint) },
      { headers: { 'Cache-Control': 's-maxage=20' } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, quoteTicker, quoteMint: sp.quoteMint ?? USDC }, { status: 502 });
  }
}
