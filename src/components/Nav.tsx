'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Pet', icon: '🐾' },
  { href: '/nest', label: 'Nest', icon: '🪺' },
  { href: '/duels', label: 'Board', icon: '🏆' },
  { href: '/diary', label: 'Diary', icon: '📓' },
];

const isActive = (href: string, path: string) => (href === '/' ? path === '/' : path.startsWith(href));

/** The phone's tab bar. At desktop width the sidebar (SideNav) takes its place. */
export function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[430px] justify-around border-t px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 text-[12px] font-semibold lg:hidden"
      style={{ background: 'var(--canvas)', borderColor: 'var(--line)', color: 'var(--muted)' }}>
      {TABS.map((t) => {
        const active = isActive(t.href, path);
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

/**
 * The same four places as a sidebar, for a screen wide enough to keep them in view — mounted once
 * in the root layout, which offsets every page by its width. Hidden on phones.
 */
export function SideNav() {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r px-4 pb-6 pt-7 lg:flex"
      style={{ background: 'var(--canvas)', borderColor: 'var(--line)' }}>
      <Link href="/" className="flex items-center gap-2.5 px-2">
        <img src="/icon.png" alt="" className="h-9 w-9 rounded-[12px]" />
        <span className="text-[26px] font-bold leading-none" style={{ fontFamily: 'var(--font-display)' }}>Roost</span>
      </Link>
      <p className="mt-2 px-2 text-[12.5px] leading-snug" style={{ color: 'var(--muted)' }}>Tokenized stocks, raised like pets, on BNB Chain.</p>

      <nav className="mt-7 grid gap-1">
        {TABS.map((t) => {
          const active = isActive(t.href, path);
          return (
            <Link key={t.href} href={t.href}
              className="flex items-center gap-3 rounded-full px-3 py-2.5 text-[15px] font-semibold transition-colors"
              style={active
                ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'inset 3px 0 0 var(--accent)', border: '1px solid var(--line)' }
                : { color: 'var(--muted)', border: '1px solid transparent' }}>
              <span aria-hidden className="w-6 text-center text-[18px] leading-none">{t.icon}</span>{t.label}
            </Link>
          );
        })}
      </nav>

      <Link href="/adopt" className="pill mt-5 grid h-12 place-items-center text-[16px]">Hatch a Fledgling</Link>
      <Link href="/shelf" className="mt-3 px-3 text-[13px] underline" style={{ color: isActive('/shelf', path) ? 'var(--ink)' : 'var(--muted)' }}>Meet the six Fledglings</Link>

      <p className="mt-auto px-2 text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
        Roost never holds your keys. Every trade is signed in your own wallet, on BNB Smart Chain.
      </p>
    </aside>
  );
}
