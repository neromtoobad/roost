import { NextResponse } from 'next/server';
import { fetchBars } from '@/lib/bars';
import { SPECIES, type Species } from '@/lib/pets';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SPECIES[id as Species['id']]) return NextResponse.json({ error: 'unknown species' }, { status: 404 });

  const { bars, source } = await fetchBars(id as Species['id']);
  const headers = source === 'nasdaq' ? { 'Cache-Control': 's-maxage=300' } : undefined;
  return NextResponse.json({ bars, source }, headers ? { headers } : undefined);
}
