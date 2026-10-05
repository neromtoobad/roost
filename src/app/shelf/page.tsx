'use client';
import { useState } from 'react';
import { Nav } from '@/components/Nav';
import { MOODS, SPECIES, petImage, type Mood, type Species } from '@/lib/pets';

const ORDER: Species['id'][] = ['nova', 'volt', 'pip', 'booster', 'nimbus', 'lurk'];

// The collection. Every species, every mood, the wrong detail called out — the shelf you'd show a friend.
export default function Shelf() {
  const [open, setOpen] = useState<Species['id']>('nova');
  const [mood, setMood] = useState<Mood>('chill');
  const sp = SPECIES[open];
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(12px,env(safe-area-inset-top))] lg:min-h-0 lg:max-w-[1200px] lg:px-10 lg:pb-16 lg:pt-8">
      <h1 className="text-center text-[28px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>Shelf</h1>
      <p className="text-center text-[13px]" style={{ color: 'var(--muted)' }}>Six Fledglings. One wrong detail each.</p>

      <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="card relative mt-4 flex flex-col items-center px-4 pb-4 pt-3 lg:mt-0 lg:py-8">
        <div className="grid h-56 w-56 place-items-center lg:h-64 lg:w-64 xl:h-80 xl:w-80">
          <img src={petImage(open, mood)} alt={`${sp.name} looking ${mood}`} className="h-56 w-56 object-contain lg:h-64 lg:w-64 xl:h-80 xl:w-80" />
        </div>
        <p className="text-[22px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>{sp.name}</p>
        <p className="text-[13px] num" style={{ color: 'var(--muted)' }}>{sp.species} · {sp.ticker}</p>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted)' }}>wrong detail: <span style={{ color: 'var(--ink)' }}>{sp.wrongDetail}</span></p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {MOODS.map((m) => (
            <button key={m} onClick={() => setMood(m)} className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize"
              style={mood === m ? { background: 'var(--accent)', color: 'var(--on-accent)' } : { background: 'var(--canvas)', color: 'var(--muted)' }}>{m === 'nightowl' ? 'night owl' : m}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 lg:mt-0 lg:gap-3">
        {ORDER.map((id) => (
          <button key={id} onClick={() => { setOpen(id); setMood('chill'); }} className="card flex flex-col items-center gap-1 px-2 pb-2 pt-3"
            style={{ outline: open === id ? '3px solid var(--accent)' : '3px solid transparent' }}>
            <img src={petImage(id, 'hero')} alt="" className="h-20 w-20 object-contain" draggable={false} />
            <span className="text-[13px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>{SPECIES[id].name}</span>
            <span className="-mt-1 text-[11px] num" style={{ color: 'var(--muted)' }}>{SPECIES[id].ticker}</span>
          </button>
        ))}
      </div>
      </div>
      <Nav />
    </main>
  );
}
