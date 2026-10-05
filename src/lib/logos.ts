import DATA from './logos.json';

// Which tokens have their logo saved in public/logos, and each ticker's (scripts/token-logos.ts).
const HAVE = new Set<string>(DATA.addresses);
const BY_TICKER = DATA.byTicker as Record<string, string>;

const path = (a: string) => `/logos/${a}.webp`;

/**
 * A stock's own logo — the company's mark in its issuer's frame — by token address, falling back to
 * the ticker's (bStock first). Null when neither is saved.
 */
export function logoFor(address?: string | null, ticker?: string | null): string | null {
  const a = address?.toLowerCase();
  if (a && HAVE.has(a)) return path(a);
  const t = ticker ? BY_TICKER[ticker.toUpperCase()] : undefined;
  return t ? path(t) : null;
}
