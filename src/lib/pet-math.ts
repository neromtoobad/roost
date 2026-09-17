import type { Species } from './pets';

// The shape of a Stockling and the arithmetic over it. Deliberately free of React and of
// localStorage: the browser, the API routes and the hourly worker all reason about the same pet,
// so the numbers a judge sees on the board are the numbers the engine acted on.

export type Personality = 'diamond' | 'degen' | 'boomer' | 'quant';

export type Lot = { ts: number; qty: number; price: number };
export type EntryKind = 'feed' | 'buy' | 'lend' | 'yield' | 'hold' | 'ask' | 'system';
export type Entry = { ts: number; text: string; kind: EntryKind; qty?: number; price?: number; usd?: number; sig?: string; paper?: boolean };
export type Proposal = { ts: number; usd: number; reason: string };
export type Launch = { pool: string; baseMint: string; config: string; quote: string; sig: string; ts: number };

export type PetState = {
  species: Species['id'];
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
  agentId?: string;    // Clawpump agent — its presence means execution is live, not paper
  wallet?: string;
  launch?: Launch;
};

/** No agent behind it means the trades are simulated, and every surface says so. */
export const isPaper = (p: PetState) => !p.agentId;

export const heldQty = (p: PetState) => p.lots.reduce((s, l) => s + l.qty, 0) + p.yieldQty;
export const costBasis = (p: PetState) => p.lots.reduce((s, l) => s + l.qty * l.price, 0);
export const totalFed = (p: PetState) => costBasis(p) + p.cash;
export const marketValue = (p: PetState, price: number) => heldQty(p) * price;

export function pnl(p: PetState, price: number) {
  const basis = costBasis(p);
  const value = marketValue(p, price);
  return { abs: value - basis, pct: basis > 0 ? ((value - basis) / basis) * 100 : 0, value, basis };
}
