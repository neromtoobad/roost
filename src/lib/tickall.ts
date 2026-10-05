'use client';
import { useEffect, useRef } from 'react';
import { runEngine } from './engine';
import { pullPet, syncPet } from './sync';
import { mergeEntries, readPetByUid, savePet, stockOf, type PetState } from './store';
import type { Bar } from './strategy';

// Brings every Fledgling in the nest up to the hour, not only the one on screen. The hourly worker
// keeps trading while nobody is looking, so first adopt what it did; then replay the engine over
// whatever is left, save, and mirror. Once per pet per visit — saving changes the pets, and replaying
// on every change would loop. The pet on screen has its own catch-up (with the "while you were out"
// report), so the home screen passes the others.

export function useTickAll(pets: PetState[]) {
  const done = useRef(new Set<string>());
  // Every uid in view: saving a pet does not change it, a new one does.
  const key = pets.map((p) => p.uid).filter(Boolean).sort().join(',');

  useEffect(() => {
    const uids = key ? key.split(',').filter((u) => !done.current.has(u)) : [];
    if (!uids.length) return;
    uids.forEach((u) => done.current.add(u));
    // Not cancelled on unmount: a replay half-saved is worse than one finished for a screen that left.
    void (async () => {
      const targets = uids.map((u) => readPetByUid(u)).filter((p): p is PetState => Boolean(p));
      const addresses = [...new Set(targets.map((p) => stockOf(p).address.toLowerCase()))];
      const bars: Record<string, Bar[]> = {};
      await Promise.all(addresses.map(async (a) => {
        try {
          const j = (await fetch(`/api/history/${a}`).then((r) => r.json())) as { bars?: Bar[] };
          if (j.bars?.length) bars[a] = j.bars;
        } catch { /* no bars, no replay: it catches up on the next visit */ }
      }));
      for (const target of targets) {
        let cur = readPetByUid(target.uid!) ?? target;
        const pulled = await pullPet(cur);
        if (pulled) { cur = mergeEntries({ ...cur, ...pulled.pet }, pulled.entries); savePet(cur); }
        const b = bars[stockOf(cur).address.toLowerCase()];
        if (!b?.length) continue;
        const res = runEngine(cur, b);
        savePet(res.pet);
        void syncPet(res.pet, res.fresh);
      }
    })();
  }, [key]);
}
