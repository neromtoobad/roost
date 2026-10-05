'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { Foil } from '@/components/Foil';
import { petImage } from '@/lib/pets';
import { Pet } from '@/components/Pet';
import { HUE, LITTER_LOOK } from '@/lib/look';
import { WIDE, useMedia } from '@/lib/client';
import { litterById } from '@/lib/litters';
import { costBasis, heldQty, isPaper, setCurrentPet, stockOf, usePets, type PetState } from '@/lib/store';
import { useTickAll } from '@/lib/tickall';
import { stage } from '@/lib/care';

// Every Fledgling on this device as one portfolio: what each holds, what it is worth at the print,
// what it cost, and what has been taken off the table. Live and paper are counted apart — adding a
// paper pet's gains to real money would be the one number on this screen that lies.

type Priced = Record<string, number | null>;

export default function Nest() {
  const router = useRouter();
  const { pets, current } = usePets();
  // Every pet up to the hour before the portfolio is totalled.
  useTickAll(pets);
  const [prices, setPrices] = useState<Priced>({});
  const wide = useMedia(WIDE);

  const addresses = [...new Set(pets.map((p) => stockOf(p).address.toLowerCase()))];
  const key = addresses.join(',');
  useEffect(() => {
    if (!key) return;
    let alive = true;
    // One call for the whole nest, however many pets — a litter alone is seven.
    fetch(`/api/prices?tokens=${key}`).then((r) => (r.ok ? r.json() : null))
      .then((j: { prices?: Priced } | null) => { if (alive && j?.prices) setPrices(j.prices); })
      .catch(() => {});
    return () => { alive = false; };
  }, [key]);

  const row = (p: PetState) => {
    const px = prices[stockOf(p).address.toLowerCase()] ?? null;
    const qty = heldQty(p), basis = costBasis(p), value = px != null ? qty * px : null;
    return { qty, basis, value, pnl: value != null ? value - basis : null, realized: p.realized ?? 0, cash: p.cash };
  };
  const total = (paper: boolean) => pets.filter((p) => isPaper(p) === paper).map(row).reduce(
    (t, r) => ({ value: t.value + (r.value ?? 0), basis: t.basis + r.basis, realized: t.realized + r.realized, cash: t.cash + r.cash, n: t.n + 1 }),
    { value: 0, basis: 0, realized: 0, cash: 0, n: 0 },
  );
  const live = total(false), paper = total(true);

  const open = (p: PetState) => { if (p.uid) setCurrentPet(p.uid); router.push('/'); };

  const byLitter = new Map<string, PetState[]>();
  for (const p of pets) if (p.litter) byLitter.set(p.litter.key, [...(byLitter.get(p.litter.key) ?? []), p]);
  const litters = [...byLitter];
  const singles = pets.filter((p) => !p.litter);
  // The foil goes to the one cared for most — growth points, never returns — and leads the grid.
  const grown = (p: PetState) => stage(p.care, p.schedule).points;
  const star = singles.length > 1 ? singles.reduce((a, b) => (grown(b) > grown(a) ? b : a)) : null;
  const shelf = star ? [star, ...singles.filter((p) => p !== star)] : singles;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(12px,env(safe-area-inset-top))] lg:h-full lg:min-h-0 lg:max-w-[1200px] lg:px-10 lg:pb-6 lg:pt-6">
      <h1 className="text-center text-[32px] font-extrabold tracking-[-0.03em] lg:text-left lg:text-[40px]" style={{ fontFamily: 'var(--font-display)' }}>Your <span className="text-gold">nest</span></h1>
      <p className="text-center text-[13px] lg:text-left lg:text-[14px]" style={{ color: 'var(--muted)' }}>
        {pets.length ? `${pets.length} Fledgling${pets.length === 1 ? '' : 's'}, one portfolio.` : 'No Fledglings yet.'}
      </p>

      {/* Desktop: the totals and the way to hatch stay put on the left; the pets fill the right. */}
      <div className="lg:mt-5 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8">
      <aside className="lg:self-start">
      {[{ label: 'Real money', t: live }, { label: 'Paper', t: paper }].filter((x) => x.t.n > 0).map(({ label, t }) => {
        const pnl = t.value - t.basis;
        return (
          <div key={label} className="card mt-4 px-4 py-3 lg:mt-0 lg:mb-3 lg:px-5 lg:py-4">
            <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{label} · {t.n} {t.n === 1 ? 'buddy' : 'buddies'}</p>
            <p className="text-[30px] font-extrabold leading-tight tracking-[-0.02em]" style={{ fontFamily: 'var(--font-display)' }}>${t.value.toFixed(2)}</p>
            <p className="num text-[12.5px]" style={{ color: 'var(--muted)' }}>
              cost <span style={{ color: 'var(--ink)' }}>${t.basis.toFixed(2)}</span>
              {t.basis > 0 && <> · <span style={{ color: pnl >= 0 ? 'var(--up)' : 'var(--down)' }}>{pnl >= 0 ? '+' : '−'}${Math.abs(pnl).toFixed(2)}</span></>}
              {t.realized !== 0 && <> · <span style={{ color: t.realized >= 0 ? 'var(--up)' : 'var(--down)' }}>{t.realized >= 0 ? '+' : '−'}${Math.abs(t.realized).toFixed(2)} realized</span></>}
              {t.cash > 0 && <> · ${t.cash.toFixed(0)} waiting to be spent</>}
            </p>
          </div>
        );
      })}

      <Link href="/adopt" className="pill mt-1 hidden w-full place-items-center text-[16px] lg:grid">Hatch another</Link>
      <Link href="/shelf" className="mt-3 hidden text-center text-[13px] underline lg:block" style={{ color: 'var(--muted)' }}>Meet the six Fledglings</Link>
      </aside>

      <div className="lg:min-h-0 lg:overflow-y-auto lg:pr-1">
      {/* Litters first, each as one card: hatched together, fed together. */}
      {litters.length > 0 && <p className="mt-6 mb-1 hidden text-[11.5px] font-medium uppercase tracking-[.08em] lg:mt-0 lg:block" style={{ color: 'var(--muted)' }}>Litters</p>}
      <div className="lg:grid lg:grid-cols-2 lg:gap-3">
      {litters.map(([k, pups]) => {
        const l = pups[0].litter!;
        const v = pups.map(row).reduce((t, r) => ({ value: t.value + (r.value ?? 0) + r.cash, basis: t.basis + r.basis }), { value: 0, basis: 0 });
        return (
          <Link key={k} href={`/litter?key=${k}`} className="card mt-4 block px-3 py-2.5 lg:mt-0 lg:px-4 lg:py-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                {LITTER_LOOK[l.id] ? <img src={LITTER_LOOK[l.id].icon} alt="" className="mr-1 inline h-6 w-6 object-contain align-[-5px]" /> : litterById(l.id)?.icon} {l.name} <span className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>· {pups.length} pups · {isPaper(pups[0]) ? 'paper' : 'live'}</span>
              </p>
              <p className="num shrink-0 text-[15px] font-bold">${v.value.toFixed(2)}</p>
            </div>
            <div className="mt-1.5 flex -space-x-2">
              {pups.map((p) => (
                <img key={p.uid} src={petImage(p.species, 'hero')} alt={p.name} title={`${p.name} · ${stockOf(p).ticker}`}
                  className="h-9 w-9 rounded-full border-2 object-cover object-top" style={{ background: `color-mix(in srgb, ${HUE[p.species].main} 40%, var(--surface))`, borderColor: 'var(--surface)' }} />
              ))}
            </div>
            <p className="mt-1 text-[11.5px]" style={{ color: 'var(--muted)' }}>{pups.map((p) => stockOf(p).ticker).join(' · ')} — feed them as one ›</p>
          </Link>
        );
      })}

      </div>

      {singles.length > 0 && <p className="mb-1 hidden text-[11.5px] font-medium uppercase tracking-[.08em] lg:mt-6 lg:block" style={{ color: 'var(--muted)' }}>Fledglings</p>}
      <ul className="mt-4 grid grid-cols-2 gap-3 lg:mt-0 lg:grid-cols-3">
        {shelf.map((p) => {
          const s = stockOf(p), r = row(p), on = p.uid === current, top = p === star, g = stage(p.care, p.schedule);
          const chip = { background: 'color-mix(in srgb, var(--surface) 72%, transparent)', border: '1px solid var(--line)' };
          const body = (
            <>
              {/* The collectible: the creature on its habitat base, in its own light; level and age in the corners. */}
              <div className={`relative overflow-hidden ${top ? 'min-h-60 flex-1' : 'h-40 lg:h-44'}`}
                style={{ background: `radial-gradient(70% 55% at 50% 78%, color-mix(in srgb, ${HUE[p.species].main} 38%, transparent), transparent 75%), linear-gradient(180deg, var(--stage-top), var(--stage-bot))` }}>
                {top && <div className="stage-rays" aria-hidden />}
                <span className="absolute left-2.5 top-2.5 z-[2] rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.06em]" style={{ ...chip, color: top ? 'var(--accent-ink)' : 'var(--muted)' }}>Lv {g.index + 1} · {g.name}</span>
                <span className="absolute right-2.5 top-2.5 z-[2] rounded-full px-2 py-0.5 text-[10.5px] num" style={{ ...chip, color: 'var(--muted)' }}>day {p.streak}</span>
                <div className="absolute bottom-0 left-1/2 z-[1] -translate-x-1/2">
                  <Pet id={p.species} mood={top ? 'ecstatic' : 'happy'} night={false} size={top ? (wide ? 280 : 190) : wide ? 124 : 112} base />
                </div>
              </div>
              <div className="flex items-end justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className={`truncate font-extrabold leading-tight ${top ? 'text-[18px]' : 'text-[14.5px]'}`} style={{ fontFamily: 'var(--font-display)' }}>
                    {p.name} <span className="num text-[11.5px] font-medium" style={{ color: 'var(--muted)' }}>{s.ticker}</span>
                  </p>
                  <p className="truncate text-[11px]" style={{ color: 'var(--muted)' }}>{s.company} · {isPaper(p) ? 'paper' : 'live'}</p>
                  <p className={`num font-semibold leading-tight ${top ? 'text-[20px]' : 'text-[15px]'}`}>{r.value != null ? `$${r.value.toFixed(2)}` : '—'}</p>
                </div>
                {r.pnl != null && r.basis > 0 && (
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] num"
                    style={{ color: r.pnl >= 0 ? 'var(--up)' : 'var(--down)', background: `color-mix(in srgb, ${r.pnl >= 0 ? 'var(--up)' : 'var(--down)'} 14%, transparent)` }}>
                    {r.pnl >= 0 ? '+' : ''}{((r.pnl / r.basis) * 100).toFixed(2)}%
                  </span>
                )}
              </div>
            </>
          );
          const frame = { outline: on ? `2px solid ${HUE[p.species].main}` : '2px solid transparent', outlineOffset: '-2px' };
          return (
            <li key={p.uid ?? p.adoptedAt} className={top ? 'col-span-2 lg:row-span-2' : ''}>
              <button onClick={() => open(p)} className="block h-full w-full text-left" aria-label={`Open ${p.name}`}>
                {top
                  ? <Foil className="card flex h-full flex-col overflow-hidden" style={frame}>{body}</Foil>
                  : <div className="card flex h-full flex-col overflow-hidden transition-transform hover:-translate-y-0.5" style={frame}>{body}</div>}
              </button>
            </li>
          );
        })}
      </ul>

      </div>
      </div>

      <Link href="/adopt" className="pill mt-4 grid w-full place-items-center text-[17px] lg:hidden">Hatch another</Link>
      <Link href="/shelf" className="mt-3 text-center text-[13px] underline lg:hidden" style={{ color: 'var(--muted)' }}>Meet the six Fledglings</Link>
      <Nav />
    </main>
  );
}
