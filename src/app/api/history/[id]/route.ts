import { NextResponse } from 'next/server';
import { fetchBars } from '@/lib/bars';
import { resolveStock } from '@/lib/quote';

// Hourly on-chain bars for a species' signature stock, or for any token address.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stock = await resolveStock(id);
  if (!stock) return NextResponse.json({ error: 'unknown stock' }, { status: 404 });

  const { bars, source } = await fetchBars(stock);
  const headers = source === 'dex' ? { 'Cache-Control': 's-maxage=300' } : undefined;
  return NextResponse.json({ bars, source }, headers ? { headers } : undefined);
}
