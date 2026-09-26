'use client';
import { useMemo } from 'react';
import { setLocal, useLocal } from './client';
import { isPaper, type Entry, type Launch, type PetState, type Personality } from './pet-math';
import { SPECIES, type Species } from './pets';

// Pet state as the browser holds it. Feeding adds cash; the strategy engine decides what to do with
// it. Those are separate on purpose — "you fed it" and "it bought something" are different events,
// and only the second one is the pet acting on its own.
//
// The shape and the arithmetic live in ./pet-math, which the server and the hourly worker share.

export * from './pet-math';

export const PERSONALITIES: Record<Personality, { name: string; tagline: string; icon: string }> = {
  diamond: { name: 'Diamond Hands', tagline: 'deploys at every open, lends it all, never sells', icon: '💎' },
  degen:   { name: 'Degen',         tagline: 'hunts 2% dips at any hour',                        icon: '⚡' },
  boomer:  { name: 'Boomer',        tagline: 'regular hours only, keeps 20% in reserve',          icon: '🕰' },
  quant:   { name: 'Quant',         tagline: 'weekly rebalance, cites basis points',              icon: '📊' },
};

const KEY = 'roost.pet';
const day = (t: number) => new Date(t).toLocaleDateString('en-CA');

export function usePet(): PetState | null {
  const raw = useLocal(KEY);
  return useMemo(() => {
    if (!raw) return null;
    try { return migrate(JSON.parse(raw)); } catch { return null; }
  }, [raw]);
}

/** Pets adopted before the engine existed stored feeds instead of lots. */
export function migrate(p: PetState & { feeds?: { ts: number; usd: number; price: number | null }[] }): PetState {
  if (p.cash !== undefined) return p;
  const feeds = p.feeds ?? [];
  return {
    ...p,
    cash: feeds.filter((f) => !f.price).reduce((s, f) => s + f.usd, 0),
    lots: feeds.filter((f) => f.price).map((f) => ({ ts: f.ts, qty: f.usd / f.price!, price: f.price! })),
    lentQty: 0, yieldQty: 0, lastTickAt: p.adoptedAt, proposal: null,
  };
}

export function savePet(p: PetState) { setLocal(KEY, JSON.stringify(p)); }
/** Read outside React — the engine runs in a fetch callback, not during render. */
export function readPet(): PetState | null {
  try { const raw = localStorage.getItem(KEY); return raw ? migrate(JSON.parse(raw)) : null; } catch { return null; }
}

/** Fold entries the worker wrote while the app was closed into the local diary, newest last. */
export function mergeEntries(p: PetState, incoming: Entry[]): PetState {
  if (!incoming.length) return p;
  const seen = new Set(p.diary.map((e) => `${e.ts}:${e.kind}`));
  const add = incoming.filter((e) => !seen.has(`${e.ts}:${e.kind}`));
  if (!add.length) return p;
  return { ...p, diary: [...p.diary, ...add].sort((a, b) => a.ts - b.ts) };
}


// ——— lifecycle ———
export function adoptPet(init: { species: Species['id']; name: string; personality: Personality }): PetState {
  const t = Date.now();
  const p: PetState = {
    ...init, adoptedAt: t, lastFed: t, streak: 1, lastVisitDay: day(t),
    cash: 0, lots: [], lentQty: 0, yieldQty: 0, lastTickAt: t, proposal: null,
    diary: [{ ts: t, text: hatchLine(init.personality, init.name), kind: 'system' }],
  };
  savePet(p);
  return p;
}

export function touchVisit(p: PetState): PetState {
  const today = day(Date.now());
  if (p.lastVisitDay === today) return p;
  const yesterday = day(Date.now() - 86_400_000);
  const next = { ...p, streak: p.lastVisitDay === yesterday ? p.streak + 1 : 1, lastVisitDay: today };
  savePet(next);
  return next;
}

/** Feeding only adds cash. What happens to it is the pet's call. */
export function feedPet(p: PetState, usd: number): PetState {
  const t = Date.now();
  const next: PetState = {
    ...p, lastFed: t, cash: p.cash + usd,
    diary: [...p.diary, { ts: t, text: `Fed $${usd}.`, kind: 'feed', usd }],
  };
  savePet(next);
  return next;
}

// Adoption is local. There is no server-side agent to create any more: execution runs through
// the owner's own Binance Agentic Wallet, so the only thing that makes a pet live is a bound
// wallet address. See lib/agent.ts for why Roost deliberately holds no keys.
export async function adoptPetRemote(
  init: { species: Species['id']; name: string; personality: Personality },
  wallet?: string,
): Promise<PetState> {
  const p = adoptPet(init);
  if (wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    const next = { ...p, wallet };
    savePet(next);
    return next;
  }
  return p;
}

export async function feedPetRemote(p: PetState, usd: number, _marketOpen: boolean): Promise<PetState> {
  // Feeding credits the pet's cash. What it then does with that cash is its own decision, and
  // executing it is the agent's job through `baw` — ask POST /api/agent what it wants to do.
  return feedPet(p, usd);
}

/**
 * A buy that happened on-chain, recorded from its receipt. `fromCash` is the pet's own decision
 * being signed (it spends cash the owner fed earlier); otherwise the owner fed and it ate at once.
 * Returns the new pet and the entries it added, for syncing.
 */
export function recordBuy(
  p: PetState,
  b: { hash: string; qty: number; spent: number; fromCash: boolean; reason?: string },
): { pet: PetState; fresh: Entry[] } {
  const t = Date.now();
  const ticker = SPECIES[p.species].ticker;
  const price = b.spent / b.qty;
  const fresh: Entry[] = [
    ...(b.fromCash ? [] : [{ ts: t, text: `Fed $${b.spent.toFixed(2)}.`, kind: 'feed' as const, usd: b.spent }]),
    {
      ts: t + 1, kind: 'buy', qty: b.qty, price, usd: b.spent, sig: b.hash, paper: false,
      text: b.reason ?? `Ate it. ${b.qty.toFixed(4)} ${ticker}, on-chain, signed by you.`,
    },
  ];
  const next: PetState = {
    ...p,
    lastFed: b.fromCash ? p.lastFed : t,
    cash: b.fromCash ? Math.max(0, p.cash - b.spent) : p.cash,
    proposal: b.fromCash ? null : p.proposal,
    lots: [...p.lots, { ts: t, qty: b.qty, price }],
    diary: [...p.diary, ...fresh],
  };
  savePet(next);
  return { pet: next, fresh };
}

export function saveLaunch(p: PetState, launch: Launch) {
  savePet({ ...p, launch, diary: [...p.diary, { ts: launch.ts, text: `Rang the bell. ${p.name} is public.`, kind: 'system', sig: launch.sig }] });
}

export function answerProposal(p: PetState, accept: boolean, price: number): PetState {
  if (!p.proposal) return p;
  const t = Date.now();
  if (!accept) {
    savePet({ ...p, proposal: null, diary: [...p.diary, { ts: t, text: 'Fine. Not today.', kind: 'hold' }] });
    return p;
  }
  const usd = Math.min(p.proposal.usd, p.cash);
  const qty = usd / price;
  const next: PetState = {
    ...p, proposal: null, cash: p.cash - usd, lots: [...p.lots, { ts: t, qty, price }],
    diary: [...p.diary, { ts: t, text: `You said yes. Bought ${qty.toFixed(4)} at $${price.toFixed(2)}.`, kind: 'buy', qty, price, usd, paper: isPaper(p) }],
  };
  savePet(next);
  return next;
}

// ——— voice ———
function hatchLine(v: Personality, name: string) {
  return {
    diamond: `${name} online. I don't sell. I don't even know how.`,
    degen: `${name} HAS ENTERED THE CHAT. where's the dip`,
    boomer: `${name} here. Markets open at 9:30. I'll be ready at 9:00.`,
    quant: `${name} initialized. Baseline: zero. Everything from here is alpha.`,
  }[v];
}

export const waitingLine: Record<Personality, string> = {
  diamond: 'Holding it for the open. Every open, same thing.',
  degen: 'Sitting on it. Waiting for something to break.',
  boomer: 'It will be deployed during regular hours. Not before.',
  quant: 'Queued for the next rebalance window.',
};
