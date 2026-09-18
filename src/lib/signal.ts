// What a Fledgling sells.
//
// An Agent Studio agent is a seller: it has an ERC-8004 identity, an ERC-8183 task interface, and
// it charges for its work in $U. So a Fledgling needs something worth buying, and it should be the
// thing Roost actually knows rather than a wrapper around someone else's endpoint.
//
// That thing is the gap. A tokenized stock trades every hour of the week; the exchange behind it
// is open about 32 hours in 168. For the other 136 the reference price is a number that stopped
// moving on Friday afternoon while the token kept trading. Measuring that honestly turns out to
// take more care than it looks:
//
//   · referencePrice is per underlying share, tokenPrice is per token, and tokenToShareRatio is
//     the bridge. Skip it and a 10:1 token reports a 900% spread.
//   · The RWA row's own two prices cannot be differenced — tokenPrice / (referencePrice * ratio)
//     is exactly 1.000 for all 488 listed tokens, because one is derived from the other.
//   · So the traded leg has to be a real aggregator quote, which needs a taker address.
//
// This module is the deliverable behind the ERC-8183 `notify_funded` call. It works for any RWA
// token on BSC, not only the six with faces.

import { request } from './binance';
import { CHAIN_ID, USDT } from './pets';
import { nyseSession } from './session';

type RwaRow = {
  tokenContractAddress: string;
  tokenSymbol: string;
  underlyingTicker: string;
  underlyingName: string;
  platformId: string;
  decimals: string;
  referencePrice: string;
  tokenPrice: string;
  tokenToShareRatio: string;
  statusInfo?: { marketStatus?: string; openState?: boolean; nextOpenTime?: number };
};

export type SpreadReport = {
  ticker: string;
  name: string;
  tokenSymbol: string;
  platform: string;
  address: string;
  /** Executable, per token — a real quote when a taker was given, else an oracle read. */
  onChain: number | null;
  /** What one token is worth at the underlying's reference price, ratio applied. */
  reference: number | null;
  spreadPct: number | null;
  /** True only while the underlying exchange is actually open. */
  underlyingOpen: boolean;
  marketStatus: string | null;
  /** Where `underlyingOpen` came from — bStock rows omit marketStatus, so we fall back. */
  statusSource: 'api' | 'nyse-clock';
  nextOpenTime: number | null;
  hoursUntilOpen: number | null;
  pct24h: number | null;
  priceSource: 'aggregator-quote' | 'oracle' | 'none';
  verdict: string;
  asOf: number;
};

const TTL = 60_000;
let cache: { at: number; rows: RwaRow[] } | null = null;

// An upstream failure and "this ticker is not listed" are completely different problems, and
// collapsing them into an empty array makes the second hide the first. That is the same trap the
// Binance gateway sets by returning HTTP 200 on failure, and it is not one to reproduce.
let lastUpstream: string | null = null;
export const upstreamError = () => lastUpstream;

async function rwaTokens(): Promise<RwaRow[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  const r = await request('GET', '/api/v1/dex/market/rwa/tokens');
  const rows = ((r.json as { data?: RwaRow[] } | null)?.data ?? []) as RwaRow[];
  if (rows.length) {
    cache = { at: Date.now(), rows };
    lastUpstream = null;
  } else {
    const msg = (r.json as { msg?: string } | null)?.msg ?? '(no msg)';
    lastUpstream = `rwa/tokens returned no rows — HTTP ${r.status} code=${r.code} msg=${msg}`;
    console.error('[signal]', lastUpstream);
  }
  return rows;
}

/** Every ticker this agent can report on. */
export async function listTickers(): Promise<{ ticker: string; name: string; platforms: string[] }[]> {
  const rows = await rwaTokens();
  const by = new Map<string, { ticker: string; name: string; platforms: string[] }>();
  for (const r of rows) {
    const t = (r.underlyingTicker ?? '').toUpperCase();
    if (!t) continue;
    const hit = by.get(t) ?? { ticker: t, name: r.underlyingName ?? t, platforms: [] };
    if (!hit.platforms.includes(r.platformId)) hit.platforms.push(r.platformId);
    by.set(t, hit);
  }
  return [...by.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

/**
 * Pick the listing to quote. bStock first: it swaps through the ordinary aggregator, while Ondo
 * is request-for-quote and refuses to price without a taker at all.
 */
function pick(rows: RwaRow[], ticker: string): RwaRow | undefined {
  const hits = rows.filter((r) => (r.underlyingTicker ?? '').toUpperCase() === ticker.toUpperCase());
  return hits.find((r) => r.platformId === 'bstock') ?? hits[0];
}

function sentence(r: {
  ticker: string; spreadPct: number | null; underlyingOpen: boolean; hoursUntilOpen: number | null;
  priceSource: SpreadReport['priceSource'];
}): string {
  if (r.spreadPct === null) return `No executable price for ${r.ticker} right now.`;
  const mag = Math.abs(r.spreadPct);
  const dir = r.spreadPct >= 0 ? 'above' : 'below';
  const size = mag < 0.1 ? 'in line with' : mag < 1 ? `${mag.toFixed(2)}% ${dir}` : `${mag.toFixed(2)}% ${dir}`;
  const where = mag < 0.1 ? `${r.ticker} is trading in line with its reference` : `${r.ticker} is trading ${size} its reference`;
  const when = r.underlyingOpen
    ? 'while the underlying exchange is open, so both legs are live'
    : r.hoursUntilOpen !== null
      ? `while the underlying exchange is shut — the reference has not moved for a while and will not until it reopens in about ${r.hoursUntilOpen.toFixed(0)}h`
      : 'while the underlying exchange is shut, so the reference leg is stale';
  const caveat = r.priceSource === 'oracle'
    ? ' Priced from an oracle read, not an executable quote — pass a taker address for a real fill.'
    : '';
  return `${where}, ${when}.${caveat}`;
}

/** The report itself. `wallet` upgrades the traded leg from an oracle read to a real fill. */
export async function spreadReport(ticker: string, wallet?: string): Promise<SpreadReport | null> {
  const rows = await rwaTokens();
  const row = pick(rows, ticker);
  if (!row) return null;

  const ratio = Number(row.tokenToShareRatio);
  const refShare = Number(row.referencePrice);
  const reference = Number.isFinite(refShare) && Number.isFinite(ratio) && refShare > 0 ? refShare * ratio : null;

  let onChain: number | null = null;
  let priceSource: SpreadReport['priceSource'] = 'none';
  let pct24h: number | null = null;

  if (/^0x[a-fA-F0-9]{40}$/.test(wallet ?? '')) {
    try {
      const q = await request('GET', '/api/v1/dex/aggregator/quote', {
        params: {
          binanceChainId: CHAIN_ID,
          fromTokenAddress: row.tokenContractAddress,
          toTokenAddress: USDT,
          amount: `1${'0'.repeat(Number(row.decimals) || 18)}`,
          userWalletAddress: wallet,
        },
      });
      const got = (q.json as { data?: { toTokenAmount: string }[] } | null)?.data?.[0];
      if (got) {
        const v = Number(got.toTokenAmount) / 1e18;
        if (Number.isFinite(v) && v > 0) { onChain = v; priceSource = 'aggregator-quote'; }
      }
    } catch { /* fall back to the oracle read below */ }
  }

  try {
    const p = await request('POST', '/api/v1/dex/market/price-info', {
      body: [{ binanceChainId: CHAIN_ID, tokenContractAddress: row.tokenContractAddress }],
    });
    const info = (p.json as { data?: { price: string; priceChange24H: string | null }[] } | null)?.data?.[0];
    if (info) {
      pct24h = info.priceChange24H !== null && Number.isFinite(Number(info.priceChange24H)) ? Number(info.priceChange24H) : null;
      if (onChain === null && Number(info.price) > 0) { onChain = Number(info.price); priceSource = 'oracle'; }
    }
  } catch { /* leave what we have */ }

  // bStock rows carry statusInfo but omit marketStatus; only Ondo fills it in. Silence is not
  // "closed", and reporting a shut exchange while the NYSE is trading would be a lie in the one
  // field this product exists to get right. Where the API says nothing, use our own session clock.
  const reported = row.statusInfo?.marketStatus;
  const underlyingOpen = reported
    ? reported === 'regular' && row.statusInfo?.openState !== false
    : nyseSession() === 'regular';
  const statusSource: 'api' | 'nyse-clock' = reported ? 'api' : 'nyse-clock';
  const nextOpenTime = row.statusInfo?.nextOpenTime ?? null;
  const hoursUntilOpen = nextOpenTime && nextOpenTime > Date.now() ? (nextOpenTime - Date.now()) / 3600e3 : null;
  const spreadPct = onChain !== null && reference ? (onChain / reference - 1) * 100 : null;

  const base = {
    ticker: (row.underlyingTicker ?? ticker).toUpperCase(),
    name: row.underlyingName ?? '',
    tokenSymbol: row.tokenSymbol,
    platform: row.platformId,
    address: row.tokenContractAddress,
    onChain, reference, spreadPct,
    underlyingOpen, marketStatus: reported ?? null, statusSource,
    nextOpenTime, hoursUntilOpen, pct24h, priceSource,
    asOf: Date.now(),
  };
  return { ...base, verdict: sentence(base) };
}

/** The whole board, widest gap first — what a caller buying one report usually wants next. */
export async function widestSpreads(limit = 10, wallet?: string): Promise<SpreadReport[]> {
  const rows = await rwaTokens();
  const tickers = [...new Set(rows.map((r) => (r.underlyingTicker ?? '').toUpperCase()).filter(Boolean))];
  const reports: SpreadReport[] = [];
  // Oracle-read pass: one batch, no per-token quote. Callers who want fills ask per ticker.
  for (const t of tickers.slice(0, 60)) {
    const r = await spreadReport(t, wallet);
    if (r?.spreadPct !== null && r) reports.push(r);
  }
  return reports.sort((a, b) => Math.abs(b.spreadPct ?? 0) - Math.abs(a.spreadPct ?? 0)).slice(0, limit);
}
