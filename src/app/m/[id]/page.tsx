'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { ManagerAvatar } from '@/components/ManagerAvatar';
import { RecordLine } from '@/components/Record';
import { ConnectPill, useWallet } from '@/components/Wallet';
import { managerById } from '@/lib/managers';
import type { ManagerRecord, Trade } from '@/lib/records';
import type { Stock } from '@/lib/pets';
import { ago, usd } from '@/lib/format';

// One manager, as a prospective client would want to read them: who they are, the mandate in plain
// words, which token each of their stocks resolves to and why, and everything they have actually done.

type Detail = {
  record: ManagerRecord | null;
  trades: Trade[];
  universe: { ticker: string; name: string; stock: Stock | null; reason: string; basis: string | null }[];
};

const KIND: Record<string, string> = { buy: 'Bought', sell: 'Sold', ask: 'Asked to buy' };

export default function ManagerPage() {
  const { id } = useParams<{ id: string }>();
  const m = managerById(id);
  const { address } = useWallet();
  const [detail, setDetail] = useState<{ key: string; value: Detail } | null>(null);
  const key = `${id}:${address ?? '-'}`;

  useEffect(() => {
    if (!m) return;
    let alive = true;
    fetch(`/api/managers/${m.id}${address ? `?wallet=${address}` : ''}`).then((r) => (r.ok ? r.json() : null))
      .then((j: Detail | null) => { if (alive && j) setDetail({ key, value: j }); }).catch(() => {});
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center px-4">
        <p style={{ color: 'var(--muted)' }}>No such manager.</p>
        <Link href="/managers" className="mt-3 underline">All managers</Link>
      </main>
    );
  }
  const d = detail?.key === key ? detail.value : null;
  const r = d?.record ?? null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(16px,env(safe-area-inset-top))] lg:max-w-[1120px] lg:px-10 lg:pb-12 lg:pt-8">
      <div className="flex items-center justify-between">
        <Link href="/managers" className="text-[13px]" style={{ color: 'var(--muted)' }}>‹ All managers</Link>
        <ConnectPill />
      </div>

      <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10">
        <section>
          <div className="flex items-center gap-4">
            <ManagerAvatar manager={m} size={88} ring />
            <div>
              <h1 className="text-[36px] font-semibold leading-none tracking-tight lg:text-[44px]" style={{ fontFamily: 'var(--font-display)' }}>{m.name}</h1>
              <p className="mt-1 text-[14px]" style={{ color: 'var(--muted)' }}>{m.title} · {m.hours}</p>
            </div>
          </div>
          <blockquote className="mt-5 border-l-2 pl-4 text-[17px] italic leading-relaxed lg:text-[19px]" style={{ borderColor: m.color, fontFamily: 'var(--font-display)' }}>
            “{m.philosophy}”
          </blockquote>

          <h2 className="mt-7 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>The mandate</h2>
          <ul className="mt-2 grid gap-1.5">
            {m.rules.map((rule) => (
              <li key={rule} className="flex gap-2 text-[14.5px] leading-snug">
                <span aria-hidden style={{ color: m.color }}>■</span>{rule}
              </li>
            ))}
            <li className="flex gap-2 text-[14.5px] leading-snug"><span aria-hidden style={{ color: m.color }}>■</span>Every trade is simulated against your wallet first and refused if it costs more than 3% over the stock&rsquo;s reference price.</li>
          </ul>

          <h2 className="mt-7 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>What {m.name} buys</h2>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted)' }}>
            Where two issuers sell the same share, the cheaper one per share is chosen {address ? 'from real quotes for your wallet' : 'at the traded price — connect a wallet for real quotes'}.
          </p>
          <ul className="mt-2 grid gap-1.5">
            {(d?.universe ?? m.universe.map((u) => ({ ...u, stock: null, reason: '', basis: null }))).map((u) => (
              <li key={u.ticker} className="card px-3 py-2.5">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-[14.5px] font-semibold">{u.name} <span className="num text-[12px] font-normal" style={{ color: 'var(--muted)' }}>{u.ticker}</span></span>
                  <span className="num shrink-0 text-[12px]" style={{ color: 'var(--muted)' }}>{u.stock ? u.stock.tokenSymbol : d ? '—' : '…'}</span>
                </p>
                {u.reason && <p className="mt-0.5 text-[12px] leading-snug" style={{ color: 'var(--muted)' }}>{u.reason}</p>}
              </li>
            ))}
          </ul>
        </section>

        <aside className="mt-7 lg:sticky lg:top-8 lg:mt-0">
          <div className="card px-4 py-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>Public record</h2>
            <div className="mt-2"><RecordLine record={r} /></div>
            {r && (
              <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                {r.clients} client{r.clients === 1 ? '' : 's'} · {r.trades} trade{r.trades === 1 ? '' : 's'}
                {r.onchainTrades > 0 && <> · <span style={{ color: 'var(--ink)' }}>{r.onchainTrades} on BSC</span></>}
                {r.lastTradeAt && <> · last {ago(r.lastTradeAt)}</>}
              </p>
            )}
            <Link href={`/hire/${m.id}`} className="pill mt-4 grid w-full place-items-center text-[16px]">Hire {m.name}</Link>
            <p className="mt-2 text-center text-[11.5px]" style={{ color: 'var(--muted)' }}>No wallet needed to try — without one, {m.name} trades on paper.</p>
          </div>

          <div className="card mt-3 px-4 py-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>Latest moves</h2>
            {!d ? <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>Loading…</p>
              : d.trades.length === 0 ? <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>Nothing yet. Be the first client.</p>
              : (
                <ul className="mt-2 grid gap-2.5">
                  {d.trades.map((t, i) => (
                    <li key={`${t.ts}-${i}`} className="text-[12.5px] leading-snug">
                      <p><b>{KIND[t.kind] ?? t.kind}</b> <span className="num">{t.ticker}</span>{t.usd != null && <> · <span className="num">{usd(t.usd)}</span></>}
                        <span style={{ color: 'var(--muted)' }}> · {ago(t.ts)}{t.paper ? ' · paper' : ''}</span></p>
                      <p style={{ color: 'var(--muted)' }}>{t.text}</p>
                      {t.sig?.startsWith('0x') && !t.paper && (
                        <a href={`https://bscscan.com/tx/${t.sig}`} target="_blank" rel="noreferrer" className="num text-[11.5px] underline" style={{ color: 'var(--ink)' }}>BscScan ↗</a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </aside>
      </div>
      <Nav />
    </main>
  );
}
