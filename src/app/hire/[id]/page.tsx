'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ManagerAvatar } from '@/components/ManagerAvatar';
import { ConnectPill, useWallet } from '@/components/Wallet';
import { managerById } from '@/lib/managers';
import { feedPet, hireManager } from '@/lib/store';
import { syncPet } from '@/lib/sync';
import { CADENCE_LABEL, type Cadence } from '@/lib/care';
import type { Stock } from '@/lib/pets';
import { usd } from '@/lib/format';

// Hiring a manager is writing a mandate: how much, how often, and which of their stocks. The manager
// then trades it by their rule. With a wallet bound, every buy is a real swap the client signs — in
// this app, or through their own Binance Agentic Wallet inside the limits shown here. Without one,
// it is paper, and says so.

type Resolved = { ticker: string; name: string; stock: Stock | null; reason: string; basis: string | null };

const AMOUNTS = [25, 50, 100, 250];
/** Ondo refuses orders of $5 and under, so a live share of a contribution has to clear that. */
const MIN_LIVE_SHARE = 6;

export default function Hire() {
  const { id } = useParams<{ id: string }>();
  const m = managerById(id);
  const router = useRouter();
  const { address } = useWallet();
  const [universe, setUniverse] = useState<{ key: string; list: Resolved[] } | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState(100);
  const [every, setEvery] = useState<Cadence | null>('month');
  const [busy, setBusy] = useState(false);
  const key = `${id}:${address ?? '-'}`;

  useEffect(() => {
    if (!m) return;
    let alive = true;
    fetch(`/api/managers/${m.id}${address ? `?wallet=${address}` : ''}`).then((r) => (r.ok ? r.json() : null))
      .then((j: { universe?: Resolved[] } | null) => { if (alive && j?.universe) setUniverse({ key, list: j.universe }); }).catch(() => {});
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return null;
  const list = universe?.key === key ? universe.list : null;
  const chosen = (list ?? []).filter((u) => u.stock && !off.has(u.ticker));
  const live = Boolean(address);
  const share = chosen.length ? amount / chosen.length : 0;
  const tooSmall = live && chosen.length > 0 && share < MIN_LIVE_SHARE;
  const ready = Boolean(list) && chosen.length > 0 && !tooSmall && !busy;

  const toggle = (t: string) => setOff((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const hire = () => {
    if (!ready) return;
    setBusy(true);
    const born = hireManager(
      m,
      chosen.map((u) => ({
        stock: u.stock!,
        issuerNote: u.basis && u.basis !== 'only' ? `Two issuers sell ${u.ticker}; this mandate holds ${u.stock!.tokenSymbol}. ${u.reason}` : undefined,
      })),
      every ? { usd: amount, every } : null,
      address,
    );
    // The first contribution lands now, split evenly; the manager's rule decides when it goes in.
    const each = Math.floor(share * 100) / 100;
    for (const p of born) void syncPet(feedPet(p, each, `First contribution: ${usd(each)}.`));
    router.push(`/mandate?key=${born[0].mandate!.key}&hired=1`);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-12 pt-[max(16px,env(safe-area-inset-top))] lg:max-w-[1040px] lg:px-10 lg:pt-8">
      <div className="flex items-center justify-between">
        <Link href={`/m/${m.id}`} className="text-[13px]" style={{ color: 'var(--muted)' }}>‹ {m.name}</Link>
        <ConnectPill />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <ManagerAvatar manager={m} size={56} />
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>New mandate</p>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight lg:text-[34px]" style={{ fontFamily: 'var(--font-display)' }}>Hire {m.name}</h1>
        </div>
      </div>

      <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10">
        <section>
          <h2 className="text-[13px] font-semibold">How much, to start</h2>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {AMOUNTS.map((a) => (
              <button key={a} onClick={() => setAmount(a)} className="rounded-[12px] py-3 text-[15px] font-semibold num"
                style={amount === a ? { background: 'var(--ink)', color: 'var(--canvas)' } : { background: 'var(--surface)', border: '1px solid var(--line)' }}>${a}</button>
            ))}
          </div>

          <h2 className="mt-5 text-[13px] font-semibold">Then</h2>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {([null, 'week', 'fortnight', 'month'] as (Cadence | null)[]).map((c) => (
              <button key={c ?? 'once'} onClick={() => setEvery(c)} className="rounded-[12px] py-2.5 text-[13px] font-semibold"
                style={every === c ? { background: 'var(--ink)', color: 'var(--canvas)' } : { background: 'var(--surface)', border: '1px solid var(--line)' }}>
                {c === null ? 'Just once' : c === 'week' ? 'Weekly' : c === 'fortnight' ? 'Fortnightly' : 'Monthly'}
              </button>
            ))}
          </div>

          <h2 className="mt-5 text-[13px] font-semibold">Stocks</h2>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--muted)' }}>Untick any you do not want {m.name} to touch. Each gets an equal share.</p>
          <ul className="mt-2 grid gap-1.5">
            {!list && <li className="card px-3 py-3 text-[13px]" style={{ color: 'var(--muted)' }}>Pricing {m.name}&rsquo;s stocks{address ? ' for your wallet' : ''}…</li>}
            {list?.map((u) => {
              const on = Boolean(u.stock) && !off.has(u.ticker);
              return (
                <li key={u.ticker}>
                  <button onClick={() => u.stock && toggle(u.ticker)} disabled={!u.stock}
                    className="card flex w-full items-start gap-3 px-3 py-2.5 text-left" style={{ opacity: u.stock ? 1 : 0.5 }}>
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] text-[12px]"
                      style={on ? { background: 'var(--ink)', color: 'var(--canvas)' } : { border: '1.5px solid var(--line)' }}>{on ? '✓' : ''}</span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold">{u.name} <span className="num text-[12px] font-normal" style={{ color: 'var(--muted)' }}>{u.ticker}{u.stock ? ` · ${u.stock.tokenSymbol}` : ''}</span></span>
                      <span className="block text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>{u.reason}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="mt-6 lg:sticky lg:top-8 lg:mt-0">
          <div className="card px-4 py-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>The mandate</h2>
            <p className="mt-2 text-[15px] leading-snug">
              <b>{m.name}</b> invests <b className="num">{usd(amount, 0)}</b>{every ? <> now, then <b className="num">{usd(amount, 0)}</b> {CADENCE_LABEL[every]}</> : ' once'}, across{' '}
              <b>{chosen.length || '…'} stock{chosen.length === 1 ? '' : 's'}</b>{chosen.length > 0 && <> — <span className="num">{usd(share)}</span> each</>}.
            </p>
            <p className="mt-2 text-[13px] leading-snug" style={{ color: 'var(--muted)' }}>{m.rules[0]}</p>
            {tooSmall && (
              <p className="mt-2 text-[12.5px]" style={{ color: 'var(--down)' }}>
                {usd(share)} a stock is too small for a real order — Ondo refuses $5 and under. Raise the amount or untick a stock.
              </p>
            )}

            <div className="mt-3 rounded-[12px] px-3 py-2.5 text-[12.5px] leading-snug" style={{ background: 'var(--canvas)' }}>
              {live ? (
                <>
                  <p><b>Live.</b> Bound to <span className="num">{address!.slice(0, 6)}…{address!.slice(-4)}</span>. Every buy is a real swap you sign — simulated first, exact approval only.</p>
                  <p className="mt-1.5" style={{ color: 'var(--muted)' }}>
                    To let your own Binance <b style={{ color: 'var(--ink)' }}>Agentic Wallet</b> sign instead, set these limits in the Binance App: per-trade cap <span className="num">{usd(Math.max(share, MIN_LIVE_SHARE), 0)}</span>, daily cap <span className="num">{usd(amount, 0)}</span>, tokens <span className="num">USDT, {chosen.map((u) => u.stock!.tokenSymbol).join(', ') || '…'}</span>.
                  </p>
                </>
              ) : (
                <p><b>Paper.</b> No wallet connected, so nothing real moves — the trades are simulated at real prices, and every screen says so. Connect a wallet before hiring to go live.</p>
              )}
            </div>

            <button onClick={hire} disabled={!ready} className="pill mt-4 w-full text-[16px] disabled:opacity-40">
              {busy ? 'Hiring…' : `Hire ${m.name}${live ? '' : ' (paper)'}`}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
