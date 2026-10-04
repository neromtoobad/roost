import { NextResponse } from 'next/server';
import { dbEnabled } from '@/lib/db';
import { MANAGERS } from '@/lib/managers';
import { emptyRecord, managerRecords, type ManagerRecord } from '@/lib/records';
import { cached } from '@/lib/swr';

// Every manager with its public track record — the lineup clients choose from. Records come from
// lib/records; without a database the lineup still loads, with no record attached.
export async function GET() {
  let records: ManagerRecord[] = [];
  if (dbEnabled()) {
    try {
      records = await cached('managers', managerRecords, { fresh: 30_000, stale: 10 * 60_000 });
    } catch (e) {
      console.error('[managers] records failed —', (e as Error).message);
    }
  }
  return NextResponse.json(
    { managers: MANAGERS.map((m) => ({ ...m, record: records.find((r) => r.id === m.id) ?? emptyRecord(m.id) })) },
    { headers: { 'Cache-Control': 's-maxage=30' } },
  );
}
