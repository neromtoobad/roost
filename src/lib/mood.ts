import type { Mood } from './pets';
import type { Session } from './session';

export type MoodInput = {
  pct24h: number;   // home stock 24h change, percent
  session: Session;
  hunger: number;   // 0..1, 1 = just fed
  volSpike?: boolean;
};

// Deterministic. Hunger and session win over price so the care loop is never masked by a green day.
export function computeMood(i: MoodInput): Mood {
  if (i.hunger < 0.33) return 'hungry';
  if (i.session === 'weekend' || i.session === 'holiday') return 'pajamas';
  if (i.session === 'overnight') return 'nightowl';
  if (i.pct24h >= 4) return 'ecstatic';
  if (i.pct24h >= 1) return 'happy';
  if (i.pct24h <= -4) return 'sulking';
  if (i.pct24h <= -1 || i.volSpike) return 'nervous';
  return 'chill';
}

export const moodLines: Record<Mood, string[]> = {
  ecstatic: ['WE ARE SO BACK.', 'Up only. Allegedly.', 'I bought a hat. Two hats.'],
  happy: ['Green day. I bought a hat.', "Told you. I didn't, but still."],
  chill: ['Sideways. Vibing.', 'Nothing happened. Perfect.'],
  nervous: ["It's a dip. It's a healthy dip. Right?", 'Everything is fine. Stop asking.'],
  sulking: ["Don't look at me.", 'We do not speak of today.'],
  nightowl: ["Wall Street sleeps. I don't.", 'NYSE is closed. I am not.'],
  pajamas: ['Markets closed. Snacks open.', 'Weekend rules: no charts.'],
  hungry: ["Feed me and I'll buy the dip.", 'Empty bowl. Empty bags.'],
};

export function moodLine(mood: Mood, pct24h: number, ticker: string): string {
  const pool = moodLines[mood];
  const pick = pool[Math.abs(Math.round(pct24h * 100)) % pool.length];
  const sign = pct24h >= 0 ? '+' : '';
  return mood === 'nightowl' || mood === 'pajamas' || mood === 'hungry'
    ? pick
    : `${ticker} ${sign}${pct24h.toFixed(1)}%. ${pick}`;
}
