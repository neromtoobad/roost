'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { isNight, nyseSession, type Session } from './session';

// Browser-only state exposed through useSyncExternalStore, so the server snapshot is stable
// and hydration never sees a value that only exists in the browser.

/** Wall clock, ticking every `interval` ms. Server snapshot is 0. */
export function useNow(interval = 30_000): number {
  return useSyncExternalStore(
    (cb) => { const t = setInterval(cb, interval); return () => clearInterval(t); },
    () => Math.floor(Date.now() / interval) * interval,
    () => 0,
  );
}

/** Whether a media query matches — for sizes CSS alone cannot set, like the pet's pixel size. Server snapshot is false. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The width at which Roost stops being a phone column: the sidebar appears and screens go two-up. */
export const WIDE = '(min-width: 1024px)';
/** Wide enough for the full-size pet and the roomier columns. */
export const WIDER = '(min-width: 1280px)';

/** The current URL query string. Server snapshot is ''. */
export function useSearch(): URLSearchParams {
  const s = useSyncExternalStore(
    (cb) => { window.addEventListener('popstate', cb); return () => window.removeEventListener('popstate', cb); },
    () => window.location.search,
    () => '',
  );
  return new URLSearchParams(s);
}

const LOCAL_EVENT = 'roost:local';

/** A localStorage value that re-renders on change. Server snapshot is null. */
export function useLocal(key: string): string | null {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('storage', cb);
      window.addEventListener(LOCAL_EVENT, cb);
      return () => { window.removeEventListener('storage', cb); window.removeEventListener(LOCAL_EVENT, cb); };
    },
    () => { try { return localStorage.getItem(key); } catch { return null; } },
    () => null,
  );
}

export function setLocal(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

// NYSE closure dates, fetched once per page load and shared by every screen that asks.
let holidaysLoad: Promise<Set<string>> | null = null;
const loadHolidays = () => (holidaysLoad ??= fetch('/api/holidays')
  .then((r) => r.json()).then((j: { dates?: string[] }) => new Set(j.dates ?? []))
  .catch(() => new Set<string>()));

/**
 * The NYSE session the whole app keeps time by: day theme while it trades, night while it sleeps.
 * `?night=1` and `?day=1` force a side, for demos and screenshots.
 */
export function useMarketSession(): { session: Session; night: boolean } {
  const now = useNow();
  const q = useSearch();
  const [holidays, setHolidays] = useState<Set<string>>();
  useEffect(() => {
    let alive = true;
    void loadHolidays().then((h) => { if (alive) setHolidays(h); });
    return () => { alive = false; };
  }, []);
  const session: Session = q.get('night') ? 'overnight' : q.get('day') ? 'regular' : nyseSession(now ? new Date(now) : new Date(), holidays);
  return { session, night: isNight(session) };
}
