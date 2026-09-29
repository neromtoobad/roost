'use client';
import { useMemo } from 'react';
import { setLocal, useLocal } from './client';
import { isPaper, stockOf, type Entry, type Launch, type Lot, type PetState, type Personality } from './pet-math';
import type { Species, Stock } from './pets';

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

// A nest: every Fledgling this device has adopted, and which one is on screen. It replaced a single
// pet under 'roost.pet'; a device that still has one is moved into a nest of one on its first write,
// taking its server id ('roost.remoteId') with it.
const NEST = 'roost.nest';
const LEGACY = 'roost.pet';
const LEGACY_REMOTE = 'roost.remoteId';

type Nest = { pets: PetState[]; current: string | null };

const day = (t: number) => new Date(t).toLocaleDateString('en-CA');
const newUid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

function parseNest(raw: string | null): Nest | null {
  if (!raw) return null;
  try {
    const n = JSON.parse(raw) as Nest;
    return Array.isArray(n.pets) ? { pets: n.pets.map(migrate), current: n.current ?? n.pets[0]?.uid ?? null } : null;
  } catch { return null; }
}

/** The nest as stored — moving a legacy single pet into it the first time. Browser only. */
function loadNest(): Nest {
  try {
    const nest = parseNest(localStorage.getItem(NEST));
    if (nest) return nest;
    const legacy = localStorage.getItem(LEGACY);
    if (!legacy) return { pets: [], current: null };
    const remote = localStorage.getItem(LEGACY_REMOTE) ?? undefined;
    const pet: PetState = { ...migrate(JSON.parse(legacy)), uid: newUid(), ...(remote ? { remoteId: remote } : {}) };
    const moved = { pets: [pet], current: pet.uid! };
    setLocal(NEST, JSON.stringify(moved));
    localStorage.removeItem(LEGACY);
    localStorage.removeItem(LEGACY_REMOTE);
    return moved;
  } catch { return { pets: [], current: null }; }
}

function writeNest(n: Nest) { setLocal(NEST, JSON.stringify(n)); }

/** Every pet on this device, and the uid of the one on screen. */
export function usePets(): Nest {
  const raw = useLocal(NEST);
  const legacy = useLocal(LEGACY);
  return useMemo(() => {
    const nest = parseNest(raw);
    if (nest) return nest;
    // Not moved yet: show the legacy pet as a nest of one; the first write moves it for real.
    if (!legacy) return { pets: [], current: null };
    try { return { pets: [migrate(JSON.parse(legacy))], current: null }; } catch { return { pets: [], current: null }; }
  }, [raw, legacy]);
}

/** The pet on screen. */
export function usePet(): PetState | null {
  const { pets, current } = usePets();
  return pets.find((p) => p.uid === current) ?? pets[0] ?? null;
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

/** Write a pet back into the nest: the one with its uid, or a new one. */
export function savePet(p: PetState) {
  const nest = loadNest();
  // A pet read before the nest existed has no uid yet; it is the one adopted at the same moment.
  const pet = p.uid ? p : { ...p, uid: nest.pets.find((x) => x.adoptedAt === p.adoptedAt)?.uid ?? newUid() };
  const i = nest.pets.findIndex((x) => x.uid === pet.uid);
  const pets = i >= 0 ? nest.pets.map((x, k) => (k === i ? pet : x)) : [...nest.pets, pet];
  writeNest({ pets, current: nest.current ?? pet.uid! });
}

/** Read outside React — the engine runs in a fetch callback, not during render. */
export function readPet(): PetState | null {
  const nest = loadNest();
  return nest.pets.find((p) => p.uid === nest.current) ?? nest.pets[0] ?? null;
}

/** Look at a different pet. */
export function setCurrentPet(uid: string) {
  const nest = loadNest();
  if (nest.pets.some((p) => p.uid === uid)) writeNest({ ...nest, current: uid });
}

/** Set one field on a stored pet without touching the rest — for server ids arriving late. */
export function patchPet(uid: string, patch: Partial<PetState>) {
  const nest = loadNest();
  writeNest({ ...nest, pets: nest.pets.map((p) => (p.uid === uid ? { ...p, ...patch } : p)) });
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
export function adoptPet(init: { species: Species['id']; name: string; personality: Personality; stock?: Stock }): PetState {
  const t = Date.now();
  const p: PetState = {
    ...init, uid: newUid(), adoptedAt: t, lastFed: t, streak: 1, lastVisitDay: day(t),
    cash: 0, lots: [], lentQty: 0, yieldQty: 0, lastTickAt: t, proposal: null,
    diary: [{ ts: t, text: hatchLine(init.personality, init.name), kind: 'system' }],
  };
  const nest = loadNest();
  // A new pet joins the nest and is the one on screen.
  writeNest({ pets: [...nest.pets, p], current: p.uid! });
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
  init: { species: Species['id']; name: string; personality: Personality; stock?: Stock },
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
  const ticker = stockOf(p).ticker;
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

/**
 * Shares released back to USDT, from the swap's receipt (or, for a paper pet, at the print). The
 * lots go oldest first, and what they cost comes off against what the sale brought in: that
 * difference is the realized gain, kept on the pet so the portfolio stays honest after a sale.
 */
export function recordSell(
  p: PetState,
  s: { qty: number; received: number; hash?: string; paper?: boolean },
): { pet: PetState; fresh: Entry[] } {
  const t = Date.now();
  const ticker = stockOf(p).ticker;
  let left = s.qty, cost = 0;
  const lots: Lot[] = [];
  for (const lot of p.lots) {
    const take = Math.min(lot.qty, left);
    cost += take * lot.price;
    left -= take;
    if (lot.qty - take > 1e-12) lots.push({ ...lot, qty: lot.qty - take });
  }
  const gain = s.received - cost;
  const fresh: Entry[] = [{
    ts: t, kind: 'sell', qty: s.qty, price: s.received / s.qty, usd: s.received,
    ...(s.hash ? { sig: s.hash } : {}), paper: s.paper ?? isPaper(p),
    text: `Let go of ${s.qty.toFixed(4)} ${ticker} for $${s.received.toFixed(2)} — ${gain >= 0 ? 'up' : 'down'} $${Math.abs(gain).toFixed(2)} on what it cost.`,
  }];
  const next: PetState = { ...p, lots, realized: (p.realized ?? 0) + gain, diary: [...p.diary, ...fresh] };
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
