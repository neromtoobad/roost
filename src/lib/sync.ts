'use client';
import { isPaper, patchPet, readPet, stockOf, type Entry, type PetState, type Proposal } from './store';

// Mirrors the local Fledgling to the server so it can appear on the board. The local copy stays
// the source of truth — this is best-effort, so the app works offline or if the database is down.

const OWNER_KEY = 'roost.ownerKey';

/** A capability token for this device. Only its sha256 is ever stored server-side. */
function ownerKey(): string {
  try {
    let k = localStorage.getItem(OWNER_KEY);
    if (!k) { k = `${crypto.randomUUID()}-${crypto.randomUUID()}`; localStorage.setItem(OWNER_KEY, k); }
    return k;
  } catch { return ''; }
}

// One in flight per pet: bursts for the same pet (adopt → tick → feed in one second) collapse into
// a single round trip, and two pets syncing at once do not swallow each other.
const inFlight = new Map<string, Promise<void>>();

export function syncPet(pet: PetState, fresh: Entry[] = []): Promise<void> {
  const key = pet.uid ?? `adopted:${pet.adoptedAt}`;
  const running = inFlight.get(key);
  if (running) return running;
  const stock = stockOf(pet);
  const job = (async () => {
    try {
      const owner = ownerKey();
      if (!owner) return;
      const r = await fetch('/api/pet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerKey: owner,
          pet: {
            id: pet.remoteId ?? null,
            species: pet.species,
            ticker: stock.ticker,
            // Only when it is not the species' signature stock; null keeps the column meaning that.
            tokenAddress: pet.stock ? stock.address : null,
            tokenSymbol: pet.stock ? stock.tokenSymbol : null,
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
            realized: pet.realized ?? 0,
            schedule: pet.schedule ?? null,
            care: pet.care ?? null,
            manager: pet.mandate?.manager ?? null,
            mandateKey: pet.mandate?.key ?? null,
          },
          entries: fresh.map((e) => ({ ts: e.ts, kind: e.kind, text: e.text, qty: e.qty ?? null, price: e.price ?? null, usd: e.usd ?? null, sig: e.sig ?? null, paper: e.paper ?? true })),
        }),
      });
      const j = (await r.json()) as { ok: boolean; id?: string };
      // The server id arrives after the fact; set just that field so nothing newer is overwritten.
      if (j.ok && j.id && j.id !== pet.remoteId && pet.uid) patchPet(pet.uid, { remoteId: j.id });
    } catch {
      // Offline or the database is unreachable — the local Fledgling is unaffected.
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);
  return job;
}

export type Pulled = {
  pet: { cash: number; lots: PetState['lots']; lentQty: number; yieldQty: number; lastTickAt: number; proposal: Proposal | null; schedule?: PetState['schedule'] };
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
  const id = pet.remoteId;
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
  const id = readPet()?.remoteId;
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

/** The Telegram pet, for one Fledgling: is it on, and a t.me link that binds a chat to it. */
export async function telegram(id: string, action: 'status' | 'link' | 'unlink'): Promise<{ enabled: boolean; linked?: boolean; url?: string; error?: string } | null> {
  const key = ownerKey();
  if (!key) return null;
  try {
    const r = await fetch('/api/telegram/link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerKey: key, id, action }),
    });
    return (await r.json()) as { enabled: boolean; linked?: boolean; url?: string; error?: string };
  } catch {
    return null;
  }
}
