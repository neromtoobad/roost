'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { ManagerAvatar } from '@/components/ManagerAvatar';
import { MANAGERS, type Manager } from '@/lib/managers';
import type { Book, ManagerRecord } from '@/lib/records';
import { ago, pct, tone, usd } from '@/lib/format';

// The managers against each other, on what they actually did. Ranked by real money first — a
// manager with a live record outranks any paper one — then by paper. Nothing here is self-reported:
// lib/records values every client's positions at the live print.

type Row = Manager & { record: ManagerRecord | null };

const score = (r: ManagerRecord | null) =>
  r?.live.positions && r.live.returnPct !== null ? 1e6 + r.live.returnPct
    : r?.paper.positions && r.paper.returnPct !== null ? r.paper.returnPct
    : -1e6;

function Cell({ b }: { b: Book | undefined }) {
  if (!b || !b.positions || b.returnPct === null) return <span style={{ color: 'var(--muted)' }}>—</span>;
  return (
    <span className="num">
      <span className="font-semibold" style={{ color: tone(b.returnPct) }}>{pct(b.returnPct)}</span>
      <span className="ml-1 text-[11px]" style={{ color: 'var(--muted)' }}>{usd(b.basis, 0)}</span>
    </span>
  );
}

export default function League() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/managers').then((r) => (r.ok ? r.json() : null))
      .then((j: { managers?: Row[] } | null) => { if (alive) setRows(j?.managers ?? MANAGERS.map((m) => ({ ...m, record: null }))); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const ranked = rows ? [...rows].sort((a, b) => score(b.record) - score(a.record)) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(16px,env(safe-area-inset-top))] lg:max-w-[980px] lg:px-10 lg:pb-12 lg:pt-10">
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>League</p>
      <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight lg:text-[44px]" style={{ fontFamily: 'var(--font-display)' }}>Who is actually good</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed" style={{ color: 'var(--muted)' }}>
        Every client&rsquo;s positions, valued at the live price. Real money ranks above paper; the two are never added together. On-chain trades are ones with a BSC transaction you can open.
      </p>

      <div className="card mt-5 overflow-hidden">
        <div className="hidden grid-cols-[32px_minmax(0,1.6fr)_1fr_1fr_0.8fr_0.8fr] gap-3 border-b px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] lg:grid" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
          <span>#</span><span>Manager</span><span>Live</span><span>Paper</span><span>Clients</span><span>On BSC</span>
        </div>
        {!ranked && <p className="px-4 py-4 text-[13px]" style={{ color: 'var(--muted)' }}>Loading the records…</p>}
        <ul>
          {ranked?.map((m, i) => {
            const r = m.record;
            return (
              <li key={m.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--line)' }}>
                <Link href={`/m/${m.id}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 px-4 py-3 lg:grid-cols-[32px_minmax(0,1.6fr)_1fr_1fr_0.8fr_0.8fr] lg:items-center">
                  <span className="num pt-1 text-[14px] font-semibold" style={{ color: 'var(--muted)' }}>{i + 1}</span>
                  <span className="flex min-w-0 items-center gap-3">
                    <ManagerAvatar manager={m} size={40} />
                    <span className="min-w-0">
                      <span className="block text-[16px] font-semibold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{m.name}</span>
                      <span className="block truncate text-[12px]" style={{ color: 'var(--muted)' }}>{m.title}</span>
                    </span>
                  </span>
                  {/* On a phone the numbers sit under the name; on a desk they get columns. */}
                  <span className="col-start-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] lg:contents">
                    <span><span className="lg:hidden" style={{ color: 'var(--muted)' }}>Live </span><Cell b={r?.live} /></span>
                    <span><span className="lg:hidden" style={{ color: 'var(--muted)' }}>Paper </span><Cell b={r?.paper} /></span>
                    <span className="num"><span className="lg:hidden" style={{ color: 'var(--muted)' }}>Clients </span>{r?.clients ?? '—'}</span>
                    <span className="num"><span className="lg:hidden" style={{ color: 'var(--muted)' }}>On BSC </span>{r ? r.onchainTrades : '—'}{r?.lastTradeAt ? <span className="ml-1 text-[11px]" style={{ color: 'var(--muted)' }}>{ago(r.lastTradeAt)}</span> : null}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <Nav />
    </main>
  );
}
