import { nyseSession } from './session';
import type { Personality } from './pet-math';

// The personality you pick at adoption IS the trading strategy. Each rule is a pure function of
// (price bars, state) so the engine can replay a window deterministically and the UI can explain
// every decision. Nothing here touches the network.
//
// None of them lends. No venue on BSC takes a tokenized equity as collateral, so a rule that "lent"
// would be reporting yield nobody pays — even on paper, that is a number that lies.

export type Bar = { t: number; open: number; high: number; low: number; close: number };

export type Intent =
  /** `reason` narrates a fill (paper); `why` says what fired, for a live pet asking to be signed. */
  | { kind: 'buy'; usd: number; reason: string; why?: string }
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
const DIP = 0.02;               // 2% off the recent high
const DEGEN_COOLDOWN = 6 * 3600e3;
const BIG_MOVE = 25;            // over $25 the pet asks first
const NIGHT_DISCOUNT = 0.01;    // 1% under the last regular-session close
const MOMENTUM_BARS = 120;      // five days of hourly bars

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

/** The close of the last regular-session bar before `i`: where the exchange left the price. */
function lastSessionClose(bars: Bar[], i: number): number | null {
  for (let j = i - 1; j >= 0; j--) if (isOpen(bars[j].t)) return bars[j].close;
  return null;
}

/** Mean close of the trailing `n` bars up to and including `i`. */
function trailingMean(bars: Bar[], i: number, n: number): number {
  const from = Math.max(0, i - n + 1);
  let sum = 0;
  for (let j = from; j <= i; j++) sum += bars[j].close;
  return sum / (i - from + 1);
}

/** What would this personality do at bar `i`? One intent per bar, or null for "nothing". */
export function decide(p: Personality, bars: Bar[], i: number, s: StrategyState): Intent | null {
  const bar = bars[i];
  const canSpend = s.cash >= MIN_TICKET;

  switch (p) {
    case 'diamond': {
      // DCA the whole balance at every open. Never sells.
      if (canSpend && isMarketOpenBar(bars, i)) return { kind: 'buy', usd: s.cash, reason: 'Market open. Deployed everything.', why: 'the market just opened' };
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
      // Weekly rebalance, starting with the first session after adoption — not a week after it.
      const weekly = s.heldQty === 0 || bar.t - s.lastBuyAt >= 7 * 86400e3;
      if (canSpend && weekly && isOpen(bar.t)) return { kind: 'buy', usd: s.cash, reason: 'Weekly rebalance executed.', why: 'the weekly rebalance is due' };
      return null;
    }
    case 'night': {
      // Only while the exchange is shut, and only at a discount to where it last closed.
      if (!canSpend || isOpen(bar.t)) return null;
      if (bar.t - s.lastBuyAt < DEGEN_COOLDOWN) return null;
      const close = lastSessionClose(bars, i);
      if (!close) return null;
      const off = (close - bar.close) / close;
      if (off < NIGHT_DISCOUNT) return null;
      const usd = Math.max(MIN_TICKET, s.cash * 0.5);
      const why = `${(off * 100).toFixed(1)}% under the last close, with the exchange shut`;
      return usd > BIG_MOVE
        ? { kind: 'propose', usd, reason: why }
        : { kind: 'buy', usd, reason: `${(off * 100).toFixed(1)}% under the last close while Wall Street sleeps. Bought it.`, why };
    }
    case 'momentum': {
      // Weekly, at the open, and only into strength — above its five-day average.
      if (!canSpend || !isMarketOpenBar(bars, i)) return null;
      if (s.heldQty > 0 && bar.t - s.lastBuyAt < 7 * 86400e3) return null;
      const avg = trailingMean(bars, i, MOMENTUM_BARS);
      const above = (bar.close / avg - 1) * 100;
      const pct = (v: number) => `${Math.abs(v) < 1 ? Math.abs(v).toFixed(2) : Math.abs(v).toFixed(1)}%`;
      if (above <= 0) return { kind: 'hold', reason: `${pct(above)} under its five-day average. Not chasing a falling one.` };
      return { kind: 'buy', usd: s.cash, reason: `${pct(above)} above its five-day average. Riding it.`, why: `${pct(above)} above its five-day average` };
    }
  }
}
