import { SPECIES, type Species, type Stock } from './pets';
import type { Care, Schedule } from './care';
import type { ManagerId } from './managers';

// The shape of a Fledgling and the arithmetic over it. Deliberately free of React and of
// localStorage: the browser, the API routes and the hourly worker all reason about the same pet,
// so the numbers a judge sees on the board are the numbers the engine acted on.

/** The rule a manager trades by. The first four predate the managers; `night` and `momentum` are theirs. */
export type Personality = 'diamond' | 'degen' | 'boomer' | 'quant' | 'night' | 'momentum';

export type Lot = { ts: number; qty: number; price: number };
export type EntryKind = 'feed' | 'buy' | 'sell' | 'lend' | 'yield' | 'hold' | 'ask' | 'system';
export type Entry = { ts: number; text: string; kind: EntryKind; qty?: number; price?: number; usd?: number; sig?: string; paper?: boolean };
export type Proposal = { ts: number; usd: number; reason: string };
export type Launch = { pool: string; baseMint: string; config: string; quote: string; sig: string; ts: number };

export type PetState = {
  /** This device's handle for the pet, so a nest of several can tell them apart. */
  uid?: string;
  /** The server row it mirrors to, once synced. */
  remoteId?: string;
  species: Species['id'];
  /** What it holds, when that is not its species' signature stock. */
  stock?: Stock;
  name: string;
  personality: Personality;
  adoptedAt: number;
  lastFed: number;
  streak: number;
  lastVisitDay: string;
  cash: number;        // fed, not yet deployed
  lots: Lot[];         // positions, with cost basis
  lentQty: number;     // shares lent for yield
  yieldQty: number;    // shares earned from lending
  lastTickAt: number;  // engine watermark
  diary: Entry[];
  proposal?: Proposal | null;
  wallet?: string;     // the bound Agentic Wallet address — its presence means execution is live
  agentId?: string;    // Agent Studio agent id, once the pet runs autonomously
  launch?: Launch;
  /** USDT taken off the table when the owner released shares, minus what those shares cost. */
  realized?: number;
  /** A standing feed: so much, so often. See lib/care. */
  schedule?: Schedule;
  /** Visits, pets, the forgiven day, the dividend ratio last seen. See lib/care. */
  care?: Care;
  /** Hatched with others from one theme, and fed with them. `key` is the hatching; see lib/litters. */
  litter?: { id: string; key: string; name: string };
  /** The mandate this position belongs to: which manager runs it, for one client. See lib/managers. */
  mandate?: { key: string; manager: ManagerId };
};

/** The stock a pet holds: its own if it hatched from one, else its species' signature stock. */
export const stockOf = (p: Pick<PetState, 'species' | 'stock'>): Stock => p.stock ?? SPECIES[p.species];

/** No wallet bound means the trades are simulated, and every surface says so. */
export const isPaper = (p: PetState) => !p.wallet;

export const heldQty = (p: PetState) => p.lots.reduce((s, l) => s + l.qty, 0) + p.yieldQty;
export const costBasis = (p: PetState) => p.lots.reduce((s, l) => s + l.qty * l.price, 0);
export const totalFed = (p: PetState) => costBasis(p) + p.cash;
export const marketValue = (p: PetState, price: number) => heldQty(p) * price;

export function pnl(p: PetState, price: number) {
  const basis = costBasis(p);
  const value = marketValue(p, price);
  return { abs: value - basis, pct: basis > 0 ? ((value - basis) / basis) * 100 : 0, value, basis };
}
