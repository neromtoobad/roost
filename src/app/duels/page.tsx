'use client';
import { useEffect, useState } from 'react';
import { Nav } from '@/components/Nav';
import { PERSONALITIES, usePet, type Personality } from '@/lib/store';
import { petImage, type Species } from '@/lib/pets';
import { challengeRival } from '@/lib/sync';
import { DuelCard, type Duel } from '@/components/Duel';

type Row = {
  id: string; name: string; species: Species['id']; ticker: string; personality: Personality;
  streak: number; paper: boolean; isPublic: boolean;
  qty: number; basis: number; value: number | null; price: number | null;
  pnlAbs: number | null; pnlPct: number | null; lentQty: number;
  pct24h: number | null; dayAbs: number | null; growth: { stage: string; points: number };
};

type Tab = 'today' | 'all' | 'care';
const TABS: { id: Tab; label: string; blurb: string; head: string }[] = [
  { id: 'today', label: 'Today', blurb: 'How what each one holds moved in the last 24 hours.', head: '24h · move' },
  { id: 'all', label: 'All time', blurb: 'Ranked by real P&L. Nobody reports their own score.', head: 'P&L · value' },
  { id: 'care', label: 'Care', blurb: 'Ranked by care — days visited, pets given, feeding days kept. Never by money.', head: 'Stage · care' },
];
const by: Record<Tab, (a: Row, b: Row) => number> = {
  today: (a, b) => (b.pct24h ?? -Infinity) - (a.pct24h ?? -Infinity),
  all: (a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity),
  care: (a, b) => b.growth.points - a.growth.points || b.streak - a.streak,
};

type Pulse = { actions: number; afterHours: number };

export default function Board() {
  const pet = usePet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  // Which row is yours: the pet on screen, once it has synced.
  const mine = pet?.remoteId ?? null;

  const load = () => Promise.all([
    fetch('/api/leaderboard').then((r) => r.json()),
    fetch('/api/duel').then((r) => r.json()),
  ]);

  useEffect(() => {
    let alive = true;
    load().then(([b, d]: [{ rows: Row[]; pulse: Pulse | null }, { duels: Duel[] }]) => {
      if (!alive) return;
      setRows(b.rows ?? []);
      setPulse(b.pulse ?? null);
      setDuels(d.duels ?? []);
    }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);

  const open = duels.filter((d) => !d.settledAt);
  // The duel of the day: the closest race still running.
  const gap = (d: Duel) => {
    const a = d.aNow !== null && d.aValue > 0 ? (d.aNow - d.aValue) / d.aValue : null;
    const b = d.bNow !== null && d.bValue > 0 ? (d.bNow - d.bValue) / d.bValue : null;
    return a === null || b === null ? Infinity : Math.abs(a - b);
  };
  const spotlight = open.length ? open.reduce((x, y) => (gap(y) < gap(x) ? y : x)) : null;
  const sorted = rows ? [...rows].sort(by[tab]) : null;
  const t = TABS.find((x) => x.id === tab)!;
  const busyIds = new Set(open.flatMap((d) => [d.a, d.b]));

  async function onChallenge(rivalId: string) {
    setBusy(true);
    const res = await challengeRival(rivalId);
    setNote(res.ok ? 'Duel on. 24 hours.' : res.reason === 'not-owner' ? 'That is not your Fledgling.' : res.reason ?? 'Could not start it.');
    if (res.ok) {
      const [b, d] = await load();
      setRows(b.rows ?? []); setPulse(b.pulse ?? null); setDuels(d.duels ?? []);
    }
    setBusy(false);
  }

  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(12px,env(safe-area-inset-top))] lg:h-full lg:min-h-0 lg:max-w-[1200px] lg:px-10 lg:pb-6 lg:pt-6">
      <div className="lg:flex lg:items-end lg:justify-between lg:gap-6">
      <div>
      <h1 className="text-center text-[28px] font-bold lg:text-left lg:text-[36px]" style={{ fontFamily: 'var(--font-display)' }}>Board</h1>
      <p className="text-center text-[13px] lg:text-left lg:text-[14px]" style={{ color: 'var(--muted)' }}>{t.blurb}</p>
      <div className="mx-auto mt-3 grid w-full max-w-[340px] grid-cols-3 rounded-full p-1 text-[13px] font-semibold lg:mx-0" style={{ background: 'var(--surface-2)' }} role="tablist" aria-label="Rank by">
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} className="rounded-full py-1.5 transition-colors"
            style={tab === x.id ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(0,0,0,.2)' } : { color: 'var(--muted)' }}>{x.label}</button>
        ))}
      </div>
      </div>

      {pulse && pulse.actions > 0 && (
        <p className="mt-2 text-center text-[12px] num lg:text-right" style={{ color: 'var(--muted)' }}>
          {pulse.actions} moves in the last 24h
          {pulse.afterHours > 0 && <> · <span style={{ color: 'var(--accent-ink)' }}>{pulse.afterHours} while the NYSE was shut</span></>}
        </p>
      )}
      </div>

      {note && (
        <p className="mt-3 text-center text-[13px]" style={{ color: 'var(--accent-ink)' }} onClick={() => setNote(null)}>{note}</p>
      )}

      {/* Desktop: the table on the left and the duels beside it, each scrolling on its own so the
          page stays one screen. On a phone the duels come first, the table, then what has settled. */}
      <div className="flex flex-col lg:mt-5 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
      <div className="order-2 lg:col-start-1 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
      {rows === null && <p className="mt-8 text-center text-[13px] num" style={{ color: 'var(--muted)' }}>loading…</p>}

      {rows?.length === 0 && (
        <div className="card mt-6 px-4 py-6 text-center">
          <img src={petImage(pet?.species ?? 'lurk', 'chill')} alt="" className="mx-auto h-24 w-24 object-contain" />
          <p className="mt-2 text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>Nobody on the board yet.</p>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--muted)' }}>Feed your Fledgling and it&rsquo;ll show up here once it holds something.</p>
        </div>
      )}

      <ul className="mt-4 grid gap-2 empty:hidden lg:mt-0 lg:gap-0 lg:overflow-hidden lg:rounded-[var(--radius-card)] lg:border lg:border-[var(--line)] lg:bg-[var(--surface)]">
        {rows && rows.length > 0 && (
          <li className="hidden px-4 py-2.5 text-[12px] lg:grid lg:grid-cols-[32px_44px_minmax(0,1fr)_130px_44px] lg:items-center lg:gap-3" style={{ color: 'var(--muted)', background: 'var(--surface-2)' }}>
            <span className="text-center">#</span><span /><span>Fledgling</span><span className="text-right">{t.head}</span><span />
          </li>
        )}
        {sorted?.map((r, i) => {
          const isMine = r.id === mine;
          const move = tab === 'today' ? r.pct24h : r.pnlPct;
          const up = (move ?? 0) >= 0;
          return (
            <li key={r.id} className="card flex items-center gap-3 px-3 py-2.5 lg:grid lg:grid-cols-[32px_44px_minmax(0,1fr)_130px_44px] lg:rounded-none lg:border-0 lg:border-t lg:px-4 lg:py-3"
              style={isMine ? { boxShadow: 'inset 3px 0 0 var(--accent)', background: 'color-mix(in srgb, var(--accent) 9%, var(--surface))' } : undefined}>
              <span className="w-6 shrink-0 text-center text-[14px] font-bold num" style={{ color: 'var(--muted)' }}>{medal(i)}</span>
              <img src={petImage(r.species, up ? 'happy' : 'sulking')} alt="" className="h-11 w-11 shrink-0 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  {r.name}{isMine && <span className="ml-1 text-[11px]" style={{ color: 'var(--accent-ink)' }}>you</span>}
                </p>
                <p className="text-[11.5px] num" style={{ color: 'var(--muted)' }}>
                  {PERSONALITIES[r.personality]?.icon} {r.ticker} · day {r.streak}
                  {r.lentQty > 0 && ' · lending'}{r.isPublic && ' · public'}{r.paper && ' · paper'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {tab === 'care' ? (
                  <>
                    <p className="text-[14px] font-bold" style={{ color: 'var(--accent-ink)' }}>{r.growth.stage}</p>
                    <p className="text-[11.5px] num" style={{ color: 'var(--muted)' }}>{r.growth.points} care · day {r.streak}</p>
                  </>
                ) : (
                  <>
                    <p className="text-[15px] font-bold num" style={{ color: move === null ? 'var(--muted)' : up ? 'var(--up)' : 'var(--down)' }}>
                      {move === null ? '—' : `${up ? '+' : ''}${move.toFixed(2)}%`}
                    </p>
                    <p className="text-[11.5px] num" style={{ color: 'var(--muted)' }}>
                      {tab === 'today'
                        ? r.dayAbs === null ? '' : `${r.dayAbs >= 0 ? '+' : '−'}$${Math.abs(r.dayAbs).toFixed(2)} today`
                        : r.value === null ? '' : `$${r.value.toFixed(2)}`}
                    </p>
                  </>
                )}
              </div>
              {!isMine && mine && !busyIds.has(r.id) && !busyIds.has(mine) && (
                <button onClick={() => onChallenge(r.id)} disabled={busy} aria-label={`Challenge ${r.name}`}
                  className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[14px]"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', opacity: busy ? 0.5 : 1 }}>⚔</button>
              )}
            </li>
          );
        })}
      </ul>

      {rows && rows.length > 0 && (
        <p className="mt-4 text-center text-[12px] lg:text-left" style={{ color: 'var(--muted)' }}>
          Tap ⚔ to put yours up against another for 24 hours. Neither of you gets to trade.
        </p>
      )}
      </div>

      <div className="contents lg:col-start-2 lg:row-start-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-5 lg:overflow-y-auto lg:pr-1">
      {spotlight && (
        <section className="order-1 mt-5 lg:mt-0">
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[.08em]" style={{ color: 'var(--accent-ink)' }}>Duel of the day · closest race</h2>
          <DuelCard duel={spotlight} mine={mine} featured />
        </section>
      )}
      {open.length > 1 && (
        <section className="order-1 mt-5 lg:mt-0">
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>Live duels</h2>
          <div className="grid gap-2">{open.filter((d) => d !== spotlight).map((d) => <DuelCard key={d.id} duel={d} mine={mine} />)}</div>
        </section>
      )}
      {duels.some((d) => d.settledAt) && (
        <section className="order-3 mt-6 lg:mt-0">
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>Settled</h2>
          <div className="grid gap-2">{duels.filter((d) => d.settledAt).map((d) => <DuelCard key={d.id} duel={d} mine={mine} />)}</div>
        </section>
      )}

      <aside className="card order-4 hidden px-5 py-4 text-[13px] lg:block" style={{ color: 'var(--muted)' }}>
        <p className="text-[12px] font-medium uppercase tracking-[.08em]">How the board works</p>
        <p className="mt-2"><b style={{ color: 'var(--ink)' }}>Today</b> ranks the last 24 hours&rsquo; move on what each one holds. <b style={{ color: 'var(--ink)' }}>All time</b> ranks its return on what it paid. <b style={{ color: 'var(--ink)' }}>Care</b> ranks days visited, pets given and feeding days kept. Everyone is priced the same way.</p>
        <p className="mt-2">A duel puts two of them side by side for 24 hours. Neither owner can trade during it, so only the rule and the market decide.</p>
      </aside>
      </div>
      </div>
      <Nav />
    </main>
  );
}
