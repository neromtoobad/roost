'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { ManagerAvatar } from '@/components/ManagerAvatar';
import { ConnectPill, useWallet } from '@/components/Wallet';
import { allocate } from '@/lib/litters';
import { CADENCE_LABEL } from '@/lib/care';
import {
  answerProposal, costBasis, endMandate, feedPet, heldQty, isPaper, mandatesOf, readPetByUid, recordBuy, stockOf, usePets, type PetState,
} from '@/lib/store';
import { syncPet } from '@/lib/sync';
import { useSearch } from '@/lib/client';
import { useTickAll } from '@/lib/tickall';
import { bscscan, useBuy, type BuyStep } from '@/lib/trade';
import { ago, delta, pct, tone, usd as money } from '@/lib/format';

// One mandate: a manager, the stocks they run for this client, and the money in them. New money is a
// rebalance (lib/litters): whatever has fallen furthest below an equal share gets topped up first,
// and nothing is sold to make room. The manager's rule decides when cash waiting goes in; a live
// mandate turns that decision into a memo the client signs.

const AMOUNTS = [25, 50, 100, 250];
/** The smallest buy worth placing for one stock: Ondo refuses $5 and under. */
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
    case 'done': return 'Done.';
    case 'stopped': return step.reason;
    default: return '';
  }
}

type Outcome = { uid: string; ticker: string; usd: number; ok: boolean; note: string; hash?: string };

export default function MandatePage() {
  const router = useRouter();
  const q = useSearch();
  const key = q.get('key') ?? '';
  const { pets } = usePets();
  const mandate = mandatesOf(pets).find((m) => m.key === key);
  const positions = mandate?.positions ?? [];
  const m = mandate?.manager;
  const first = positions[0];
  const live = first ? !isPaper(first) : false;
  const bound = first?.wallet ?? '';
  const { address, isConnected } = useWallet();
  const matches = Boolean(address && bound && address.toLowerCase() === bound.toLowerCase());
  const { step, run, reset, lastStop } = useBuy();
  const { away } = useTickAll(positions);

  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const tokens = [...new Set(positions.map((p) => stockOf(p).address.toLowerCase()))].join(',');
  useEffect(() => {
    if (!tokens) return;
    let alive = true;
    fetch(`/api/prices?tokens=${tokens}`).then((r) => (r.ok ? r.json() : null))
      .then((j: { prices?: Record<string, number | null> } | null) => { if (alive && j?.prices) setPrices(j.prices); }).catch(() => {});
    return () => { alive = false; };
  }, [tokens]);

  const [amount, setAmount] = useState(50);
  const [queue, setQueue] = useState<{ at: number; of: number; ticker: string } | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  if (!mandate || !m || !first) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center px-4 pb-24">
        <p className="text-[14px]" style={{ color: 'var(--muted)' }}>No mandate here.</p>
        <Link href="/managers" className="pill mt-4 grid place-items-center px-6 text-[15px]">Hire a manager</Link>
        <Nav />
      </main>
    );
  }

  const priceOf = (p: PetState) => prices[stockOf(p).address.toLowerCase()] ?? null;
  // What each holds at the print, plus cash given and not yet spent — so a stock that was just topped
  // up is not topped up again before its manager has put it to work.
  const values = positions.map((p) => { const px = priceOf(p); return (px ? heldQty(p) * px : 0) + p.cash; });
  const total = values.reduce((s, v) => s + v, 0);
  const basis = positions.reduce((s, p) => s + costBasis(p), 0);
  const invested = positions.reduce((s, p) => { const px = priceOf(p); return s + (px ? heldQty(p) * px : 0); }, 0);
  const waiting = positions.reduce((s, p) => s + p.cash, 0);
  const realized = positions.reduce((s, p) => s + (p.realized ?? 0), 0);
  const priced = positions.every((p) => priceOf(p) != null || heldQty(p) === 0);
  const shares = priced ? allocate(values, amount, live ? MIN_LIVE : 0) : positions.map(() => 0);
  const getting = positions.map((p, i) => ({ p, usd: shares[i] })).filter((x) => x.usd > 0);
  const memos = positions.filter((p) => p.proposal);
  const schedule = first.schedule;
  const perContribution = positions.reduce((s, p) => s + (p.schedule?.usd ?? 0), 0);
  const running = queue !== null;

  /** Cash for the manager to place by their rule — paper, or a live mandate's pledge they will ask to sign. */
  const giveCash = () => {
    for (const { p, usd: a } of getting) {
      void syncPet(feedPet(readPetByUid(p.uid!) ?? p, a, `Added ${money(a)} — ${a === Math.max(...shares) ? 'furthest below an equal share' : 'topped up toward an equal share'}.`));
    }
    setOutcomes(getting.map(({ p, usd: a }) => ({ uid: p.uid!, ticker: stockOf(p).ticker, usd: a, ok: true, note: live ? `for ${m.name} to place` : 'added (paper)' })));
  };

  /** Invest it now: one signed, simulated buy per stock that gets some. */
  const investNow = async () => {
    const out: Outcome[] = [];
    setOutcomes(null);
    for (let i = 0; i < getting.length; i++) {
      const { p, usd: a } = getting[i];
      const s = stockOf(p);
      setQueue({ at: i + 1, of: getting.length, ticker: s.ticker });
      const b = await run({ species: p.species, stock: s }, a, bound);
      if (b) {
        const { pet: bought, fresh } = recordBuy(readPetByUid(p.uid!) ?? p, {
          hash: b.hash, qty: b.qty, spent: b.usdt, fromCash: false,
          reason: `Invested on your instruction: ${b.qty.toFixed(4)} ${s.ticker}, on-chain, signed by you.`,
        });
        void syncPet(bought, fresh);
        out.push({ uid: p.uid!, ticker: s.ticker, usd: b.usdt, ok: true, note: `${b.qty.toFixed(4)} ${s.tokenSymbol}`, hash: b.hash });
        setOutcomes([...out]);
        continue;
      }
      const why = lastStop();
      out.push({ uid: p.uid!, ticker: s.ticker, usd: a, ok: false, note: why?.reason ?? 'stopped', hash: why?.hash });
      setOutcomes([...out]);
      // Refused before anything was sent: pass this one over. A cancel, or anything on-chain: stop.
      if (why?.hash || /cancelled/i.test(why?.reason ?? '')) break;
    }
    setQueue(null);
    reset();
  };

  const answer = (p: PetState, yes: boolean) => {
    const px = priceOf(p);
    if (yes && !px) return; // a paper fill needs a price; a no does not
    void syncPet(answerProposal(readPetByUid(p.uid!) ?? p, yes, px ?? 0));
  };

  const end = () => {
    const note = live ? ' Your tokens stay in your wallet; Roost simply stops managing them.' : '';
    if (!window.confirm(`End ${m.name}'s mandate?${note}`)) return;
    endMandate(key);
    router.push('/');
  };

  const pnl = invested - basis;
  const hired = Boolean(q.get('hired'));

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(16px,env(safe-area-inset-top))] lg:max-w-[1120px] lg:px-10 lg:pb-12 lg:pt-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-[13px]" style={{ color: 'var(--muted)' }}>‹ Desk</Link>
        <ConnectPill />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Link href={`/m/${m.id}`}><ManagerAvatar manager={m} size={60} ring /></Link>
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight lg:text-[34px]" style={{ fontFamily: 'var(--font-display)' }}>{m.name}&rsquo;s mandate</h1>
          <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
            {live ? <>Live · <span className="num">{short(bound)}</span></> : 'Paper'} · {positions.length} stock{positions.length === 1 ? '' : 's'}
            {schedule && !schedule.paused && <> · <span className="num">{money(perContribution)}</span> {CADENCE_LABEL[schedule.every]}</>}
          </p>
        </div>
      </div>

      {hired && (
        <div className="card mt-4 px-4 py-3 text-[14px]" style={{ boxShadow: `inset 3px 0 0 ${m.color}` }}>
          <p className="font-semibold">Mandate signed.</p>
          <p className="mt-0.5" style={{ color: 'var(--muted)' }}>{m.voice.hired} {live ? 'Every buy will come to you as a memo to sign.' : 'This one is on paper.'}</p>
        </div>
      )}

      <div className="lg:mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-10">
        <section>
          <div className="card mt-4 px-4 py-3 lg:mt-0">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[12px]" style={{ color: 'var(--muted)' }}>Worth now</p>
                <p className="num text-[28px] font-semibold leading-tight">{money(total)}</p>
              </div>
              {basis > 0 && (
                <p className="num text-right text-[13px]" style={{ color: tone(pnl) }}>
                  {delta(pnl)} ({pct((pnl / basis) * 100)})<br />
                  <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>on {money(basis)} invested</span>
                </p>
              )}
            </div>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--muted)' }}>
              {waiting >= 0.01 ? <><span className="num" style={{ color: 'var(--ink)' }}>{money(waiting)}</span> waiting for {m.name} to place · </> : null}
              {realized !== 0 && <><span className="num" style={{ color: tone(realized) }}>{delta(realized)}</span> realized · </>}
              {schedule ? (schedule.paused ? 'contributions paused' : `next contribution ${new Date(schedule.nextAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`) : 'no standing contribution'}
            </p>
          </div>

          {memos.length > 0 && (
            <div className="mt-3 grid gap-2">
              {memos.map((p) => {
                const s = stockOf(p);
                return (
                  <div key={p.uid} className="card px-4 py-3" style={{ boxShadow: 'inset 3px 0 0 var(--accent)' }}>
                    <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>Memo · {ago(p.proposal!.ts)}</p>
                    <p className="mt-1 text-[15px] leading-snug"><b>{m.name}</b> wants <b className="num">{money(p.proposal!.usd)}</b> in <b>{s.ticker}</b>: {p.proposal!.reason}.</p>
                    <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--muted)' }}>{m.voice.asks}</p>
                    <div className="mt-2.5 flex gap-2">
                      {live ? (
                        <Link href={`/feed?proposal=1&pet=${p.uid}`} className="pill grid flex-1 place-items-center text-[14px]">Review &amp; sign</Link>
                      ) : (
                        <button onClick={() => answer(p, true)} className="pill flex-1 text-[14px]">Approve (paper)</button>
                      )}
                      <button onClick={() => answer(p, false)} className="flex-1 rounded-full border text-[14px] font-semibold" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>Not this time</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <h2 className="mt-5 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>Holdings</h2>
          <ul className="mt-2 grid gap-1.5">
            {positions.map((p, i) => {
              const s = stockOf(p);
              const px = priceOf(p);
              const qty = heldQty(p), cost = costBasis(p);
              const val = px ? qty * px : null;
              const w = total > 0 ? values[i] / total : 0;
              return (
                <li key={p.uid} className="card px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-[14.5px] font-semibold">{s.company} <span className="num text-[12px] font-normal" style={{ color: 'var(--muted)' }}>{s.tokenSymbol}</span></p>
                    <p className="num shrink-0 text-[14px]">{val != null ? money(val) : '—'}</p>
                  </div>
                  <div className="relative mt-1.5 h-1.5 rounded-full" style={{ background: 'var(--line)' }} aria-hidden>
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, w * 100 * (positions.length / 2))}%`, background: m.color }} />
                    <div className="absolute top-[-3px] h-3 w-[2px]" style={{ left: '50%', background: 'var(--ink)' }} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11.5px] num" style={{ color: 'var(--muted)' }}>
                    <span>
                      {(w * 100).toFixed(1)}% of the mandate
                      {cost > 0 && val != null && <> · <span style={{ color: tone(val - cost) }}>{pct(((val - cost) / cost) * 100)}</span></>}
                      {p.cash >= 0.01 && <> · {money(p.cash)} waiting</>}
                      {shares[i] > 0 && <> · gets {money(shares[i])} next</>}
                    </span>
                    {qty > 0 && <Link href={`/release?pet=${p.uid}`} className="shrink-0 underline">Withdraw</Link>}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11.5px]" style={{ color: 'var(--muted)' }}>The line on each bar is an equal share. New money tops up whatever sits furthest under it.</p>

          {away && away.length > 0 && (
            <div className="card mt-4 px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>Since you were last here</p>
              <ul className="mt-1.5 grid gap-1 text-[13px]">
                {away.slice(-6).map((a, i) => (
                  <li key={i}><span className="num" style={{ color: 'var(--muted)' }}>{ago(a.entry.ts)} · {a.ticker}</span> — {a.entry.text}</li>
                ))}
              </ul>
              <Link href={`/letters?key=${key}`} className="mt-2 inline-block text-[12.5px] underline">All of {m.name}&rsquo;s notes</Link>
            </div>
          )}
        </section>

        <aside className="mt-5 lg:sticky lg:top-8 lg:mt-0">
          <div className="card px-4 py-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>Add money</h2>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {AMOUNTS.map((a) => (
                <button key={a} onClick={() => { setAmount(a); setOutcomes(null); }} disabled={running}
                  className="rounded-[12px] py-2.5 text-[14px] font-semibold num"
                  style={amount === a ? { background: 'var(--ink)', color: 'var(--canvas)' } : { background: 'var(--canvas)', border: '1px solid var(--line)' }}>${a}</button>
              ))}
            </div>
            <p className="mt-3 text-[13px] leading-snug">
              {!priced ? 'Pricing the holdings…'
                : !getting.length ? `${money(amount, 0)} is too little to split — each live buy has to be over $${MIN_LIVE - 1}.`
                : <>{getting.map(({ p, usd: a }) => `${stockOf(p).ticker} ${money(a)}`).join(' · ')}.</>}
            </p>

            {queue && (
              <p className="mt-2 text-[12.5px] leading-snug" style={{ color: step.at === 'stopped' ? 'var(--down)' : 'var(--muted)' }}>
                <b style={{ color: 'var(--ink)' }}>{queue.at} of {queue.of} · {queue.ticker}</b> — {stepLine(step)}
              </p>
            )}
            {outcomes && (
              <ul className="mt-2 grid gap-1 text-[12.5px]">
                {outcomes.map((o) => (
                  <li key={o.uid} style={{ color: o.ok ? 'var(--ink)' : 'var(--down)' }}>
                    {o.ok ? '✓' : '✗'} <b>{o.ticker}</b> {money(o.usd)} — {o.note}
                    {o.hash && <> · <a href={bscscan(o.hash)} target="_blank" rel="noreferrer" className="num underline">BscScan ↗</a></>}
                  </li>
                ))}
              </ul>
            )}

            {live && isConnected && matches && (
              <button onClick={() => void investNow()} disabled={running || !getting.length || busy(step)} className="pill mt-3 w-full text-[15px] disabled:opacity-40">
                {running ? 'Investing…' : `Invest now · ${getting.length} signed buy${getting.length === 1 ? '' : 's'}`}
              </button>
            )}
            {live && (!isConnected || !matches) && (
              <p className="mt-3 text-[12.5px]" style={{ color: 'var(--down)' }}>
                Connect the wallet this mandate is bound to, <span className="num">{short(bound)}</span>, to invest now.
              </p>
            )}
            <button onClick={giveCash} disabled={running || !getting.length} className={`${live ? 'mt-2 w-full rounded-full border py-3 text-[14px] font-semibold' : 'pill mt-3 w-full text-[15px]'} disabled:opacity-40`}
              style={live ? { borderColor: 'var(--line)', background: 'var(--surface)' } : undefined}>
              {live ? `Or let ${m.name} time it` : `Add ${money(amount, 0)} (paper)`}
            </button>
            <p className="mt-2 text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
              {live
                ? `Investing now is one simulated buy per stock, each signed by you. Letting ${m.name} time it means a memo to sign when the rule fires.`
                : `Paper: nothing real moves. ${m.name} places it by the rule: ${m.rules[0].toLowerCase()}`}
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between px-1 text-[12.5px]">
            <Link href={`/letters?key=${key}`} className="underline" style={{ color: 'var(--muted)' }}>Notes &amp; letters</Link>
            <button onClick={end} className="underline" style={{ color: 'var(--muted)' }}>End mandate</button>
          </div>
        </aside>
      </div>
      <Nav />
    </main>
  );
}
