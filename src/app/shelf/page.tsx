'use client';
import { useState } from 'react';
import { Nav } from '@/components/Nav';
import { Habitat } from '@/components/Habitat';
import { StockLogo } from '@/components/StockLogo';
import { HUE } from '@/lib/look';
import { MOODS, SPECIES, petImage, type Mood, type Species } from '@/lib/pets';

const ORDER: Species['id'][] = ['nova', 'volt', 'pip', 'booster', 'nimbus', 'lurk'];

// The collection. Every species, every mood, the wrong detail called out — the shelf you'd show a friend.
export default function Shelf() {
  const [open, setOpen] = useState<Species['id']>('nova');
  const [mood, setMood] = useState<Mood>('chill');
  const sp = SPECIES[open];
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(12px,env(safe-area-inset-top))] lg:h-full lg:min-h-0 lg:max-w-[1200px] lg:px-10 lg:pb-6 lg:pt-6">
      <h1 className="text-center text-[32px] font-extrabold tracking-[-0.03em] lg:text-[38px]" style={{ fontFamily: 'var(--font-display)' }}>The <span className="text-gold">Fledglings</span></h1>
      <p className="text-center text-[13px]" style={{ color: 'var(--muted)' }}>Six Fledglings. One wrong detail each.</p>

      <div className="lg:mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <Habitat id={open} mood={mood} sizes={[200, 220, 290]} className="mt-4 px-4 pb-4 pt-4 lg:mt-0 lg:py-6">
        <p className="relative text-[26px] font-extrabold tracking-[-0.02em]" style={{ fontFamily: 'var(--font-display)' }}>{sp.name}</p>
        <p className="relative flex items-center gap-1.5 text-[13px] num" style={{ color: 'var(--muted)' }}>{sp.species} · <StockLogo address={sp.address} ticker={sp.ticker} size={18} />{sp.ticker}</p>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted)' }}>wrong detail: <span style={{ color: 'var(--ink)' }}>{sp.wrongDetail}</span></p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {MOODS.map((m) => (
            <button key={m} onClick={() => setMood(m)} className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize"
              style={mood === m ? { background: 'var(--accent)', color: 'var(--on-accent)' } : { background: 'color-mix(in srgb, var(--surface) 70%, transparent)', color: 'var(--muted)' }}>{m === 'nightowl' ? 'night owl' : m}</button>
          ))}
        </div>
      </Habitat>

      <div className="mt-4 grid grid-cols-3 gap-2 lg:mt-0 lg:gap-3">
        {ORDER.map((id) => (
          <button key={id} onClick={() => { setOpen(id); setMood('chill'); }} className="card flex flex-col items-center gap-1 px-2 pb-2 pt-3 transition-transform hover:-translate-y-0.5"
            style={{ outline: open === id ? `3px solid ${HUE[id].main}` : '3px solid transparent', background: `radial-gradient(80% 70% at 50% 40%, color-mix(in srgb, ${HUE[id].main} 26%, transparent), transparent 75%) padding-box, linear-gradient(180deg, var(--card-top), var(--card-bot)) padding-box, var(--card-edge) border-box` }}>
            <img src={petImage(id, 'hero')} alt="" className="h-20 w-20 object-contain" draggable={false} />
            <span className="text-[13px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>{SPECIES[id].name}</span>
            <span className="-mt-1 flex items-center gap-1 text-[11px] num" style={{ color: 'var(--muted)' }}><StockLogo address={SPECIES[id].address} ticker={SPECIES[id].ticker} size={14} />{SPECIES[id].ticker}</span>
          </button>
        ))}
      </div>
      </div>
      <Nav />
    </main>
  );
}
