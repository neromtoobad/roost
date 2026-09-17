'use client';
import { motion, useReducedMotion } from 'framer-motion';

// A burst of small lime squares. Used on feed, hatch and going public.
export function Confetti({ count = 24, color = 'var(--accent)' }: { count?: number; color?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      {Array.from({ length: count }).map((_, i) => {
        const a = (i / count) * Math.PI * 2, r = 90 + (i % 5) * 28;
        return (
          <motion.span key={i} className="absolute left-1/2 top-1/2 block h-2.5 w-2.5 rounded-[2px]" style={{ background: color }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{ x: Math.cos(a) * r, y: Math.sin(a) * r + 40, opacity: 0, rotate: 180 + i * 20, scale: 0.6 }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: (i % 6) * 0.03 }} />
        );
      })}
    </div>
  );
}
