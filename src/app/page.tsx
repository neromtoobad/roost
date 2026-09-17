'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pet } from '@/components/Pet';
import { Ring } from '@/components/Ring';
import { Nav } from '@/components/Nav';
import { Confetti } from '@/components/Confetti';
import { Report, Ask } from '@/components/Report';
import { Sparkline } from '@/components/Sparkline';
import { DuelCard, type Duel } from '@/components/Duel';
import { SPECIES, type Mood } from '@/lib/pets';
import { computeMood, moodLine } from '@/lib/mood';
import { isNight, nyseSession, sessionLabel } from '@/lib/session';
import { useLocal, useNow, useSearch } from '@/lib/client';
import { runEngine } from '@/lib/engine';
import { pullPet, syncPet } from '@/lib/sync';
import { answerProposal, heldQty, isPaper, mergeEntries, pnl, readPet, savePet, touchVisit, usePet, waitingLine, type Entry } from '@/lib/store';
import type { Bar } from '@/lib/strategy';

type Price = { price: number | null; pct24h: number; source: string };

export default function Home() {
  const router = useRouter();
  const pet = usePet();
  const hasStore = useLocal('roost.pet') !== null;
  const now = useNow();
  const q = useSearch();
  const [price, setPrice] = useState<Price>({ price: null, pct24h: 0, source: 'none' });
  const [bars, setBars] = useState<Bar[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>();
  const [report, setReport] = useState<{ fresh: Entry[]; awayMs: number } | null>(null);
  const [duel, setDuel] = useState<Duel | null>(null);
  const remoteId = useLocal('roost.remoteId');

  const species = pet?.species ?? 'nova';
  const celebrate = Boolean(q.get('hatched') || q.get('fed') || q.get('public'));

  useEffect(() => { if (now && !pet) router.replace('/adopt'); }, [now, pet, router]);
  useEffect(() => { if (pet) touchVisit(pet); }, [pet?.lastVisitDay]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => { window.history.replaceState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); }, 1400);
    return () => clearTimeout(t);
  }, [celebrate]);
  useEffect(() => {
    let alive = true;
    fetch('/api/holidays').then((r) => r.json()).then((j: { dates: string[] }) => { if (alive) setHolidays(new Set(j.dates)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Price, history, and the catch-up tick all hang off one load.
  useEffect(() => {
    let alive = true;
    fetch(`/api/price/${species}`).then((r) => r.json()).then((p: Price) => { if (alive) setPrice(p); }).catch(() => {});
    fetch(`/api/history/${species}`).then((r) => r.json()).then(async (j: { bars: Bar[] }) => {
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
  }, [species]);

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

  const session = q.get('night') ? 'overnight' : nyseSession(now ? new Date(now) : new Date(), holidays);
  const night = isNight(session);
  useEffect(() => { document.documentElement.dataset.session = night ? 'night' : 'day'; }, [night]);

  const sp = SPECIES[species];
  const lastFed = pet?.lastFed ?? now;
  const hunger = now ? Math.max(0, 1 - (now - lastFed) / (72 * 3600 * 1000)) : 1;
  const energy = session === 'regular' ? 0.95 : session === 'pre' || session === 'post' ? 0.7 : 0.4;
  const bond = Math.min(1, 0.15 + (pet?.streak ?? 1) * 0.12);
  const computed = useMemo(() => computeMood({ pct24h: price.pct24h, session, hunger }), [price.pct24h, session, hunger]);
  const mood = celebrate ? 'ecstatic' : ((q.get('mood') as Mood | null) ?? computed);
  const line = celebrate
    ? (q.get('hatched') ? 'Hi. I live here now.' : q.get('public') ? 'We rang the bell.' : 'CHOMP. Thank you.')
    : moodLine(mood, price.pct24h, sp.ticker);

  const qty = pet ? heldQty(pet) : 0;
  const perf = pet && price.price ? pnl(pet, price.price) : null;

  if (!hasStore && !pet) return <main className="min-h-dvh" />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <span className="rounded-full border px-3 py-1.5 text-[12px] num" style={{ borderColor: night ? 'var(--accent)' : 'var(--ink)', color: night ? 'var(--accent)' : 'var(--ink)', boxShadow: night ? 'var(--glow)' : 'none' }}>
          {night ? '☾' : '☀'} {sessionLabel[session]}
        </span>
        <span className="text-[13px] font-semibold" style={{ color: 'var(--muted)' }}>{pet?.name ?? sp.name} · day {pet?.streak ?? 1}</span>
      </div>

      <div className="relative mt-5 flex flex-col items-center">
        <div className="card relative mb-2 max-w-[264px] px-4 py-2.5 text-center text-[15px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
          {line}
          <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45" style={{ background: 'var(--surface)', borderRight: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }} aria-hidden />
        </div>
        <div className="relative">
          {celebrate && <Confetti />}
          <Pet id={species} mood={mood} night={night} size={300} />
        </div>
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

      {pet && <Ask pet={pet} price={price.price} onAnswer={(yes) => { if (price.price) void syncPet(answerProposal(pet, yes, price.price)); }} />}

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

      <Link href="/feed" className="pill mt-5 grid w-full place-items-center text-[18px] active:scale-[0.98]" style={{ transition: 'transform .1s' }}>Feed $5</Link>
      <Link href="/public" className="mt-2 grid w-full place-items-center rounded-full border py-3 text-[14px] font-bold" style={{ borderColor: 'var(--line)', background: 'var(--surface)', fontFamily: 'var(--font-display)' }}>
        {pet?.launch ? `$${pet.name.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()} is public · view pool` : '🔔 Go public'}
      </Link>

      <p className="mt-3 text-center text-[13px]" style={{ color: 'var(--muted)' }}>
        holds <span className="num" style={{ color: 'var(--ink)' }}>{qty.toFixed(4)} {sp.ticker}</span>
        {pet && pet.lentQty > 0 && <> · <span className="num">{pet.lentQty.toFixed(3)} lent</span></>}
        {pet && pet.cash > 0 && <> · <span className="num">${pet.cash.toFixed(0)} idle</span></>}
      </p>
      {pet && pet.cash >= 1 && !pet.proposal && (
        <p className="mt-1 text-center text-[12px]" style={{ color: 'var(--muted)' }}>{waitingLine[pet.personality]}</p>
      )}

      {report && pet && <Report pet={pet} fresh={report.fresh} awayMs={report.awayMs} price={price.price} onClose={() => setReport(null)} />}
      <Nav />
    </main>
  );
}
