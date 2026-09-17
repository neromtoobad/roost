// The live print for a Fledgling's home stock, and the number this whole product turns on:
// how far the token has drifted from the share it stands for.
//
// It takes two sources, because one will not do it. The RWA row looks like it already holds
// both legs — `tokenPrice` and `referencePrice` side by side — but it does not:
//
//     tokenPrice / (referencePrice * tokenToShareRatio) === 1.000, for all 488 listed tokens
//
// `referencePrice` is derived from `tokenPrice`, not an independent tape. Difference the two
// and you report a perfectly efficient market, always, including at 3am on a Sunday.
//
// So the reference leg comes from the RWA row and the traded leg from the DEX price feed, and
// the spread between those two is real. That spread is the Night Owl mood: the NYSE is shut,
// the reference has not moved since Friday, and the token is still trading.

import { SPECIES, CHAIN_ID, speciesByTicker, type Species } from './pets';
import { request } from './binance';

const TTL = 60_000;

type RwaRow = {
  tokenContractAddress: string;
  tokenSymbol: string;
  underlyingTicker: string;
  referencePrice: string;
  tokenPrice: string;
  tokenToShareRatio: string;
  statusInfo?: { marketStatus: string; openState: boolean; nextOpenTime: number; nextCloseTime: number };
};

type DexRow = { tokenContractAddress: string; price: string; priceChange24H: string | null };

export type Quote = {
  ticker: string;
  /** What the token trades at on BSC, per token. */
  price: number | null;
  /** What one token is worth at the underlying's reference price — ratio applied. */
  reference: number | null;
  /** Traded vs reference, percent. The gap the product is about. */
  spreadPct: number | null;
  pct24h: number;
  marketStatus: string | null;
  /** Epoch ms. When the underlying exchange next opens — straight from the API, not our clock. */
  nextOpenTime: number | null;
  source: 'dex' | 'rwa' | 'none';
};

const addr = (a: string) => a.toLowerCase();

// ── sources ────────────────────────────────────────────────────────────────────────────

let rwaCache: { at: number; rows: Map<string, RwaRow> } | null = null;

/** Every listed RWA token in one call — cheaper than asking per species, and it is the same call. */
async function rwaRows(): Promise<Map<string, RwaRow>> {
  if (rwaCache && Date.now() - rwaCache.at < TTL) return rwaCache.rows;
  const rows = new Map<string, RwaRow>();
  try {
    const r = await request('GET', '/api/v1/dex/market/rwa/tokens');
    const data = (r.json as { data?: RwaRow[] } | null)?.data;
    if (Array.isArray(data)) for (const row of data) rows.set(addr(row.tokenContractAddress), row);
  } catch { /* leave empty — callers degrade to a null reference rather than failing */ }
  if (rows.size) rwaCache = { at: Date.now(), rows };
  return rows;
}

const dexCache = new Map<string, { at: number; row: DexRow }>();

/** Traded price and 24h move, batched. This is the leg that is genuinely independent. */
async function dexRows(addresses: string[]): Promise<Map<string, DexRow>> {
  const out = new Map<string, DexRow>();
  const stale: string[] = [];
  for (const a of addresses.map(addr)) {
    const hit = dexCache.get(a);
    if (hit && Date.now() - hit.at < TTL) out.set(a, hit.row);
    else stale.push(a);
  }
  if (stale.length) {
    try {
      const r = await request('POST', '/api/v1/dex/market/price-info', {
        body: stale.map((a) => ({ binanceChainId: CHAIN_ID, tokenContractAddress: a })),
      });
      const data = (r.json as { data?: DexRow[] } | null)?.data;
      if (Array.isArray(data)) {
        for (const row of data) {
          const a = addr(row.tokenContractAddress);
          dexCache.set(a, { at: Date.now(), row });
          out.set(a, row);
        }
      }
    } catch { /* fall through — the RWA row still gives us a price, just not an independent one */ }
  }
  return out;
}

// ── the quote ──────────────────────────────────────────────────────────────────────────

function build(sp: Species, rwa: RwaRow | undefined, dex: DexRow | undefined): Quote {
  // One token is worth `referencePrice * tokenToShareRatio` of underlying. For a 10:1 token
  // that ratio is 10, and skipping it invents a 900% spread out of nothing.
  const ref = rwa ? Number(rwa.referencePrice) * Number(rwa.tokenToShareRatio) : NaN;
  const reference = Number.isFinite(ref) && ref > 0 ? ref : null;

  const traded = dex ? Number(dex.price) : NaN;
  const rwaPrice = rwa ? Number(rwa.tokenPrice) : NaN;

  const price = Number.isFinite(traded) && traded > 0 ? traded
    : Number.isFinite(rwaPrice) && rwaPrice > 0 ? rwaPrice
    : null;

  const source: Quote['source'] = Number.isFinite(traded) && traded > 0 ? 'dex'
    : Number.isFinite(rwaPrice) && rwaPrice > 0 ? 'rwa'
    : 'none';

  // Only meaningful when the traded leg is genuinely independent of the reference leg.
  const spreadPct = source === 'dex' && reference !== null && price !== null
    ? (price / reference - 1) * 100
    : null;

  const chg = dex?.priceChange24H;
  return {
    ticker: sp.ticker,
    price,
    reference,
    spreadPct,
    pct24h: chg !== null && chg !== undefined && Number.isFinite(Number(chg)) ? Number(chg) : 0,
    marketStatus: rwa?.statusInfo?.marketStatus ?? null,
    nextOpenTime: rwa?.statusInfo?.nextOpenTime ?? null,
    source,
  };
}

/** Quotes for several species at once — two upstream calls total, however many are asked for. */
export async function quotesFor(ids: Species['id'][]): Promise<Record<string, Quote>> {
  const uniq = [...new Set(ids)].filter((id) => SPECIES[id]);
  if (!uniq.length) return {};
  const species = uniq.map((id) => SPECIES[id]);
  const [rwa, dex] = await Promise.all([rwaRows(), dexRows(species.map((s) => s.address))]);
  return Object.fromEntries(
    species.map((sp) => [sp.id, build(sp, rwa.get(addr(sp.address)), dex.get(addr(sp.address)))]),
  );
}

export async function quoteFor(id: Species['id']): Promise<Quote> {
  return (await quotesFor([id]))[id];
}

/** Prices by ticker. Kept for the leaderboard and duels, which value portfolios by ticker. */
export async function pricesFor(tickers: string[]): Promise<Record<string, number | null>> {
  const uniq = [...new Set(tickers)];
  const ids = uniq.map(speciesByTicker).filter((s): s is Species => Boolean(s)).map((s) => s.id);
  const quotes = await quotesFor(ids);
  const byTicker = new Map(Object.values(quotes).map((q) => [q.ticker.toUpperCase(), q.price]));
  return Object.fromEntries(uniq.map((t) => [t, byTicker.get(t.toUpperCase()) ?? null]));
}

export async function priceFor(ticker: string): Promise<number | null> {
  return (await pricesFor([ticker]))[ticker] ?? null;
}
