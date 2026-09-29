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

import { request, baseUnits } from './binance';
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

let loading: Promise<RwaRow[]> | null = null;

/** One load at a time — concurrent identical signed requests are refused as replays (lib/quote). */
function rwaTokens(): Promise<RwaRow[]> {
  if (cache && Date.now() - cache.at < TTL) return Promise.resolve(cache.rows);
  loading ??= loadRwaTokens().finally(() => { loading = null; });
  return loading;
}

async function loadRwaTokens(): Promise<RwaRow[]> {
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

// ── Same stock, two issuers ───────────────────────────────────────────────────────────────────
//
// About 40 tickers are listed on BSC by both bStock and Ondo — NVDA, TSLA, SPCX and CRWV among
// them, which is four of the six Fledglings. Quoting both on a Saturday (2026-09-26) showed three
// things a single-issuer spread cannot:
//
//   · The issuers do not share a reference. At the same instant, per share with the ratio
//     applied, NVDAB's referencePrice was 224.19 and NVDAon's 224.80; IBM's were 2.2% apart.
//     Each issuer carries its own, so "the reference" is not one number.
//   · Where both quote, there is no arbitrage worth the name. Buy one at its ask, sell the other
//     at its bid: in one run every pair lost money before gas; in another the best cleared 0.09%,
//     about two cents on $100 once gas was paid. What is there is a choice: NVDA sold for the
//     same on either issuer but cost 2.1% more to buy as NVDAon. That is routing, not arbitrage,
//     and it is the useful thing to report.
//   · Some Ondo pools are broken off-hours. SNDKon quoted 97% under its own reference. The
//     aggregator does flag it, in `priceImpactPercent` — which carries a fraction despite its
//     name, so 0.946 is 94.6% and a guard written as `impact > 1` passes it. Every side here is
//     checked against its issuer's own reference instead, and anything past SANE_PCT is reported
//     but kept out of the routing.
//
// Every price in this section is per underlying share, so the two issuers compare directly. Fills
// are before gas: the aggregator reports each swap's gas separately as `tradeFee` (about $0.03).

/** A side this far from its own issuer's reference is a broken pool, not a price. No bStock round
 *  trip exceeded 0.6% on any pair measured, and the worst sane Ondo side sat about 2% off. */
const SANE_PCT = 5;

export type IssuerLeg = {
  platform: string;
  tokenSymbol: string;
  address: string;
  referencePerShare: number | null;
  /** USDT per share received for selling `usd` worth. A real fill. */
  bidPerShare: number | null;
  /** USDT per share paid when buying with `usd`. A real fill. */
  askPerShare: number | null;
  /** Ask over bid: what a round trip costs on this issuer alone. */
  roundTripPct: number | null;
  bidVsReferencePct: number | null;
  askVsReferencePct: number | null;
  marketStatus: string | null;
  /** Gas for one swap in USD, as the aggregator prices it (`tradeFee`) — about $0.03, whatever the size. */
  gasUsdPerSwap: number | null;
  /** Why a side has no usable price — verbatim from the gateway, or the sanity check that dropped it. */
  bidNote: string | null;
  askNote: string | null;
};

type Route = { tokenSymbol: string; platform: string; vsNextPct: number | null };

export type CrossIssuerReport = {
  ticker: string;
  name: string;
  /** Size each side was quoted at, in USDT. Fills depend on it; thin pools refuse large ones. */
  usd: number;
  legs: IssuerLeg[];
  /** How far apart the issuers' own references sit — highest over lowest, per share. */
  referenceGapPct: number | null;
  /** Where the share costs least to buy at this size; `vsNextPct` is how much more the next issuer charges. */
  cheapestBuy: Route | null;
  /** Where the share fetches most at this size; `vsNextPct` is how much more than the next issuer pays. */
  bestSell: Route | null;
  /** The best of buying on one issuer and selling on another at this size. `pct` is before gas and
   *  usually negative; `afterGasUsd` subtracts both swaps' gas, which at $100 is about 0.06%. */
  arbitrage: { buy: string; sell: string; pct: number; afterGasUsd: number | null } | null;
  priceSource: 'aggregator-quote' | 'none';
  verdict: string;
  asOf: number;
};

export type IssuerPair = {
  ticker: string;
  name: string;
  issuers: { platform: string; tokenSymbol: string; referencePerShare: number | null; marketStatus: string | null }[];
  referenceGapPct: number | null;
};

const pct = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? (a / b - 1) * 100 : null);

function perShareReference(r: RwaRow): number | null {
  const v = Number(r.referencePrice);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Every listing of one underlying, ordered by platform so the output is stable. */
function listingsOf(rows: RwaRow[], ticker: string): RwaRow[] {
  return rows
    .filter((r) => (r.underlyingTicker ?? '').toUpperCase() === ticker.toUpperCase())
    .sort((a, b) => a.platformId.localeCompare(b.platformId));
}

function referenceGap(refs: (number | null)[]): number | null {
  const ok = refs.filter((v): v is number => v !== null);
  return ok.length > 1 ? pct(Math.max(...ok), Math.min(...ok)) : null;
}

/** One aggregator quote: what `amount` of `from` fetches in `to`, in base units, or why not. */
async function quoteOut(from: string, to: string, amount: string, wallet: string):
  Promise<{ out: number | null; impactPct: number | null; gasUsd: number | null; note: string | null }> {
  try {
    const r = await request('GET', '/api/v1/dex/aggregator/quote', {
      params: { binanceChainId: CHAIN_ID, fromTokenAddress: from, toTokenAddress: to, amount, userWalletAddress: wallet },
    });
    const row = (r.json as { data?: { toTokenAmount: string; priceImpactPercent?: string; tradeFee?: string }[] } | null)?.data?.[0];
    if (!row) return { out: null, impactPct: null, gasUsd: null, note: (r.json as { msg?: string } | null)?.msg ?? `no quote (HTTP ${r.status})` };
    const out = Number(row.toTokenAmount);
    // A fraction, whatever the name says — see the comment at the top of this section.
    const impactPct = row.priceImpactPercent !== undefined ? Number(row.priceImpactPercent) * 100 : null;
    // Not a protocol fee (`feeAmount` comes back null): it is the swap's gas in USD, and it is not
    // taken out of toTokenAmount — so a fill is before gas unless something subtracts this.
    const gasUsd = Number(row.tradeFee);
    return { out: Number.isFinite(out) && out > 0 ? out : null, impactPct, gasUsd: Number.isFinite(gasUsd) ? gasUsd : null, note: null };
  } catch (e) {
    return { out: null, impactPct: null, gasUsd: null, note: (e as Error).message };
  }
}

function brokenNote(vsRef: number, impactPct: number | null): string {
  const impact = impactPct !== null ? ` (the aggregator reports ${impactPct.toFixed(1)}% price impact)` : '';
  return `${Math.abs(vsRef).toFixed(1)}% ${vsRef < 0 ? 'under' : 'over'} its own reference${impact} — a broken pool, not a price; left out of routing`;
}

async function legFor(row: RwaRow, usd: number, wallet: string | undefined): Promise<IssuerLeg> {
  const ratio = Number(row.tokenToShareRatio);
  const decimals = Number(row.decimals) || 18;
  const referencePerShare = perShareReference(row);
  const leg: IssuerLeg = {
    platform: row.platformId, tokenSymbol: row.tokenSymbol, address: row.tokenContractAddress,
    referencePerShare, bidPerShare: null, askPerShare: null, roundTripPct: null,
    bidVsReferencePct: null, askVsReferencePct: null,
    marketStatus: row.statusInfo?.marketStatus ?? null, gasUsdPerSwap: null, bidNote: null, askNote: null,
  };

  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet ?? '')) {
    leg.bidNote = leg.askNote = 'no taker address — Ondo will not quote without one, so no side is priced';
    return leg;
  }
  // Size the sell from the row's own token price: it only has to land near `usd`, and the fill
  // is then divided by exactly what was sent.
  const tokenPrice = Number(row.tokenPrice);
  if (!(ratio > 0) || !(tokenPrice > 0)) {
    leg.bidNote = leg.askNote = 'the RWA row carries no usable price or ratio to size a quote from';
    return leg;
  }
  const sellUnits = baseUnits(usd / tokenPrice, decimals);
  const sold = Number(sellUnits) / 10 ** decimals;

  const [sell, buy] = await Promise.all([
    quoteOut(row.tokenContractAddress, USDT, sellUnits, wallet!),
    quoteOut(USDT, row.tokenContractAddress, baseUnits(usd, 18), wallet!), // USDT on BSC is 18 decimals
  ]);
  leg.bidPerShare = sell.out !== null ? sell.out / 1e18 / (sold * ratio) : null;
  leg.askPerShare = buy.out !== null ? usd / ((buy.out / 10 ** decimals) * ratio) : null;
  leg.bidNote = sell.note;
  leg.askNote = buy.note;
  const gas = [sell.gasUsd, buy.gasUsd].filter((g): g is number => g !== null);
  leg.gasUsdPerSwap = gas.length ? Math.max(...gas) : null;
  leg.bidVsReferencePct = pct(leg.bidPerShare, referencePerShare);
  leg.askVsReferencePct = pct(leg.askPerShare, referencePerShare);
  if (leg.bidVsReferencePct !== null && Math.abs(leg.bidVsReferencePct) > SANE_PCT) {
    leg.bidNote = brokenNote(leg.bidVsReferencePct, sell.impactPct);
  }
  if (leg.askVsReferencePct !== null && Math.abs(leg.askVsReferencePct) > SANE_PCT) {
    leg.askNote = brokenNote(leg.askVsReferencePct, buy.impactPct);
  }
  // From usable sides only: a round trip through a broken pool is a number, not a cost.
  leg.roundTripPct = pct(usableAsk(leg), usableBid(leg));
  return leg;
}

/** A side counts for routing only if it was quoted and passed the sanity check. */
function usableBid(l: IssuerLeg) { return l.bidPerShare !== null && !l.bidNote ? l.bidPerShare : null; }
function usableAsk(l: IssuerLeg) { return l.askPerShare !== null && !l.askNote ? l.askPerShare : null; }

function crossSentence(r: Omit<CrossIssuerReport, 'verdict'>): string {
  const { ticker: t, usd } = r;
  const size = `$${usd}`;
  if (r.priceSource === 'none') {
    const gap = r.referenceGapPct !== null ? ` Their own references for ${t} sit ${r.referenceGapPct.toFixed(2)}% apart.` : '';
    return `No executable price on any issuer — pass a taker address for real fills.${gap}`;
  }
  const out: string[] = [];

  const b = r.cheapestBuy;
  out.push(!b ? `Neither issuer will sell ${t} at a usable price for ${size} right now.`
    : b.vsNextPct === null ? `Only ${b.tokenSymbol} can be bought at a usable price for ${size} right now.`
    : b.vsNextPct < 0.1 ? `${t} costs the same to buy on either issuer.`
    : `${t} costs ${b.vsNextPct.toFixed(2)}% less to buy as ${b.tokenSymbol}.`);

  const s = r.bestSell;
  out.push(!s ? `Neither issuer will take ${t} back at a usable price for ${size} right now.`
    : s.vsNextPct === null ? `Only ${s.tokenSymbol} can be sold at a usable price for ${size} right now.`
    : s.vsNextPct < 0.1 ? `It fetches the same sold on either issuer.`
    : `It fetches ${s.vsNextPct.toFixed(2)}% more sold as ${s.tokenSymbol}.`);

  const a = r.arbitrage;
  if (a) {
    out.push(a.pct <= 0
      ? `No arbitrage between them: buying one and selling the other loses ${Math.abs(a.pct).toFixed(2)}% before gas.`
      : a.afterGasUsd === null
        ? `Buying ${a.buy} and selling ${a.sell} clears ${a.pct.toFixed(2)}% before gas; the aggregator did not price the gas.`
        : a.afterGasUsd > 0
          ? `Buying ${a.buy} and selling ${a.sell} clears ${a.pct.toFixed(2)}% before gas — $${a.afterGasUsd.toFixed(2)} after it, at this size.`
          : `Buying ${a.buy} and selling ${a.sell} clears ${a.pct.toFixed(2)}% before gas, but the two swaps' gas takes all of it at this size.`);
  }
  if (r.referenceGapPct !== null && r.referenceGapPct >= 0.1) {
    out.push(`The issuers disagree on the reference itself by ${r.referenceGapPct.toFixed(2)}%.`);
  }
  for (const l of r.legs) {
    for (const [side, note] of [['sell', l.bidNote], ['buy', l.askNote]] as const) {
      if (note?.includes('broken pool')) out.push(`${l.tokenSymbol}'s ${side} quote is ${note.split(' — ')[0]}, so it is left out.`);
    }
  }
  return out.join(' ');
}

/** One ticker across every issuer that lists it. `wallet` is required for fills — Ondo will not quote without it. */
export async function crossIssuerReport(ticker: string, wallet?: string, usd = 100): Promise<CrossIssuerReport | null> {
  const rows = listingsOf(await rwaTokens(), ticker);
  if (rows.length < 2) return null;

  const legs = await Promise.all(rows.map((r) => legFor(r, usd, wallet)));

  const asks = legs.map((l) => ({ l, v: usableAsk(l) })).filter((x): x is { l: IssuerLeg; v: number } => x.v !== null).sort((a, b) => a.v - b.v);
  const bids = legs.map((l) => ({ l, v: usableBid(l) })).filter((x): x is { l: IssuerLeg; v: number } => x.v !== null).sort((a, b) => b.v - a.v);

  let arbitrage: CrossIssuerReport['arbitrage'] = null;
  for (const buy of asks) {
    for (const sell of bids) {
      if (buy.l === sell.l) continue;
      const p = (sell.v / buy.v - 1) * 100;
      const gas = buy.l.gasUsdPerSwap !== null && sell.l.gasUsdPerSwap !== null ? buy.l.gasUsdPerSwap + sell.l.gasUsdPerSwap : null;
      if (!arbitrage || p > arbitrage.pct) {
        arbitrage = { buy: buy.l.tokenSymbol, sell: sell.l.tokenSymbol, pct: p, afterGasUsd: gas !== null ? usd * p / 100 - gas : null };
      }
    }
  }

  const base = {
    ticker: (rows[0].underlyingTicker ?? ticker).toUpperCase(),
    name: rows[0].underlyingName ?? '',
    usd,
    legs,
    referenceGapPct: referenceGap(legs.map((l) => l.referencePerShare)),
    cheapestBuy: asks[0] ? { tokenSymbol: asks[0].l.tokenSymbol, platform: asks[0].l.platform, vsNextPct: asks[1] ? pct(asks[1].v, asks[0].v) : null } : null,
    bestSell: bids[0] ? { tokenSymbol: bids[0].l.tokenSymbol, platform: bids[0].l.platform, vsNextPct: bids[1] ? pct(bids[0].v, bids[1].v) : null } : null,
    arbitrage,
    priceSource: legs.some((l) => l.bidPerShare !== null || l.askPerShare !== null) ? 'aggregator-quote' as const : 'none' as const,
    asOf: Date.now(),
  };
  return { ...base, verdict: crossSentence(base) };
}

/** Every ticker more than one issuer lists, widest reference disagreement first. One cached call, no quotes. */
export async function crossIssuerBoard(): Promise<IssuerPair[]> {
  const rows = await rwaTokens();
  const by = new Map<string, RwaRow[]>();
  for (const r of rows) {
    const t = (r.underlyingTicker ?? '').toUpperCase();
    if (t) by.set(t, [...(by.get(t) ?? []), r]);
  }
  return [...by]
    .filter(([, rs]) => rs.length > 1)
    .map(([ticker, rs]) => {
      const issuers = rs
        .sort((a, b) => a.platformId.localeCompare(b.platformId))
        .map((r) => ({ platform: r.platformId, tokenSymbol: r.tokenSymbol, referencePerShare: perShareReference(r), marketStatus: r.statusInfo?.marketStatus ?? null }));
      return { ticker, name: rs[0].underlyingName ?? ticker, issuers, referenceGapPct: referenceGap(issuers.map((i) => i.referencePerShare)) };
    })
    .sort((a, b) => (b.referenceGapPct ?? -1) - (a.referenceGapPct ?? -1));
}
