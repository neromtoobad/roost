'use client';
import { useSyncExternalStore } from 'react';

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

/** The current URL query string. Server snapshot is ''. */
export function useSearch(): URLSearchParams {
  const s = useSyncExternalStore(
    (cb) => { window.addEventListener('popstate', cb); return () => window.removeEventListener('popstate', cb); },
    () => window.location.search,
    () => '',
  );
  return new URLSearchParams(s);
}

const LOCAL_EVENT = 'stocklings:local';

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
