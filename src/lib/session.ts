// NYSE session clock. The app's day/night theme and the pet's Energy follow this, not the wall clock.
export type Session = 'pre' | 'regular' | 'post' | 'overnight' | 'weekend' | 'holiday';

/** `holidays` is a set of YYYY-MM-DD closure dates (from /api/holidays). A holiday reads like a weekend. */
export function nyseSession(now: Date = new Date(), holidays?: Set<string>): Session {
  const et = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => et.find((p) => p.type === t)?.value ?? '';
  const day = get('weekday');
  const mins = Number(get('hour')) % 24 * 60 + Number(get('minute'));
  if (day === 'Sat' || day === 'Sun') return 'weekend';
  if (holidays?.has(`${get('year')}-${get('month')}-${get('day')}`)) return 'holiday';
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return 'pre';
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return 'regular';
  if (mins >= 16 * 60 && mins < 20 * 60) return 'post';
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
