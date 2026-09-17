import { SPECIES, type Species } from './pets';
import type { Bar } from './strategy';

// Hourly bars for a species' home stock, shared by the history route and the hourly worker so the
// pet reacts to the same tape whether or not anyone has the app open.
//
// Backpack's external source is the real exchange tape and needs no auth. Pre-IPO names have no
// exchange, so they fall back to a flat series off the live on-chain price — the engine still runs,
// it just has nothing to react to.

export type BarSet = { bars: Bar[]; source: 'nasdaq' | 'onchain-flat' | 'none' };

export async function fetchBars(id: Species['id'], days = 7): Promise<BarSet> {
  const sp = SPECIES[id];
  const startTime = Math.floor(Date.now() / 1000) - days * 86400;

  if (!sp.preIpo) {
    try {
      const r = await fetch(
        `https://api.backpack.exchange/api/v1/klines?symbol=${sp.ticker}.US_USDC&interval=1h&startTime=${startTime}&source=External`,
        { next: { revalidate: 300 } },
      );
      const j = await r.json();
      if (Array.isArray(j) && j.length) {
        const bars = j
          .filter((b: { close: string | null }) => b.close)
          .map((b: { start: string; open: string; high: string; low: string; close: string }) => ({
            t: Date.parse(`${b.start.replace(' ', 'T')}Z`),
            open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close),
          }));
        if (bars.length) return { bars, source: 'nasdaq' };
      }
    } catch {}
  }

  try {
    const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${sp.holdMint}`, { next: { revalidate: 300 } });
    const j = await r.json();
    const px = Number(j?.[sp.holdMint]?.usdPrice);
    if (px) {
      const now = Date.now();
      const bars = Array.from({ length: days * 24 }, (_, k) => {
        const t = now - (days * 24 - 1 - k) * 3600e3;
        return { t, open: px, high: px, low: px, close: px };
      });
      return { bars, source: 'onchain-flat' };
    }
  } catch {}

  return { bars: [], source: 'none' };
}
