'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pet } from '@/components/Pet';
import { Ring } from '@/components/Ring';
import { Nav, SessionBadge } from '@/components/Nav';
import { ConnectPill, useWallet } from '@/components/Wallet';
import { Confetti } from '@/components/Confetti';
import { ENTRY_ICON, Report, Ask } from '@/components/Report';
import { Sparkline } from '@/components/Sparkline';
import { DuelCard, type Duel } from '@/components/Duel';
import { TelegramLink } from '@/components/Telegram';
import { petImage, type Mood } from '@/lib/pets';
import { computeMood, moodLine } from '@/lib/mood';
import { WIDE, WIDER, useMarketSession, useMedia, useNow, useSearch } from '@/lib/client';
import { runEngine } from '@/lib/engine';
import { useTickAll } from '@/lib/tickall';
import { pullPet, syncPet } from '@/lib/sync';
import { answerProposal, feedPet, feedingDay, heldQty, isPaper, markCelebrated, mergeEntries, noteRatio, pauseSchedule, petPet, pnl, readPet, savePet, setCurrentPet, stockOf, touchVisit, useFocusPet, usePet, usePets, waitingLine, type Entry } from '@/lib/store';
import { CADENCE_LABEL, bond as bondOf, canPet, isDue, milestone, stage } from '@/lib/care';
import type { Bar } from '@/lib/strategy';

type Price = { price: number | null; pct24h: number; source: string; ratio?: number | null };
type Fill = { perToken: number | null; spreadPct: number | null; vendor: string | null; error?: string };

export default function Home() {
  const router = useRouter();
  const pet = usePet();
  const { pets } = usePets();
  const hasStore = pets.length > 0;
  // The rest of the nest catches up too; the pet on screen catches up below, with its report.
  useTickAll(pets.filter((p) => p.uid !== pet?.uid));
  const now = useNow();
  const q = useSearch();
  const wide = useMedia(WIDE);
  const wider = useMedia(WIDER);
  // A link from the Telegram pet names which Fledgling it is about.
  const elsewhere = useFocusPet(q);
  const [price, setPrice] = useState<Price>({ price: null, pct24h: 0, source: 'none' });
  const [bars, setBars] = useState<Bar[]>([]);
  const [report, setReport] = useState<{ fresh: Entry[]; awayMs: number } | null>(null);
  const [duel, setDuel] = useState<Duel | null>(null);
  const remoteId = pet?.remoteId ?? null;
  const [holding, setHolding] = useState<{ key: string; qty: number } | null>(null);
  const { address, isConnected, onBsc } = useWallet();
  const [fill_, setFill] = useState<{ key: string; value: Fill } | null>(null);

  const species = pet?.species ?? 'nova';
  // The pet's own stock — any of ~450, not only its species' signature one. Routes take the address.
  const stock = pet ? stockOf(pet) : null;
  const stockId = stock?.address ?? species;
  // Hatching is celebrated; feeding is not. Confetti belongs to care milestones, never to money moving
  // (see lib/care for why).
  const celebrate = Boolean(q.get('hatched') || q.get('public'));
  const fed = Boolean(q.get('fed'));
  const [petLine, setPetLine] = useState<{ text: string; at: number } | null>(null);

  useEffect(() => { if (now && !pet) router.replace('/adopt'); }, [now, pet, router]);
  useEffect(() => { if (pet) touchVisit(pet); }, [pet?.lastVisitDay]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => { window.history.replaceState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); }, 1400);
    return () => clearTimeout(t);
  }, [celebrate]);
  // The traded leg only becomes honest once there is a taker to price against. Each answer is kept
  // with the wallet and stock it was for, and shown only while those still hold — so switching pets
  // or wallets never shows the last one's numbers, without resetting state inside the effect.
  const fillKey = isConnected && onBsc && address ? `${address}:${stockId}` : null;
  useEffect(() => {
    if (!fillKey) return;
    let alive = true;
    fetch(`/api/fill/${stockId}?wallet=${address}`)
      .then((r) => r.json()).then((f: Fill) => { if (alive) setFill({ key: fillKey, value: f }); }).catch(() => {});
    return () => { alive = false; };
  }, [fillKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fill = fill_ && fill_.key === fillKey ? fill_.value : null;

  // What the bound wallet actually holds of this pet's token — the check on the diary's own numbers.
  const holdingKey = pet?.wallet && stock ? `${pet.wallet}:${stock.address}` : null;
  useEffect(() => {
    if (!holdingKey || !pet?.wallet || !stock) return;
    let alive = true;
    fetch(`/api/holdings?wallet=${pet.wallet}&tokens=${stock.address}`)
      .then((r) => r.json())
      .then((h: { tokens?: Record<string, number> }) => {
        const v = h.tokens?.[stock.address.toLowerCase()];
        if (alive && typeof v === 'number') setHolding({ key: holdingKey, qty: v });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [holdingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const onChain = holding && holding.key === holdingKey ? holding.qty : null;


  // Price, history, and the catch-up tick all hang off one load.
  useEffect(() => {
    let alive = true;
    // Only a real price is kept: an error body is not a price, and treating it as one crashed this
    // screen the one time Binance could not be reached.
    fetch(`/api/price/${stockId}`).then((r) => (r.ok ? r.json() : null)).then((p: Price | null) => {
      if (!alive || !p || typeof p.pct24h !== 'number') return;
      setPrice(p);
      // A risen share ratio is a reinvested dividend: the pet grew without anyone buying anything.
      const cur = readPet();
      if (p.ratio && cur && stockOf(cur).address === stockId) noteRatio(cur, p.ratio);
    }).catch(() => {});
    fetch(`/api/history/${stockId}`).then((r) => r.json()).then(async (j: { bars: Bar[] }) => {
      if (!alive || !j.bars?.length) return;
      setBars(j.bars);
      let current = readPet();
      if (!current) return;
      const since = current.lastTickAt || current.adoptedAt;

      // The hourly worker keeps ticking with nobody watching, so the server's copy can be ahead of
      // this browser's. Adopt it first, then replay only what is genuinely left.
      const pulled = await pullPet(current);
      if (!alive) return;
      const overnight = pulled?.entries ?? [];
      if (pulled) { current = mergeEntries({ ...current, ...pulled.pet }, pulled.entries); savePet(current); }

      // ?rewind=48 pretends you were away that many hours, so the engine has a window to replay.
      // Dev and demo only — it moves the watermark, never invents prices.
      const rewind = Number(new URLSearchParams(window.location.search).get('rewind'));
      const seed = rewind > 0 ? { ...current, lastTickAt: Date.now() - rewind * 3600e3 } : current;
      const res = runEngine(seed, j.bars);
      savePet(res.pet);
      const fresh = [...overnight, ...res.fresh];
      if (fresh.length) setReport({ fresh, awayMs: res.to - since });
      void syncPet(res.pet, res.fresh); // only what happened here; the worker's lines are already stored
    }).catch(() => {});
    return () => { alive = false; };
  }, [stockId, pet?.uid]);

  // An open duel belongs on the screen you actually look at, not only on the Board.
  useEffect(() => {
    if (!remoteId) return;
    let alive = true;
    fetch('/api/duel').then((r) => r.json()).then((j: { duels: Duel[] }) => {
      if (!alive) return;
      setDuel(j.duels?.find((d) => !d.settledAt && (d.a === remoteId || d.b === remoteId)) ?? null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [remoteId]);

  const { session, night } = useMarketSession();

  const ticker = stock?.ticker ?? '';
  const lastFed = pet?.lastFed ?? now;
  const hunger = now ? Math.max(0, 1 - (now - lastFed) / (72 * 3600 * 1000)) : 1;
  const energy = session === 'regular' ? 0.95 : session === 'pre' || session === 'post' ? 0.7 : 0.4;
  const bond = bondOf(pet?.care, pet?.streak ?? 1, now);
  const grown = stage(pet?.care, pet?.schedule);
  // A milestone of care — a stage, a streak — celebrated once, then marked as done.
  const ms = pet && !celebrate ? milestone(pet.streak, grown, pet.care) : null;
  useEffect(() => {
    if (!ms || !pet?.uid) return;
    const t = setTimeout(() => markCelebrated(pet.uid!, ms.key), 4000);
    return () => clearTimeout(t);
  }, [ms?.key, pet?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cleared by its own timer (see onPet), so showing it needs no clock read during render.
  const justPetted = Boolean(petLine);
  const computed = useMemo(() => computeMood({ pct24h: price.pct24h, session, hunger }), [price.pct24h, session, hunger]);
  const mood: Mood = celebrate || ms ? 'ecstatic' : justPetted || fed ? 'happy' : ((q.get('mood') as Mood | null) ?? computed);
  const line = celebrate
    ? (q.get('hatched') ? 'Hi. I live here now.' : 'We rang the bell.')
    : ms ? ms.line
    : justPetted ? petLine!.text
    : fed ? 'Thanks. That hit the spot.'
    : moodLine(mood, price.pct24h, ticker);

  // The free daily action. Costs nothing, moves nothing, and is the one thing you can do for it every day.
  const onPet = () => {
    if (!pet) return;
    const next = petPet(pet);
    const lines = ['*leans in*', 'Again tomorrow?', 'Best part of my day.', 'Okay, okay. I like you.'];
    setPetLine({ text: next ? lines[(next.care?.pets ?? 0) % lines.length] : 'I felt that earlier. Still good.', at: Date.now() });
    setTimeout(() => setPetLine(null), 4000);
    if (next) void syncPet(next);
  };

  const qty = pet ? heldQty(pet) : 0;
  const perf = pet && price.price ? pnl(pet, price.price) : null;

  if (!hasStore && !pet) return <main className="min-h-dvh" />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(12px,env(safe-area-inset-top))] lg:min-h-0 lg:max-w-[1200px] lg:px-10 lg:pb-16 lg:pt-8">
      {/* Desktop has the clock and the wallet in the top bar. */}
      <div className="flex items-center justify-between gap-2 lg:hidden">
        <SessionBadge />
        <div className="shrink-0"><ConnectPill /></div>
      </div>
      {/* The nest: every pet on this device, and a way to hatch another. */}
      {pets.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Your Fledglings">
          {pets.map((p) => {
            const on = p.uid === pet?.uid;
            return (
              <button key={p.uid ?? p.adoptedAt} role="tab" aria-selected={on}
                onClick={() => { if (p.uid && !on) { setReport(null); setCurrentPet(p.uid); } }}
                className="flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12px] font-semibold"
                style={{ borderColor: on ? 'var(--accent)' : 'var(--line)', background: on ? 'color-mix(in srgb, var(--accent) 18%, var(--surface))' : 'var(--surface)' }}>
                <img src={petImage(p.species, 'hero')} alt="" className="h-6 w-6 rounded-full object-cover object-top" style={{ background: 'var(--canvas)' }} />
                {p.name}<span className="num" style={{ color: 'var(--muted)' }}>{stockOf(p).ticker}</span>
              </button>
            );
          })}
          <Link href="/adopt" aria-label="Hatch another Fledgling" className="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[18px] font-bold"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>+</Link>
        </div>
      )}
      <p className="mt-1 text-right text-[13px] font-semibold lg:hidden" style={{ color: 'var(--muted)' }}>{pet?.name} · {ticker}{stock && stock.company !== ticker ? ` · ${stock.company}` : ''} · day {pet?.streak ?? 1}</p>
      {pet?.litter && (
        <p className="text-right text-[12px] lg:hidden">
          <Link href={`/litter?key=${pet.litter.key}`} className="underline" style={{ color: 'var(--muted)' }}>one of the {pet.litter.name} litter ›</Link>
        </p>
      )}
      {elsewhere && (
        <p className="card mt-2 px-3 py-2 text-[12.5px]" style={{ color: 'var(--muted)' }}>
          That link is for a Fledgling that lives in another browser — this one only knows the pets hatched here.
        </p>
      )}
      {fill?.spreadPct != null && (
        <p className="mt-0.5 text-right text-[11.5px] num lg:hidden" style={{ color: 'var(--muted)' }}>
          {ticker} on-chain{' '}
          <b style={{ color: fill.spreadPct >= 0 ? 'var(--up)' : 'var(--down)' }}>
            {fill.spreadPct >= 0 ? '+' : ''}{fill.spreadPct.toFixed(3)}%
          </b>{' '}
          vs reference{fill.vendor ? ` · ${fill.vendor}` : ''}
        </p>
      )}

      {/* Desktop: the pet gets a stage of its own on the left, and the numbers sit beside it. */}
      <div className="lg:mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] xl:gap-10">
      <section className="lg:sticky lg:top-8 lg:rounded-[var(--radius-card)] lg:border lg:border-[var(--line)] lg:bg-[var(--surface)] lg:flex lg:min-h-[620px] lg:flex-col lg:items-center lg:justify-center lg:py-10">
      <div className="relative mt-5 flex flex-col items-center lg:mt-0">
        <div className="card relative mb-2 max-w-[264px] px-4 py-2.5 text-center text-[15px] font-semibold lg:max-w-[360px] lg:px-5 lg:py-3 lg:text-[18px]" style={{ fontFamily: 'var(--font-display)' }}>
          {line}
          <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45" style={{ background: 'var(--surface)', borderRight: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }} aria-hidden />
        </div>
        <button type="button" onClick={onPet} className="relative" aria-label={pet && canPet(pet.care) ? `Pet ${pet.name}` : `${pet?.name} was petted recently`}>
          {(celebrate || ms) && <Confetti />}
          {/* It grows with care: a Hatchling is small, a Legend is not. Never with money. */}
          <Pet id={species} mood={mood} night={night} size={Math.round((wider ? 440 : 300) * grown.scale)} />
        </button>
        <p className="-mt-1 text-[11.5px] num lg:text-[13px]" style={{ color: 'var(--muted)' }}>
          {grown.name}{grown.next !== null ? ` · ${grown.points}/${grown.next} to grow` : ''}
          {pet && canPet(pet.care) ? ` · ${wide ? 'click' : 'tap'} to pet` : ''}
        </p>
      </div>
      </section>

      <section className="lg:flex lg:flex-col">
      {/* Desktop: the name as a heading, where the phone has a caption above the pet. */}
      <div className="mb-4 hidden lg:block">
        <h1 className="text-[36px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{pet?.name}</h1>
        <p className="text-[14px] font-semibold" style={{ color: 'var(--muted)' }}>
          <span className="num" style={{ color: 'var(--ink)' }}>{ticker}</span>{stock && stock.company !== ticker ? ` · ${stock.company}` : ''} · day {pet?.streak ?? 1}
          {pet?.litter && <> · <Link href={`/litter?key=${pet.litter.key}`} className="underline">{pet.litter.name} litter</Link></>}
        </p>
      </div>

      {/* Portfolio — the number that moves without you. */}
      {pet && (
        <div className="card mt-1 flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>Portfolio {isPaper(pet) && <span className="num">· paper</span>}</p>
            <p className="text-[24px] font-bold num leading-tight">{perf ? `$${perf.value.toFixed(2)}` : '—'}</p>
            {perf && perf.basis > 0 && (
              <p className="text-[12.5px] num" style={{ color: perf.abs >= 0 ? 'var(--up)' : 'var(--down)' }}>
                {perf.abs >= 0 ? '+' : ''}${perf.abs.toFixed(2)} ({perf.abs >= 0 ? '+' : ''}{perf.pct.toFixed(2)}%)
              </p>
            )}
          </div>
          <Sparkline bars={bars} lots={pet.lots} yieldQty={pet.yieldQty} />
        </div>
      )}

      {pet && <Ask pet={pet} price={price.price} onAnswer={(yes) => {
        // A live pet's yes is a signature, and signatures happen on the feed screen.
        if (yes && !isPaper(pet)) { router.push('/feed?proposal=1'); return; }
        if (price.price) void syncPet(answerProposal(pet, yes, price.price));
      }} />}

      {duel && (
        <Link href="/duels" className="mt-2 block">
          <DuelCard duel={duel} mine={remoteId} />
        </Link>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Ring label="Hunger" value={hunger} icon="🍽" />
        <Ring label="Energy" value={energy} icon="⚡" />
        <Ring label="Bond" value={bond} icon="♥" />
      </div>

      {/* A standing feed. Due: sign it (live) or feed it (paper), or skip it. Not due: when, and a pause. */}
      {pet?.schedule && (isDue(pet.schedule, now) ? (
        <div className="card mt-3 px-4 py-3" style={{ outline: '3px solid var(--accent)' }}>
          <p className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            It&rsquo;s feeding day — ${pet.schedule.usd} {CADENCE_LABEL[pet.schedule.every]}.
          </p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--muted)' }}>
            Kept {pet.schedule.kept} so far{pet.schedule.missed ? `, missed ${pet.schedule.missed}` : ''}. Regular beats clever.
          </p>
          <div className="mt-3 flex gap-2">
            {isPaper(pet) ? (
              <button onClick={() => { const next = feedingDay(feedPet(pet, pet.schedule!.usd), 'kept'); void syncPet(next); }}
                className="pill flex-1 text-[15px]">Feed ${pet.schedule.usd}</button>
            ) : (
              <Link href="/feed?due=1" className="pill grid flex-1 place-items-center text-[15px]">Sign it</Link>
            )}
            <button onClick={() => void syncPet(feedingDay(pet, 'skipped'))} className="btn-2 flex-1 py-3 text-[15px]">Skip this one</button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>
          {pet.schedule.paused ? 'Feeding days paused' : <>Feeds <span className="num" style={{ color: 'var(--ink)' }}>${pet.schedule.usd}</span> {CADENCE_LABEL[pet.schedule.every]} · next {new Date(pet.schedule.nextAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</>}
          {' · '}
          <button className="underline" onClick={() => void syncPet(pauseSchedule(pet, !pet.schedule!.paused))}>{pet.schedule.paused ? 'resume' : 'pause'}</button>
        </p>
      ))}

      {/* Feeding and letting go: a pet you can only feed is a pet you can only lose money into. */}
      <div className={`mt-5 grid gap-2 ${qty > 0 ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'}`}>
        <Link href="/feed" className="pill grid place-items-center text-[18px] active:scale-[0.98]" style={{ transition: 'transform .1s' }}>Feed</Link>
        {qty > 0 && (
          <Link href="/release" className="btn-2 grid place-items-center px-7 text-[15px] active:scale-[0.98]">Release</Link>
        )}
      </div>
      <p className="mt-3 text-center text-[13px]" style={{ color: 'var(--muted)' }}>
        holds <span className="num" style={{ color: 'var(--ink)' }}>{qty.toFixed(4)} {ticker}</span>
        {qty > 0 && price.ratio && price.ratio > 1.0005 && (
          <span className="num" title="Dividends are reinvested into the token, so one token stands for more than one share"> (≈{(qty * price.ratio).toFixed(4)} shares)</span>
        )}
        {onChain !== null && (
          <> · <span className="num" title="What the bound wallet holds of this token, read from Binance's Wallet API">{onChain.toFixed(4)} in wallet</span></>
        )}
        {pet && (pet.realized ?? 0) !== 0 && (
          <> · <span className="num" style={{ color: (pet.realized ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>
            {(pet.realized ?? 0) >= 0 ? '+' : '−'}${Math.abs(pet.realized ?? 0).toFixed(2)} realized
          </span></>
        )}
        {pet && pet.lentQty > 0 && <> · <span className="num">{pet.lentQty.toFixed(3)} lent</span></>}
        {pet && pet.cash > 0 && <> · <span className="num">${pet.cash.toFixed(0)} idle</span></>}
      </p>
      {pet && pet.cash >= 1 && !pet.proposal && (
        <p className="mt-1 text-center text-[12px]" style={{ color: 'var(--muted)' }}>{waitingLine[pet.personality]}</p>
      )}
      {pet && <TelegramLink pet={pet} />}

      {/* Desktop has room for what the phone keeps a tap away: the stock, and what the pet did lately. */}
      <div className="card mt-6 hidden px-5 py-4 lg:block">
        <p className="text-[11.5px] font-medium uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>Market</p>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <p className="num text-[20px] font-semibold">{price.price ? `$${price.price.toFixed(2)}` : '—'} <span className="text-[13px] font-medium" style={{ color: 'var(--muted)' }}>{stock?.tokenSymbol}</span></p>
          <p className="num text-[13px] font-medium" style={{ color: price.pct24h >= 0 ? 'var(--up)' : 'var(--down)' }}>{price.pct24h >= 0 ? '+' : ''}{price.pct24h.toFixed(2)}% 24h</p>
        </div>
        {fill?.spreadPct != null && (
          <p className="mt-1 text-[12.5px] num" style={{ color: 'var(--muted)' }}>
            On-chain <b style={{ color: fill.spreadPct >= 0 ? 'var(--up)' : 'var(--down)' }}>{fill.spreadPct >= 0 ? '+' : ''}{fill.spreadPct.toFixed(3)}%</b> vs reference{fill.vendor ? ` · ${fill.vendor}` : ''}
          </p>
        )}
      </div>
      {pet && pet.diary.length > 0 && (
        <div className="card mt-3 hidden px-5 py-4 lg:block">
          <div className="flex items-center justify-between">
            <p className="text-[11.5px] font-medium uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>Recent</p>
            <Link href="/diary" className="text-[12.5px] font-medium" style={{ color: 'var(--accent-ink)' }}>Diary ›</Link>
          </div>
          <ul className="mt-2.5 grid gap-3">
            {[...pet.diary].sort((a, b) => b.ts - a.ts).slice(0, 4).map((e, i) => (
              <li key={`${e.ts}-${i}`} className="flex gap-3 text-[13.5px]">
                <span aria-hidden className="w-5 shrink-0 text-center">{ENTRY_ICON[e.kind] ?? '•'}</span>
                <div className="min-w-0">
                  <p className="truncate">{e.text}</p>
                  <p className="num text-[11px]" style={{ color: 'var(--muted)' }}>{new Date(e.ts).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      </section>
      </div>

      {report && pet && <Report pet={pet} fresh={report.fresh} awayMs={report.awayMs} price={price.price} onClose={() => setReport(null)} />}
      <Nav />
    </main>
  );
}
