'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { petImage } from '@/lib/pets';
import { litterById } from '@/lib/litters';
import { costBasis, heldQty, isPaper, setCurrentPet, stockOf, usePets, type PetState } from '@/lib/store';

// Every Fledgling on this device as one portfolio: what each holds, what it is worth at the print,
// what it cost, and what has been taken off the table. Live and paper are counted apart — adding a
// paper pet's gains to real money would be the one number on this screen that lies.

type Priced = Record<string, number | null>;

export default function Nest() {
  const router = useRouter();
  const { pets, current } = usePets();
  const [prices, setPrices] = useState<Priced>({});

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

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-24 pt-[max(12px,env(safe-area-inset-top))] lg:max-w-[1120px] lg:px-10 lg:pb-12 lg:pt-8">
      <h1 className="text-center text-[28px] font-bold lg:text-left lg:text-[36px]" style={{ fontFamily: 'var(--font-display)' }}>Nest</h1>
      <p className="text-center text-[13px] lg:text-left lg:text-[14px]" style={{ color: 'var(--muted)' }}>
        {pets.length ? `${pets.length} Fledgling${pets.length === 1 ? '' : 's'}, one portfolio.` : 'No Fledglings yet.'}
      </p>

      <div className="lg:grid lg:grid-cols-2 lg:gap-4">
      {[{ label: 'Real money', t: live }, { label: 'Paper', t: paper }].filter((x) => x.t.n > 0).map(({ label, t }) => {
        const pnl = t.value - t.basis;
        return (
          <div key={label} className="card mt-4 px-4 py-3">
            <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{label} · {t.n} pet{t.n === 1 ? '' : 's'}</p>
            <p className="num text-[24px] font-bold leading-tight">${t.value.toFixed(2)}</p>
            <p className="num text-[12.5px]" style={{ color: 'var(--muted)' }}>
              cost <span style={{ color: 'var(--ink)' }}>${t.basis.toFixed(2)}</span>
              {t.basis > 0 && <> · <span style={{ color: pnl >= 0 ? 'var(--up)' : 'var(--down)' }}>{pnl >= 0 ? '+' : '−'}${Math.abs(pnl).toFixed(2)}</span></>}
              {t.realized !== 0 && <> · <span style={{ color: t.realized >= 0 ? 'var(--up)' : 'var(--down)' }}>{t.realized >= 0 ? '+' : '−'}${Math.abs(t.realized).toFixed(2)} realized</span></>}
              {t.cash > 0 && <> · ${t.cash.toFixed(0)} waiting to be spent</>}
            </p>
          </div>
        );
      })}

      </div>

      {/* Litters first, each as one card: hatched together, fed together. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-4">
      {litters.map(([k, pups]) => {
        const l = pups[0].litter!;
        const v = pups.map(row).reduce((t, r) => ({ value: t.value + (r.value ?? 0) + r.cash, basis: t.basis + r.basis }), { value: 0, basis: 0 });
        return (
          <Link key={k} href={`/litter?key=${k}`} className="card mt-4 block px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                {litterById(l.id)?.icon} {l.name} <span className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>· {pups.length} pups · {isPaper(pups[0]) ? 'paper' : 'live'}</span>
              </p>
              <p className="num shrink-0 text-[15px] font-bold">${v.value.toFixed(2)}</p>
            </div>
            <div className="mt-1.5 flex -space-x-2">
              {pups.map((p) => (
                <img key={p.uid} src={petImage(p.species, 'hero')} alt={p.name} title={`${p.name} · ${stockOf(p).ticker}`}
                  className="h-8 w-8 rounded-full border-2 object-cover object-top" style={{ background: 'var(--canvas)', borderColor: 'var(--surface)' }} />
              ))}
            </div>
            <p className="mt-1 text-[11.5px]" style={{ color: 'var(--muted)' }}>{pups.map((p) => stockOf(p).ticker).join(' · ')} — feed them as one ›</p>
          </Link>
        );
      })}

      </div>

      <ul className="mt-4 grid gap-2 lg:grid-cols-2 lg:gap-3">
        {singles.map((p) => {
          const s = stockOf(p), r = row(p), on = p.uid === current;
          return (
            <li key={p.uid ?? p.adoptedAt}>
              <button onClick={() => open(p)} className="card flex w-full items-center gap-3 px-3 py-2.5 text-left"
                style={{ outline: on ? '3px solid var(--accent)' : '3px solid transparent' }}>
                <img src={petImage(p.species, 'hero')} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover object-top" style={{ background: 'var(--canvas)' }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                    {p.name} <span className="num text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>{s.ticker}</span>
                  </p>
                  <p className="truncate text-[12px]" style={{ color: 'var(--muted)' }}>
                    {s.company} · {isPaper(p) ? 'paper' : 'live'} · {r.qty.toFixed(4)} {s.tokenSymbol}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-[15px] font-bold">{r.value != null ? `$${r.value.toFixed(2)}` : '—'}</p>
                  {r.pnl != null && r.basis > 0 && (
                    <p className="num text-[11.5px]" style={{ color: r.pnl >= 0 ? 'var(--up)' : 'var(--down)' }}>
                      {r.pnl >= 0 ? '+' : ''}{((r.pnl / r.basis) * 100).toFixed(2)}%
                    </p>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <Link href="/adopt" className="pill mt-4 grid w-full place-items-center text-[17px] lg:mt-6 lg:w-[320px]">Hatch another</Link>
      <Link href="/shelf" className="mt-3 text-center text-[13px] underline lg:hidden" style={{ color: 'var(--muted)' }}>Meet the six Fledglings</Link>
      <Nav />
    </main>
  );
}
