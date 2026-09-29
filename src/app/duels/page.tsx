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
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(12px,env(safe-area-inset-top))]">
      <h1 className="text-center text-[28px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>Board</h1>
      <p className="text-center text-[13px]" style={{ color: 'var(--muted)' }}>
        Ranked by real P&amp;L. Nobody reports their own score.
      </p>

      {pulse && pulse.actions > 0 && (
        <p className="mt-2 text-center text-[12px] num" style={{ color: 'var(--muted)' }}>
          {pulse.actions} moves in the last 24h
          {pulse.afterHours > 0 && <> · <span style={{ color: 'var(--accent)' }}>{pulse.afterHours} while the NYSE was shut</span></>}
        </p>
      )}

      {note && (
        <p className="mt-3 text-center text-[13px]" style={{ color: 'var(--accent)' }} onClick={() => setNote(null)}>{note}</p>
      )}

      {open.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Live duels</h2>
          <div className="grid gap-2">{open.map((d) => <DuelCard key={d.id} duel={d} mine={mine} />)}</div>
        </section>
      )}

      {rows === null && <p className="mt-8 text-center text-[13px] num" style={{ color: 'var(--muted)' }}>loading…</p>}

      {rows?.length === 0 && (
        <div className="card mt-6 px-4 py-6 text-center">
          <img src={petImage(pet?.species ?? 'lurk', 'chill')} alt="" className="mx-auto h-24 w-24 object-contain" />
          <p className="mt-2 text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>Nobody on the board yet.</p>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--muted)' }}>Feed your Fledgling and it&rsquo;ll show up here once it holds something.</p>
        </div>
      )}

      <ul className="mt-4 grid gap-2">
        {rows?.map((r, i) => {
          const isMine = r.id === mine;
          const up = (r.pnlPct ?? 0) >= 0;
          return (
            <li key={r.id} className="card flex items-center gap-3 px-3 py-2.5"
              style={isMine ? { outline: '3px solid var(--accent)' } : undefined}>
              <span className="w-6 shrink-0 text-center text-[14px] font-bold num" style={{ color: 'var(--muted)' }}>{medal(i)}</span>
              <img src={petImage(r.species, up ? 'happy' : 'sulking')} alt="" className="h-11 w-11 shrink-0 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  {r.name}{isMine && <span className="ml-1 text-[11px]" style={{ color: 'var(--accent)' }}>you</span>}
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
                  className="shrink-0 rounded-full px-2.5 py-1.5 text-[14px]"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', opacity: busy ? 0.5 : 1 }}>⚔</button>
              )}
            </li>
          );
        })}
      </ul>

      {rows && rows.length > 0 && (
        <p className="mt-4 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
          Tap ⚔ to put yours up against another for 24 hours. Neither of you gets to trade.
        </p>
      )}

      {duels.some((d) => d.settledAt) && (
        <section className="mt-6">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Settled</h2>
          <div className="grid gap-2">{duels.filter((d) => d.settledAt).map((d) => <DuelCard key={d.id} duel={d} mine={mine} />)}</div>
        </section>
      )}
      <Nav />
    </main>
  );
}
