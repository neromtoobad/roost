import { decide, HOURLY_YIELD, type Bar, type StrategyState } from './strategy';
import { isPaper, totalFed, type Entry, type PetState } from './pet-math';

// Replays the hours since the pet last ticked and applies whatever its strategy decided.
// Deterministic: same bars + same state always produce the same actions, so the diary is
// reproducible and every line can be explained.
//
// Pure — it returns the next pet rather than storing it. The browser writes the result to
// localStorage, the hourly worker writes it to Postgres, and both get identical actions.
//
// A live Fledgling — one bound to a wallet — never records a trade here. Roost holds no keys, so
// nothing it decides can happen until the owner signs: a buy becomes a request for a signature,
// and the lot is written only from the receipt once they do (store.recordBuy). A paper Fledgling
// still fills at the bar's close, and says it is paper.

export type TickResult = { pet: PetState; fresh: Entry[]; from: number; to: number };

export function runEngine(pet: PetState, bars: Bar[], now = Date.now()): TickResult {
  const from = pet.lastTickAt || pet.adoptedAt;
  const window = bars.filter((b) => b.t > from && b.t <= now).sort((a, b) => a.t - b.t);
  if (!window.length) return { pet, fresh: [], from, to: now };

  const s: StrategyState = {
    cash: pet.cash,
    heldQty: pet.lots.reduce((n, l) => n + l.qty, 0) + pet.yieldQty,
    lentQty: pet.lentQty,
    lastBuyAt: pet.lots.at(-1)?.ts ?? pet.adoptedAt,
    totalFed: totalFed(pet),
  };
  const lots = [...pet.lots];
  const fresh: Entry[] = [];
  const paper = isPaper(pet);
  let yieldQty = pet.yieldQty;
  let proposal = pet.proposal ?? null;
  let earnedThisRun = 0;

  for (let i = 0; i < window.length; i++) {
    const bar = window[i];
    const idx = bars.findIndex((b) => b.t === bar.t);

    // Lending accrues every hour it sits, and compounds — earned shares stay lent rather than
    // reappearing as idle and re-triggering a lend every hour.
    if (s.lentQty > 0) {
      const earned = s.lentQty * HOURLY_YIELD;
      yieldQty += earned; s.heldQty += earned; s.lentQty += earned; earnedThisRun += earned;
    }

    if (proposal) continue; // one open question at a time; the pet waits for an answer

    const intent = decide(pet.personality, bars, idx < 0 ? i : idx, s);
    if (!intent) continue;

    if (intent.kind === 'buy' && !paper) {
      const usd = Math.min(intent.usd, s.cash);
      if (usd < 1) continue;
      const why = intent.why ?? 'its rule fired';
      proposal = { ts: bar.t, usd, reason: why };
      fresh.push({ ts: bar.t, text: `Wants to buy $${usd.toFixed(2)} — ${why}. Needs your signature.`, kind: 'ask', usd });
    } else if (intent.kind === 'lend' && !paper) {
      // No venue on BSC takes a tokenized equity as collateral. A paper pet can pretend; real
      // shares stay idle rather than report yield nobody is paying.
      continue;
    } else if (intent.kind === 'buy') {
      const usd = Math.min(intent.usd, s.cash);
      if (usd < 1) continue;
      const qty = usd / bar.close;
      lots.push({ ts: bar.t, qty, price: bar.close });
      s.cash -= usd; s.heldQty += qty; s.lastBuyAt = bar.t;
      fresh.push({ ts: bar.t, text: intent.reason, kind: 'buy', qty, price: bar.close, usd, paper });
    } else if (intent.kind === 'lend') {
      const add = s.heldQty - s.lentQty;
      if (add <= 1e-9) continue;
      s.lentQty += add;
      fresh.push({ ts: bar.t, text: intent.reason, kind: 'lend', qty: add, paper });
    } else if (intent.kind === 'propose') {
      proposal = { ts: bar.t, usd: Math.min(intent.usd, s.cash), reason: intent.reason };
      fresh.push({ ts: bar.t, text: `Wants to put $${proposal.usd.toFixed(0)} in — ${intent.reason}.`, kind: 'ask', usd: proposal.usd });
    } else if (intent.kind === 'hold' && !fresh.some((f) => f.kind === 'hold')) {
      fresh.push({ ts: bar.t, text: intent.reason, kind: 'hold' });
    }
  }

  if (earnedThisRun > 1e-9) {
    fresh.push({ ts: now, text: `Earned ${earnedThisRun.toFixed(5)} from lending while you were away.`, kind: 'yield', qty: earnedThisRun, paper });
  }

  const next: PetState = {
    ...pet, cash: s.cash, lots, lentQty: s.lentQty, yieldQty, lastTickAt: now, proposal,
    diary: fresh.length ? [...pet.diary, ...fresh] : pet.diary,
  };
  return { pet: next, fresh, from, to: now };
}

export function awayLabel(ms: number): string {
  const h = ms / 3600e3;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60e3))} minutes`;
  if (h < 48) return `${Math.round(h)} hours`;
  return `${Math.round(h / 24)} days`;
}
