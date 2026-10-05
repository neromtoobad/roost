'use client';
import { STAGES, type Stage } from '@/lib/care';

/**
 * The light the pet stands in: a soft yellow glow, and three hairline rings, one per stage it can
 * grow into. Rings it has reached are lit; the next one fills as an arc with its care points. So the
 * decoration is the growth meter, drawn where the eye already is.
 */
export function GrowthRings({ size, grown, spread = 1.45, labels = true }: { size: number; grown: Stage; spread?: number; labels?: boolean }) {
  const d = Math.round(size * spread);
  const c = d / 2;
  const radii = [0.6, 0.79, 0.97].map((f) => f * (c - 8));
  // Labels sit on the rings' upper right, inside them: clear of the speech bubble above, and never
  // wider than the rings themselves (a phone has no room to spare).
  const a = (-28 * Math.PI) / 180;
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: d, height: d }} aria-hidden>
      <div className="absolute inset-[8%] rounded-full" style={{ background: 'var(--stage-glow)' }} />
      <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} className="absolute inset-0 overflow-visible">
        {STAGES.slice(1).map((s, i) => {
          const r = radii[i];
          const reached = grown.index >= i + 1;
          const isNext = grown.index === i;
          const floor = STAGES[i].from;
          const progress = isNext ? Math.max(0, Math.min(1, (grown.points - floor) / (s.from - floor))) : 0;
          const circ = 2 * Math.PI * r;
          return (
            <g key={s.name}>
              <circle cx={c} cy={c} r={r} fill="none" stroke={reached ? 'var(--accent)' : 'var(--stage-ring)'} strokeOpacity={reached ? 0.45 : 1}
                strokeWidth="1" strokeDasharray={reached || isNext ? undefined : '2 5'} />
              {isNext && progress > 0 && (
                <circle cx={c} cy={c} r={r} fill="none" stroke="var(--accent)" strokeOpacity="0.85" strokeWidth="1.5" strokeLinecap="round"
                  strokeDasharray={`${circ * progress} ${circ}`} transform={`rotate(-90 ${c} ${c})`} style={{ filter: 'drop-shadow(var(--glow))' }} />
              )}
              {labels && (
                <text x={c + r * Math.cos(a) - 6} y={c + r * Math.sin(a) + 3} textAnchor="end" className="num" fontSize="9" letterSpacing="1.2"
                  fill={reached || isNext ? 'var(--accent-ink)' : 'var(--muted)'} opacity={reached || isNext ? 0.9 : 0.6}>
                  {s.name.toUpperCase()} · {s.from}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
