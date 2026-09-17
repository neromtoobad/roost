import { NextResponse } from 'next/server';

// NYSE closures from Backpack's public sessions API, cached for a day. The session clock consults this so a
// holiday reads as "closed" (night theme) instead of "regular".
export async function GET() {
  try {
    const r = await fetch('https://api.backpack.exchange/api/v1/market-holidays', { next: { revalidate: 86_400 } });
    const j = (await r.json()) as Array<{ date?: string; endDate?: string; startDate?: string; description?: string }>;
    const dates = j.map((h) => h.date ?? h.startDate).filter(Boolean);
    return NextResponse.json({ dates }, { headers: { 'Cache-Control': 's-maxage=86400' } });
  } catch {
    return NextResponse.json({ dates: [] });
  }
}
