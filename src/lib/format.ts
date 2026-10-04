// Numbers, the same way on every screen.

export const usd = (n: number, digits = 2) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** A signed percent: +1.23% / −0.40%. */
export const pct = (n: number, digits = 2) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}%`;

/** A signed dollar change: +$1.20 / −$0.40. */
export const delta = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`;

export const tone = (n: number | null | undefined) => (n == null ? 'var(--muted)' : n >= 0 ? 'var(--up)' : 'var(--down)');

/** "3h ago", "2d ago", or a date when it is older than a week. */
export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
