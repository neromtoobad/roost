import { NextResponse } from 'next/server';
import { pricesByAddress } from '@/lib/quote';
import { isAddress } from '@/lib/pets';

// Traded prices for several tokens in one call — a nest or a litter at once, rather than a request
// per pet. `/api/prices?tokens=0x…,0x…` → { prices: { "0x…": 178.2 } }, keyed lower-case.
export async function GET(req: Request) {
  const tokens = (new URL(req.url).searchParams.get('tokens') ?? '').split(',').map((t) => t.trim()).filter(isAddress).slice(0, 40);
  if (!tokens.length) return NextResponse.json({ error: 'tokens required' }, { status: 400 });
  try {
    return NextResponse.json({ prices: await pricesByAddress(tokens) }, { headers: { 'Cache-Control': 's-maxage=30' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
