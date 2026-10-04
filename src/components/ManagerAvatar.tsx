import { initials, type Manager } from '@/lib/managers';

// A manager's face. Their portrait once there is one (/public/managers/<id>.png), and until then a
// monogram in their colour — so every screen is finished whichever way the art question goes.

export function ManagerAvatar({ manager, size = 48, ring = false }: { manager: Manager; size?: number; ring?: boolean }) {
  const style = {
    width: size, height: size,
    boxShadow: ring ? `0 0 0 3px var(--surface), 0 0 0 5px ${manager.color}` : undefined,
  } as const;
  if (manager.art) {
    return (
      <img src={manager.art} alt={manager.name} width={size} height={size}
        className="shrink-0 rounded-full object-cover object-top" style={{ ...style, background: 'var(--canvas)' }} draggable={false} />
    );
  }
  return (
    <span aria-label={manager.name} role="img"
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{ ...style, background: manager.color, color: '#fff', fontFamily: 'var(--font-display)', fontSize: Math.round(size * 0.38), letterSpacing: '-0.02em' }}>
      {initials(manager)}
    </span>
  );
}
