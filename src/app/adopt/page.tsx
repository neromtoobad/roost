'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Confetti } from '@/components/Confetti';
import { SPECIES, petImage, type Species, type Stock } from '@/lib/pets';
import { PERSONALITIES, adoptLitter, adoptPetRemote, type Personality } from '@/lib/store';
import { ConnectPill, useWallet } from '@/components/Wallet';
import { syncPet } from '@/lib/sync';
import { StockCard, type StockInfo } from '@/components/StockCard';
import { LITTERS, type Litter, type LitterMember } from '@/lib/litters';
import type { IssuerChoice } from '@/lib/issuer';

// Finch's rule: egg → hatch → name → personality, inside the first minute, before any feature.
// The egg can be any tokenized stock on BSC — about 450 — one of the six classics, or a litter: a
// theme hatched as several pups at once. The sector decides which Fledgling hatches (speciesFor in
// lib/pets), and where two issuers sell the same stock, the cheaper share decides the token
// (lib/issuer).
type Step = 'egg' | 'stock' | 'litter' | 'hatch' | 'name';
const ORDER: Species['id'][] = ['nova', 'volt', 'pip', 'booster', 'nimbus', 'lurk'];
type Listing = { ticker: string; company: string; assetType?: number; tokens: Stock[] };
type Resolved = Omit<Litter, 'members'> & { members: LitterMember[] };

/** The pet's first word on why it is this token and not the other issuer's. */
function issuerNote(ticker: string, token: Stock, choice: Pick<IssuerChoice, 'basis' | 'reason' | 'options'> & { pick?: Stock } | null): string | undefined {
  if (!choice || choice.basis === 'only') return undefined;
  const picked = !choice.pick || choice.pick.address === token.address;
  return picked
    ? `Two issuers sell ${ticker}; I hatched from ${token.tokenSymbol}. ${choice.reason}`
    : `Two issuers sell ${ticker}; you chose ${token.tokenSymbol}. At hatch: ${choice.reason}`;
}

function PersonalityPicker({ value, onChange }: { value: Personality; onChange: (p: Personality) => void }) {
  return (
    <div className="mt-3 grid gap-2">
      {(Object.keys(PERSONALITIES) as Personality[]).map((k) => {
        const p = PERSONALITIES[k], on = value === k;
        return (
          <button key={k} onClick={() => onChange(k)} className="card flex items-center gap-3 px-4 py-3 text-left"
            style={{ outline: on ? '3px solid var(--accent)' : '3px solid transparent', background: on ? 'color-mix(in srgb, var(--accent) 14%, var(--surface))' : 'var(--surface)' }}>
            <span className="grid h-9 w-9 place-items-center rounded-full text-lg" style={{ background: 'var(--canvas)' }} aria-hidden>{p.icon}</span>
            <span><span className="block text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>{p.name}</span>
              <span className="block text-[12.5px]" style={{ color: 'var(--muted)' }}>{p.tagline}</span></span>
            {on && <span className="ml-auto grid h-6 w-6 place-items-center rounded-full text-[12px]" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function Adopt() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('egg');
  const [pick, setPick] = useState<Species['id'] | null>(null);
  const [cracked, setCracked] = useState(false);
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState<Personality>('degen');
  const { address } = useWallet();
  const sp = pick ? SPECIES[pick] : null;

  // Any stock: a search over the ~450, the most traded shown before anything is typed.
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ q: string; list: Listing[] } | null>(null);
  const [chosen, setChosen] = useState<StockInfo | null>(null);
  const [choice, setChoice] = useState<IssuerChoice | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/api/stocks${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        .then((r) => r.json())
        .then((j: { results?: Listing[] }) => { if (alive) setResults({ q, list: j.results ?? [] }); })
        .catch(() => {});
    }, q ? 180 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  // A litter: resolved server-side, because each pup's token is a price comparison.
  const [litter, setLitter] = useState<Resolved | null>(null);

  const showStock = async (token: Stock) => {
    const info = (await fetch(`/api/stock/${token.address}`).then((r) => r.json())) as StockInfo;
    if (!info?.stock) return;
    setChosen(info);
    setPick(info.species);
    setStep('stock');
  };

  // One button per company. Where two issuers sell it, ask which share is cheaper — for this wallet
  // at a first-feed size if one is connected, at the traded price if not — and open that one.
  const openListing = async (l: Listing) => {
    setLoading(l.ticker);
    try {
      let token = l.tokens[0];
      setChoice(null);
      if (l.tokens.length > 1) {
        const c = (await fetch(`/api/issuer?ticker=${encodeURIComponent(l.ticker)}${address ? `&wallet=${address}` : ''}&usd=25`)
          .then((r) => (r.ok ? r.json() : null)).catch(() => null)) as IssuerChoice | null;
        if (c?.pick) { setChoice(c); token = c.pick; }
      }
      await showStock(token);
    } catch { /* stays on the list */ }
    setLoading(null);
  };

  const openLitter = async (l: Litter) => {
    setLoading(l.id);
    try {
      const r = (await fetch(`/api/litter/${l.id}${address ? `?wallet=${address}` : ''}`).then((x) => x.json())) as Resolved;
      if (r?.members) { setLitter(r); setStep('litter'); }
    } catch { /* stays on the list */ }
    setLoading(null);
  };

  const hatch = () => {
    if (!pick) return;
    setStep('hatch');
    setTimeout(() => setCracked(true), 1400);
    setTimeout(() => { setName(SPECIES[pick].name); setStep('name'); }, 3200);
  };
  const adopt = () => {
    if (!pick || !name.trim()) return;
    router.push('/?hatched=1'); // optimistic — the local pet exists immediately; the agent attaches when the API answers
    // A bound wallet is what makes a Fledgling live rather than paper. A searched stock rides along;
    // a classic egg keeps its species' signature stock.
    const stock = chosen?.stock;
    const note = stock ? issuerNote(stock.ticker, stock, choice) : undefined;
    void adoptPetRemote({ species: pick, name: name.trim().slice(0, 16), personality, ...(stock ? { stock } : {}), ...(note ? { issuerNote: note } : {}) }, address).then(syncPet);
  };

  const pups = litter?.members.filter((m): m is LitterMember & { stock: Stock } => Boolean(m.stock)) ?? [];
  const hatchLitter = () => {
    if (!litter || !pups.length) return;
    setStep('hatch');
    setTimeout(() => setCracked(true), 1400);
    setTimeout(() => {
      const born = adoptLitter(
        { id: litter.id, name: litter.name },
        pups.map((m) => ({ species: m.species, name: m.name, stock: m.stock, issuerNote: issuerNote(m.ticker, m.stock, m.choice) })),
        personality, address,
      );
      for (const p of born) void syncPet(p);
      router.push(`/litter?key=${born[0].litter!.key}&hatched=1`);
    }, 3000);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-10 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border px-3 py-1.5 text-[12px] num" style={{ borderColor: 'var(--ink)' }}>
          {step === 'egg' ? 'Adopt' : step === 'stock' ? 'Meet the stock' : step === 'litter' ? 'A litter' : step === 'hatch' ? 'Hatching' : 'Name & personality'}
        </span>
        {/* A Fledgling is bound to the wallet connected at adoption. Without one it stays paper,
            so the pill has to be reachable here — not only after the pet exists. */}
        <ConnectPill />
      </div>
      {!address && step === 'name' && (
        <p className="mt-2 text-center text-[11.5px]" style={{ color: 'var(--muted)' }}>
          No wallet connected — {name || 'your Fledgling'} will trade on paper.
        </p>
      )}

      <AnimatePresence mode="wait">
        {step === 'egg' && (
          <motion.section key="egg" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <h1 className="mt-5 text-center text-[32px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>Pick your egg</h1>
            <p className="mt-1 text-center text-[14px]" style={{ color: 'var(--muted)' }}>Any of ~450 tokenized stocks. Its sector decides which Fledgling hatches.</p>

            <label className="card mt-5 flex items-center gap-2 px-4 py-3">
              <span aria-hidden>🔎</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticker or company — NVDA, Coca-Cola, SPY…"
                className="w-full bg-transparent text-[15px] outline-none" style={{ color: 'var(--ink)' }} aria-label="Search tokenized stocks" />
            </label>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              {q.trim() ? 'Matches' : 'Most traded on BSC right now'}
            </p>
            <div className="mt-2 grid gap-1.5">
              {results && results.list.length === 0 && q.trim() && (
                <p className="card px-4 py-3 text-[13px]" style={{ color: 'var(--muted)' }}>No tokenized stock on BSC matches “{q.trim()}”.</p>
              )}
              {(results?.list ?? []).slice(0, q.trim() ? 20 : 8).map((l) => (
                <div key={l.ticker} className="card flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                      {l.ticker}{l.assetType === 3 && <span className="ml-1.5 text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>ETF</span>}
                    </p>
                    <p className="truncate text-[12px]" style={{ color: 'var(--muted)' }}>
                      {l.company}{l.tokens.length > 1 ? ' · two issuers' : ''}
                    </p>
                  </div>
                  <button onClick={() => void openListing(l)} disabled={loading !== null}
                    className="shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold"
                    style={{ background: 'var(--accent)', color: 'var(--on-accent)', opacity: loading && loading !== l.ticker ? 0.4 : 1 }}>
                    {loading === l.ticker ? (l.tokens.length > 1 ? 'Comparing…' : '…') : 'Pick'}
                  </button>
                </div>
              ))}
            </div>

            {/* Themes, hatched as several pups and fed as one. Binance's own sector names. */}
            <p className="mt-6 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Or a litter</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {LITTERS.map((l) => (
                <button key={l.id} onClick={() => void openLitter(l)} disabled={loading !== null}
                  className="card flex flex-col items-start gap-0.5 px-3 py-3 text-left active:scale-[0.98]"
                  style={{ opacity: loading && loading !== l.id ? 0.4 : 1, transition: 'transform .1s' }}>
                  <span className="text-[20px]" aria-hidden>{l.icon}</span>
                  <span className="text-[14.5px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{l.name}</span>
                  <span className="text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
                    {loading === l.id ? 'Pricing every pup…' : `${l.members.length} pups · ${l.members.map((m) => m.ticker).join(' ')}`}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-6 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Or a classic</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {ORDER.map((id) => {
                const s = SPECIES[id], on = pick === id;
                return (
                  <button key={id} onClick={() => setPick(id)} className="card flex flex-col items-center gap-2 px-3 pb-3 pt-4 text-left transition-transform active:scale-[0.98]"
                    style={{ outline: on ? '3px solid var(--accent)' : '3px solid transparent', boxShadow: on ? 'var(--glow)' : 'none' }}>
                    <img src={`/pets/eggs/${id}.png`} alt="" className="h-28 w-28 object-contain" draggable={false} />
                    <span className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>{s.ticker}</span>
                    <span className="-mt-1 text-[12px]" style={{ color: 'var(--muted)' }}>{s.preIpo ? 'pre-IPO' : 'tokenized stock'}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setChosen(null); setChoice(null); hatch(); }} disabled={!pick} className="pill mt-6 w-full text-[18px] disabled:opacity-40">Hatch</button>
          </motion.section>
        )}

        {step === 'stock' && chosen && sp && (
          <motion.section key="stock" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="mx-auto mt-3 grid h-32 w-32 place-items-center">
              <img src={`/pets/eggs/${sp.id}.png`} alt="" className="h-28 w-28 object-contain" draggable={false} />
            </div>
            <p className="text-center text-[14px]" style={{ color: 'var(--muted)' }}>
              {chosen.company?.industry ? `${chosen.company.industry}` : chosen.stock.assetType === 3 ? 'An ETF' : 'This stock'} hatches {/^[aeiou]/i.test(sp.species) ? 'an' : 'a'}{' '}
              <b style={{ color: 'var(--ink)' }}>{sp.species.toLowerCase()}</b>.
            </p>
            {/* Two issuers, one share: which is cheaper, on what basis, and the other one a tap away. */}
            {choice && choice.options.length > 1 && (
              <div className="card mt-3 px-4 py-3 text-[13px]">
                <p className="text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Two issuers sell {choice.ticker}</p>
                <p className="mt-1 leading-snug">{choice.reason}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {choice.options.map((o) => {
                    const on = o.stock.address === chosen.stock.address;
                    return (
                      <button key={o.stock.address} disabled={on || loading !== null}
                        onClick={() => { setLoading(o.stock.address); void showStock(o.stock).finally(() => setLoading(null)); }}
                        className="rounded-full px-3 py-1.5 text-[12px] font-bold num"
                        style={on ? { background: 'var(--accent)', color: 'var(--on-accent)' } : { background: 'var(--surface)', border: '1px solid var(--line)' }}>
                        {loading === o.stock.address ? '…' : `${o.stock.tokenSymbol}${o.perShare ? ` · $${o.perShare.toFixed(2)}/share` : ''}`}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--muted)' }}>
                  {choice.basis === 'fill' ? 'Real quotes for your wallet, gas not included.' : 'At the traded price. Connect a wallet for real quotes.'}
                </p>
              </div>
            )}
            <div className="mt-3"><StockCard info={chosen} /></div>
            <button onClick={hatch} className="pill mt-4 w-full text-[18px]">Hatch {chosen.stock.ticker}</button>
            <button onClick={() => { setChosen(null); setChoice(null); setPick(null); setStep('egg'); }} className="mt-3 w-full text-center text-[13px] underline" style={{ color: 'var(--muted)' }}>
              Pick a different stock
            </button>
          </motion.section>
        )}

        {step === 'litter' && litter && (
          <motion.section key="litter" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <h1 className="mt-4 text-center text-[28px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>{litter.icon} {litter.name}</h1>
            <p className="text-center text-[13.5px]" style={{ color: 'var(--muted)' }}>{litter.blurb}</p>
            <p className="mt-2 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
              {pups.length} pups, fed as one: each feed tops up whoever has fallen furthest behind first.
            </p>
            <ul className="mt-3 grid gap-1.5">
              {litter.members.map((m) => (
                <li key={m.ticker} className="card flex items-start gap-3 px-3 py-2.5" style={{ opacity: m.stock ? 1 : 0.5 }}>
                  <img src={`/pets/eggs/${m.species}.png`} alt="" className="h-10 w-10 shrink-0 object-contain" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                      {m.name} <span className="num text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>{m.ticker}{m.stock ? ` · ${m.stock.tokenSymbol}` : ''}</span>
                    </p>
                    <p className="text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>{m.error ?? m.choice?.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>One personality for the litter</p>
            <PersonalityPicker value={personality} onChange={setPersonality} />
            <button onClick={hatchLitter} disabled={!pups.length} className="pill mt-4 w-full text-[18px] disabled:opacity-40">Hatch {pups.length} pups</button>
            <p className="mt-2 text-center text-[11.5px]" style={{ color: 'var(--muted)' }}>
              {address ? 'Bound to your wallet: you sign every feed, and Roost never holds your keys.' : 'No wallet connected — the litter will trade on paper.'}
            </p>
            <button onClick={() => { setLitter(null); setStep('egg'); }} className="mt-3 w-full text-center text-[13px] underline" style={{ color: 'var(--muted)' }}>
              Pick something else
            </button>
          </motion.section>
        )}

        {step === 'hatch' && litter && (
          <motion.section key="hatch-litter" className="flex flex-1 flex-col items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="relative grid grid-cols-3 gap-2">
              {cracked && <Confetti count={36} />}
              {pups.map((m, i) => (
                <div key={m.ticker} className="grid h-24 w-24 place-items-center">
                  <AnimatePresence mode="wait">
                    {!cracked ? (
                      <motion.img key="egg" src={`/pets/eggs/${m.species}.png`} alt="" className="h-20 w-20 object-contain"
                        animate={{ rotate: [0, -6, 6, -8, 8, -4, 4, 0] }} transition={{ duration: 1.3, ease: 'easeInOut', delay: i * 0.04 }}
                        exit={{ scale: 1.3, opacity: 0, transition: { duration: 0.2 } }} />
                    ) : (
                      <motion.div key="pet" className="flex flex-col items-center" initial={{ scale: 0.4, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 16, delay: i * 0.06 }}>
                        <img src={petImage(m.species, 'ecstatic')} alt="" className="h-20 w-20 object-contain" />
                        <span className="text-[11px] font-bold num">{m.ticker}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[16px] font-semibold" style={{ color: 'var(--muted)' }}>{cracked ? `A litter of ${pups.length}!` : 'Something is moving…'}</p>
          </motion.section>
        )}

        {step === 'hatch' && !litter && sp && (
          <motion.section key="hatch" className="flex flex-1 flex-col items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="relative grid h-72 w-72 place-items-center">
              {cracked && <Confetti />}
              <AnimatePresence mode="wait">
                {!cracked ? (
                  <motion.img key="egg" src={`/pets/eggs/${sp.id}.png`} alt="" className="h-56 w-56 object-contain"
                    animate={{ rotate: [0, -6, 6, -8, 8, -4, 4, 0], y: [0, -2, 0, -4, 0] }} transition={{ duration: 1.3, ease: 'easeInOut' }}
                    exit={{ scale: 1.3, opacity: 0, transition: { duration: 0.2 } }} />
                ) : (
                  <motion.img key="pet" src={petImage(sp.id, 'ecstatic')} alt="" className="h-64 w-64 object-contain"
                    initial={{ scale: 0.4, y: 30, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} />
                )}
              </AnimatePresence>
            </div>
            <p className="mt-2 text-[16px] font-semibold" style={{ color: 'var(--muted)' }}>{cracked ? `A ${sp.species.toLowerCase()}!` : 'Something is moving…'}</p>
          </motion.section>
        )}

        {step === 'name' && sp && (
          <motion.section key="name" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mx-auto mt-2 grid h-44 w-44 place-items-center">
              <img src={petImage(sp.id, 'happy')} alt="" className="h-44 w-44 object-contain" />
            </div>
            <label className="card mt-2 block px-4 py-3">
              <span className="block text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} autoFocus
                className="w-full bg-transparent text-[20px] font-bold outline-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }} />
            </label>
            <PersonalityPicker value={personality} onChange={setPersonality} />
            <p className="mt-3 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>The personality is also how it trades.</p>
            <button onClick={adopt} disabled={!name.trim()} className="pill mt-4 w-full text-[18px] disabled:opacity-40">Adopt {name.trim() || sp.name}</button>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
