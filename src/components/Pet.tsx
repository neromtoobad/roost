'use client';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { petImage, type Mood, type Species } from '@/lib/pets';

// The pet is the interface. Idle breathing, a blink, and a squash-and-stretch on every mood change.
// Where the top of each habitat base sits in its own image (fraction of its height), so the
// creature's feet land on the surface rather than floating over the rim.
const BASE_TOP: Record<Species['id'], number> = { nova: 0.47, volt: 0.47, pip: 0.48, booster: 0.53, nimbus: 0.51, lurk: 0.48 };

export function Pet({ id, mood, night, size = 300, base = false }: { id: Species['id']; mood: Mood; night: boolean; size?: number; base?: boolean }) {
  const reduce = useReducedMotion();
  // The render is 82% of the box, centred, with its feet at ~97% of the render.
  const feet = size * (0.09 + 0.82 * 0.965);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size, marginBottom: base ? size * 0.2 : 0 }}>
      {base ? (
        // Its habitat: a diorama base in the same toy material, the creature standing on it.
        <img src={`/pets/bases/${id}.webp`} alt="" draggable={false} aria-hidden className="pointer-events-none absolute left-1/2 max-w-none select-none"
          style={{ width: size * 1.02, top: feet, transform: `translate(-50%, -${BASE_TOP[id] * 100}%)`, filter: 'drop-shadow(0 22px 26px rgba(0,0,0,.35))' }} />
      ) : (
        <div className="absolute bottom-3 h-6 rounded-full" style={{
          width: size * 0.7, background: night ? 'var(--accent)' : 'var(--line)',
          filter: night ? 'blur(18px)' : 'blur(8px)', opacity: night ? 0.55 : 0.8,
        }} aria-hidden />
      )}
      <AnimatePresence mode="popLayout">
        <motion.img
          key={mood}
          src={petImage(id, mood)}
          alt={`${id} looking ${mood}`}
          draggable={false}
          className="relative select-none object-contain"
          style={{
            width: size * 0.82, height: size * 0.82,
            // the Night Owl render carries its own blue vignette; feather it into the night canvas
            ...(mood === 'nightowl' ? { maskImage: 'radial-gradient(circle at 50% 45%, #000 52%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle at 50% 45%, #000 52%, transparent 70%)' } : {}),
          }}
          initial={reduce ? false : { scale: 0.85, y: 8, opacity: 0 }}
          animate={reduce ? {} : { scale: [1, 1.02, 1], y: [0, -3, 0], opacity: 1 }}
          exit={reduce ? {} : { scale: 1.08, opacity: 0, transition: { duration: 0.15 } }}
          transition={reduce ? {} : { opacity: { duration: 0.2 }, scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' }, y: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }}
        />
      </AnimatePresence>
    </div>
  );
}
