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

import { SPECIES, CHAIN_ID, USDT, speciesByTicker, isAddress, type Species, type Stock, type Platform } from './pets';
import { request } from './binance';

const TTL = 60_000;

type RwaRow = {
  tokenContractAddress: string;
  tokenSymbol: string;
  underlyingTicker: string;
  underlyingName?: string;
  platformId?: string;
  decimals?: string;
  assetType?: number | null;
  volume24H?: string;
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
let rwaLoading: Promise<Map<string, RwaRow>> | null = null;

/**
 * Every listed RWA token in one call — cheaper than asking per species, and it is the same call.
 * One load at a time: callers that arrive while it is in flight share it. Seven litter pups asking
 * at once sent seven identical signed requests, and the gateway refused all but one as a replay
 * ("Duplicate request detected", 40103) and rate-limited the rest.
 */
function rwaRows(): Promise<Map<string, RwaRow>> {
  if (rwaCache && Date.now() - rwaCache.at < TTL) return Promise.resolve(rwaCache.rows);
  rwaLoading ??= loadRwaRows().finally(() => { rwaLoading = null; });
  return rwaLoading;
}

async function loadRwaRows(): Promise<Map<string, RwaRow>> {
  const rows = new Map<string, RwaRow>();
  // Twice at most: the gateway answers some failures with HTTP 200 and an empty body, and the
  // overpay guard in lib/preflight should not skip its check over one transient empty answer.
  for (let attempt = 0; attempt < 2 && !rows.size; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 300));
    try {
      const r = await request('GET', '/api/v1/dex/market/rwa/tokens');
      const data = (r.json as { data?: RwaRow[] } | null)?.data;
      if (Array.isArray(data)) for (const row of data) rows.set(addr(row.tokenContractAddress), row);
      if (!rows.size) {
        const msg = (r.json as { msg?: string } | null)?.msg ?? '(no msg)';
        console.error(`[quote] rwa/tokens returned no rows — HTTP ${r.status} code=${r.code} msg=${msg}`);
      }
    } catch (e) {
      // Callers still degrade to a null reference rather than failing, but a silent
      // degradation nobody can diagnose is how an outage looks like an empty market.
      console.error('[quote] rwa/tokens failed —', (e as Error).message);
    }
  }
  if (rows.size) rwaCache = { at: Date.now(), rows };
  return rows;
}

/** How many underlying shares one token stands for — over 1 as dividends are reinvested. */
export async function shareRatio(address: string): Promise<number | null> {
  const v = Number((await rwaRows()).get(addr(address))?.tokenToShareRatio);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * What one token is worth at its own issuer's reference price, ratio applied. Null when the RWA
 * list has no usable row for it. Per issuer on purpose: bStock and Ondo publish different
 * references for the same share, so a token is only ever measured against its own.
 */
export async function referencePerToken(address: string): Promise<number | null> {
  const row = (await rwaRows()).get(addr(address));
  const v = row ? Number(row.referencePrice) * Number(row.tokenToShareRatio) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
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
    } catch (e) {
      console.error('[quote] price-info failed —', (e as Error).message);
    }
  }
  return out;
}

// ── any stock ──────────────────────────────────────────────────────────────────────────

function toStock(r: RwaRow): Stock | null {
  if (!isAddress(r.tokenContractAddress)) return null;
  const platform: Platform = r.platformId === 'ondo' ? 'ondo' : 'bstock';
  return {
    ticker: (r.underlyingTicker ?? '').toUpperCase(),
    company: r.underlyingName ?? r.underlyingTicker,
    tokenSymbol: r.tokenSymbol,
    platform,
    address: r.tokenContractAddress,
    decimals: Number(r.decimals) || 18,
    assetType: r.assetType ?? undefined,
  };
}

/** Every tokenized stock on BSC, most traded first — what a Fledgling can hatch from. */
export async function listStocks(): Promise<(Stock & { volume24h: number })[]> {
  const out: (Stock & { volume24h: number })[] = [];
  for (const r of (await rwaRows()).values()) {
    const s = toStock(r);
    if (s) out.push({ ...s, volume24h: Number(r.volume24H) || 0 });
  }
  return out.sort((a, b) => b.volume24h - a.volume24h);
}

/**
 * A species id or a token address, as the stock it names. Routes take either: the six classic
 * Fledglings keep their short URLs, and any other stock is addressed by its contract.
 */
export async function resolveStock(idOrAddress: string): Promise<Stock | null> {
  if (SPECIES[idOrAddress as Species['id']]) return SPECIES[idOrAddress as Species['id']];
  if (!isAddress(idOrAddress)) return null;
  const row = (await rwaRows()).get(addr(idOrAddress));
  return row ? toStock(row) : null;
}

// ── the quote ──────────────────────────────────────────────────────────────────────────

function build(sp: Pick<Stock, 'ticker'>, rwa: RwaRow | undefined, dex: DexRow | undefined): Quote {
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

/** Quotes for several stocks at once, keyed by lower-cased address — two upstream calls total. */
export async function quotesForStocks(stocks: Pick<Stock, 'ticker' | 'address'>[]): Promise<Record<string, Quote>> {
  if (!stocks.length) return {};
  const [rwa, dex] = await Promise.all([rwaRows(), dexRows(stocks.map((s) => s.address))]);
  return Object.fromEntries(stocks.map((s) => [addr(s.address), build(s, rwa.get(addr(s.address)), dex.get(addr(s.address)))]));
}

export async function quoteForStock(s: Pick<Stock, 'ticker' | 'address'>): Promise<Quote> {
  return (await quotesForStocks([s]))[addr(s.address)];
}

/** Quotes for several species at once — two upstream calls total, however many are asked for. */
export async function quotesFor(ids: Species['id'][]): Promise<Record<string, Quote>> {
  const species = [...new Set(ids)].filter((id) => SPECIES[id]).map((id) => SPECIES[id]);
  const byAddress = await quotesForStocks(species);
  return Object.fromEntries(species.map((sp) => [sp.id, byAddress[addr(sp.address)]]));
}

export async function quoteFor(id: Species['id']): Promise<Quote> {
  return (await quotesFor([id]))[id];
}

/**
 * Traded prices by token address, for the leaderboard and duels. They only need the print, so this
 * reads the DEX feed alone (~0.4s) and falls back to the RWA row's token price — the same fallback
 * `build` uses — only for a token the feed has no price for.
 */
export async function pricesByAddress(addresses: string[]): Promise<Record<string, number | null>> {
  const uniq = [...new Set(addresses.map(addr))];
  const dex = await dexRows(uniq);
  const out: Record<string, number | null> = {};
  const missing: string[] = [];
  for (const a of uniq) {
    const v = Number(dex.get(a)?.price);
    if (Number.isFinite(v) && v > 0) out[a] = v;
    else { out[a] = null; missing.push(a); }
  }
  if (missing.length) {
    const rwa = await rwaRows();
    for (const a of missing) {
      const v = Number(rwa.get(a)?.tokenPrice);
      out[a] = Number.isFinite(v) && v > 0 ? v : null;
    }
  }
  return out;
}

/**
 * Each token's 24h change, in percent, from the same DEX batch the prices come from — cached
 * alongside them, so asking right after pricesByAddress costs no request. Null when the feed has none.
 */
export async function changesByAddress(addresses: string[]): Promise<Record<string, number | null>> {
  const uniq = [...new Set(addresses.map(addr))];
  const dex = await dexRows(uniq);
  return Object.fromEntries(uniq.map((a) => {
    const v = dex.get(a)?.priceChange24H;
    return [a, v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null];
  }));
}

/**
 * Prices by ticker, for the leaderboard and duels. They only need the traded print, so this reads
 * the DEX feed alone (~0.4s) and falls back to the full quote — which also pulls the rwa/tokens
 * list, ~1.3s median — only for a ticker the feed has no price for. Same answer as `quotesFor`'s
 * `price`, which prefers the same print and falls back the same way.
 */
export async function pricesFor(tickers: string[]): Promise<Record<string, number | null>> {
  const wanted = [...new Set(tickers)].map((t) => [t, speciesByTicker(t)] as const);
  const known = wanted.filter((w): w is readonly [string, Species] => Boolean(w[1]));
  const dex = await dexRows(known.map(([, sp]) => sp.address));

  const out: Record<string, number | null> = Object.fromEntries(wanted.map(([t]) => [t, null]));
  const missing: (readonly [string, Species])[] = [];
  for (const [t, sp] of known) {
    const v = Number(dex.get(addr(sp.address))?.price);
    if (Number.isFinite(v) && v > 0) out[t] = v;
    else missing.push([t, sp]);
  }
  if (missing.length) {
    const quotes = await quotesFor(missing.map(([, sp]) => sp.id));
    for (const [t, sp] of missing) out[t] = quotes[sp.id]?.price ?? null;
  }
  return out;
}

export async function priceFor(ticker: string): Promise<number | null> {
  return (await pricesFor([ticker]))[ticker] ?? null;
}

// ── the executable leg ─────────────────────────────────────────────────────────────────
//
// `price-info` is an oracle read, and for several tokens it returns the same number as
// referencePrice — so differencing them shows a flat 0.000% that means "same source", not
// "efficient market". A real aggregator quote is the honest traded leg: it is what a
// Fledgling would actually be filled at, impact and fees included.
//
// It needs a wallet address. bStock will quote without one, Ondo refuses outright — the
// RFQ desk prices against the taker. That is why this takes a connected address.

const USDT_DECIMALS = 18; // USDT on BSC is 18, not the 6 it uses on Ethereum.

export type Fill = {
  ticker: string;
  /** USDT actually received for one whole token, per the aggregator. */
  perToken: number | null;
  priceImpactPct: number | null;
  vendor: string | null;
  /** Fill vs the underlying reference. The gap, measured against something independent. */
  spreadPct: number | null;
  error?: string;
};

type QuoteRow = {
  toTokenAmount: string;
  vendorName?: string;
  priceImpactPercent?: string;
  executionMode?: string;
};

/** What one token would really fetch right now, for a given taker. */
export async function fillFor(id: Species['id'], wallet: `0x${string}`): Promise<Fill> {
  const sp = SPECIES[id];
  if (!sp) return { ticker: '?', perToken: null, priceImpactPct: null, vendor: null, spreadPct: null, error: 'unknown species' };
  return fillForStock(sp, wallet);
}

/** The same for any stock. */
export async function fillForStock(sp: Pick<Stock, 'ticker' | 'address' | 'decimals'>, wallet: `0x${string}`): Promise<Fill> {
  const base: Fill = { ticker: sp.ticker, perToken: null, priceImpactPct: null, vendor: null, spreadPct: null };
  try {
    const r = await request('GET', '/api/v1/dex/aggregator/quote', {
      params: {
        binanceChainId: CHAIN_ID,
        fromTokenAddress: sp.address,
        toTokenAddress: USDT,
        amount: `1${'0'.repeat(sp.decimals)}`, // exactly one whole token, in base units
        userWalletAddress: wallet,
      },
    });
    const rows = (r.json as { data?: QuoteRow[] } | null)?.data;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) {
      const msg = (r.json as { msg?: string } | null)?.msg ?? `no quote (HTTP ${r.status})`;
      return { ...base, error: msg };
    }

    const perToken = Number(row.toTokenAmount) / 10 ** USDT_DECIMALS;
    const { reference } = await quoteForStock(sp);
    return {
      ...base,
      perToken: Number.isFinite(perToken) && perToken > 0 ? perToken : null,
      // Named a percent, carries a fraction: SNDKon filled 97% under its reference with 0.946
      // here (2026-09-26). Scale it once, at the source, so nothing downstream misreads it.
      priceImpactPct: row.priceImpactPercent !== undefined ? Number(row.priceImpactPercent) * 100 : null,
      vendor: row.vendorName ?? null,
      spreadPct: reference && perToken > 0 ? (perToken / reference - 1) * 100 : null,
    };
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
}
