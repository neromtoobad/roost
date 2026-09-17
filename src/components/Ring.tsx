// One of exactly three gauges on the home screen. 72px, 8px stroke, accent on line.
export function Ring({ label, value, icon }: { label: string; value: number; icon: string }) {
  const r = 32, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-[72px] w-[72px]">
        <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
          <circle cx="36" cy="36" r={r} fill="none" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset .6s ease', filter: 'drop-shadow(var(--glow))' }} />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-xl" aria-hidden>{icon}</div>
      </div>
      <div className="text-[13px] font-semibold" style={{ color: 'var(--muted)' }}>{label} <span className="num" style={{ color: 'var(--ink)' }}>{Math.round(v * 100)}%</span></div>
    </div>
  );
}
