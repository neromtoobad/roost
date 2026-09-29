import { NextResponse } from 'next/server';
import { fillForStock, resolveStock } from '@/lib/quote';

// What one token would really fetch for this taker, right now — impact and fees included.
//
// The wallet is required rather than optional: Ondo is RFQ and prices against the taker, and
// even on bStock the address changes what routes are offered. Quoting off the zero address
// returns "insufficient liquidity" on the thinner books.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stock = await resolveStock(id);
  if (!stock) return NextResponse.json({ error: 'unknown stock' }, { status: 404 });

  const wallet = new URL(req.url).searchParams.get('wallet') ?? '';
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'a connected wallet address is required to quote' }, { status: 400 });
  }

  const fill = await fillForStock(stock, wallet as `0x${string}`);
  return NextResponse.json(fill, { headers: { 'Cache-Control': 'no-store' } });
}
