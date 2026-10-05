'use client';
import { useEffect, useMemo } from 'react';
import { setLocal, useLocal } from './client';
import { heldQty, isPaper, stockOf, type Entry, type Launch, type Lot, type PetState, type Personality } from './pet-math';
import { CADENCE_LABEL, canPet, celebrated, kept, newSchedule, pet, skipped, visit, type Cadence } from './care';
import type { Species, Stock } from './pets';

// Pet state as the browser holds it. Feeding adds cash; the strategy engine decides what to do with
// it. Those are separate on purpose — "you fed it" and "it bought something" are different events,
// and only the second one is the pet acting on its own.
//
// The shape and the arithmetic live in ./pet-math, which the server and the hourly worker share.

export * from './pet-math';

export const PERSONALITIES: Record<Personality, { name: string; tagline: string; icon: string }> = {
  diamond: { name: 'Diamond Hands', tagline: 'deploys at every open, never sells',              icon: '💎' },
  degen:   { name: 'Degen',         tagline: 'hunts 2% dips at any hour',                        icon: '⚡' },
  boomer:  { name: 'Boomer',        tagline: 'regular hours only, keeps 20% in reserve',          icon: '🕰' },
  quant:   { name: 'Quant',         tagline: 'weekly rebalance, cites basis points',              icon: '📊' },
  night:   { name: 'Night Shift',   tagline: 'buys only while Wall Street sleeps, at a discount',  icon: '🌙' },
  momentum: { name: 'Trend Rider',  tagline: 'adds weekly to whatever is already running',        icon: '🏄' },
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

/**
 * A link that names a pet — `?pet=<server id>` from the Telegram pet — puts that pet on screen.
 * Returns true when the link names a pet this device does not have (it lives in another browser).
 */
export function useFocusPet(q: URLSearchParams): boolean {
  const want = q.get('pet');
  const { pets, current } = usePets();
  const found = want ? pets.find((x) => x.remoteId === want || x.uid === want) : undefined;
  useEffect(() => {
    if (found?.uid && found.uid !== current) setCurrentPet(found.uid);
  }, [found?.uid, current]);
  return Boolean(want && pets.length && !found);
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

/** One pet by its uid, as stored right now — for a queue of buys that each record against the latest copy. */
export function readPetByUid(uid: string): PetState | null {
  return loadNest().pets.find((p) => p.uid === uid) ?? null;
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
type Init = { species: Species['id']; name: string; personality: Personality; stock?: Stock; litter?: PetState['litter']; wallet?: string };

function newPet({ issuerNote, ...init }: Init & { issuerNote?: string }, t: number): PetState {
  return {
    ...init, uid: newUid(), adoptedAt: t, lastFed: t, streak: 1, lastVisitDay: day(t),
    cash: 0, lots: [], lentQty: 0, yieldQty: 0, lastTickAt: t, proposal: null,
    diary: [
      { ts: t, text: hatchLine(init.personality, init.name), kind: 'system' },
      // Why this token and not the other issuer's: said once, at the start, where it can be checked.
      ...(issuerNote ? [{ ts: t + 1, text: issuerNote, kind: 'system' as const }] : []),
    ],
  };
}

export function adoptPet(init: Init & { issuerNote?: string }): PetState {
  const p = newPet(init, Date.now());
  const nest = loadNest();
  // A new pet joins the nest and is the one on screen.
  writeNest({ pets: [...nest.pets, p], current: p.uid! });
  return p;
}

/**
 * A litter: one pup per stock in the theme, hatched together, sharing a personality and a wallet.
 * The first is the one on screen. Returns them all, for syncing.
 */
export function adoptLitter(
  litter: { id: string; name: string },
  pups: { species: Species['id']; name: string; stock: Stock; issuerNote?: string }[],
  personality: Personality,
  wallet?: string,
): PetState[] {
  const t = Date.now();
  const key = newUid();
  const bound = wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet) ? wallet : undefined;
  const born = pups.map((pup, i) => newPet({
    ...pup, personality, litter: { ...litter, key }, ...(bound ? { wallet: bound } : {}),
  }, t + i * 10)); // apart by a few ms: adoptedAt is how an unsynced pet is told apart
  const nest = loadNest();
  writeNest({ pets: [...nest.pets, ...born], current: born[0]?.uid ?? nest.current });
  return born;
}

/** The pets of one litter, as stored. */
export const litterOf = (pets: PetState[], key: string) => pets.filter((p) => p.litter?.key === key);

export function touchVisit(p: PetState): PetState {
  const t = Date.now();
  if (p.lastVisitDay === day(t)) return p;
  const v = visit(p.streak, p.lastVisitDay, p.care, t);
  const next: PetState = {
    ...p, streak: v.streak, care: v.care, lastVisitDay: day(t),
    diary: v.forgiven
      ? [...p.diary, { ts: t, text: `You missed a day. I kept the streak anyway — I can do that once a week.`, kind: 'system' }]
      : p.diary,
  };
  savePet(next);
  return next;
}

/** The free daily action: no money, no trade, just attention. Twelve hours between. */
export function petPet(p: PetState): PetState | null {
  if (!canPet(p.care)) return null;
  const next = { ...p, care: pet(p.care) };
  savePet(next);
  return next;
}

/** A standing feed. Set from the feed screen; changing it starts the rhythm again from now. */
export function setSchedule(p: PetState, usd: number, every: Cadence): PetState {
  const t = Date.now();
  const next: PetState = {
    ...p, schedule: newSchedule(usd, every, t),
    diary: [...p.diary, { ts: t, text: `Feeding day set: $${usd} ${CADENCE_LABEL[every]}. I'll remind you.`, kind: 'system' }],
  };
  savePet(next);
  return next;
}

export function stopSchedule(p: PetState): PetState {
  const next: PetState = { ...p, schedule: undefined, diary: [...p.diary, { ts: Date.now(), text: 'No more feeding days. Feed me when you like.', kind: 'system' }] };
  savePet(next);
  return next;
}

export function pauseSchedule(p: PetState, paused: boolean): PetState {
  if (!p.schedule) return p;
  const t = Date.now();
  // Resuming starts from the next slot after now, not from a feeding day already gone by.
  const schedule = paused ? { ...p.schedule, paused: true } : { ...p.schedule, paused: false, nextAt: Math.max(p.schedule.nextAt, t) };
  const next = { ...p, schedule };
  savePet(next);
  return next;
}

/** A feeding day honoured or passed over. The feed itself is recorded by whoever did it. */
export function feedingDay(p: PetState, outcome: 'kept' | 'skipped'): PetState {
  if (!p.schedule) return p;
  const next = { ...p, schedule: outcome === 'kept' ? kept(p.schedule) : skipped(p.schedule) };
  savePet(next);
  return next;
}

export function markCelebrated(uid: string, key: string) {
  const p = loadNest().pets.find((x) => x.uid === uid);
  if (p) patchPet(uid, { care: celebrated(p.care, key) });
}

/**
 * The token's share ratio, as it is now. When it has risen since last seen, a dividend was
 * reinvested into the token — the pet holds more of the company without anyone buying anything,
 * and it says so. The first sighting only sets the baseline.
 */
export function noteRatio(p: PetState, ratio: number): PetState {
  const seen = p.care?.ratioSeen;
  const care = { days: 0, pets: 0, ...p.care, ratioSeen: ratio };
  if (seen === undefined || !(ratio > seen * (1 + 1e-7))) {
    if (seen === ratio) return p;
    const next = { ...p, care };
    savePet(next);
    return next;
  }
  const held = heldQty(p);
  const t = Date.now();
  const ticker = stockOf(p).ticker;
  const grewPct = (ratio / seen - 1) * 100;
  const text = held > 0
    ? `${ticker} paid a dividend. Each token now stands for ${ratio.toFixed(4)} shares (+${grewPct.toFixed(2)}%), so I hold ${(held * (ratio - seen)).toFixed(5)} more shares than when I last looked — reinvested, nobody bought anything.`
    : `${ticker} paid a dividend: each token now stands for ${ratio.toFixed(4)} shares. I'll grow with it once I hold some.`;
  const next: PetState = { ...p, care, diary: [...p.diary, { ts: t, text, kind: 'yield' }] };
  savePet(next);
  return next;
}

/** Feeding only adds cash. What happens to it is the pet's call. */
export function feedPet(p: PetState, usd: number, text?: string): PetState {
  const t = Date.now();
  const next: PetState = {
    ...p, lastFed: t, cash: p.cash + usd,
    diary: [...p.diary, { ts: t, text: text ?? `Fed $${usd}.`, kind: 'feed', usd }],
  };
  savePet(next);
  return next;
}

// Adoption is local. There is no server-side agent to create any more: execution runs through
// the owner's own Binance Agentic Wallet, so the only thing that makes a pet live is a bound
// wallet address. See lib/agent.ts for why Roost deliberately holds no keys.
export async function adoptPetRemote(
  init: { species: Species['id']; name: string; personality: Personality; stock?: Stock; issuerNote?: string },
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
    // Returned, not only saved: the caller syncs what this returns, and the old copy still carries the
    // question — the server would keep asking it.
    const declined: PetState = { ...p, proposal: null, diary: [...p.diary, { ts: t, text: 'Fine. Not today.', kind: 'hold' }] };
    savePet(declined);
    return declined;
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
    night: `${name} online. You sleep, I shop.`,
    momentum: `${name} here. If it's going up, I'm getting on.`,
  }[v];
}

export const waitingLine: Record<Personality, string> = {
  diamond: 'Holding it for the open. Every open, same thing.',
  degen: 'Sitting on it. Waiting for something to break.',
  boomer: 'It will be deployed during regular hours. Not before.',
  quant: 'Queued for the next rebalance window.',
  night: 'Waiting for the closing bell, and a discount.',
  momentum: 'Waiting for the open, and for strength.',
};
