'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { ManagerAvatar } from '@/components/ManagerAvatar';
import { ConnectPill } from '@/components/Wallet';
import { TelegramLink } from '@/components/Telegram';
import { MANAGERS } from '@/lib/managers';
import { CADENCE_LABEL } from '@/lib/care';
import { isNight, nyseSession, sessionLabel } from '@/lib/session';
import { useNow, useSearch } from '@/lib/client';
import { costBasis, heldQty, isPaper, mandatesOf, stockOf, useFocusPet, usePets, type PetState } from '@/lib/store';
import { useTickAll } from '@/lib/tickall';
import { ago, delta, pct, tone, usd } from '@/lib/format';

// The desk: every mandate this browser holds, as one book. With none yet, the front door — the six
// managers and what hiring one means.

function Landing({ night, label }: { night: boolean; label: string }) {
  return (
    <>
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: night ? 'var(--accent)' : 'var(--muted)' }}>{label}</p>
      <h1 className="mt-2 max-w-[760px] text-[40px] font-semibold leading-[1.02] tracking-tight lg:text-[60px]" style={{ fontFamily: 'var(--font-display)' }}>
        Hire an AI fund manager for your stocks.
      </h1>
      <p className="mt-3 max-w-[620px] text-[15.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
        Tokenized US stocks trade on BNB Chain around the clock. The exchange behind them is open 32 hours a week. Roost gives you a manager for the other 136 — one written rule, your limits, your wallet. Every trade is simulated before you sign it, and every manager&rsquo;s record is public.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href="/managers" className="pill grid place-items-center px-7 text-[16px]">Meet the managers</Link>
        <span className="text-[13px]" style={{ color: 'var(--muted)' }}>No wallet needed to try — paper first, real money when you&rsquo;re ready.</span>
      </div>

      <ul className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {MANAGERS.map((m) => (
          <li key={m.id}>
            <Link href={`/m/${m.id}`} className="card flex h-full flex-col items-start gap-2 px-3 py-3">
              <ManagerAvatar manager={m} size={44} />
              <span>
                <span className="block text-[16px] font-semibold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{m.name}</span>
                <span className="block text-[12px]" style={{ color: 'var(--muted)' }}>{m.title}</span>
              </span>
              <span className="text-[12px] leading-snug">{m.tagline}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-8 grid gap-3 lg:grid-cols-3">
        {[
          ['Your wallet, your keys', 'A live mandate is bound to your wallet. Roost builds each trade, simulates it against your balance, and you sign it — in the app, or through your own Binance Agentic Wallet inside limits you set.'],
          ['The cheaper share', 'Two issuers sell most big names. Each stock resolves to whichever token costs less per share, from real quotes for your wallet — and the manager says why.'],
          ['Checkable, not claimed', 'Records are computed from every client’s positions at the live price. Live and paper are never added together, and every on-chain trade links to BscScan.'],
        ].map(([t, b]) => (
          <div key={t} className="card px-4 py-4">
            <p className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{t}</p>
            <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>{b}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Desk() {
  const { pets } = usePets();
  const now = useNow();
  const q = useSearch();
  const elsewhere = useFocusPet(q);
  const [holidays, setHolidays] = useState<Set<string>>();
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const mandates = mandatesOf(pets);
  const { away } = useTickAll(pets);

  useEffect(() => {
    let alive = true;
    fetch('/api/holidays').then((r) => r.json()).then((j: { dates: string[] }) => { if (alive) setHolidays(new Set(j.dates)); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const tokens = [...new Set(pets.map((p) => stockOf(p).address.toLowerCase()))].sort().join(',');
  useEffect(() => {
    if (!tokens) return;
    let alive = true;
    fetch(`/api/prices?tokens=${tokens}`).then((r) => (r.ok ? r.json() : null))
      .then((j: { prices?: Record<string, number | null> } | null) => { if (alive && j?.prices) setPrices(j.prices); }).catch(() => {});
    return () => { alive = false; };
  }, [tokens]);

  const session = q.get('night') ? 'overnight' : nyseSession(now ? new Date(now) : new Date(), holidays);
  const night = isNight(session);
  useEffect(() => { document.documentElement.dataset.session = night ? 'night' : 'day'; }, [night]);
  const onDesk = night ? MANAGERS.find((m) => m.id === 'vesper')! : null;
  const label = `${night ? '☾' : '☀'} ${sessionLabel[session]}${onDesk ? ` · ${onDesk.name} is on the desk` : ''}`;

  const worth = (p: PetState) => { const px = prices[stockOf(p).address.toLowerCase()]; return px ? heldQty(p) * px : null; };
  const book = (list: PetState[]) => list.reduce((t, p) => {
    const v = worth(p);
    return { value: t.value + (v ?? costBasis(p)) + p.cash, basis: t.basis + costBasis(p), cash: t.cash + p.cash, n: t.n + 1 };
  }, { value: 0, basis: 0, cash: 0, n: 0 });
  const live = book(pets.filter((p) => !isPaper(p)));
  const paper = book(pets.filter((p) => isPaper(p)));
  const memos = pets.filter((p) => p.proposal);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(16px,env(safe-area-inset-top))] lg:max-w-[1120px] lg:px-10 lg:pb-12 lg:pt-10">
      <div className="mb-5 flex items-center justify-between gap-2 lg:mb-6">
        <span className="text-[24px] font-semibold tracking-tight lg:hidden" style={{ fontFamily: 'var(--font-display)' }}>Roost</span>
        <span className="hidden lg:block" />
        <ConnectPill />
      </div>
      {elsewhere && (
        <p className="card mb-4 px-3 py-2 text-[12.5px]" style={{ color: 'var(--muted)' }}>
          That link is for a mandate held in another browser — this one only knows the managers hired here.
        </p>
      )}

      {!mandates.length ? <Landing night={night} label={label} /> : (
        <>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: night ? 'var(--accent)' : 'var(--muted)' }}>{label}</p>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight lg:text-[44px]" style={{ fontFamily: 'var(--font-display)' }}>Your desk</h1>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[{ label: 'Real money', t: live }, { label: 'Paper', t: paper }].filter((x) => x.t.n > 0).map(({ label: l, t }) => {
              const pnl = t.value - t.cash - t.basis;
              return (
                <div key={l} className="card px-4 py-3">
                  <p className="text-[12px]" style={{ color: 'var(--muted)' }}>{l} · {t.n} position{t.n === 1 ? '' : 's'}</p>
                  <p className="num text-[28px] font-semibold leading-tight">{usd(t.value)}</p>
                  <p className="num text-[12.5px]" style={{ color: 'var(--muted)' }}>
                    {t.basis > 0 ? <><span style={{ color: tone(pnl) }}>{delta(pnl)} ({pct((pnl / t.basis) * 100)})</span> on {usd(t.basis)}</> : 'nothing invested yet'}
                    {t.cash >= 0.01 && <> · {usd(t.cash)} waiting</>}
                  </p>
                </div>
              );
            })}
          </div>

          {memos.length > 0 && (
            <Link href={`/mandate?key=${memos[0].mandate?.key}`} className="card mt-3 flex items-center justify-between gap-3 px-4 py-3" style={{ boxShadow: 'inset 3px 0 0 var(--accent)' }}>
              <span className="text-[14px]"><b>{memos.length} memo{memos.length === 1 ? '' : 's'}</b> waiting for your answer — {memos[0].name} wants {usd(memos[0].proposal!.usd)} in {stockOf(memos[0]).ticker}.</span>
              <span className="shrink-0 text-[13px] font-semibold">Review ›</span>
            </Link>
          )}

          <h2 className="mt-6 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>Your managers</h2>
          <ul className="mt-2 grid gap-3 lg:grid-cols-2">
            {mandates.map(({ key, manager: m, positions }) => {
              const t = book(positions);
              const pnl = t.value - t.cash - t.basis;
              const s = positions[0].schedule;
              const asks = positions.filter((p) => p.proposal).length;
              return (
                <li key={key}>
                  <Link href={`/mandate?key=${key}`} className="card flex h-full flex-col gap-2 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <ManagerAvatar manager={m} size={48} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[19px] font-semibold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{m.name}</p>
                        <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>{m.title} · {isPaper(positions[0]) ? 'paper' : 'live'}</p>
                      </div>
                      <div className="text-right">
                        <p className="num text-[17px] font-semibold">{usd(t.value)}</p>
                        {t.basis > 0 && <p className="num text-[12px]" style={{ color: tone(pnl) }}>{pct((pnl / t.basis) * 100)}</p>}
                      </div>
                    </div>
                    <p className="num text-[12px]" style={{ color: 'var(--muted)' }}>{positions.map((p) => stockOf(p).ticker).join(' · ')}</p>
                    <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
                      {asks > 0 ? <b style={{ color: 'var(--ink)' }}>{asks} memo{asks === 1 ? '' : 's'} to answer · </b> : null}
                      {t.cash >= 0.01 ? `${usd(t.cash)} waiting · ` : ''}
                      {s && !s.paused ? `${usd(positions.reduce((a, p) => a + (p.schedule?.usd ?? 0), 0))} ${CADENCE_LABEL[s.every]}` : 'no standing contribution'}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>

          <Link href="/managers" className="mt-4 self-start rounded-full border px-5 py-2.5 text-[14px] font-semibold" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>Hire another manager</Link>

          {away && away.length > 0 && (
            <div className="card mt-5 px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>Since you were last here</p>
              <ul className="mt-1.5 grid gap-1 text-[13px]">
                {away.slice(-8).map((a, i) => (
                  <li key={i}><span className="num" style={{ color: 'var(--muted)' }}>{ago(a.entry.ts)} · {a.manager} · {a.ticker}</span> — {a.entry.text}</li>
                ))}
              </ul>
            </div>
          )}
          {pets[0] && <TelegramLink pet={pets[0]} />}
        </>
      )}
      <Nav />
    </main>
  );
}
