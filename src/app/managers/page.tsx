'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { ManagerAvatar } from '@/components/ManagerAvatar';
import { MANAGERS, type Manager } from '@/lib/managers';
import type { ManagerRecord } from '@/lib/records';
import { RecordLine } from '@/components/Record';

// The lineup. Six managers, each with one written rule and a public record — computed from what they
// actually did for every client, live and paper counted apart.

type WithRecord = Manager & { record: ManagerRecord | null };

export default function Managers() {
  const [list, setList] = useState<WithRecord[]>(MANAGERS.map((m) => ({ ...m, record: null })));
  useEffect(() => {
    let alive = true;
    fetch('/api/managers').then((r) => (r.ok ? r.json() : null))
      .then((j: { managers?: WithRecord[] } | null) => { if (alive && j?.managers) setList(j.managers); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(16px,env(safe-area-inset-top))] lg:max-w-[1120px] lg:px-10 lg:pb-12 lg:pt-10">
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>The managers</p>
      <h1 className="mt-1 text-[34px] font-semibold leading-[1.05] tracking-tight lg:text-[44px]" style={{ fontFamily: 'var(--font-display)' }}>
        Hire someone who never sleeps.
      </h1>
      <p className="mt-2 max-w-[640px] text-[14.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
        Six AI fund managers for tokenized US stocks on BNB Chain. Each trades by one written rule, around the clock, inside the limits you set — and every trade is signed in your own wallet. Their records are public and computed, not claimed.
      </p>

      <ul className="mt-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {list.map((m) => (
          <li key={m.id}>
            <Link href={`/m/${m.id}`} className="card flex h-full flex-col gap-3 px-4 py-4 transition-transform active:scale-[0.99]">
              <div className="flex items-center gap-3">
                <ManagerAvatar manager={m} size={56} />
                <div className="min-w-0">
                  <p className="text-[21px] font-semibold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{m.name}</p>
                  <p className="text-[13px]" style={{ color: 'var(--muted)' }}>{m.title}</p>
                </div>
                <span className="ml-auto shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>{m.hours}</span>
              </div>
              <p className="text-[14px] leading-snug">{m.tagline}</p>
              <p className="num text-[11.5px]" style={{ color: 'var(--muted)' }}>{m.universe.map((u) => u.ticker).join(' · ')}</p>
              <RecordLine record={m.record} />
              <p className="mt-auto text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>Meet {m.name} →</p>
            </Link>
          </li>
        ))}
      </ul>
      <Nav />
    </main>
  );
}
