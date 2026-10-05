// A stock's badge where a logo would go: its ticker on a gradient picked from the ticker itself, so
// the same stock always wears the same colours and a list of them reads at a glance.
export function TickerBadge({ ticker, size = 36 }: { ticker: string; size?: number }) {
  let h = 0;
  for (const ch of ticker) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const label = ticker.length > 4 ? ticker.slice(0, 4) : ticker;
  return (
    <span className="grid shrink-0 place-items-center rounded-[10px] font-extrabold text-white" aria-hidden
      style={{ width: size, height: size, fontSize: label.length > 3 ? size * 0.27 : size * 0.33, fontFamily: 'var(--font-display)', letterSpacing: '-.02em',
        background: `linear-gradient(140deg, hsl(${h} 85% 62%), hsl(${(h + 40) % 360} 75% 42%))`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.35), 0 3px 8px -3px hsl(${h} 80% 40% / .7)`, textShadow: '0 1px 1px rgba(0,0,0,.25)' }}>
      {label}
    </span>
  );
}
