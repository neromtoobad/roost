import { NextResponse } from 'next/server';
import { SPECIES, type Species } from '@/lib/pets';

// Price for a species' home stock. Backpack's external ticker is the real exchange print
// (free, no auth); Jupiter's price v3 covers 24/7 on-chain and pre-IPO tokens.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = SPECIES[id as Species['id']];
  if (!sp) return NextResponse.json({ error: 'unknown species' }, { status: 404 });

  const out: { price: number | null; pct24h: number; source: string } = { price: null, pct24h: 0, source: 'none' };

  if (!sp.preIpo) {
    try {
      const r = await fetch(`https://api.backpack.exchange/api/v1/ticker?symbol=${sp.ticker}.US_USDC&source=External`, { next: { revalidate: 60 } });
      const t = await r.json();
      if (t?.lastPrice) { out.price = Number(t.lastPrice); out.pct24h = Number(t.priceChangePercent) * 100; out.source = 'nasdaq'; }
    } catch {}
  }
  if (out.price === null) {
    try {
      const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${sp.holdMint}`, { next: { revalidate: 60 } });
      const j = await r.json();
      const p = j?.[sp.holdMint];
      if (p?.usdPrice) { out.price = Number(p.usdPrice); out.pct24h = Number(p.priceChange24h ?? 0); out.source = 'onchain'; }
    } catch {}
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 's-maxage=60' } });
}
