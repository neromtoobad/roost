'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Desk', icon: '◧' },
  { href: '/managers', label: 'Managers', icon: '◎' },
  { href: '/league', label: 'League', icon: '▤' },
  { href: '/letters', label: 'Letters', icon: '✉' },
];

const isActive = (href: string, path: string) =>
  href === '/' ? path === '/' || path.startsWith('/mandate') : path.startsWith(href) || (href === '/managers' && (path.startsWith('/m/') || path.startsWith('/hire')));

/** The phone's tab bar. At desktop width the sidebar (SideNav) takes its place. */
export function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[430px] justify-around border-t px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 text-[11.5px] font-semibold lg:hidden"
      style={{ background: 'var(--canvas)', borderColor: 'var(--line)', color: 'var(--muted)' }}>
      {TABS.map((t) => {
        const active = isActive(t.href, path);
        return (
          <Link key={t.href} href={t.href} className="flex flex-col items-center gap-0.5 px-3 py-1"
            style={active ? { color: 'var(--ink)', borderBottom: '2px solid var(--accent)' } : { borderBottom: '2px solid transparent' }}>
            <span aria-hidden className="text-[17px] leading-none">{t.icon}</span>{t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The same places as a sidebar, for a screen wide enough to keep them in view — mounted once in the
 * root layout, which offsets every page by its width. Hidden on phones.
 */
export function SideNav() {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r px-4 pb-6 pt-7 lg:flex"
      style={{ background: 'var(--canvas)', borderColor: 'var(--line)' }}>
      <Link href="/" className="flex items-baseline gap-2 px-2">
        <span className="text-[28px] font-semibold leading-none tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Roost</span>
        <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)', boxShadow: 'var(--glow)' }} aria-hidden />
      </Link>
      <p className="mt-2 px-2 text-[12.5px] leading-snug" style={{ color: 'var(--muted)' }}>AI fund managers for tokenized stocks, on BNB Chain.</p>

      <nav className="mt-7 grid gap-1">
        {TABS.map((t) => {
          const active = isActive(t.href, path);
          return (
            <Link key={t.href} href={t.href}
              className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14.5px] font-medium transition-colors"
              style={active
                ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'inset 3px 0 0 var(--accent)', border: '1px solid var(--line)' }
                : { color: 'var(--muted)', border: '1px solid transparent' }}>
              <span aria-hidden className="w-5 text-center text-[16px] leading-none">{t.icon}</span>{t.label}
            </Link>
          );
        })}
      </nav>

      <Link href="/managers" className="pill mt-5 grid h-11 place-items-center text-[14.5px]">Hire a manager</Link>

      <p className="mt-auto px-2 text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
        Roost never holds your keys. Every trade is simulated first and signed in your own wallet, on BNB Smart Chain.
      </p>
    </aside>
  );
}
