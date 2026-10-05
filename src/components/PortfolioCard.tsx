'use client';
import NumberFlow from '@number-flow/react';
import { useId, useMemo, useState, type PointerEvent } from 'react';
import type { Bar } from '@/lib/strategy';
import type { Lot } from '@/lib/store';

type Period = '24H' | '7D';
const usd = { style: 'currency', currency: 'USD' } as const;
const when = (t: number) => new Date(t).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * What the pet's holding is worth, and how it got there. The value rolls when it changes, the cents
 * step back, and the line can be scrubbed: drag across it and the number becomes that hour's value.
 * The series is the shares held at each hour times that hour's close — the pet's actual position,
 * not the stock's chart.
 */
export function PortfolioCard({ value, basis, paper, bars, lots, yieldQty, pct24h, big }: {
  value: number | null; basis: number; paper: boolean; bars: Bar[]; lots: Lot[]; yieldQty: number; pct24h: number; big?: boolean;
}) {
  const [period, setPeriod] = useState<Period>('7D');
  const [at, setAt] = useState<number | null>(null);
  const gid = useId().replace(/:/g, '');

  const series = useMemo(() => {
    const hours = period === '24H' ? bars.slice(-25) : bars;
    return hours.map((b) => ({ t: b.t, v: (lots.filter((l) => l.ts <= b.t).reduce((s, l) => s + l.qty, 0) + yieldQty) * b.close }));
  }, [bars, lots, yieldQty, period]);

  const has = series.length > 1 && series.some((p) => p.v > 0);
  const lo = has ? Math.min(...series.map((p) => p.v)) : 0;
  const hi = has ? Math.max(...series.map((p) => p.v)) : 1;
  const span = hi - lo || 1;
  const W = 300, H = 100;
  const pts = series.map((p, i) => [(i / Math.max(1, series.length - 1)) * W, H - 6 - ((p.v - lo) / span) * (H - 16)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const cursor = at !== null && pts[at] ? at : null;
  const dot = cursor !== null ? pts[cursor] : pts.at(-1);

  const shown = cursor !== null ? series[cursor].v : value;
  const pnl = value !== null && basis > 0 ? value - basis : null;
  // Today's move on what it holds now: the token's 24h change applied to the position.
  const day = value !== null && value > 0 ? value - value / (1 + pct24h / 100) : null;

  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    if (!has) return;
    const box = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setAt(Math.round(f * (series.length - 1)));
  };

  return (
    <div className="card mt-1 px-4 pb-3 pt-3 lg:px-5 lg:pt-4">
      <div className="flex items-center justify-between">
        <p className="text-[11.5px] font-medium uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>
          Portfolio{paper && <span className="num normal-case tracking-normal"> · paper</span>}
        </p>
        {has && (
          <div className="flex rounded-full p-0.5 text-[11px] num" style={{ background: 'var(--surface-2)' }} role="tablist" aria-label="Period">
            {(['24H', '7D'] as const).map((p) => (
              <button key={p} role="tab" aria-selected={period === p} onClick={() => { setPeriod(p); setAt(null); }}
                className="rounded-full px-2.5 py-0.5 font-medium"
                style={period === p ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(0,0,0,.18)' } : { color: 'var(--muted)' }}>{p}</button>
            ))}
          </div>
        )}
      </div>

      <div className={`mt-1 font-extrabold leading-none tracking-[-0.03em] ${big ? 'text-[36px] lg:text-[48px]' : 'text-[32px]'}`} style={{ fontFamily: 'var(--font-display)' }}>
        {shown !== null ? <NumberFlow value={shown} locales="en-US" format={usd} className="dim-cents" /> : '—'}
      </div>

      <div className="mt-1.5 flex min-h-[22px] flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] num">
        {cursor !== null ? (
          <span style={{ color: 'var(--muted)' }}>{when(series[cursor].t)}</span>
        ) : (
          <>
            {pnl !== null && (
              <span style={{ color: pnl >= 0 ? 'var(--up)' : 'var(--down)' }}>
                {pnl >= 0 ? '+' : '−'}${Math.abs(pnl).toFixed(2)} ({pnl >= 0 ? '+' : '−'}{Math.abs((pnl / basis) * 100).toFixed(2)}%)
                <span style={{ color: 'var(--muted)' }}> all time</span>
              </span>
            )}
            {day !== null && Math.abs(day) >= 0.005 && (
              <span className="rounded-full px-2 py-0.5 text-[11.5px]"
                style={{ color: day >= 0 ? 'var(--up)' : 'var(--down)', background: `color-mix(in srgb, ${day >= 0 ? 'var(--up)' : 'var(--down)'} 14%, transparent)` }}>
                {day >= 0 ? '+' : '−'}${Math.abs(day).toFixed(2)} 24h
              </span>
            )}
          </>
        )}
      </div>

      {has ? (
        <div className={`relative mt-2 touch-pan-y select-none ${big ? 'h-16 lg:h-20' : 'h-14'}`} onPointerMove={scrub} onPointerDown={scrub} onPointerLeave={() => setAt(null)}
          role="img" aria-label={`Portfolio value over ${period === '24H' ? 'the last 24 hours' : 'the last 7 days'}`}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#fill-${gid})`} />
            <path d={line} fill="none" stroke="var(--accent-ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {/* Scrubbing: the future past the cursor steps back, and a line marks the hour. */}
          {cursor !== null && (
            <>
              <div className="absolute inset-y-0 right-0" style={{ left: `${(dot![0] / W) * 100}%`, background: 'var(--surface)', opacity: 0.6 }} />
              <div className="absolute inset-y-0 w-px" style={{ left: `${(dot![0] / W) * 100}%`, borderLeft: '1px dashed var(--muted)' }} />
            </>
          )}
          {dot && (
            <span className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${(dot[0] / W) * 100}%`, top: `${(dot[1] / H) * 100}%`, background: 'var(--accent)', boxShadow: '0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent), 0 0 12px var(--accent)' }} />
          )}
        </div>
      ) : (
        <p className="mt-2 text-[12.5px]" style={{ color: 'var(--muted)' }}>Feed it and this line starts moving.</p>
      )}
    </div>
  );
}
