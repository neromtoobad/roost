'use client';
import { Nav } from '@/components/Nav';
import { TxLink } from '@/components/Report';
import { petImage } from '@/lib/pets';
import { usePet, type EntryKind } from '@/lib/store';

const ICON: Record<EntryKind, string> = { feed: '🍽', buy: '📈', sell: '🕊', lend: '🏦', yield: '✨', hold: '🤚', ask: '🙋', system: '🔔' };

export default function Diary() {
  const pet = usePet();
  const entries = pet ? [...pet.diary].reverse() : [];
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(12px,env(safe-area-inset-top))] lg:min-h-0 lg:max-w-[1200px] lg:px-10 lg:pb-16 lg:pt-8">
      <div className="lg:mx-auto lg:w-full lg:max-w-[860px]">
      <h1 className="text-center text-[28px] font-bold lg:text-left lg:text-[36px]" style={{ fontFamily: 'var(--font-display)' }}>Diary</h1>
      <p className="text-center text-[13px] lg:text-left lg:text-[14px]" style={{ color: 'var(--muted)' }}>
        {pet ? `Every decision ${pet.name} made, in its own words.` : 'Adopt a Fledgling to start a diary.'}
      </p>
      {/* Desktop reads it as one ledger, an entry per row; the phone keeps a card each. */}
      <ul className="mt-5 grid gap-2 lg:mt-6 lg:gap-0 lg:overflow-hidden lg:rounded-[var(--radius-card)] lg:border lg:border-[var(--line)] lg:bg-[var(--surface)]">
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
