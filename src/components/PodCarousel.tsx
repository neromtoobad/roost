'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { SPECIES, type Species } from '@/lib/pets';
import { HUE } from '@/lib/look';

const STEP = 92;

/**
 * The six classic pods as a turntable: the one in front is lit and full colour, its neighbours step
 * back and go grey. Swipe, click a neighbour, use the arrows or the keyboard. One pod is always in
 * front, so there is always something to hatch.
 */
export function PodCarousel({ ids, value, onChange }: { ids: Species['id'][]; value: Species['id']; onChange: (id: Species['id']) => void }) {
  const reduce = useReducedMotion();
  const n = ids.length, at = Math.max(0, ids.indexOf(value));
  const go = (d: number) => onChange(ids[(at + d + n) % n]);
  const sp = SPECIES[value];
  const arrow = 'btn-2 grid h-8 w-8 place-items-center !rounded-full text-[16px]';
  return (
    // Lit in the colour of the creature in front, so turning the table changes the light.
    <div className="stage mt-2 rounded-[22px] px-3 pb-3 pt-2" style={{ ['--pet' as string]: HUE[value].main, transition: 'background .4s ease' }}>
      <div className="stage-rays" aria-hidden />
      <motion.div className="relative h-36 cursor-grab touch-pan-y overflow-hidden outline-none active:cursor-grabbing lg:h-28 lg:tall:h-32" tabIndex={0}
        role="listbox" aria-label="Classic pods" aria-activedescendant={`pod-${value}`}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); }}
        drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18} dragSnapToOrigin
        onDragEnd={(_, info) => { if (info.offset.x < -36) go(1); else if (info.offset.x > 36) go(-1); }}>
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-8 w-40 -translate-x-1/2 rounded-[50%]" style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${HUE[value].main} 65%, transparent), transparent)`, filter: 'blur(4px)' }} aria-hidden />
        {ids.map((id, k) => {
          let off = k - at;
          if (off > n / 2) off -= n;
          if (off < -n / 2) off += n;
          const a = Math.abs(off);
          return (
            <motion.button key={id} id={`pod-${id}`} role="option" aria-selected={off === 0} aria-label={`${SPECIES[id].ticker} pod`}
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
        <button onClick={() => go(-1)} aria-label="Previous pod" className={arrow} style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>‹</button>
        <div className="min-w-0 text-center">
          <p className="text-[16px] font-extrabold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{sp.ticker} <span className="hue-text text-[12px] font-semibold" style={{ ['--hue-main' as string]: HUE[value].main, ['--hue-deep' as string]: HUE[value].deep }}>· {sp.name}</span></p>
          <p className="truncate text-[12px]" style={{ color: 'var(--muted)' }}>{sp.company} · {sp.preIpo ? 'pre-IPO' : 'tokenized stock'}</p>
        </div>
        <button onClick={() => go(1)} aria-label="Next pod" className={arrow} style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>›</button>
      </div>
    </div>
  );
}

/**
 * A pod sitting in the nest: the nest drawn twice, its back behind the pod and its front rim over the
 * pod's base, so the pod is in it rather than on top of it.
 */
export function OnNest({ id, size }: { id: Species['id']; size: number }) {
  const nw = size * 1.7, nh = nw / 1.64;
  const nest = { width: nw, left: '50%', bottom: 0, translate: '-50% 0' } as const;
  return (
    <div className="relative" style={{ width: nw, height: size + nh * 0.42 }}>
      <img src="/ui/nest.webp" alt="" aria-hidden draggable={false} className="pointer-events-none absolute max-w-none" style={nest} />
      <img src={`/pets/eggs/${id}.png`} alt="" draggable={false} className="absolute left-1/2 object-contain"
        style={{ width: size, height: size, bottom: nh * 0.36, translate: '-50% 0', filter: 'drop-shadow(0 8px 10px rgba(0,0,0,.3))' }} />
      <img src="/ui/nest.webp" alt="" aria-hidden draggable={false} className="pointer-events-none absolute max-w-none" style={{ ...nest, clipPath: 'inset(54% 0 0 0)' }} />
    </div>
  );
}
