'use client';
import { Nav } from '@/components/Nav';
import { TxLink } from '@/components/Report';
import { petImage } from '@/lib/pets';
import { usePet, type EntryKind } from '@/lib/store';

const ICON: Record<EntryKind, string> = { feed: '🍽', buy: '📈', lend: '🏦', yield: '✨', hold: '🤚', ask: '🙋', system: '🔔' };

export default function Diary() {
  const pet = usePet();
  const entries = pet ? [...pet.diary].reverse() : [];
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(12px,env(safe-area-inset-top))]">
      <h1 className="text-center text-[28px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>Diary</h1>
      <p className="text-center text-[13px]" style={{ color: 'var(--muted)' }}>
        {pet ? `Every decision ${pet.name} made, in its own words.` : 'Adopt a Fledgling to start a diary.'}
      </p>
      <ul className="mt-5 grid gap-2">
        {entries.map((e, i) => (
          <li key={`${e.ts}-${i}`} className="card flex items-start gap-3 px-3 py-3">
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
      <Nav />
    </main>
  );
}
