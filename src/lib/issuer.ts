import { CHAIN_ID, USDT, type Stock } from './pets';
import { request, baseUnits } from './binance';
import { listStocks, quotesForStocks, referencePerToken, shareRatio } from './quote';

// Two issuers sell most of the big names — NVDA as bStock's NVDAB and as Ondo's NVDAon — and they
// are different tokens at different prices. A Fledgling hatching from one of them should not pick
// by habit. This compares what one share actually costs through each, and picks.
//
// Per share, not per token: tokens drift from 1:1 as dividends are reinvested (tokenToShareRatio),
// so a cheaper token can still be the dearer share.
//
// Two ways to measure it, and the answer says which it used:
//
//   fill  a real aggregator quote for this wallet and this size — impact included. Needs a taker:
//         Ondo will not quote without one.
//   feed  the traded price from the market feed, divided by the ratio. What a paper pet is priced
//         at anyway, so for a paper pet it is the honest basis, not a fallback.
//
// Ondo often fills by request-for-quote — an EIP-712 order the owner signs, settled by a market
// maker — rather than a pool swap. The web app signs both, so both compete on price alone.

export type IssuerOption = {
  stock: Stock;
  /** USDT per underlying share, on the chosen basis. */
  perShare: number | null;
  /** How far that sits from this issuer's own reference, percent. */
  vsReferencePct: number | null;
  /** How the aggregator would fill it: an ordinary swap, or request-for-quote. Fill basis only. */
  mode: 'swap' | 'rfq' | null;
  /** Why this option has no usable price, verbatim from the gateway where it gave one. */
  note: string | null;
};

export type IssuerChoice = {
  ticker: string;
  company: string;
  pick: Stock;
  options: IssuerOption[];
  basis: 'fill' | 'feed' | 'only';
  /** The size quoted, for a fill. */
  usd: number | null;
  /** How much less a share costs through the pick than through the next usable option. */
  savingPct: number | null;
  /** One sentence, for the adopt screen and the pet's first diary line. */
  reason: string;
  asOf: number;
};

/** A quote this far from its own reference is a broken pool, not a price (lib/signal found the same). */
const SANE_PCT = 5;
/** Under this, the two cost the same; bStock wins the tie because it swaps at any hour. */
const TIE_PCT = 0.05;

const ISSUER: Record<string, string> = { bstock: 'bStock', ondo: 'Ondo' };
const issuerName = (s: Stock) => ISSUER[s.platform] ?? s.platform;

async function buyQuote(s: Stock, usd: number, wallet: string): Promise<{ tokens: number | null; mode: 'swap' | 'rfq' | null; note: string | null }> {
  const params = {
    binanceChainId: CHAIN_ID, fromTokenAddress: USDT, toTokenAddress: s.address,
    amount: baseUnits(usd, 18), // USDT on BSC has 18 decimals
    userWalletAddress: wallet,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Spaced per endpoint by lib/binance; a 42900 that still gets through is tried once more.
      const r = await request('GET', '/api/v1/dex/aggregator/quote', { params });
      if (r.code === 42900 && attempt === 0) { await new Promise((ok) => setTimeout(ok, 600)); continue; }
      const row = (r.json as { data?: { toTokenAmount?: string; executionMode?: string }[] } | null)?.data?.[0];
      if (!row) return { tokens: null, mode: null, note: (r.json as { msg?: string } | null)?.msg ?? `no quote (HTTP ${r.status})` };
      const tokens = Number(row.toTokenAmount) / 10 ** s.decimals;
      return {
        tokens: Number.isFinite(tokens) && tokens > 0 ? tokens : null,
        mode: row.executionMode === 'RFQ' ? 'rfq' : 'swap',
        note: null,
      };
    } catch (e) {
      return { tokens: null, mode: null, note: (e as Error).message };
    }
  }
  return { tokens: null, mode: null, note: 'rate limited' };
}

async function option(s: Stock, basis: 'fill' | 'feed', usd: number, wallet: string | undefined, feedPrice: number | null): Promise<IssuerOption> {
  const [ratio, refToken] = await Promise.all([shareRatio(s.address), referencePerToken(s.address)]);
  const out: IssuerOption = { stock: s, perShare: null, vsReferencePct: null, mode: null, note: null };
  if (!ratio) return { ...out, note: 'no share ratio in the RWA list' };

  let perToken: number | null = null;
  if (basis === 'fill') {
    const q = await buyQuote(s, usd, wallet!);
    out.mode = q.mode;
    out.note = q.note;
    perToken = q.tokens ? usd / q.tokens : null;
  } else {
    perToken = feedPrice;
    if (perToken === null) out.note = 'no traded price in the feed';
  }
  if (perToken === null) return out;

  out.perShare = perToken / ratio;
  out.vsReferencePct = refToken ? (perToken / refToken - 1) * 100 : null;
  if (out.vsReferencePct !== null && Math.abs(out.vsReferencePct) > SANE_PCT) {
    const off = Math.abs(out.vsReferencePct);
    out.note = `${off > 100 ? 'absurdly' : `${off.toFixed(1)}%`} ${out.vsReferencePct < 0 ? 'under' : 'over'} its own reference — a broken pool, not a price`;
  }
  return out;
}

const usable = (o: IssuerOption) => o.perShare !== null && !o.note;

/**
 * Which token a Fledgling of `ticker` should hatch from. With a wallet the comparison is real fills
 * at `usd`; without one it is the feed. Null when nothing on BSC lists the ticker.
 */
export async function chooseIssuer(ticker: string, opts: { wallet?: string; usd?: number } = {}): Promise<IssuerChoice | null> {
  const t = ticker.toUpperCase();
  const listings: Stock[] = (await listStocks())
    .filter((s) => s.ticker === t)
    .map(({ volume24h: _v, ...s }) => s) // eslint-disable-line @typescript-eslint/no-unused-vars
    .sort((a, b) => a.platform.localeCompare(b.platform)); // bstock before ondo: the tie-break order
  if (!listings.length) return null;

  const company = listings[0].company;
  const now = Date.now();
  if (listings.length === 1) {
    const only = listings[0];
    return {
      ticker: t, company, pick: only, basis: 'only', usd: null, savingPct: null, asOf: now,
      options: [{ stock: only, perShare: null, vsReferencePct: null, mode: null, note: null }],
      reason: `Only ${issuerName(only)} lists ${t} on BSC, so it is ${only.tokenSymbol}.`,
    };
  }

  const wallet = opts.wallet && /^0x[a-fA-F0-9]{40}$/.test(opts.wallet) ? opts.wallet : undefined;
  const basis: 'fill' | 'feed' = wallet ? 'fill' : 'feed';
  const usd = Math.min(Math.max(opts.usd ?? 25, 6), 1000);
  const feed = basis === 'feed' ? await quotesForStocks(listings) : {};
  const options = await Promise.all(listings.map((s) =>
    option(s, basis, usd, wallet, feed[s.address.toLowerCase()]?.price ?? null)));

  // Cheapest per share first, whether it fills by swap or by request-for-quote.
  const pool = options.filter(usable).sort((a, b) => a.perShare! - b.perShare!);
  const how = basis === 'fill' ? `for $${usd}, quoted for your wallet` : 'at the traded price';

  if (!pool.length) {
    // Nothing priced: keep the tie-break order and say so rather than pretend there was a choice.
    const pick = listings[0];
    const why = options.map((o) => `${o.stock.tokenSymbol}: ${o.note ?? 'no price'}`).join('; ');
    return {
      ticker: t, company, pick, options, basis, usd: basis === 'fill' ? usd : null, savingPct: null, asOf: now,
      reason: `Neither issuer would price ${t} just now (${why}), so it is ${pick.tokenSymbol}, which swaps at any hour.`,
    };
  }

  let pick = pool[0];
  let next = pool.find((o) => o !== pick) ?? null;
  // Too close to call: the one that swaps at any hour.
  if (next && (next.perShare! / pick.perShare! - 1) * 100 < TIE_PCT && next.stock.platform === 'bstock') [pick, next] = [next, pick];
  const savingPct = next ? Math.max(0, (next.perShare! / pick.perShare! - 1) * 100) : null;

  let reason: string;
  if (!next) {
    const other = options.find((o) => o !== pick)!;
    reason = `${pick.stock.tokenSymbol} is the only ${t} that would price ${how}${other.note ? ` — ${other.stock.tokenSymbol}: ${other.note}` : ''}.`;
  } else if (savingPct! < TIE_PCT) {
    reason = `${t} costs the same per share either way ${how}, so it is ${pick.stock.tokenSymbol}${pick.stock.platform === 'bstock' ? ', which swaps at any hour' : ''}.`;
  } else {
    reason = `${pick.stock.tokenSymbol} costs ${savingPct!.toFixed(2)}% less per share than ${next.stock.tokenSymbol} ${how}.`;
  }
  if (basis === 'fill' && pick.mode === 'rfq') reason += ' It fills by request-for-quote: you sign an order and a market maker settles it.';

  return { ticker: t, company, pick: pick.stock, options, basis, usd: basis === 'fill' ? usd : null, savingPct, reason, asOf: now };
}
