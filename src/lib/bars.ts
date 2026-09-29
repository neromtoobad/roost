import { SPECIES, CHAIN_ID, type Species, type Stock } from './pets';
import { request } from './binance';
import { quoteForStock } from './quote';
import type { Bar } from './strategy';

// Hourly bars for a Fledgling's home stock, shared by the history route and the hourly worker so
// the pet reacts to the same tape whether or not anyone has the app open.
//
// These are on-chain candles, not the exchange tape — which is the point. They keep printing
// through the weekend, when the underlying has been shut since Friday.
//
// Two shapes worth knowing, both of which cost an afternoon:
//   · `bar` is case-sensitive and lowercase. `1H` is rejected; `1h` is right.
//   · A candle is [open, high, low, close, volume, timestamp, trades] — the timestamp is at
//     index 5, not index 0 the way Binance spot klines put it.

export type BarSet = { bars: Bar[]; source: 'dex' | 'flat' | 'none' };

type Candle = [number, number, number, number, number, number, number];

/** A species id for its signature stock, or any stock. */
export async function fetchBars(target: Species['id'] | Pick<Stock, 'ticker' | 'address'>, days = 7): Promise<BarSet> {
  const sp = typeof target === 'string' ? SPECIES[target] : target;
  if (!sp) return { bars: [], source: 'none' };

  try {
    const r = await request('GET', '/api/v1/dex/market/candles', {
      params: {
        binanceChainId: CHAIN_ID,
        tokenContractAddress: sp.address,
        bar: '1h',
        limit: Math.min(days * 24, 500),
      },
    });
    const data = (r.json as { data?: Candle[] } | null)?.data;
    if (Array.isArray(data) && data.length) {
      const bars = data
        .map((c) => ({ t: Number(c[5]), open: Number(c[0]), high: Number(c[1]), low: Number(c[2]), close: Number(c[3]) }))
        .filter((b) => Number.isFinite(b.t) && Number.isFinite(b.close) && b.close > 0)
        .sort((a, b) => a.t - b.t);
      if (bars.length) return { bars, source: 'dex' };
    }
  } catch { /* fall through to the flat series */ }

  // No candles — a thin book, or a listing too new to have any. The engine still runs; it just
  // has nothing to react to, which is honest rather than invented movement.
  try {
    const q = await quoteForStock(sp);
    if (q.price) {
      const now = Date.now();
      const bars = Array.from({ length: days * 24 }, (_, k) => {
        const t = now - (days * 24 - 1 - k) * 3600e3;
        return { t, open: q.price!, high: q.price!, low: q.price!, close: q.price! };
      });
      return { bars, source: 'flat' };
    }
  } catch { /* nothing to offer */ }

  return { bars: [], source: 'none' };
}
