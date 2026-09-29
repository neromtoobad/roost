import type { Species, Stock } from './pets';
import type { IssuerChoice } from './issuer';

// A litter: several Fledglings hatched together from a theme, and fed as one.
//
// The themes are Binance's own. The RWA token list documents sector tabs by these names — Magnificent
// 7, AI Chips, ETF, Buffett Portfolio — but the gateway ignores the `tabId` that selects them and
// returns all 448 tickers whatever it is set to (see lib/company). So the lists live here, and
// every ticker in them was checked against the live list on 2026-09-29.
//
// Feeding a litter is a rebalance with new money: whatever goes in tops up the pups that have
// fallen furthest below an equal share first, and nobody is sold to make room. Fewer trades than
// selling winners, and no pup is fed just to be fed.

export type Litter = {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  /** Ticker, and what the pup is called — the company, as people say it. */
  members: { ticker: string; name: string }[];
};

export const LITTERS: Litter[] = [
  {
    id: 'mag7', name: 'Magnificent 7', icon: '👑', blurb: 'The seven biggest names in US tech.',
    members: [
      { ticker: 'AAPL', name: 'Apple' }, { ticker: 'MSFT', name: 'Microsoft' }, { ticker: 'GOOGL', name: 'Alphabet' },
      { ticker: 'AMZN', name: 'Amazon' }, { ticker: 'META', name: 'Meta' }, { ticker: 'NVDA', name: 'Nvidia' },
      { ticker: 'TSLA', name: 'Tesla' },
    ],
  },
  {
    id: 'chips', name: 'AI Chips', icon: '🧠', blurb: 'Who designs, makes and packs the silicon AI runs on.',
    members: [
      { ticker: 'NVDA', name: 'Nvidia' }, { ticker: 'AMD', name: 'AMD' }, { ticker: 'AVGO', name: 'Broadcom' },
      { ticker: 'TSM', name: 'TSMC' }, { ticker: 'MU', name: 'Micron' }, { ticker: 'ARM', name: 'Arm' },
    ],
  },
  {
    id: 'etf', name: 'Whole market', icon: '🌐', blurb: 'Four funds, thousands of companies — and some gold.',
    members: [
      { ticker: 'SPY', name: 'S&P 500' }, { ticker: 'QQQ', name: 'Nasdaq 100' },
      { ticker: 'IWM', name: 'Small caps' }, { ticker: 'GLD', name: 'Gold' },
    ],
  },
  {
    id: 'buffett', name: 'Buffett Portfolio', icon: '🎩', blurb: "Names Berkshire Hathaway has held for years.",
    members: [
      { ticker: 'AAPL', name: 'Apple' }, { ticker: 'BAC', name: 'BofA' }, { ticker: 'AXP', name: 'AmEx' },
      { ticker: 'KO', name: 'Coca-Cola' }, { ticker: 'CVX', name: 'Chevron' }, { ticker: 'OXY', name: 'Occidental' },
    ],
  },
];

export const litterById = (id: string) => LITTERS.find((l) => l.id === id);

/** A litter's pup as /api/litter resolves it: which token it hatches from, and why that one. */
export type LitterMember = {
  ticker: string;
  name: string;
  stock: Stock | null;
  species: Species['id'];
  choice: Pick<IssuerChoice, 'basis' | 'savingPct' | 'reason' | 'options'> | null;
  error?: string;
};

/**
 * Split `cash` so the emptiest bowls fill first. `values` is what each pup holds now, in dollars;
 * the answer is what each one gets. It raises the lowest to meet the next, then both to meet the
 * one after, until the money runs out — so after the feed, everyone who ate sits at one level.
 *
 * `min` is the smallest order worth placing (Ondo refuses $5 and under). A pup whose share would come
 * in under it waits for next time, and its share goes to the others — the fullest one waits first.
 */
export function allocate(values: number[], cash: number, min = 0): number[] {
  const zero = values.map(() => 0);
  if (!(cash > 0) || !values.length || cash < min) return zero;

  let active = values.map((_, i) => i);
  while (active.length) {
    const sorted = [...active].sort((a, b) => values[a] - values[b]);
    // The level the water reaches: fill the lowest k until the next one is higher than the level.
    let level = 0, sum = 0;
    for (let k = 0; k < sorted.length; k++) {
      sum += values[sorted[k]];
      level = (cash + sum) / (k + 1);
      if (k + 1 === sorted.length || level <= values[sorted[k + 1]]) break;
    }
    const share = values.map((v, i) => (active.includes(i) ? Math.max(0, level - v) : 0));
    const small = active.filter((i) => share[i] > 1e-9 && share[i] < min);
    if (!small.length) return cents(share, cash);
    const waits = small.reduce((a, b) => (share[a] <= share[b] ? a : b));
    active = active.filter((i) => i !== waits);
  }
  return zero;
}

/** Round to cents without losing any: whatever rounding drops goes to the biggest share. */
function cents(share: number[], cash: number): number[] {
  const out = share.map((v) => Math.floor(v * 100) / 100);
  const left = Math.round((cash - out.reduce((s, v) => s + v, 0)) * 100) / 100;
  if (left > 0) {
    const big = out.reduce((b, v, i) => (v > out[b] ? i : b), 0);
    out[big] = Math.round((out[big] + left) * 100) / 100;
  }
  return out;
}
