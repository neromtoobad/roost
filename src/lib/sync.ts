'use client';
import { SPECIES } from './pets';
import { isPaper, type Entry, type PetState, type Proposal } from './store';

// Mirrors the local Fledgling to the server so it can appear on the board. The local copy stays
// the source of truth — this is best-effort, so the app works offline or if the database is down.

const OWNER_KEY = 'roost.ownerKey';
const REMOTE_ID = 'roost.remoteId';

/** A capability token for this device. Only its sha256 is ever stored server-side. */
function ownerKey(): string {
  try {
    let k = localStorage.getItem(OWNER_KEY);
    if (!k) { k = `${crypto.randomUUID()}-${crypto.randomUUID()}`; localStorage.setItem(OWNER_KEY, k); }
    return k;
  } catch { return ''; }
}

export function remoteId(): string | null {
  try { return localStorage.getItem(REMOTE_ID); } catch { return null; }
}

let inFlight: Promise<void> | null = null;

export function syncPet(pet: PetState, fresh: Entry[] = []): Promise<void> {
  // Collapse bursts (adopt → tick → feed in one second) into a single round trip.
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const key = ownerKey();
      if (!key) return;
      const r = await fetch('/api/pet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerKey: key,
          pet: {
            id: remoteId(),
            species: pet.species,
            ticker: SPECIES[pet.species].ticker,
            name: pet.name,
            personality: pet.personality,
            adoptedAt: pet.adoptedAt,
            streak: pet.streak,
            cash: pet.cash,
            lots: pet.lots,
            lentQty: pet.lentQty,
            yieldQty: pet.yieldQty,
            lastTickAt: pet.lastTickAt || pet.adoptedAt,
            agentId: pet.agentId ?? null,
            wallet: pet.wallet ?? null,
            launch: pet.launch ?? null,
            proposal: pet.proposal ?? null,
            paper: isPaper(pet),
          },
          entries: fresh.map((e) => ({ ts: e.ts, kind: e.kind, text: e.text, qty: e.qty ?? null, price: e.price ?? null, usd: e.usd ?? null, sig: e.sig ?? null, paper: e.paper ?? true })),
        }),
      });
      const j = (await r.json()) as { ok: boolean; id?: string };
      if (j.ok && j.id) { try { localStorage.setItem(REMOTE_ID, j.id); } catch {} }
    } catch {
      // Offline or the database is unreachable — the local Fledgling is unaffected.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export type Pulled = {
  pet: { cash: number; lots: PetState['lots']; lentQty: number; yieldQty: number; lastTickAt: number; proposal: Proposal | null };
  entries: Entry[];
};

/**
 * Ask the server what the Fledgling did while this browser was closed. Answers null when there is
 * nothing to adopt — no remote copy yet, offline, or the local watermark is already current.
 *
 * Caveat worth knowing: adopting the server copy replaces the engine-owned numbers, so cash fed
 * while offline and never synced would be overwritten. Pulling first, before anything else touches
 * the pet in a session, keeps that out of reach in practice.
 */
export async function pullPet(pet: PetState): Promise<Pulled | null> {
  const id = remoteId();
  const key = ownerKey();
  if (!id || !key) return null;
  try {
    const r = await fetch('/api/pet/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerKey: key, id, since: pet.lastTickAt || pet.adoptedAt }),
    });
    const j = (await r.json()) as { ok: boolean; ahead?: boolean } & Pulled;
    if (!j.ok || !j.ahead || !j.pet) return null;
    return { pet: j.pet, entries: j.entries ?? [] };
  } catch {
    return null;
  }
}

/** Put your Fledgling up against another for 24 hours. Neither owner gets to trade. */
export async function challengeRival(rivalId: string): Promise<{ ok: boolean; reason?: string }> {
  const id = remoteId();
  const key = ownerKey();
  if (!id) return { ok: false, reason: 'Feed yours first so it lands on the board.' };
  if (!key) return { ok: false, reason: 'This device has no key.' };
  try {
    const r = await fetch('/api/duel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerKey: key, id, rivalId }),
    });
    return (await r.json()) as { ok: boolean; reason?: string };
  } catch {
    return { ok: false, reason: 'Offline.' };
  }
}

/**
 * Build the transaction that collects what backers have paid the pet. The owner key proves this is
 * your Fledgling; the wallet that created the pool still has to sign, so nothing moves without it.
 */
export async function buildClaimTx(creator: string): Promise<{ tx?: string; error?: string }> {
  const id = remoteId();
  const key = ownerKey();
  if (!id || !key) return { error: 'This device has no claim on that Fledgling.' };
  try {
    const r = await fetch('/api/claim', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerKey: key, id, creator }),
    });
    return (await r.json()) as { tx?: string; error?: string };
  } catch {
    return { error: 'Offline.' };
  }
}

/** The link you send to a friend. Null until the pet has synced and has a public page. */
export function backLink(): string | null {
  const id = remoteId();
  if (!id || typeof window === 'undefined') return null;
  return `${window.location.origin}/back/${id}`;
}
