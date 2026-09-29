'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { Confetti } from '@/components/Confetti';
import { ConnectPill, useWallet } from '@/components/Wallet';
import { petImage } from '@/lib/pets';
import { allocate, litterById } from '@/lib/litters';
import { PERSONALITIES, feedPet, heldQty, isPaper, litterOf, readPetByUid, recordBuy, setCurrentPet, stockOf, usePets, type PetState } from '@/lib/store';
import { syncPet } from '@/lib/sync';
import { useSearch } from '@/lib/client';
import { bscscan, useBuy, type BuyStep } from '@/lib/trade';

// A litter as one thing: what it holds together, how far each pup sits from an equal share, and one
// feed for all of them. The feed is a rebalance with new money (lib/litters): the pups furthest
// behind eat first, and nobody is sold to make room.
//
// Live, that is one real buy per pup that eats, each signed in the owner's wallet in turn — exact
// approval, simulated first, recorded from the receipt, the same as feeding one pet. A pup whose buy
// is refused before anything is sent (a bad price, a closed desk) is passed over and the rest go on;
// a cancel in the wallet, or anything that reached the chain, stops the queue there.

const AMOUNTS = { paper: [20, 50, 100, 200], live: [25, 50, 100, 200] } as const;
/** The smallest buy worth placing for one pup: Ondo refuses $5 and under. */
const MIN_LIVE = 6;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const busy = (s: BuyStep) => ['checking', 'approve', 'approving', 'buy', 'buying'].includes(s.at);

function stepLine(step: BuyStep): string {
  switch (step.at) {
    case 'checking': return 'Simulating it against your wallet…';
    case 'approve': return 'Approve exactly this much USDT in your wallet.';
    case 'approving': return 'Approval confirming on BSC…';
    case 'buy': return `Confirm the buy. ${step.preflight.summary}`;
    case 'buying': return 'Sent. Waiting for BSC…';
    case 'done': return 'Ate.';
    case 'stopped': return step.reason;
    default: return '';
  }
}

type Outcome = { uid: string; name: string; usd: number; ok: boolean; note: string; hash?: string };

export default function LitterPage() {
  const router = useRouter();
  const q = useSearch();
  const key = q.get('key') ?? '';
  const { pets } = usePets();
  const pups = litterOf(pets, key);
  const first = pups[0];
  const meta = first?.litter ? litterById(first.litter.id) : undefined;
  const live = first ? !isPaper(first) : false;
  const bound = first?.wallet ?? '';
  const { address, isConnected } = useWallet();
  const matches = Boolean(address && bound && address.toLowerCase() === bound.toLowerCase());
  const { step, run, reset, lastStop } = useBuy();

  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const tokens = [...new Set(pups.map((p) => stockOf(p).address.toLowerCase()))].join(',');
  useEffect(() => {
    if (!tokens) return;
    let alive = true;
    fetch(`/api/prices?tokens=${tokens}`).then((r) => (r.ok ? r.json() : null))
      .then((j: { prices?: Record<string, number | null> } | null) => { if (alive && j?.prices) setPrices(j.prices); }).catch(() => {});
    return () => { alive = false; };
  }, [tokens]);

  const [usd, setUsd] = useState<number>(live ? AMOUNTS.live[1] : AMOUNTS.paper[1]);
  const [queue, setQueue] = useState<{ at: number; of: number; name: string } | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  if (!pups.length) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center px-4 pb-24">
        <p className="text-[14px]" style={{ color: 'var(--muted)' }}>No litter here.</p>
        <Link href="/adopt" className="pill mt-4 px-6 text-[16px]">Hatch one</Link>
        <Nav />
      </main>
    );
  }

  // In the bowl: what it holds at the print, plus cash fed and not yet spent — so a paper pup that
  // was just fed is not fed again before it has eaten.
  const worth = (p: PetState) => {
    const px = prices[stockOf(p).address.toLowerCase()];
    return (px ? heldQty(p) * px : 0) + p.cash;
  };
  const values = pups.map(worth);
  const total = values.reduce((s, v) => s + v, 0);
  const priced = pups.every((p) => prices[stockOf(p).address.toLowerCase()] != null || heldQty(p) === 0);
  const shares = priced ? allocate(values, usd, live ? MIN_LIVE : 0) : pups.map(() => 0);
  const eating = pups.map((p, i) => ({ p, usd: shares[i] })).filter((x) => x.usd > 0);
  const waiting = pups.length - eating.length;
  const running = queue !== null;

  const feedPaper = () => {
    const out: Outcome[] = [];
    for (const { p, usd: a } of eating) {
      const next = feedPet(readPetByUid(p.uid!) ?? p, a, `Fed $${a.toFixed(2)} with the ${p.litter?.name ?? 'litter'} — ${a === Math.max(...shares) ? 'I was the hungriest' : 'topped up to the rest'}.`);
      void syncPet(next);
      out.push({ uid: p.uid!, name: p.name, usd: a, ok: true, note: 'fed (paper)' });
    }
    setOutcomes(out);
  };

  const feedLive = async () => {
    const out: Outcome[] = [];
    setOutcomes(null);
    for (let i = 0; i < eating.length; i++) {
      const { p, usd: a } = eating[i];
      setQueue({ at: i + 1, of: eating.length, name: p.name });
      const b = await run({ species: p.species, stock: stockOf(p) }, a, bound);
      if (b) {
        const current = readPetByUid(p.uid!) ?? p;
        const { pet: bought, fresh } = recordBuy(current, {
          hash: b.hash, qty: b.qty, spent: b.usdt, fromCash: false,
          reason: `Ate with the ${p.litter?.name ?? 'litter'}. ${b.qty.toFixed(4)} ${stockOf(p).ticker}, on-chain, signed by you.`,
        });
        void syncPet(bought, fresh);
        out.push({ uid: p.uid!, name: p.name, usd: b.usdt, ok: true, note: `${b.qty.toFixed(4)} ${stockOf(p).tokenSymbol}`, hash: b.hash });
        setOutcomes([...out]);
        continue;
      }
      const why = lastStop();
      out.push({ uid: p.uid!, name: p.name, usd: a, ok: false, note: why?.reason ?? 'stopped', hash: why?.hash });
      setOutcomes([...out]);
      // Refused before anything was sent: pass this pup over. A cancel, or anything on-chain: stop.
      if (why?.hash || /cancelled/i.test(why?.reason ?? '')) break;
    }
    setQueue(null);
    reset();
  };

  const open = (p: PetState) => { if (p.uid) setCurrentPet(p.uid); router.push('/'); };
  const hatched = Boolean(q.get('hatched'));

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(12px,env(safe-area-inset-top))] lg:max-w-[1120px] lg:px-10 lg:pb-12 lg:pt-8">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => router.push('/nest')} aria-label="Back to the nest" className="text-[22px]">‹</button>
        <ConnectPill />
      </div>
      <div className="relative">
        {hatched && <Confetti count={30} />}
        <h1 className="mt-2 text-center text-[28px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          {meta?.icon} {first.litter?.name}
        </h1>
      </div>
      <p className="text-center text-[13px]" style={{ color: 'var(--muted)' }}>
        {pups.length} pups · {live ? `live, bound to ${short(bound)}` : 'paper'} · {PERSONALITIES[first.personality].name}
      </p>

      <div className="lg:mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-10">
      <div>
      <div className="card mt-4 px-4 py-3">
        <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>Together</p>
        <p className="num text-[24px] font-bold leading-tight">${total.toFixed(2)}</p>
        <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
          The line on each bar is an equal share. Feeding tops up whoever sits furthest under it.
        </p>
      </div>

      <ul className="mt-3 grid gap-1.5">
        {pups.map((p, i) => {
          const w = total > 0 ? values[i] / total : 0;
          const gets = shares[i];
          return (
            <li key={p.uid}>
              <button onClick={() => open(p)} className="card flex w-full items-center gap-3 px-3 py-2 text-left">
                <img src={petImage(p.species, 'hero')} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover object-top" style={{ background: 'var(--canvas)' }} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-2 text-[14px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                    <span className="truncate">{p.name} <span className="num text-[11.5px] font-semibold" style={{ color: 'var(--muted)' }}>{stockOf(p).tokenSymbol}</span></span>
                    <span className="num shrink-0 text-[13px]">${values[i].toFixed(2)}</span>
                  </p>
                  <div className="relative mt-1 h-2 rounded-full" style={{ background: 'var(--line)' }} aria-hidden>
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(100, w * 100 * (pups.length / 2))}%`, background: 'var(--accent)' }} />
                    <div className="absolute top-[-2px] h-3 w-[2px]" style={{ left: '50%', background: 'var(--ink)' }} />
                  </div>
                  <p className="mt-0.5 text-[11px] num" style={{ color: 'var(--muted)' }}>
                    {(w * 100).toFixed(1)}% of the litter{gets > 0 ? ` · eats $${gets.toFixed(2)} next` : total > 0 || waiting ? ' · waits this time' : ''}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      </div>

      <div className="lg:sticky lg:top-8">
      <p className="mt-5 text-[12px] font-semibold uppercase tracking-wide lg:mt-4" style={{ color: 'var(--muted)' }}>Feed the litter</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {(live ? AMOUNTS.live : AMOUNTS.paper).map((a) => (
          <button key={a} onClick={() => { setUsd(a); setOutcomes(null); }} disabled={running}
            className="rounded-full py-3 text-[16px] font-bold num"
            style={usd === a ? { background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: 'var(--glow)' } : { background: 'var(--surface)', border: '1px solid var(--line)' }}>${a}</button>
        ))}
      </div>
      <p className="card mt-3 px-4 py-3 text-[13.5px] leading-snug">
        {!priced ? 'Pricing the litter…'
          : !eating.length ? `$${usd} is too little to split — each live buy has to be over $${MIN_LIVE - 1}.`
          : <>
              {eating.map(({ p, usd: a }) => `${p.name} $${a.toFixed(2)}`).join(' · ')}.
              {waiting > 0 && <> {waiting} {waiting === 1 ? 'pup waits' : 'pups wait'} {live ? `— a share under $${MIN_LIVE} is not worth a trade, so the fullest wait first` : 'this time — they are already ahead'}.</>}
              {live && <> That is {eating.length} buy{eating.length === 1 ? '' : 's'}, each signed in your wallet.</>}
            </>}
      </p>

      {queue && (
        <div className="card mt-3 px-4 py-3 text-[13.5px]">
          <p className="font-semibold">{queue.at} of {queue.of} · {queue.name}</p>
          <p className="mt-0.5 leading-snug" style={{ color: step.at === 'stopped' ? 'var(--down)' : 'var(--muted)' }}>{stepLine(step)}</p>
        </div>
      )}

      {outcomes && (
        <ul className="card mt-3 grid gap-1 px-4 py-3 text-[12.5px]">
          {outcomes.map((o) => (
            <li key={o.uid} style={{ color: o.ok ? 'var(--ink)' : 'var(--down)' }}>
              {o.ok ? '✓' : '✗'} <b>{o.name}</b> ${o.usd.toFixed(2)} — {o.note}
              {o.hash && <> · <a href={bscscan(o.hash)} target="_blank" rel="noreferrer" className="num underline" style={{ color: 'var(--accent)' }}>BscScan ↗</a></>}
            </li>
          ))}
        </ul>
      )}

      {!live && (
        <button onClick={feedPaper} disabled={!eating.length || Boolean(outcomes)} className="pill mt-4 w-full text-[18px] disabled:opacity-40">
          {outcomes ? 'Fed' : `Feed $${usd} (paper)`}
        </button>
      )}
      {live && !isConnected && (
        <div className="card mt-4 flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
          <span>Connect the wallet this litter is bound to, <span className="num">{short(bound)}</span>.</span>
          <ConnectPill />
        </div>
      )}
      {live && isConnected && !matches && (
        <p className="card mt-4 px-4 py-3 text-[13px]" style={{ color: 'var(--down)' }}>
          This wallet is <span className="num">{address ? short(address) : '—'}</span>. The litter is bound to <span className="num">{short(bound)}</span> — switch accounts in your wallet.
        </p>
      )}
      {live && matches && (
        <button onClick={() => void feedLive()} disabled={running || !eating.length || busy(step)} className="pill mt-4 w-full text-[18px] disabled:opacity-40">
          {running ? 'Feeding…' : outcomes ? 'Feed again' : `Feed $${usd} · ${eating.length} buy${eating.length === 1 ? '' : 's'}`}
        </button>
      )}
      <p className="mt-3 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
        {live
          ? 'Roost never holds your keys. Each buy is simulated first and refused over 3% above its reference.'
          : 'Paper: nothing real moves. Each pup deploys what it is fed by its personality.'}
      </p>
      </div>
      </div>
      <Nav />
    </main>
  );
}
