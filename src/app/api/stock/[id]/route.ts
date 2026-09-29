import { NextResponse } from 'next/server';
import { quoteForStock, resolveStock, shareRatio } from '@/lib/quote';
import { companyFor } from '@/lib/company';
import { speciesFor } from '@/lib/pets';
import { cached } from '@/lib/swr';

// One stock, everything a first-time investor would ask before adopting it: the company, the
// numbers, the price against its reference — and which Fledgling would hatch from it.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stock = await resolveStock(id);
  if (!stock) return NextResponse.json({ error: 'unknown stock' }, { status: 404 });

  // A company's profile barely moves; its price does. Cache the one, not the other.
  const [company, quote, ratio] = await Promise.all([
    cached(`company:${stock.address.toLowerCase()}`, () => companyFor(stock.address, stock.platform), { fresh: 30 * 60_000, stale: 24 * 3600_000 })
      .catch(() => null),
    quoteForStock(stock),
    shareRatio(stock.address),
  ]);

  return NextResponse.json({
    stock,
    species: speciesFor(company?.industry, stock.assetType),
    company,
    quote: {
      price: quote.price, reference: quote.reference, spreadPct: quote.spreadPct, pct24h: quote.pct24h,
      // Per share, so it sits on the same scale as the 52-week range and the P/E.
      sharePrice: quote.price != null && ratio ? quote.price / ratio : null,
      tokenToShareRatio: ratio,
      marketStatus: quote.marketStatus, nextOpenTime: quote.nextOpenTime,
    },
  }, { headers: { 'Cache-Control': 's-maxage=60' } });
}
