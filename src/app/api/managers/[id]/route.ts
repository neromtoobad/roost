import { NextResponse } from 'next/server';
import { dbEnabled } from '@/lib/db';
import { managerById } from '@/lib/managers';
import { emptyRecord, managerRecords, recentTrades } from '@/lib/records';
import { chooseIssuer } from '@/lib/issuer';
import { cached } from '@/lib/swr';

// One manager: who they are, their public record and latest trades, and their stocks resolved to
// the tokens a new mandate would hold — for each ticker, the issuer whose share is cheaper (lib/
// issuer), by real fills when a wallet is given.
//
//   /api/managers/vesper              by the traded price
//   /api/managers/vesper?wallet=0x…   by real fills for this wallet, $25 a stock
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = managerById(id);
  if (!m) return NextResponse.json({ error: 'no such manager' }, { status: 404 });
  const wallet = new URL(req.url).searchParams.get('wallet') ?? undefined;

  const universe = await Promise.all(m.universe.map(async (u) => {
    try {
      const c = await cached(`issuer:${u.ticker}:${wallet?.toLowerCase() ?? '-'}:25`, () => chooseIssuer(u.ticker, { wallet, usd: 25 }), { fresh: 60_000, stale: 5 * 60_000 });
      if (!c) return { ...u, stock: null, reason: `${u.ticker} is not listed on BSC right now`, basis: null };
      return { ...u, stock: c.pick, reason: c.reason, basis: c.basis };
    } catch (e) {
      return { ...u, stock: null, reason: (e as Error).message, basis: null };
    }
  }));

  let record = emptyRecord(m.id), trades: Awaited<ReturnType<typeof recentTrades>> = [];
  if (dbEnabled()) {
    try {
      const [all, recent] = await Promise.all([
        cached('managers', managerRecords, { fresh: 30_000, stale: 10 * 60_000 }),
        recentTrades(m.id),
      ]);
      record = all.find((r) => r.id === m.id) ?? emptyRecord(m.id);
      trades = recent;
    } catch (e) {
      console.error('[managers] record failed —', (e as Error).message);
    }
  }
  return NextResponse.json({ manager: m, record, trades, universe }, { headers: { 'Cache-Control': 'private, max-age=20' } });
}
