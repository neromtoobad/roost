'use client';
import { Nav } from '@/components/Nav';
import { TxLink } from '@/components/Report';
import { petImage } from '@/lib/pets';
import { usePet, type EntryKind, type PetState } from '@/lib/store';
import { useNow } from '@/lib/client';
import { nextBell, nyseSession } from '@/lib/session';

const ICON: Record<EntryKind, string> = { feed: '🍽', buy: '📈', sell: '🕊', lend: '🏦', yield: '✨', hold: '🤚', ask: '🙋', system: '🔔' };

const DAY = 864e5;
const span = (ms: number) => { const h = Math.floor(ms / 3600e3), m = Math.round((ms % 3600e3) / 60e3); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`; };

/**
 * The last day in one card, the way a sleep app hands you the night: what it bought, what it was
 * fed, how much happened while the exchange was shut, and when the next bell rings. Built only from
 * the diary itself, so it can never claim what the entries below do not show.
 */
function DayReport({ pet }: { pet: PetState }) {
  const now = useNow(60_000);
  if (!now) return null;
  const recent = pet.diary.filter((e) => now - e.ts < DAY);
  const buys = recent.filter((e) => e.kind === 'buy');
  const spent = buys.reduce((s, e) => s + (e.usd ?? 0), 0);
  const fed = recent.filter((e) => e.kind === 'feed').reduce((s, e) => s + (e.usd ?? 0), 0);
  const asks = recent.filter((e) => e.kind === 'ask').length;
  const shut = recent.filter((e) => (e.kind === 'buy' || e.kind === 'ask') && nyseSession(new Date(e.ts)) !== 'regular').length;
  const bell = nextBell(new Date(now));
  const n = pet.name;
  const headline = buys.length
    ? `${n} bought ${buys.length === 1 ? 'once' : `${buys.length} times`} — $${spent.toFixed(2)} in${
      !shut ? ', all in market hours' : buys.length === 1 ? ', while Wall Street slept' : shut >= buys.length ? ', all while Wall Street slept' : `, ${shut} of them while Wall Street slept`}.`
    : asks ? `${n} asked you ${asks === 1 ? 'once' : `${asks} times`}. It is waiting on your yes.`
    : recent.some((e) => e.kind === 'hold') ? `${n} held. Its rule did not fire — that is a decision too.`
    : `Quiet day. ${n} kept watch.`;
  const stat = (label: string, value: string) => (
    <div className="rounded-[12px] px-3 py-2" style={{ background: 'var(--surface-2)' }}>
      <p className="text-[11px]" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="num text-[15px] font-semibold">{value}</p>
    </div>
  );
  return (
    <section className="card mt-5 shrink-0 px-4 py-3.5 lg:px-5" style={{ background: 'radial-gradient(120% 160% at 0% 0%, color-mix(in srgb, var(--accent) 9%, var(--surface)), var(--surface) 60%)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] font-medium uppercase tracking-[.08em]" style={{ color: 'var(--accent-ink)' }}>The last 24 hours</p>
        <p className="num text-[12px]" style={{ color: 'var(--muted)' }}>NYSE {bell.kind === 'open' ? 'opens' : 'closes'} in {span(bell.at.getTime() - now)}</p>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <img src={petImage(pet.species, buys.length ? 'happy' : asks ? 'nervous' : 'chill')} alt="" className="h-12 w-12 shrink-0 object-contain" />
        <p className="text-[15.5px] font-semibold leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{headline}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {stat('Bought', buys.length ? `${buys.length} · $${spent.toFixed(0)}` : '—')}
        {stat('Fed', fed ? `$${fed.toFixed(0)}` : '—')}
        {stat('While NYSE shut', String(shut))}
      </div>
    </section>
  );
}

export default function Diary() {
  const pet = usePet();
  const entries = pet ? [...pet.diary].reverse() : [];
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(12px,env(safe-area-inset-top))] lg:h-full lg:min-h-0 lg:max-w-[1200px] lg:px-10 lg:pb-6 lg:pt-6">
      <div className="lg:mx-auto lg:flex lg:min-h-0 lg:w-full lg:max-w-[860px] lg:flex-1 lg:flex-col">
      <h1 className="text-center text-[28px] font-bold lg:text-left lg:text-[36px]" style={{ fontFamily: 'var(--font-display)' }}>Diary</h1>
      <p className="text-center text-[13px] lg:text-left lg:text-[14px]" style={{ color: 'var(--muted)' }}>
        {pet ? `Every decision ${pet.name} made, in its own words.` : 'Adopt a Fledgling to start a diary.'}
      </p>
      {pet && <DayReport pet={pet} />}
      {/* Desktop reads it as one ledger, an entry per row; the phone keeps a card each. */}
      <ul className="mt-3 grid gap-2 lg:mt-3 lg:min-h-0 lg:flex-1 lg:content-start lg:gap-0 lg:overflow-y-auto lg:rounded-[var(--radius-card)] lg:border lg:border-[var(--line)] lg:bg-[var(--surface)]">
        {entries.map((e, i) => (
          <li key={`${e.ts}-${i}`} className="card flex items-start gap-3 px-3 py-3 lg:rounded-none lg:border-0 lg:border-b lg:px-5 lg:py-4 lg:last:border-b-0">
            {pet && <img src={petImage(pet.species, 'chill')} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover object-top" style={{ background: 'var(--canvas)' }} />}
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{e.text}</p>
              <p className="mt-1 text-[11.5px] num" style={{ color: 'var(--muted)' }}>
                <span aria-hidden>{ICON[e.kind] ?? '•'}</span>{' '}
                {new Date(e.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {e.qty != null && e.price != null && ` · ${e.qty.toFixed(4)} @ $${e.price.toFixed(2)}`}
                {e.usd != null && e.qty == null && ` · $${e.usd.toFixed(2)}`}
                {e.paper && ' · paper'}
              </p>
              {e.sig && <TxLink sig={e.sig} />}
            </div>
          </li>
        ))}
        {pet && entries.length === 0 && <li className="text-center text-[13px]" style={{ color: 'var(--muted)' }}>Nothing yet. Feed it.</li>}
      </ul>
      </div>
      <Nav />
    </main>
  );
}
