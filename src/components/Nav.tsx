'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useMarketSession, useNow } from '@/lib/client';
import { sessionLabel } from '@/lib/session';
import { ConnectPill } from './Wallet';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const Icon = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden {...stroke}>{children}</svg>;

const ICONS = {
  pet: <Icon><circle cx="5.5" cy="10" r="2" /><circle cx="9.5" cy="5.5" r="2" /><circle cx="14.5" cy="5.5" r="2" /><circle cx="18.5" cy="10" r="2" /><path d="M12 11c-3 0-6 4.5-6 7a2.5 2.5 0 0 0 3.2 2.4c1-.3 1.9-.4 2.8-.4s1.8.1 2.8.4A2.5 2.5 0 0 0 18 18c0-2.5-3-7-6-7z" /></Icon>,
  nest: <Icon><path d="M12 3c-2.2 0-3.6 3.4-3.6 5.6a3.6 3.6 0 0 0 7.2 0C15.6 6.4 14.2 3 12 3z" /><path d="M3 13h18c0 4.4-4 8-9 8s-9-3.6-9-8z" /></Icon>,
  board: <Icon><path d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path d="M16 6h3a3 3 0 0 1-3 3M8 6H5a3 3 0 0 0 3 3" /><path d="M12 13v4M9 21h6M10 17h4" /></Icon>,
  diary: <Icon><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4z" /><path d="M5 18a2 2 0 0 1 2-2h11" /><path d="M9 8h5" /></Icon>,
};

const TABS = [
  { href: '/', label: 'Pet', icon: ICONS.pet },
  { href: '/nest', label: 'Nest', icon: ICONS.nest },
  { href: '/duels', label: 'Board', icon: ICONS.board },
  { href: '/diary', label: 'Diary', icon: ICONS.diary },
];

const isActive = (href: string, path: string) => (href === '/' ? path === '/' : path.startsWith(href));

/** Keeps <html data-session> on the NYSE clock on every screen, not only the one that computed it. */
export function SessionTheme() {
  const { night } = useMarketSession();
  useEffect(() => { document.documentElement.dataset.session = night ? 'night' : 'day'; }, [night]);
  return null;
}

/** Where the market is right now: green while it trades, yellow at the edges, grey while it sleeps. */
export function SessionBadge({ className = '' }: { className?: string }) {
  const now = useNow();
  const { session } = useMarketSession();
  // The server rendered no clock; say nothing until the browser has one.
  if (!now) return <span className={`h-[30px] ${className}`} />;
  const dot = session === 'regular' ? 'var(--up)' : session === 'pre' || session === 'post' ? 'var(--accent)' : 'var(--muted)';
  return (
    <span className={`inline-flex items-center gap-2 truncate rounded-full border px-3 py-1.5 text-[12px] num ${className}`}
      style={{ borderColor: 'var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot, boxShadow: session === 'regular' ? '0 0 0 3px color-mix(in srgb, var(--up) 25%, transparent)' : 'none' }} aria-hidden />
      {sessionLabel[session]}
    </span>
  );
}

/** The phone's tab bar. At desktop width the top bar (TopBar) takes its place. */
export function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[430px] justify-around border-t px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 text-[11.5px] font-medium lg:hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--muted)' }}>
      {TABS.map((t) => {
        const active = isActive(t.href, path);
        return (
          <Link key={t.href} href={t.href} className="flex flex-col items-center gap-1 px-3 py-1" style={active ? { color: 'var(--ink)' } : undefined}>
            <span style={active ? { color: 'var(--accent-ink)' } : undefined}>{t.icon}</span>{t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Desktop: one bar across the top, the way an exchange lays itself out — places on the left, the
 * market clock, hatching and the wallet on the right. Mounted once in the root layout. Hidden on phones.
 */
export function TopBar() {
  const path = usePathname();
  const links = [...TABS, { href: '/shelf', label: 'Fledglings' }];
  return (
    <header className="sticky top-0 z-30 hidden border-b lg:block"
      style={{ background: 'color-mix(in srgb, var(--surface) 90%, transparent)', borderColor: 'var(--line)', backdropFilter: 'saturate(1.4) blur(12px)', WebkitBackdropFilter: 'saturate(1.4) blur(12px)' }}>
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-10 px-10">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-[9px]" />
          <span className="text-[20px] font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Roost</span>
        </Link>
        <nav className="flex h-full items-stretch gap-7">
          {links.map((t) => {
            const active = isActive(t.href, path);
            return (
              <Link key={t.href} href={t.href} className="relative flex items-center text-[14.5px] font-medium transition-colors hover:text-[var(--ink)]"
                style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}>
                {t.label}
                {active && <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-t" style={{ background: 'var(--accent)' }} aria-hidden />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <SessionBadge className="xl:inline-flex max-xl:hidden" />
          <Link href="/adopt" className="pill grid h-10 place-items-center px-5 text-[14px]">Hatch a Fledgling</Link>
          <ConnectPill />
        </div>
      </div>
    </header>
  );
}

/** Desktop only: the promise, said once at the bottom of every page. */
export function Footer() {
  return (
    <footer className="hidden border-t lg:block" style={{ borderColor: 'var(--line)' }}>
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-10 py-6 text-[12.5px]" style={{ color: 'var(--muted)' }}>
        <span>Roost never holds your keys. Every trade is signed in your own wallet, on BNB Smart Chain.</span>
        <span className="shrink-0">Tokenized stocks, raised like pets.</span>
      </div>
    </footer>
  );
}
