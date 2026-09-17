'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Pet', icon: '🐾' },
  { href: '/shelf', label: 'Shelf', icon: '🧸' },
  { href: '/duels', label: 'Board', icon: '🏆' },
  { href: '/diary', label: 'Diary', icon: '📓' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[430px] justify-around border-t px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 text-[12px] font-semibold"
      style={{ background: 'var(--canvas)', borderColor: 'var(--line)', color: 'var(--muted)' }}>
      {TABS.map((t) => {
        const active = t.href === '/' ? path === '/' : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className="flex flex-col items-center gap-0.5 px-3 py-1"
            style={active ? { color: 'var(--ink)', borderBottom: '3px solid var(--accent)' } : { borderBottom: '3px solid transparent' }}>
            <span aria-hidden className="text-[18px] leading-none">{t.icon}</span>{t.label}
          </Link>
        );
      })}
    </nav>
  );
}
