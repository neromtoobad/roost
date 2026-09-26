import { NextResponse } from 'next/server';
import {
  spreadReport, listTickers, widestSpreads, upstreamError, crossIssuerReport, crossIssuerBoard,
} from '@/lib/signal';

// The deliverable a Fledgling sells: how far a tokenized stock has drifted from the share it
// stands for, and whether the exchange behind it is even open. See lib/signal.ts.
//
//   /api/signal                      → every ticker this agent can report on
//   /api/signal?ticker=NVDA          → one report, oracle-priced
//   /api/signal?ticker=NVDA&wallet=… → same, but the traded leg is a real fill
//   /api/signal?widest=1             → the widest gaps on the board right now
//
// The same stock from more than one issuer:
//
//   /api/signal?cross=1                          → every ticker two issuers list, and how far
//                                                  apart their own references sit
//   /api/signal?ticker=NVDA&cross=1&wallet=…     → real fills both ways on each issuer: where it
//                                                  is cheaper to buy, where it fetches more, and
//                                                  whether buying one and selling the other pays
//   …&usd=250                                    → quote a different size (default 100 USDT)
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const wallet = p.get('wallet') ?? undefined;
  const ticker = p.get('ticker');

  try {
    if (p.get('cross')) {
      if (!ticker) {
        const pairs = await crossIssuerBoard();
        const upstream = upstreamError();
        if (!pairs.length && upstream) return NextResponse.json({ error: 'upstream RWA call failed', upstream }, { status: 502 });
        return NextResponse.json({ pairs }, { headers: { 'Cache-Control': 's-maxage=300' } });
      }
      const usd = Math.min(Math.max(Number(p.get('usd')) || 100, 1), 10_000);
      const report = await crossIssuerReport(ticker, wallet, usd);
      if (!report) {
        const upstream = upstreamError();
        if (upstream) return NextResponse.json({ error: 'upstream RWA call failed', upstream }, { status: 502 });
        const listed = (await listTickers()).find((t) => t.ticker === ticker.toUpperCase());
        return NextResponse.json({
          error: listed
            ? `${listed.ticker} is listed by ${listed.platforms.join(', ')} only — nothing to compare`
            : `no tokenized listing for ${ticker} on BSC`,
        }, { status: 404 });
      }
      return NextResponse.json(report, { headers: { 'Cache-Control': 's-maxage=30' } });
    }
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
    if (!report) {
      // Distinguish "the upstream call failed" from "that ticker genuinely is not listed".
      const upstream = upstreamError();
      if (upstream) return NextResponse.json({ error: 'upstream RWA call failed', upstream }, { status: 502 });
      return NextResponse.json({ error: `no tokenized listing for ${ticker} on BSC` }, { status: 404 });
    }
    return NextResponse.json(report, { headers: { 'Cache-Control': 's-maxage=30' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
