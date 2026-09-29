import { NextResponse } from 'next/server';
import { quoteForStock, resolveStock, shareRatio } from '@/lib/quote';

// Price for a Fledgling's stock — a species id for the six signature stocks, or any token address
// — plus the number the product is actually about: how far the token has drifted from the share it
// stands for. See lib/quote.ts for why that needs two sources rather than the two prices the RWA
// row appears to hand you.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stock = await resolveStock(id);
  if (!stock) return NextResponse.json({ error: 'unknown stock' }, { status: 404 });

  const [q, ratio] = await Promise.all([quoteForStock(stock), shareRatio(stock.address)]);
  return NextResponse.json(
    {
      ticker: stock.ticker,
      price: q.price,
      pct24h: q.pct24h,
      source: q.source,
      reference: q.reference,
      spreadPct: q.spreadPct,
      marketStatus: q.marketStatus,
      nextOpenTime: q.nextOpenTime,
      // Shares one token stands for. It rises when a dividend is reinvested; the pet notices.
      ratio,
    },
    { headers: { 'Cache-Control': 's-maxage=60' } },
  );
}
