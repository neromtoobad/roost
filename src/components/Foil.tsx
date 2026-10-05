'use client';
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

/**
 * A collectible's foil: a sheen that follows the pointer and a slight tilt toward it, like turning
 * a card in the light. Kept for the one pet worth showing off; the rest are plain cards. The
 * pointer only writes CSS variables (no re-render), and reduced motion drops the tilt (tokens.css).
 */
export function Foil({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (vars: Record<string, string>) => { const el = ref.current; if (el) for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v); };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    set({ '--mx': `${(x * 100).toFixed(1)}%`, '--my': `${(y * 100).toFixed(1)}%`, '--rx': `${((0.5 - y) * 7).toFixed(2)}deg`, '--ry': `${((x - 0.5) * 9).toFixed(2)}deg`, '--foil-o': '1' });
  };
  const leave = () => set({ '--rx': '0deg', '--ry': '0deg', '--foil-o': '0.3' });
  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} className={`foil ${className}`} style={style}>
      {children}
    </div>
  );
}
