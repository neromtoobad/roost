import { NextResponse } from 'next/server';
import { chooseIssuer } from '@/lib/issuer';
import { cached } from '@/lib/swr';

// Which token a Fledgling of this stock should hatch from, when two issuers sell it. See lib/issuer.
//
//   /api/issuer?ticker=NVDA                     by the traded price, per share
//   /api/issuer?ticker=NVDA&wallet=0x…&usd=25   by real fills for this wallet at this size
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const ticker = (p.get('ticker') ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(ticker)) return NextResponse.json({ error: 'ticker required' }, { status: 400 });
  const wallet = p.get('wallet') ?? undefined;
  const usd = Number(p.get('usd')) || 25;

  try {
    const choice = await cached(`issuer:${ticker}:${wallet?.toLowerCase() ?? '-'}:${usd}`, () => chooseIssuer(ticker, { wallet, usd }), { fresh: 60_000, stale: 5 * 60_000 });
    if (!choice) return NextResponse.json({ error: `no tokenized listing for ${ticker} on BSC` }, { status: 404 });
    return NextResponse.json(choice, { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
