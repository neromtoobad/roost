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

import { SPECIES, CHAIN_ID, USDT, speciesByTicker, type Species } from './pets';
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
    const { reference } = await quoteFor(id);
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
