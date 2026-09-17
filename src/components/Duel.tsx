'use client';
import { petImage, type Species } from '@/lib/pets';
import { useNow } from '@/lib/client';

export type Duel = {
  id: string; a: string; b: string; startedAt: number; endsAt: number;
  aName: string; bName: string; aSpecies: Species['id']; bSpecies: Species['id'];
  aValue: number; bValue: number; aNow: number | null; bNow: number | null;
  winner: string | null; settledAt: number | null;
};

const pct = (now: number | null, start: number) => (now === null || start <= 0 ? null : ((now - start) / start) * 100);

function left(ms: number) {
  if (ms <= 0) return 'at the bell';
  const h = Math.floor(ms / 3600e3);
  return h >= 1 ? `${h}h left` : `${Math.max(1, Math.round(ms / 60e3))}m left`;
}

/** One duel, both sides, with the live gap between them. */
export function DuelCard({ duel, mine }: { duel: Duel; mine: string | null }) {
  const now = useNow(60_000); // 0 until hydration, so the server and the first paint agree
  const a = pct(duel.aNow, duel.aValue);
  const b = pct(duel.bNow, duel.bValue);
  const settled = duel.settledAt !== null;
  const ahead = a === null || b === null ? null : a > b ? duel.a : b > a ? duel.b : null;

  const side = (id: string, name: string, species: Species['id'], move: number | null, align: 'left' | 'right') => {
    const isMine = id === mine;
    const winning = settled ? duel.winner === id : ahead === id;
    return (
      <div className={`flex min-w-0 flex-1 items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
        <img src={petImage(species, (move ?? 0) >= 0 ? 'happy' : 'sulking')} alt="" className="h-10 w-10 shrink-0 object-contain"
          style={{ opacity: settled && !winning ? 0.5 : 1 }} />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            {name}{isMine && <span className="ml-1 text-[10px]" style={{ color: 'var(--accent)' }}>you</span>}
          </p>
          <p className="text-[12px] font-bold num" style={{ color: move === null ? 'var(--muted)' : move >= 0 ? 'var(--up)' : 'var(--down)' }}>
            {move === null ? '—' : `${move >= 0 ? '+' : ''}${move.toFixed(2)}%`}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="card flex items-center gap-2 px-3 py-2.5"
      style={duel.winner && duel.winner === mine ? { outline: '3px solid var(--accent)' } : undefined}>
      {side(duel.a, duel.aName, duel.aSpecies, a, 'left')}
      <div className="shrink-0 px-1 text-center">
        <p className="text-[15px] leading-none">⚔</p>
        <p className="mt-1 text-[10.5px] num" style={{ color: 'var(--muted)' }}>
          {settled
            ? duel.winner === null ? 'dead heat' : `${duel.winner === duel.a ? duel.aName : duel.bName} took it`
            : now ? left(duel.endsAt - now) : 'live'}
        </p>
      </div>
      {side(duel.b, duel.bName, duel.bSpecies, b, 'right')}
    </div>
  );
}
