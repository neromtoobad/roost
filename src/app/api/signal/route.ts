import { NextResponse } from 'next/server';
import { spreadReport, listTickers, widestSpreads } from '@/lib/signal';

// The deliverable a Fledgling sells: how far a tokenized stock has drifted from the share it
// stands for, and whether the exchange behind it is even open. See lib/signal.ts.
//
//   /api/signal                      → every ticker this agent can report on
//   /api/signal?ticker=NVDA          → one report, oracle-priced
//   /api/signal?ticker=NVDA&wallet=… → same, but the traded leg is a real fill
//   /api/signal?widest=1             → the widest gaps on the board right now
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const wallet = p.get('wallet') ?? undefined;
  const ticker = p.get('ticker');

  try {
    if (p.get('widest')) {
      const limit = Math.min(Number(p.get('limit')) || 10, 25);
      return NextResponse.json({ reports: await widestSpreads(limit, wallet) },
        { headers: { 'Cache-Control': 's-maxage=60' } });
    }
    if (!ticker) {
      return NextResponse.json({ tickers: await listTickers() },
        { headers: { 'Cache-Control': 's-maxage=300' } });
    }
    const report = await spreadReport(ticker, wallet);
    if (!report) return NextResponse.json({ error: `no tokenized listing for ${ticker} on BSC` }, { status: 404 });
    return NextResponse.json(report, { headers: { 'Cache-Control': 's-maxage=30' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
