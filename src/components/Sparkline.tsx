'use client';
import type { Bar } from '@/lib/strategy';
import type { Lot } from '@/lib/store';

/** Portfolio value over the last N hours: what the pet's shares were worth at each bar. */
export function Sparkline({ bars, lots, yieldQty, width = 120, height = 34 }: {
  bars: Bar[]; lots: Lot[]; yieldQty: number; width?: number; height?: number;
}) {
  if (bars.length < 2 || (!lots.length && !yieldQty)) return null;
  const series = bars.map((b) => {
    const qty = lots.filter((l) => l.ts <= b.t).reduce((s, l) => s + l.qty, 0) + yieldQty;
    return qty * b.close;
  });
  const lo = Math.min(...series), hi = Math.max(...series);
  const span = hi - lo || 1;
  const pts = series.map((v, i) => [(i / (series.length - 1)) * width, height - ((v - lo) / span) * (height - 4) - 2]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const up = series.at(-1)! >= series[0];
  const stroke = up ? 'var(--up)' : 'var(--down)';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Portfolio value trend" className="overflow-visible">
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={stroke} opacity="0.12" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="2.5" fill={stroke} />
    </svg>
  );
}
