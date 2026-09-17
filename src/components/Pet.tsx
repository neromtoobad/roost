'use client';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { petImage, type Mood, type Species } from '@/lib/pets';

// The pet is the interface. Idle breathing, a blink, and a squash-and-stretch on every mood change.
export function Pet({ id, mood, night, size = 300 }: { id: Species['id']; mood: Mood; night: boolean; size?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <div className="absolute bottom-3 h-6 rounded-full" style={{
        width: size * 0.7, background: night ? 'var(--accent)' : 'var(--line)',
        filter: night ? 'blur(18px)' : 'blur(8px)', opacity: night ? 0.55 : 0.8,
      }} aria-hidden />
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
