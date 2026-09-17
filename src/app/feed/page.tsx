'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Confetti } from '@/components/Confetti';
import { SPECIES, petImage } from '@/lib/pets';
import { PERSONALITIES, feedPetRemote, usePet } from '@/lib/store';
import { syncPet } from '@/lib/sync';
import { nyseSession } from '@/lib/session';

const AMOUNTS = [5, 10, 25, 50];
type Price = { price: number | null; pct24h: number; source: string };

/** What the pet will actually do with the money — its strategy, not a generic "buy now". */
function plan(personality: string, open: boolean, name: string): string {
  if (personality === 'degen') return `${name} will hunt a 2% dip, at any hour.`;
  if (personality === 'boomer') return open ? `${name} will deploy it now, keeping 20% in reserve.` : `${name} will wait for regular hours. Not before.`;
  if (personality === 'quant') return `${name} will deploy it at the next weekly rebalance.`;
  return open ? `${name} will deploy it now and lend it out.` : `${name} will deploy it at the open and lend it out.`;
}

export default function FeedPage() {
  const router = useRouter();
  const pet = usePet();
  const [usd, setUsd] = useState(5);
  const [price, setPrice] = useState<Price | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!pet) return;
    let alive = true;
    fetch(`/api/price/${pet.species}`).then((r) => r.json()).then((p: Price) => { if (alive) setPrice(p); }).catch(() => {});
    return () => { alive = false; };
  }, [pet?.species]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pet) return null;
  const sp = SPECIES[pet.species];
  const open = nyseSession() === 'regular';
  const shares = price?.price ? usd / price.price : null;

  const confirm = () => {
    void feedPetRemote(pet, usd, open).then((p) => syncPet(p));
    setDone(true);
    setTimeout(() => router.push('/?fed=1'), 1100);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-10 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="grid grid-cols-[40px_1fr_40px] items-center">
        <button onClick={() => router.back()} aria-label="Back" className="text-[22px]">‹</button>
        <span className="justify-self-center rounded-full border px-3 py-1.5 text-[12px] num" style={{ borderColor: 'var(--ink)' }}>Feed {pet.name}</span>
      </div>

      <div className="relative mx-auto mt-4 grid h-56 w-56 place-items-center">
        {done && <Confetti />}
        <motion.img src={petImage(pet.species, done ? 'ecstatic' : 'hungry')} alt="" className="h-52 w-52 object-contain"
          animate={done ? { scale: [1, 1.15, 1], rotate: [0, -4, 4, 0] } : {}} transition={{ duration: 0.5 }} />
      </div>

      <h1 className="mt-1 text-center text-[24px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>How much do you want to feed {pet.name}?</h1>

      <div className="mt-5 grid grid-cols-4 gap-2">
        {AMOUNTS.map((a) => (
          <button key={a} onClick={() => setUsd(a)} className="rounded-full py-3 text-[16px] font-bold num"
            style={usd === a ? { background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: 'var(--glow)' } : { background: 'var(--surface)', border: '1px solid var(--line)' }}>${a}</button>
        ))}
      </div>

      <div className="card mt-4 flex items-start gap-3 px-4 py-3 text-[14px]">
        <span aria-hidden>{PERSONALITIES[pet.personality].icon}</span>
        <span>
          {plan(pet.personality, open, pet.name)}
          {shares && <> About <b className="num">{shares.toFixed(4)} {sp.ticker}</b> at today&rsquo;s price.</>}
        </span>
      </div>

      <button onClick={confirm} disabled={done} className="pill mt-4 w-full text-[18px]">{done ? 'Fed!' : 'Confirm'}</button>
      <p className="mt-3 text-center text-[12px]" style={{ color: 'var(--muted)' }}>Your Fledgling never holds more than it was fed.</p>
    </main>
  );
}
