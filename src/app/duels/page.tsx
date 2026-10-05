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
};

type Pulse = { actions: number; afterHours: number };

export default function Board() {
  const pet = usePet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      <p className="text-center text-[13px] lg:text-left lg:text-[14px]" style={{ color: 'var(--muted)' }}>
        Ranked by real P&amp;L. Nobody reports their own score.
      </p>
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

      {/* Desktop: the table on the left, the duels beside it. */}
      <div className="flex flex-col lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
      {open.length > 0 && (
        <section className="mt-5 lg:order-2 lg:col-start-2 lg:row-start-1 lg:mt-0">
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>Live duels</h2>
          <div className="grid gap-2">{open.map((d) => <DuelCard key={d.id} duel={d} mine={mine} />)}</div>
        </section>
      )}

      <div className="lg:col-start-1 lg:row-span-3 lg:row-start-1">
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
            <span className="text-center">#</span><span /><span>Fledgling</span><span className="text-right">P&amp;L · value</span><span />
          </li>
        )}
        {rows?.map((r, i) => {
          const isMine = r.id === mine;
          const up = (r.pnlPct ?? 0) >= 0;
          return (
            <li key={r.id} className="card flex items-center gap-3 px-3 py-2.5 lg:grid lg:grid-cols-[32px_44px_minmax(0,1fr)_130px_44px] lg:rounded-none lg:border-0 lg:border-t lg:px-4 lg:py-3"
              style={isMine ? { outline: '3px solid var(--accent)', outlineOffset: '-3px' } : undefined}>
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
                <p className="text-[15px] font-bold num" style={{ color: up ? 'var(--up)' : 'var(--down)' }}>
                  {r.pnlPct === null ? '—' : `${up ? '+' : ''}${r.pnlPct.toFixed(2)}%`}
                </p>
                <p className="text-[11.5px] num" style={{ color: 'var(--muted)' }}>
                  {r.value === null ? '' : `$${r.value.toFixed(2)}`}
                </p>
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

      {duels.some((d) => d.settledAt) && (
        <section className="mt-6 lg:order-3 lg:col-start-2 lg:mt-0">
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>Settled</h2>
          <div className="grid gap-2">{duels.filter((d) => d.settledAt).map((d) => <DuelCard key={d.id} duel={d} mine={mine} />)}</div>
        </section>
      )}

      <aside className="card hidden px-5 py-4 text-[13px] lg:order-4 lg:col-start-2 lg:block" style={{ color: 'var(--muted)' }}>
        <p className="text-[12px] font-medium uppercase tracking-[.08em]">How the board works</p>
        <p className="mt-2">Every Fledgling holding shares is ranked by its return on what it paid for them, priced the same way for everyone.</p>
        <p className="mt-2">A duel puts two of them side by side for 24 hours. Neither owner can trade during it, so only the rule and the market decide.</p>
      </aside>
      </div>
      <Nav />
    </main>
  );
}
