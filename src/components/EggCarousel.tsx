'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { SPECIES, type Species } from '@/lib/pets';

const STEP = 92;

/**
 * The six classic eggs as a turntable: the one in front is lit and full colour, its neighbours step
 * back and go grey. Swipe, click a neighbour, use the arrows or the keyboard. One egg is always in
 * front, so there is always something to hatch.
 */
export function EggCarousel({ ids, value, onChange }: { ids: Species['id'][]; value: Species['id']; onChange: (id: Species['id']) => void }) {
  const reduce = useReducedMotion();
  const n = ids.length, at = Math.max(0, ids.indexOf(value));
  const go = (d: number) => onChange(ids[(at + d + n) % n]);
  const sp = SPECIES[value];
  const arrow = 'grid h-8 w-8 place-items-center rounded-full border text-[16px]';
  return (
    <div className="mt-2 rounded-[var(--radius-card)] border px-3 pb-3 pt-2" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <motion.div className="relative h-36 cursor-grab touch-pan-y overflow-hidden outline-none active:cursor-grabbing lg:h-32" tabIndex={0}
        role="listbox" aria-label="Classic eggs" aria-activedescendant={`egg-${value}`}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); }}
        drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18} dragSnapToOrigin
        onDragEnd={(_, info) => { if (info.offset.x < -36) go(1); else if (info.offset.x > 36) go(-1); }}>
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'var(--stage-glow)' }} aria-hidden />
        {ids.map((id, k) => {
          let off = k - at;
          if (off > n / 2) off -= n;
          if (off < -n / 2) off += n;
          const a = Math.abs(off);
          return (
            <motion.button key={id} id={`egg-${id}`} role="option" aria-selected={off === 0} aria-label={`${SPECIES[id].ticker} egg`}
              onClick={() => { if (off !== 0) onChange(id); }} tabIndex={-1}
              className="absolute left-1/2 top-1/2 -ml-14 -mt-14 h-28 w-28"
              initial={false}
              animate={{ x: off * STEP, scale: off === 0 ? 1 : a === 1 ? 0.66 : 0.48, opacity: a > 2 ? 0 : off === 0 ? 1 : a === 1 ? 0.75 : 0.4,
                filter: off === 0 ? 'grayscale(0) brightness(1)' : 'grayscale(0.9) brightness(0.85)' }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30 }}
              style={{ zIndex: 10 - a }}>
              <img src={`/pets/eggs/${id}.png`} alt="" draggable={false} className="h-full w-full object-contain" />
            </motion.button>
          );
        })}
      </motion.div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <button onClick={() => go(-1)} aria-label="Previous egg" className={arrow} style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>‹</button>
        <div className="min-w-0 text-center">
          <p className="text-[15px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{sp.ticker}</p>
          <p className="truncate text-[12px]" style={{ color: 'var(--muted)' }}>{sp.company} · {sp.preIpo ? 'pre-IPO' : 'tokenized stock'}</p>
        </div>
        <button onClick={() => go(1)} aria-label="Next egg" className={arrow} style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>›</button>
      </div>
    </div>
  );
}
