'use client';
import { useEffect, useRef, useState } from 'react';
import { runEngine } from './engine';
import { pullPet, syncPet } from './sync';
import { mergeEntries, readPetByUid, savePet, stockOf, type Entry, type PetState } from './store';
import type { Bar } from './strategy';

// Brings every position on screen up to the hour. The hourly worker keeps trading with nobody
// watching, so first adopt what it did; then replay the engine over whatever is left, save, and
// mirror. Once per position per visit — saving changes the positions, and replaying on every change
// would loop.

export type Away = { entry: Entry; ticker: string; manager: string };

export function useTickAll(pets: PetState[]): { away: Away[] | null; bars: Record<string, Bar[]> } {
  const done = useRef(new Set<string>());
  const [away, setAway] = useState<Away[] | null>(null);
  const [bars, setBars] = useState<Record<string, Bar[]>>({});
  // Every uid on screen: saving a position does not change it, a new one does.
  const key = pets.map((p) => p.uid).filter(Boolean).sort().join(',');

  useEffect(() => {
    const uids = key ? key.split(',').filter((u) => !done.current.has(u)) : [];
    if (!uids.length) return;
    uids.forEach((u) => done.current.add(u));
    // Not cancelled on unmount: a replay half-saved is worse than one finished for a screen that left.
    void (async () => {
      const targets = uids.map((u) => readPetByUid(u)).filter((p): p is PetState => Boolean(p));
      const addresses = [...new Set(targets.map((p) => stockOf(p).address.toLowerCase()))];
      const got: Record<string, Bar[]> = {};
      await Promise.all(addresses.map(async (a) => {
        try {
          const j = (await fetch(`/api/history/${a}`).then((r) => r.json())) as { bars?: Bar[] };
          if (j.bars?.length) got[a] = j.bars;
        } catch { /* a position without bars just waits for the next visit */ }
      }));
      setBars((b) => ({ ...b, ...got }));

      const fresh: Away[] = [];
      for (const target of targets) {
        let cur = readPetByUid(target.uid!) ?? target;
        const pulled = await pullPet(cur);
        if (pulled) {
          cur = mergeEntries({ ...cur, ...pulled.pet }, pulled.entries);
          savePet(cur);
          for (const e of pulled.entries) fresh.push({ entry: e, ticker: stockOf(cur).ticker, manager: cur.name });
        }
        const b = got[stockOf(cur).address.toLowerCase()];
        if (!b?.length) continue;
        const res = runEngine(cur, b);
        savePet(res.pet);
        void syncPet(res.pet, res.fresh);
        for (const e of res.fresh) fresh.push({ entry: e, ticker: stockOf(cur).ticker, manager: cur.name });
      }
      if (fresh.length) setAway((a) => [...(a ?? []), ...fresh].sort((x, y) => x.entry.ts - y.entry.ts));
    })();
  }, [key]);

  return { away, bars };
}
