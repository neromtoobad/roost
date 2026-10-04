'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { ManagerAvatar } from '@/components/ManagerAvatar';
import { TxLink } from '@/components/Report';
import { CADENCE_LABEL } from '@/lib/care';
import { useNow, useSearch } from '@/lib/client';
import { costBasis, heldQty, mandatesOf, stockOf, usePets, type Entry, type EntryKind, type PetState } from '@/lib/store';
import type { Manager } from '@/lib/managers';
import { delta, pct, usd } from '@/lib/format';

// Each manager writes to the client: a letter for the last thirty days, worked out from what they
// actually did — never from what they might have — and under it every note they made, newest first.

const MARK: Record<EntryKind, string> = { feed: '＋', buy: '▲', sell: '▼', lend: '·', yield: '◆', hold: '‖', ask: '?', system: '·' };
const MONTH = 30 * 86400e3;

function Letter({ m, positions, prices, now }: { m: Manager; positions: PetState[]; prices: Record<string, number | null>; now: number }) {
  const hiredAt = Math.min(...positions.map((p) => p.adoptedAt));
  const young = now - hiredAt < MONTH;
  const since = young ? hiredAt : now - MONTH;
  const buys = positions.flatMap((p) => p.diary.filter((e) => e.kind === 'buy' && e.ts >= since).map((e) => ({ e, t: stockOf(p).ticker })));
  const spent = buys.reduce((s, b) => s + (b.e.usd ?? 0), 0);
  const tickers = [...new Set(buys.map((b) => b.t))];
  const asks = positions.filter((p) => p.proposal).length;
  const basis = positions.reduce((s, p) => s + costBasis(p), 0);
  const value = positions.reduce((s, p) => { const px = prices[stockOf(p).address.toLowerCase()]; return s + (px ? heldQty(p) * px : costBasis(p)); }, 0);
  const waiting = positions.reduce((s, p) => s + p.cash, 0);
  const sched = positions[0].schedule;
  const each = positions.reduce((s, p) => s + (p.schedule?.usd ?? 0), 0);

  return (
    <div className="card px-5 py-5" style={{ boxShadow: `inset 3px 0 0 ${m.color}` }}>
      <div className="flex items-center gap-3">
        <ManagerAvatar manager={m} size={40} />
        <div>
          <p className="text-[18px] font-semibold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>A letter from {m.name}</p>
          <p className="text-[12px]" style={{ color: 'var(--muted)' }}>{young ? `Since you hired me, ${new Date(hiredAt).toLocaleDateString([], { month: 'long', day: 'numeric' })}` : 'The last thirty days'}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2 text-[15px] leading-relaxed" style={{ fontFamily: 'var(--font-display)' }}>
        <p>
          {buys.length
            ? <>I placed <b className="num">{usd(spent)}</b> across {buys.length} buy{buys.length === 1 ? '' : 's'}, in {tickers.join(', ')}.</>
            : young
              ? <>I have not bought anything yet. {m.rules[0]} Until that moment comes the money waits — that is the rule working, not the rule failing.</>
              : <>I did not buy anything this month. {m.rules[0]} The moment never came, so the money waited — that is the rule working, not the rule failing.</>}
        </p>
        <p>
          {basis > 0
            ? <>The mandate is worth <b className="num">{usd(value)}</b> against <span className="num">{usd(basis)}</span> invested — <b className="num">{delta(value - basis)}</b> ({pct(((value - basis) / basis) * 100)}).</>
            : <>Nothing is invested yet.</>}
          {waiting >= 0.01 && <> <span className="num">{usd(waiting)}</span> is waiting for my next signal.</>}
        </p>
        {asks > 0 && <p>I have {asks} memo{asks === 1 ? '' : 's'} waiting for your answer. Nothing moves until you sign.</p>}
        <p>{sched && !sched.paused ? <>Your next <span className="num">{usd(each)}</span> arrives {new Date(sched.nextAt).toLocaleDateString([], { month: 'long', day: 'numeric' })}, {CADENCE_LABEL[sched.every]}.</> : 'There is no standing contribution — add money whenever you like.'}</p>
        <p className="italic" style={{ color: 'var(--muted)' }}>— {m.name}, {m.title}</p>
      </div>
    </div>
  );
}

export default function Letters() {
  const { pets } = usePets();
  const q = useSearch();
  const now = useNow();
  const only = q.get('key');
  const mandates = mandatesOf(pets).filter((x) => !only || x.key === only);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const tokens = [...new Set(pets.map((p) => stockOf(p).address.toLowerCase()))].sort().join(',');
  useEffect(() => {
    if (!tokens) return;
    let alive = true;
    fetch(`/api/prices?tokens=${tokens}`).then((r) => (r.ok ? r.json() : null))
      .then((j: { prices?: Record<string, number | null> } | null) => { if (alive && j?.prices) setPrices(j.prices); }).catch(() => {});
    return () => { alive = false; };
  }, [tokens]);

  const journal: { e: Entry; m: Manager; ticker: string }[] = mandates
    .flatMap(({ manager, positions }) => positions.flatMap((p) => p.diary.map((e) => ({ e, m: manager, ticker: stockOf(p).ticker }))))
    .sort((a, b) => b.e.ts - a.e.ts)
    .slice(0, 120);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(16px,env(safe-area-inset-top))] lg:max-w-[880px] lg:px-10 lg:pb-12 lg:pt-10">
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>Letters</p>
      <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight lg:text-[44px]" style={{ fontFamily: 'var(--font-display)' }}>From your managers</h1>
      {only && <Link href="/letters" className="mt-1 text-[13px] underline" style={{ color: 'var(--muted)' }}>All managers</Link>}

      {!mandates.length && (
        <p className="card mt-5 px-4 py-4 text-[14px]" style={{ color: 'var(--muted)' }}>No letters yet. <Link href="/managers" className="underline" style={{ color: 'var(--ink)' }}>Hire a manager</Link> and they will write.</p>
      )}

      <div className="mt-5 grid gap-3">
        {mandates.map(({ key, manager, positions }) => <Letter key={key} m={manager} positions={positions} prices={prices} now={now} />)}
      </div>

      {journal.length > 0 && (
        <>
          <h2 className="mt-7 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>Every note</h2>
          <ul className="mt-2 grid gap-1.5">
            {journal.map(({ e, m, ticker }, i) => (
              <li key={`${e.ts}-${i}`} className="card flex items-start gap-3 px-3 py-2.5">
                <ManagerAvatar manager={m} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-snug">{e.text}</p>
                  <p className="mt-0.5 text-[11.5px] num" style={{ color: 'var(--muted)' }}>
                    <span aria-hidden>{MARK[e.kind] ?? '·'}</span> {m.name} · {ticker} · {new Date(e.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {e.qty != null && e.price != null && ` · ${e.qty.toFixed(4)} @ $${e.price.toFixed(2)}`}
                    {e.paper && ' · paper'}
                  </p>
                  {e.sig && <TxLink sig={e.sig} />}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <Nav />
    </main>
  );
}
