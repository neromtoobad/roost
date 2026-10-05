'use client';
import { STAGES, type Stage } from '@/lib/care';

/**
 * The light the pet stands in: a soft yellow glow, and three hairline rings, one per stage it can
 * grow into. Rings it has reached are lit; the next one fills as an arc with its care points. So the
 * decoration is the growth meter, drawn where the eye already is.
 */
export function GrowthRings({ size, grown, spread = 1.45, labels = true, pulse }: { size: number; grown: Stage; spread?: number; labels?: boolean; pulse?: number }) {
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
                strokeWidth="1" strokeDasharray={reached || isNext ? undefined : '2 5'} className={pulse === i ? 'ring-pulse' : undefined} />
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

/** Light drifting up through the stage: a few motes in the accent and a few in the creature's colour. */
export function Motes({ n = 14, color }: { n?: number; color: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        // Spread by a fixed shuffle, not Math.random, so the server and the browser draw the same stage.
        const x = (i * 37 + 11) % 100, y = 35 + ((i * 53) % 55), s = 3 + (i % 3) * 2;
        return (
          <span key={i} className="mote" aria-hidden style={{
            left: `${x}%`, top: `${y}%`, width: s, height: s,
            ['--c' as string]: i % 3 === 0 ? color : 'var(--accent)',
            ['--d' as string]: `${6 + (i % 5) * 1.6}s`, ['--delay' as string]: `${(i * 0.9) % 7}s`,
          }} />
        );
      })}
    </>
  );
}

/**
 * Growth the way a game shows a level: the stage it is, a bar filling with care points, the stage
 * it grows into. Care only — never money. `pulse` lights it up just after a stage is reached.
 */
export function LevelBar({ grown, pulse, className = '' }: { grown: Stage; pulse?: boolean; className?: string }) {
  const floor = STAGES[grown.index].from;
  const next = STAGES[grown.index + 1];
  const f = next ? Math.max(0.04, Math.min(1, (grown.points - floor) / (next.from - floor))) : 1;
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="grid h-7 min-w-7 place-items-center rounded-full px-2 text-[12px] font-extrabold"
        style={{ background: 'linear-gradient(180deg, #FFE46B, #F0B90B)', color: 'var(--on-accent)', fontFamily: 'var(--font-display)', boxShadow: '0 2px 0 #B98900' }}>
        {grown.index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-[11.5px] font-semibold">
          <span style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{grown.name}</span>
          <span className="num" style={{ color: 'var(--muted)' }}>{next ? `${grown.points}/${next.from} → ${next.name}` : `${grown.points} · max level`}</span>
        </div>
        <div className={`xp-track ${pulse ? 'xp-pulse' : ''}`}><div className="xp-fill" style={{ width: `${f * 100}%` }} /></div>
      </div>
    </div>
  );
}
