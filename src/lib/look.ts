import type { Species } from './pets';

/**
 * Each creature's own colour, taken from its render: what tints its stage, its card and its chip,
 * so a page full of pets reads as a page full of different pets. `glow` is the signature detail
 * (DESIGN.md: lime only there), `deep` a darker shade for text and edges on light backgrounds.
 */
export const HUE: Record<Species['id'], { main: string; deep: string; glow: string }> = {
  nova:    { main: '#9BE15D', deep: '#4E7A2A', glow: '#B6F23A' }, // Pango — circuit lime on charcoal
  volt:    { main: '#FF8FB8', deep: '#C2557E', glow: '#E58A4E' }, // Coil — pink, copper coils
  pip:     { main: '#D9A066', deep: '#8A5A2E', glow: '#7DBA5A' }, // Bara — caramel, leaf green
  booster: { main: '#FF7A1A', deep: '#C2560A', glow: '#B6F23A' }, // Rivet — flight-suit orange
  nimbus:  { main: '#C6A4EA', deep: '#7E5CA8', glow: '#E89AAE' }, // Patch — lavender and rose quilt
  lurk:    { main: '#F0C892', deep: '#A27B45', glow: '#B6F23A' }, // Fen — desert sand
};

/** The three needs, each its own colour and 3D icon (public/ui). */
export const STAT = {
  hunger: { color: 'var(--hunger)', icon: '/ui/stat-hunger.webp' },
  energy: { color: 'var(--energy)', icon: '/ui/stat-energy.webp' },
  bond:   { color: 'var(--bond)',   icon: '/ui/stat-bond.webp' },
} as const;

/** A litter's 3D icon and the colour its tile is lit with. */
export const LITTER_LOOK: Record<string, { icon: string; color: string }> = {
  mag7:    { icon: '/ui/litter-mag7.webp',    color: '#F0B90B' },
  chips:   { icon: '/ui/litter-chips.webp',   color: '#9BE15D' },
  etf:     { icon: '/ui/litter-etf.webp',     color: '#2BB3A8' },
  buffett: { icon: '/ui/litter-buffett.webp', color: '#E8A93A' },
};

/** What each creature takes in (lib/pets speciesFor), said the short way. */
export const TAKES_IN: Record<Species['id'], string> = {
  nova: 'technology stocks',
  volt: 'energy, utility and materials stocks',
  pip: 'consumer, healthcare and real estate stocks',
  booster: 'industrials: aerospace and space live here',
  nimbus: 'ETFs: many patches, one basket',
  lurk: 'communication and financial stocks',
};
