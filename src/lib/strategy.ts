import { nyseSession } from './session';
import type { Personality } from './pet-math';

// The personality you pick at adoption IS the trading strategy. Each rule is a pure function of
// (price bars, state) so the engine can replay a window deterministically and the UI can explain
// every decision. Nothing here touches the network.

export type Bar = { t: number; open: number; high: number; low: number; close: number };

export type Intent =
  /** `reason` narrates a fill (paper); `why` says what fired, for a live pet asking to be signed. */
  | { kind: 'buy'; usd: number; reason: string; why?: string }
  | { kind: 'lend'; reason: string }
  | { kind: 'propose'; usd: number; reason: string }   // needs the owner's nod
  | { kind: 'hold'; reason: string };

export type StrategyState = {
  cash: number;          // fed, not yet deployed
  heldQty: number;       // shares owned
  lentQty: number;       // shares lent for yield
  lastBuyAt: number;     // ms
  totalFed: number;      // lifetime, for cash-reserve rules
};

const MIN_TICKET = 5;           // don't bother below $5
const MIN_LEND = 1e-4;          // don't re-lend dust
const DIP = 0.02;               // 2% off the recent high
const DEGEN_COOLDOWN = 6 * 3600e3;
const BIG_MOVE = 25;            // over $25 the pet asks first

/** Highest close in the trailing `hours` before `i`. */
function recentHigh(bars: Bar[], i: number, hours = 24): number {
  let hi = 0;
  for (let j = Math.max(0, i - hours); j <= i; j++) hi = Math.max(hi, bars[j].close);
  return hi;
}

const isOpen = (t: number) => nyseSession(new Date(t)) === 'regular';
/** True on the first regular-session bar of a day. */
function isMarketOpenBar(bars: Bar[], i: number): boolean {
  if (!isOpen(bars[i].t)) return false;
  return i === 0 || !isOpen(bars[i - 1].t);
}

/** What would this personality do at bar `i`? One intent per bar, or null for "nothing". */
export function decide(p: Personality, bars: Bar[], i: number, s: StrategyState): Intent | null {
  const bar = bars[i];
  const canSpend = s.cash >= MIN_TICKET;
  const unlent = s.heldQty - s.lentQty;

  switch (p) {
    case 'diamond': {
      // DCA the whole balance at every open, then lend everything. Never sells.
      if (canSpend && isMarketOpenBar(bars, i)) return { kind: 'buy', usd: s.cash, reason: 'Market open. Deployed everything.', why: 'the market just opened' };
      if (unlent > MIN_LEND) return { kind: 'lend', reason: 'Lent it out. Idle shares are wasted shares.' };
      return null;
    }
    case 'degen': {
      // Buys dips at any hour, in 40% clips, with a cooldown. Asks first above $25.
      if (!canSpend) return null;
      if (bar.t - s.lastBuyAt < DEGEN_COOLDOWN) return null;
      const hi = recentHigh(bars, i);
      const off = (hi - bar.close) / hi;
      if (off < DIP) return null;
      const usd = Math.max(MIN_TICKET, s.cash * 0.4);
      const reason = `Down ${(off * 100).toFixed(1)}% from the 24h high. Bought it.`;
      return usd > BIG_MOVE
        ? { kind: 'propose', usd, reason: `down ${(off * 100).toFixed(1)}% from the 24h high` }
        : { kind: 'buy', usd, reason, why: `down ${(off * 100).toFixed(1)}% from the 24h high` };
    }
    case 'boomer': {
      // Regular hours only, keeps a 20% cash reserve, one purchase a day.
      if (!isMarketOpenBar(bars, i)) return null;
      const reserve = s.totalFed * 0.2;
      const deployable = s.cash - reserve;
      if (deployable < MIN_TICKET) return { kind: 'hold', reason: 'Holding the reserve. One does not deploy everything.' };
      return { kind: 'buy', usd: deployable, reason: 'Purchased during regular hours, as is proper.', why: 'regular hours, with the reserve kept back' };
    }
    case 'quant': {
      // Weekly rebalance; lends the rest.
      const weekly = bar.t - s.lastBuyAt >= 7 * 86400e3;
      if (canSpend && weekly && isOpen(bar.t)) return { kind: 'buy', usd: s.cash, reason: 'Weekly rebalance executed.', why: 'the weekly rebalance is due' };
      if (unlent > MIN_LEND) return { kind: 'lend', reason: 'Collateral deployed. Carry is carry.' };
      return null;
    }
  }
}

/** Kamino xStocks vaults quote roughly 2% APY; accrue it per hour on the lent balance. */
export const HOURLY_YIELD = 0.02 / (365 * 24);
