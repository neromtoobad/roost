// A need, the way a game shows one: a coloured ring filling round a 3D icon, on its own tile.
export function Ring({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  const r = 30, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  const low = v < 0.25;
  return (
    <div className="card flex flex-col items-center gap-1 px-2 pb-2.5 pt-3"
      style={{ background: `radial-gradient(90% 70% at 50% 0%, color-mix(in srgb, ${color} 16%, transparent), transparent 70%) padding-box, linear-gradient(180deg, var(--card-top), var(--card-bot)) padding-box, var(--card-edge) border-box` }}>
      <div className="relative h-[68px] w-[68px]">
        <svg viewBox="0 0 68 68" className="h-full w-full -rotate-90">
          <circle cx="34" cy="34" r={r} fill="none" stroke="color-mix(in srgb, var(--ink) 9%, transparent)" strokeWidth="7" />
          <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset .6s ease', filter: `drop-shadow(0 0 6px ${color})` }} />
        </svg>
        <img src={icon} alt="" aria-hidden draggable={false} className={`absolute inset-0 m-auto h-9 w-9 object-contain ${low ? 'animate-pulse' : ''}`} />
      </div>
      <div className="text-[12.5px] font-semibold" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>
        {label} <span className="num" style={{ color: low ? 'var(--down)' : 'var(--ink)' }}>{Math.round(v * 100)}%</span>
      </div>
    </div>
  );
}
