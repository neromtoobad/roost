// NYSE session clock. The app's day/night theme and the pet's Energy follow this, not the wall clock.
export type Session = 'pre' | 'regular' | 'post' | 'overnight' | 'weekend' | 'holiday';

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
/** The n-th given weekday of a month (n = -1 for the last). */
function nth(y: number, m: number, wd: number, n: number): number {
  if (n > 0) return 1 + ((wd - dow(y, m, 1) + 7) % 7) + (n - 1) * 7;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - ((dow(y, m, last) - wd + 7) % 7);
}
/** Easter Sunday (Anonymous Gregorian algorithm), as [month, day]. */
function easter(y: number): [number, number] {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return [month, ((h + l - 7 * m + 114) % 31) + 1];
}
/** A fixed-date holiday moved off the weekend: Saturday to Friday, Sunday to Monday. */
function observed(y: number, m: number, d: number): string {
  const w = dow(y, m, d);
  const t = new Date(Date.UTC(y, m - 1, d + (w === 6 ? -1 : w === 0 ? 1 : 0)));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// One-off closures the rules can't know (national days of mourning).
const SPECIAL = ['2025-01-09'];

const calendars = new Map<number, { closed: Set<string>; early: Set<string> }>();
/**
 * The NYSE's full closures and 1 p.m. early closes for a year, from the exchange's own rules (Rule 7.2):
 * New Year's Day, Martin Luther King Jr. Day, Washington's Birthday, Good Friday, Memorial Day,
 * Juneteenth, Independence Day, Labor Day, Thanksgiving and Christmas. Computed here, so the clock
 * needs no outside calendar.
 */
export function nyseCalendar(y: number): { closed: Set<string>; early: Set<string> } {
  const hit = calendars.get(y);
  if (hit) return hit;
  const closed = new Set<string>(SPECIAL);
  // New Year's Day on a Saturday is not moved back into the old year.
  if (dow(y, 1, 1) !== 6) closed.add(observed(y, 1, 1));
  closed.add(ymd(y, 1, nth(y, 1, 1, 3)));
  closed.add(ymd(y, 2, nth(y, 2, 1, 3)));
  const [em, ed] = easter(y);
  const gf = new Date(Date.UTC(y, em - 1, ed - 2));
  closed.add(ymd(y, gf.getUTCMonth() + 1, gf.getUTCDate()));
  closed.add(ymd(y, 5, nth(y, 5, 1, -1)));
  if (y >= 2022) closed.add(observed(y, 6, 19));
  closed.add(observed(y, 7, 4));
  closed.add(ymd(y, 9, nth(y, 9, 1, 1)));
  const thanks = nth(y, 11, 4, 4);
  closed.add(ymd(y, 11, thanks));
  closed.add(observed(y, 12, 25));
  const early = new Set<string>();
  const trades = (m: number, d: number) => { const w = dow(y, m, d); return w !== 0 && w !== 6 && !closed.has(ymd(y, m, d)); };
  if (trades(7, 3)) early.add(ymd(y, 7, 3));
  early.add(ymd(y, 11, thanks + 1));
  if (trades(12, 24)) early.add(ymd(y, 12, 24));
  const cal = { closed, early };
  calendars.set(y, cal);
  return cal;
}

export function nyseSession(now: Date = new Date()): Session {
  const et = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => et.find((p) => p.type === t)?.value ?? '';
  const day = get('weekday');
  const mins = Number(get('hour')) % 24 * 60 + Number(get('minute'));
  if (day === 'Sat' || day === 'Sun') return 'weekend';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const cal = nyseCalendar(Number(get('year')));
  if (cal.closed.has(date)) return 'holiday';
  // Early-close days ring the bell at 1 p.m.; after-hours runs to 5.
  const close = cal.early.has(date) ? 13 * 60 : 16 * 60, postEnd = cal.early.has(date) ? 17 * 60 : 20 * 60;
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return 'pre';
  if (mins >= 9 * 60 + 30 && mins < close) return 'regular';
  if (mins >= close && mins < postEnd) return 'post';
  return 'overnight';
}

export const isNight = (s: Session) => s === 'overnight' || s === 'weekend' || s === 'holiday';

export const sessionLabel: Record<Session, string> = {
  pre: 'NYSE pre-market',
  regular: 'NYSE open · regular session',
  post: 'NYSE after-hours',
  overnight: 'NYSE closed · overnight session',
  weekend: 'NYSE closed · weekend',
  holiday: 'NYSE closed · holiday',
};

/**
 * The next bell: when the regular session next opens, or, during it, when it closes. Walked in
 * 15-minute steps over the session clock above (the bells fall on quarter hours), up to a week.
 */
export function nextBell(now: Date = new Date()): { kind: 'open' | 'close'; at: Date } {
  const open = nyseSession(now) === 'regular';
  const step = 15 * 60e3;
  let t = Math.ceil(now.getTime() / step) * step;
  for (let k = 0; k < 7 * 96; k++, t += step) {
    if ((nyseSession(new Date(t)) === 'regular') !== open) return { kind: open ? 'close' : 'open', at: new Date(t) };
  }
  return { kind: open ? 'close' : 'open', at: new Date(t) };
}
