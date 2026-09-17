import { NextResponse } from 'next/server';
import { SPECIES, type Species } from '@/lib/pets';
import { quoteFor } from '@/lib/quote';

// Price for a species' home stock, plus the number the product is actually about: how far the
// token has drifted from the share it stands for. See lib/quote.ts for why that needs two
// sources rather than the two prices the RWA row appears to hand you.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SPECIES[id as Species['id']]) return NextResponse.json({ error: 'unknown species' }, { status: 404 });

  const q = await quoteFor(id as Species['id']);
  return NextResponse.json(
    {
      price: q.price,
      pct24h: q.pct24h,
      source: q.source,
      reference: q.reference,
      spreadPct: q.spreadPct,
      marketStatus: q.marketStatus,
      nextOpenTime: q.nextOpenTime,
    },
    { headers: { 'Cache-Control': 's-maxage=60' } },
  );
}
