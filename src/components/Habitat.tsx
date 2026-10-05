'use client';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Pet } from './Pet';
import { Motes } from './Stage';
import { HUE } from '@/lib/look';
import type { Mood, Species } from '@/lib/pets';
import { TALL, WIDE, WIDER, useMedia } from '@/lib/client';

/**
 * A creature at home: its lit stage in its own colour, light turning behind it, and the creature
 * standing on its habitat base. Sized for phone / desktop / a big desktop window. `bounce` gives a
 * little hop (after a feed or a release); anything passed as children sits under the creature.
 */
export function Habitat({ id, mood, sizes = [190, 230, 290], bounce, className = '', children }: {
  id: Species['id']; mood: Mood; sizes?: [number, number, number]; bounce?: boolean; className?: string; children?: ReactNode;
}) {
  const wide = useMedia(WIDE), wider = useMedia(WIDER), tall = useMedia(TALL);
  const size = wider && tall ? sizes[2] : wide ? sizes[1] : sizes[0];
  return (
    <div className={`stage flex flex-col items-center rounded-[28px] ${className}`} style={{ ['--pet' as string]: HUE[id].main }}>
      <div className="stage-rays" aria-hidden />
      <Motes n={10} color={HUE[id].glow} />
      <motion.div animate={bounce ? { y: [0, -10, 0] } : {}} transition={{ duration: 0.45 }}>
        <Pet id={id} mood={mood} night={false} size={size} base />
      </motion.div>
      {children}
    </div>
  );
}
