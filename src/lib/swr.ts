import 'server-only';
import { after } from 'next/server';

// Serve the last answer at once; refresh it after the response.
//
// The Board reads a database in another region and prices from Binance. Neither changes much in a
// few seconds, and nobody should wait on both every time they open the tab. So a read younger than
// `fresh` is served as is; one older than that, up to `stale`, is served too and refreshed after
// the response; anything older, or missing, is loaded while the caller waits.
//
// A write that changes what a read would show calls `invalidate`, so a pet you just fed is never
// hidden behind a cached board. A refresh that started before the write is discarded rather than
// stored, which is what the generation counter is for.
//
// In-process, so it assumes one long-lived server — which is what `next start` on Railway is. The
// store lives on globalThis because route handlers can be bundled separately; a module-level Map
// could be a different Map in the route that invalidates than in the one that reads.

type Entry = { at: number; value: unknown; loading?: Promise<unknown> };
type Store = { entries: Map<string, Entry>; gen: Map<string, number> };

declare global {
  var __roostSwr: Store | undefined;
}
const store = (): Store => (globalThis.__roostSwr ??= { entries: new Map(), gen: new Map() });

function refresh<T>(key: string, load: () => Promise<T>): Promise<T> {
  const { entries, gen } = store();
  const current = entries.get(key);
  if (current?.loading) return current.loading as Promise<T>;

  const started = gen.get(key) ?? 0;
  const loading: Promise<T> = load()
    .then((value) => {
      // Invalidated while this was in flight: what it read may predate the write. Do not keep it.
      if ((gen.get(key) ?? 0) === started) entries.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      const e = entries.get(key);
      if (e?.loading === loading) delete e.loading;
    });
  entries.set(key, { ...(current ?? { at: 0, value: undefined }), loading });
  return loading;
}

export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  { fresh = 15_000, stale = 10 * 60_000 }: { fresh?: number; stale?: number } = {},
): Promise<T> {
  const hit = store().entries.get(key);
  const age = hit && hit.at > 0 ? Date.now() - hit.at : Infinity;
  if (hit && age < fresh) return hit.value as T;
  if (hit && age < stale) {
    if (!hit.loading) {
      const later = () => refresh(key, load).catch((e) => console.error(`[swr] ${key} refresh failed —`, (e as Error).message));
      // Outside a request (a script, a test) there is no response to run after; just start it.
      try { after(later); } catch { void later(); }
    }
    return hit.value as T;
  }
  return refresh(key, load);
}

/** Drop what is cached for these keys, and anything still loading for them. */
export function invalidate(...keys: string[]) {
  const { entries, gen } = store();
  for (const key of keys) {
    entries.delete(key);
    gen.set(key, (gen.get(key) ?? 0) + 1);
  }
}
