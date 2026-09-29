// Habits, not hype. Everything that makes a Fledgling worth coming back to without making it a
// slot machine — pure functions, shared by the browser and the hourly worker.
//
// What the research behind it said, and what each piece does with it:
//
//   · Scheduled saving beats everything else. The CFPB's 2022 study of a savings app found fixed,
//     scheduled rules went with 1.5–3.5× larger gains than round-up style ones. → Schedule.
//   · Streaks work when they forgive. Duolingo's streak freeze is deliberate slack. → one missed
//     day a week does not break the streak.
//   · A free daily action keeps the bond without money. Aavegotchi lets you pet once every 12h. →
//     pet(), which costs nothing and moves nothing.
//   · Growth should come from consistency, not profit (Finch). → stage() counts days, pets and
//     scheduled feeds kept — never returns, never deposit size.
//   · Celebrate care, not trading. Robinhood removed confetti on trades in 2021 and settled with
//     Massachusetts in 2024 over "celebratory imagery tied to the frequency of trading". → Roost
//     celebrates hatching, streak milestones and stages, and nothing that moves money.

export type Cadence = 'week' | 'fortnight' | 'month';

export type Schedule = {
  usd: number;
  every: Cadence;
  /** Epoch ms of the next feeding day. */
  nextAt: number;
  since: number;
  /** Feeding days honoured, and feeding days passed by. */
  kept: number;
  missed: number;
  paused?: boolean;
};

export type Care = {
  /** Distinct days the owner came by — cumulative, unlike the streak. */
  days: number;
  pets: number;
  pettedAt?: number;
  /** The weekly allowance of one forgiven day, spent at this time. */
  freezeUsedAt?: number;
  /** The token-to-share ratio last seen: when it rises, a dividend was reinvested. */
  ratioSeen?: number;
  /** The last milestone celebrated, so each one is celebrated once. */
  celebrated?: string;
};

const DAY = 86_400_000;
export const PET_COOLDOWN_MS = 12 * 3600_000;
const FREEZE_EVERY_MS = 7 * DAY;

export const CADENCE_LABEL: Record<Cadence, string> = { week: 'every week', fortnight: 'every two weeks', month: 'every month' };

/** The feeding day after `from`. */
export function nextSlot(from: number, every: Cadence): number {
  if (every === 'week') return from + 7 * DAY;
  if (every === 'fortnight') return from + 14 * DAY;
  // Same day next month, clamped: a schedule set on the 31st feeds on the 28th in February rather
  // than rolling into March the way Date.setMonth would.
  const d = new Date(from);
  const dom = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setDate(Math.min(dom, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.getTime();
}

export function newSchedule(usd: number, every: Cadence, now = Date.now()): Schedule {
  return { usd, every, nextAt: nextSlot(now, every), since: now, kept: 0, missed: 0 };
}

export const isDue = (s: Schedule | undefined, now = Date.now()): boolean =>
  Boolean(s && !s.paused && now >= s.nextAt);

/**
 * A feeding day honoured. The next one is counted from the day it was due, not from now, so a
 * weekly Monday feed stays on Mondays — and days that slipped by while nobody was here are passed
 * over, never stacked up into one big catch-up buy.
 */
export function kept(s: Schedule, now = Date.now()): Schedule {
  let next = nextSlot(s.nextAt, s.every), missed = s.missed;
  while (next <= now) { next = nextSlot(next, s.every); missed++; }
  return { ...s, kept: s.kept + 1, nextAt: next, missed };
}

/** A feeding day passed by on purpose. It counts as missed, and that is all. */
export function skipped(s: Schedule, now = Date.now()): Schedule {
  let next = nextSlot(s.nextAt, s.every), missed = s.missed + 1;
  while (next <= now) { next = nextSlot(next, s.every); missed++; }
  return { ...s, nextAt: next, missed };
}

/**
 * A visit. Consecutive days grow the streak; one missed day a week is forgiven; more than that
 * starts it again. Returns what happened so the caller can say so.
 */
export function visit(
  streak: number, lastVisitDay: string, care: Care | undefined, now = Date.now(),
): { streak: number; care: Care; forgiven: boolean } {
  const c: Care = { days: 0, pets: 0, ...care };
  const day = (t: number) => new Date(t).toLocaleDateString('en-CA');
  if (lastVisitDay === day(now)) return { streak, care: c, forgiven: false };
  const days = c.days + 1;
  if (lastVisitDay === day(now - DAY)) return { streak: streak + 1, care: { ...c, days }, forgiven: false };
  const freezeReady = !c.freezeUsedAt || now - c.freezeUsedAt >= FREEZE_EVERY_MS;
  if (lastVisitDay === day(now - 2 * DAY) && freezeReady) {
    return { streak: streak + 1, care: { ...c, days, freezeUsedAt: now }, forgiven: true };
  }
  return { streak: 1, care: { ...c, days }, forgiven: false };
}

export const canPet = (care: Care | undefined, now = Date.now()) =>
  !care?.pettedAt || now - care.pettedAt >= PET_COOLDOWN_MS;

export function pet(care: Care | undefined, now = Date.now()): Care {
  return { days: 0, ...care, pets: (care?.pets ?? 0) + 1, pettedAt: now };
}

/**
 * The Bond ring: petting it lifts it and it fades over two days, but a long streak keeps a floor
 * under it. Nothing to do with money.
 */
export function bond(care: Care | undefined, streak: number, now = Date.now()): number {
  const floor = Math.min(0.6, 0.1 + streak * 0.05);
  const fresh = care?.pettedAt ? Math.max(0, 1 - (now - care.pettedAt) / (2 * DAY)) : 0;
  return Math.min(1, Math.max(floor, fresh));
}

export type Stage = { name: 'Hatchling' | 'Fledgling' | 'Flyer' | 'Legend'; index: number; points: number; next: number | null; scale: number };

const STAGES: { name: Stage['name']; from: number; scale: number }[] = [
  { name: 'Hatchling', from: 0, scale: 0.86 },
  { name: 'Fledgling', from: 5, scale: 0.92 },
  { name: 'Flyer', from: 15, scale: 1 },
  { name: 'Legend', from: 40, scale: 1.06 },
];

/** How grown it is, from care alone: days visited, pets given, feeding days kept. */
export function stage(care: Care | undefined, schedule: Schedule | undefined): Stage {
  const points = (care?.days ?? 0) + Math.floor((care?.pets ?? 0) / 2) + 2 * (schedule?.kept ?? 0);
  let i = 0;
  for (let k = 0; k < STAGES.length; k++) if (points >= STAGES[k].from) i = k;
  return { name: STAGES[i].name, index: i, points, next: STAGES[i + 1]?.from ?? null, scale: STAGES[i].scale };
}

/** The milestone worth a celebration right now, if any — each is celebrated once. */
export function milestone(streak: number, st: Stage, care: Care | undefined): { key: string; line: string } | null {
  const streakMarks = [7, 30, 100, 365];
  const s = [...streakMarks].reverse().find((m) => streak >= m);
  const candidates = [
    ...(st.index > 0 ? [{ key: `stage-${st.name}`, line: `I'm a ${st.name} now.` }] : []),
    ...(s ? [{ key: `streak-${s}`, line: `${s} days in a row. You came back every time.` }] : []),
  ];
  const done = (care?.celebrated ?? '').split('|');
  return candidates.find((c) => !done.includes(c.key)) ?? null;
}

/** Record a milestone as celebrated, keeping the list of those already done. */
export const celebrated = (care: Care | undefined, key: string): Care =>
  ({ days: 0, pets: 0, ...care, celebrated: [...new Set([...(care?.celebrated ?? '').split('|').filter(Boolean), key])].join('|') });
