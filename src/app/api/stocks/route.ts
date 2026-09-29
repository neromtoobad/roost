import { NextResponse } from 'next/server';
import { listStocks } from '@/lib/quote';
import type { Stock } from '@/lib/pets';

// Every tokenized stock a Fledgling can hatch from, grouped by ticker: one company can come from
// two issuers (bStock and Ondo), and they are different tokens with different prices.
//
//   /api/stocks          the most traded, first
//   /api/stocks?q=nvid   by ticker or company name
//
// Searched from the cached RWA list rather than the gateway's own search endpoint: the list is
// already in memory for pricing, so a keystroke costs nothing.

type Listing = { ticker: string; company: string; assetType?: number; volume24h: number; tokens: (Stock & { volume24h: number })[] };

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase();
  const stocks = await listStocks();
  if (!stocks.length) return NextResponse.json({ error: 'the RWA list is unavailable right now' }, { status: 502 });

  const byTicker = new Map<string, Listing>();
  for (const s of stocks) {
    const hit = byTicker.get(s.ticker) ?? { ticker: s.ticker, company: s.company, assetType: s.assetType, volume24h: 0, tokens: [] };
    hit.volume24h = Math.max(hit.volume24h, s.volume24h);
    // bStock first: it swaps through the ordinary aggregator at any hour; Ondo is often RFQ.
    hit.tokens.push(s);
    hit.tokens.sort((a, b) => (a.platform === 'bstock' ? -1 : 1) - (b.platform === 'bstock' ? -1 : 1));
    byTicker.set(s.ticker, hit);
  }

  let listings = [...byTicker.values()];
  if (q) {
    const rank = (l: Listing) => {
      const t = l.ticker.toLowerCase(), c = l.company.toLowerCase();
      return t === q ? 0 : t.startsWith(q) ? 1 : c.startsWith(q) ? 2 : c.includes(q) ? 3 : 9;
    };
    listings = listings.filter((l) => rank(l) < 9).sort((a, b) => rank(a) - rank(b) || b.volume24h - a.volume24h);
  }
  return NextResponse.json(
    { total: byTicker.size, results: listings.slice(0, q ? 20 : 24) },
    { headers: { 'Cache-Control': 's-maxage=60' } },
  );
}
