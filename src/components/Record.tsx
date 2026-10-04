import type { ManagerRecord } from '@/lib/records';
import { pct, tone, usd } from '@/lib/format';

// A manager's record in two numbers: real money and paper, never added together.

export function RecordLine({ record }: { record: ManagerRecord | null }) {
  if (!record) return <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>Record loading…</p>;
  const { live, paper } = record;
  return (
    <div className="grid grid-cols-2 gap-2 text-[12px]">
      <div className="rounded-[12px] px-3 py-2" style={{ background: 'var(--canvas)' }}>
        <p style={{ color: 'var(--muted)' }}>Live · real money</p>
        {live.positions > 0 && live.returnPct !== null ? (
          <p className="num text-[15px] font-semibold" style={{ color: tone(live.returnPct) }}>{pct(live.returnPct)}<span className="ml-1 text-[11px] font-normal" style={{ color: 'var(--muted)' }}>on {usd(live.basis, 0)}</span></p>
        ) : <p className="text-[13px]" style={{ color: 'var(--muted)' }}>No live trades yet</p>}
      </div>
      <div className="rounded-[12px] px-3 py-2" style={{ background: 'var(--canvas)' }}>
        <p style={{ color: 'var(--muted)' }}>Paper</p>
        {paper.positions > 0 && paper.returnPct !== null ? (
          <p className="num text-[15px] font-semibold" style={{ color: tone(paper.returnPct) }}>{pct(paper.returnPct)}<span className="ml-1 text-[11px] font-normal" style={{ color: 'var(--muted)' }}>on {usd(paper.basis, 0)}</span></p>
        ) : <p className="text-[13px]" style={{ color: 'var(--muted)' }}>—</p>}
      </div>
    </div>
  );
}
