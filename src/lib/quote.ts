// The live print for a tokenized stock. Backpack's external source is the real exchange tape and
// needs no auth; a name with no exchange listing falls back to the on-chain price.

import { SPECIES, type Species } from './pets';

const TTL = 60_000;
const cache = new Map<string, { px: number | null; at: number }>();

export async function priceFor(ticker: string): Promise<number | null> {
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < TTL) return hit.px;

  let px: number | null = null;
  try {
    const r = await fetch(`https://api.backpack.exchange/api/v1/ticker?symbol=${ticker}.US_USDC&source=External`);
    const j = await r.json();
    px = j?.lastPrice ? Number(j.lastPrice) : null;
  } catch {}

  if (px === null) {
    const sp = Object.values(SPECIES).find((s: Species) => s.ticker === ticker);
    if (sp) {
      try {
        const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${sp.holdMint}`);
        const j = await r.json();
        const on = Number(j?.[sp.holdMint]?.usdPrice);
        if (on) px = on;
      } catch {}
    }
  }

  cache.set(ticker, { px, at: Date.now() });
  return px;
}

/** Prices for several tickers at once, de-duplicated. */
export async function pricesFor(tickers: string[]): Promise<Record<string, number | null>> {
  const uniq = [...new Set(tickers)];
  const pairs = await Promise.all(uniq.map(async (t) => [t, await priceFor(t)] as const));
  return Object.fromEntries(pairs);
}
