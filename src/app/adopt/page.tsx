'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Confetti } from '@/components/Confetti';
import { SPECIES, petImage, type Species, type Stock } from '@/lib/pets';
import { PERSONALITIES, adoptLitter, adoptPetRemote, type Personality } from '@/lib/store';
import { ConnectPill, useWallet } from '@/components/Wallet';
import { OnNest, PodCarousel } from '@/components/PodCarousel';
import { StockLogo } from '@/components/StockLogo';
import { Pet } from '@/components/Pet';
import { HUE, LITTER_LOOK, TAKES_IN } from '@/lib/look';
import { syncPet } from '@/lib/sync';
import { StockCard, type StockInfo } from '@/components/StockCard';
import { LITTERS, type Litter, type LitterMember } from '@/lib/litters';
import { WIDE, useMedia } from '@/lib/client';
import type { IssuerChoice } from '@/lib/issuer';

// Finch's rule: pod → hatch → name → personality, inside the first minute, before any feature.
// The pod can be any tokenized stock on BSC — about 450 — one of the six classics, or a litter: a
// theme hatched as several pups at once. The sector decides which Fledgling hatches (speciesFor in
// lib/pets), and where two issuers sell the same stock, the cheaper share decides the token
// (lib/issuer).
type Step = 'pod' | 'stock' | 'litter' | 'hatch' | 'name';
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
    <div className="mt-3 grid gap-2 lg:grid-cols-2">
      {(Object.keys(PERSONALITIES) as Personality[]).map((k) => {
        const p = PERSONALITIES[k], on = value === k;
        return (
          <button key={k} onClick={() => onChange(k)} className="card flex items-center gap-3 px-4 py-3 text-left"
            style={{ outline: on ? '3px solid var(--accent)' : '3px solid transparent', ...(on ? { background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 22%, var(--card-top)), var(--card-bot)) padding-box, var(--card-edge) border-box' } : {}) }}>
            <span className="grid h-10 w-10 place-items-center rounded-[12px] text-lg" style={{ background: on ? 'linear-gradient(180deg, #FFE46B, #F0B90B)' : 'color-mix(in srgb, var(--ink) 7%, transparent)', boxShadow: on ? '0 2px 0 #B98900' : undefined }} aria-hidden>{p.icon}</span>
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
  const [step, setStep] = useState<Step>('pod');
  const [pick, setPick] = useState<Species['id'] | null>(null);
  // The classic pod in front of the turntable; hatching it makes it the pick.
  const [pod, setPod] = useState<Species['id']>(ORDER[0]);
  const [cracked, setCracked] = useState(false);
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState<Personality>('degen');
  const { address } = useWallet();
  const wide = useMedia(WIDE);
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

  const hatch = (id: Species['id'] | null = pick) => {
    if (!id) return;
    setPick(id);
    setStep('hatch');
    setTimeout(() => setCracked(true), 1400);
    setTimeout(() => { setName(SPECIES[id].name); setStep('name'); }, 3200);
  };
  const adopt = () => {
    if (!pick || !name.trim()) return;
    router.push('/?hatched=1'); // optimistic — the local pet exists immediately; the agent attaches when the API answers
    // A bound wallet is what makes a Fledgling live rather than paper. A searched stock rides along;
    // a classic pod keeps its species' signature stock.
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
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-10 pt-[max(12px,env(safe-area-inset-top))] lg:h-full lg:min-h-0 lg:max-w-[1200px] lg:px-10 lg:pb-6 lg:pt-6">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border px-3 py-1.5 text-[12px] num" style={{ borderColor: 'var(--ink)' }}>
          {step === 'pod' ? 'Adopt' : step === 'stock' ? 'Meet the stock' : step === 'litter' ? 'A litter' : step === 'hatch' ? 'Hatching' : 'Name & personality'}
        </span>
        {/* A Fledgling is bound to the wallet connected at adoption. Without one it stays paper,
            so the pill has to be reachable here — not only after the pet exists. On desktop it is in the top bar. */}
        <div className="lg:hidden"><ConnectPill /></div>
      </div>
      {!address && step === 'name' && (
        <p className="mt-2 text-center text-[11.5px]" style={{ color: 'var(--muted)' }}>
          No wallet connected — {name || 'your Fledgling'} will trade on paper.
        </p>
      )}

      <AnimatePresence mode="wait">
        {step === 'pod' && (
          <motion.section key="pod" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <h1 className="mt-5 text-center text-[36px] font-extrabold leading-tight tracking-[-0.03em] lg:mt-0 lg:text-[34px]" style={{ fontFamily: 'var(--font-display)' }}>Pick your <span className="text-gold">pod</span></h1>
            <p className="mt-1 text-center text-[14px] lg:mt-0.5 lg:text-[13.5px]" style={{ color: 'var(--muted)' }}>Any of ~450 tokenized stocks. Its sector decides which Fledgling hatches.</p>
            {/* What a newcomer needs to hear before choosing anything. */}
            <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] lg:mt-2" style={{ color: 'var(--muted)' }}>
              {['Start free on paper', 'From $5 when it’s real', 'You sign every trade'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <span className="grid h-4 w-4 place-items-center rounded-full text-[10px]" style={{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)', color: 'var(--accent-ink)' }} aria-hidden>✓</span>{t}
                </li>
              ))}
            </ul>

            {/* Desktop: two columns that fit the window; the stock list scrolls inside its own column. */}
            <div className="lg:mt-4 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:gap-10">
            <div className="lg:flex lg:min-h-0 lg:flex-col">
            <label className="card mt-5 flex shrink-0 items-center gap-2 px-4 py-3 lg:mt-0">
              <span aria-hidden>🔎</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticker or company — NVDA, Coca-Cola, SPY…"
                className="w-full bg-transparent text-[15px] outline-none" style={{ color: 'var(--ink)' }} aria-label="Search tokenized stocks" />
            </label>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              {q.trim() ? 'Matches' : 'Most traded on BSC right now'}
            </p>
            <div className="mt-2 grid gap-1.5 lg:min-h-0 lg:content-start lg:overflow-y-auto lg:pr-1">
              {results && results.list.length === 0 && q.trim() && (
                <p className="card px-4 py-3 text-[13px]" style={{ color: 'var(--muted)' }}>No tokenized stock on BSC matches “{q.trim()}”.</p>
              )}
              {(results?.list ?? []).slice(0, q.trim() ? 20 : wide ? 12 : 8).map((l) => (
                <div key={l.ticker} className="card flex items-center justify-between gap-3 px-3 py-2 transition-transform hover:-translate-y-px">
                  <StockLogo address={l.tokens[0]?.address} ticker={l.ticker} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                      {l.ticker}{l.assetType === 3 && <span className="ml-1.5 text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>ETF</span>}
                    </p>
                    <p className="truncate text-[12px]" style={{ color: 'var(--muted)' }}>
                      {l.company}{l.tokens.length > 1 ? ' · two issuers' : ''}
                    </p>
                  </div>
                  <button onClick={() => void openListing(l)} disabled={loading !== null}
                    className="pill h-9 shrink-0 px-4 text-[13px] after:hidden"
                    style={{ opacity: loading && loading !== l.ticker ? 0.4 : 1 }}>
                    {loading === l.ticker ? (l.tokens.length > 1 ? 'Comparing…' : '…') : 'Pick'}
                  </button>
                </div>
              ))}
            </div>

            </div>

            <div className="lg:flex lg:min-h-0 lg:flex-col">
            {/* Desktop: only the litters scroll if the window is short; the classics and Hatch always stay whole. */}
            <div className="lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            {/* Themes, hatched as several pups and fed as one. Binance's own sector names. */}
            <p className="mt-6 text-[12px] font-semibold uppercase tracking-wide lg:mt-0" style={{ color: 'var(--muted)' }}>Or a litter</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {LITTERS.map((l) => (
                <button key={l.id} onClick={() => void openLitter(l)} disabled={loading !== null}
                  title={`${l.name}: ${l.members.map((m) => m.ticker).join(' ')}`}
                  className="card flex flex-col items-start gap-1 px-3 py-3 text-left transition-transform hover:-translate-y-0.5 active:scale-[0.98] lg:flex-row lg:items-center lg:gap-3 lg:py-2"
                  style={{ opacity: loading && loading !== l.id ? 0.4 : 1, background: `radial-gradient(80% 120% at 0% 50%, color-mix(in srgb, ${LITTER_LOOK[l.id]?.color ?? 'var(--accent)'} 22%, transparent), transparent 70%) padding-box, linear-gradient(180deg, var(--card-top), var(--card-bot)) padding-box, var(--card-edge) border-box` }}>
                  <img src={LITTER_LOOK[l.id]?.icon} alt="" aria-hidden draggable={false} className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,.35)] lg:h-11 lg:w-11" />
                  <span className="flex w-full min-w-0 flex-col gap-0.5">
                    <span className="text-[14.5px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{l.name}</span>
                    {loading === l.id ? (
                      <span className="text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>Pricing every pup…</span>
                    ) : (
                      // The litter as the companies in it: each pup's stock by its own logo.
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--muted)' }}>
                        <span className="flex -space-x-1.5">{l.members.map((m) => <span key={m.ticker} className="rounded-full ring-2 ring-[var(--card-top)]"><StockLogo ticker={m.ticker} size={20} /></span>)}</span>
                        {l.members.length} pups
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
            </div>

            <p className="mt-6 shrink-0 text-[12px] font-semibold uppercase tracking-wide lg:mt-4" style={{ color: 'var(--muted)' }}>Or a classic</p>
            <div className="shrink-0 lg:mb-3"><PodCarousel ids={ORDER} value={pod} onChange={setPod} /></div>
            {/* Desktop with room to spare: who is inside, and what it takes in. */}
            <div className="card hidden shrink-0 items-center gap-4 px-4 py-3 lg:tall:flex" style={{ ['--hue-main' as string]: HUE[pod].main, ['--hue-deep' as string]: HUE[pod].deep }}>
              <img src={petImage(pod, 'happy')} alt="" className="h-20 w-20 shrink-0 object-contain" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Inside</p>
                <p className="text-[18px] font-extrabold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{SPECIES[pod].name} <span className="hue-text text-[14px] font-bold">the {SPECIES[pod].species.toLowerCase()}</span></p>
                <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--muted)' }}>Hatches from {TAKES_IN[pod]}.</p>
              </div>
            </div>
            <button onClick={() => { setChosen(null); setChoice(null); hatch(pod); }} className="pill mt-6 w-full shrink-0 text-[18px] lg:mt-auto">Hatch {SPECIES[pod].ticker}</button>
            </div>
            </div>
          </motion.section>
        )}

        {step === 'stock' && chosen && sp && (
          <motion.section key="stock" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="lg:mx-auto lg:mt-6 lg:grid lg:w-full lg:max-w-[960px] lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[380px_minmax(0,1fr)] xl:gap-10">
            <div className="lg:self-start">
            <div className="stage mx-auto mt-3 grid h-48 w-full max-w-[300px] place-items-center rounded-[24px] lg:h-60" style={{ ['--pet' as string]: HUE[sp.id].main }}>
              <div className="stage-rays" aria-hidden />
              <OnNest id={sp.id} size={112} />
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
                        className="flex items-center gap-1.5 rounded-[8px] py-1 pl-1 pr-3 text-[12px] font-semibold num"
                        style={on ? { background: 'var(--accent)', color: 'var(--on-accent)', border: '1px solid var(--accent)' } : { background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                        <StockLogo address={o.stock.address} ticker={o.stock.ticker} size={22} />
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
            </div>
            <div>
            <div className="mt-3 lg:mt-0"><StockCard info={chosen} /></div>
            <button onClick={() => hatch()} className="pill mt-4 w-full text-[18px]">Hatch {chosen.stock.ticker}</button>
            <button onClick={() => { setChosen(null); setChoice(null); setPick(null); setStep('pod'); }} className="mt-3 w-full text-center text-[13px] underline" style={{ color: 'var(--muted)' }}>
              Pick a different stock
            </button>
            </div>
          </motion.section>
        )}

        {step === 'litter' && litter && (
          <motion.section key="litter" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <h1 className="mt-4 flex items-center justify-center gap-3 text-center text-[32px] font-extrabold tracking-[-0.02em]" style={{ fontFamily: 'var(--font-display)' }}>
              {LITTER_LOOK[litter.id] ? <img src={LITTER_LOOK[litter.id].icon} alt="" className="h-12 w-12 object-contain" /> : litter.icon} {litter.name}
            </h1>
            <p className="text-center text-[13.5px]" style={{ color: 'var(--muted)' }}>{litter.blurb}</p>
            <p className="mt-2 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
              {pups.length} pups, fed as one: each feed tops up whoever has fallen furthest behind first.
            </p>
            <div className="lg:mx-auto lg:mt-4 lg:grid lg:min-h-0 lg:w-full lg:max-w-[1000px] lg:flex-1 lg:grid-cols-2 lg:gap-10">
            <ul className="mt-3 grid gap-1.5 lg:mt-0 lg:min-h-0 lg:content-start lg:overflow-y-auto lg:pr-1">
              {litter.members.map((m) => (
                <li key={m.ticker} className="card flex items-start gap-3 px-3 py-2.5" style={{ opacity: m.stock ? 1 : 0.5 }}>
                  <img src={`/pets/eggs/${m.species}.png`} alt="" className="h-10 w-10 shrink-0 object-contain" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                      {m.name} <span className="num inline-flex items-center gap-1 align-[-3px] text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>{m.stock && <StockLogo address={m.stock.address} ticker={m.ticker} size={16} />}{m.ticker}{m.stock ? ` · ${m.stock.tokenSymbol}` : ''}</span>
                    </p>
                    <p className="text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>{m.error ?? m.choice?.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="lg:self-start">
            <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide lg:mt-0" style={{ color: 'var(--muted)' }}>One personality for the litter</p>
            <PersonalityPicker value={personality} onChange={setPersonality} />
            <button onClick={hatchLitter} disabled={!pups.length} className="pill mt-4 w-full text-[18px] disabled:opacity-40">Hatch {pups.length} pups</button>
            <p className="mt-2 text-center text-[11.5px]" style={{ color: 'var(--muted)' }}>
              {address ? 'Bound to your wallet: you sign every feed, and Roost never holds your keys.' : 'No wallet connected — the litter will trade on paper.'}
            </p>
            <button onClick={() => { setLitter(null); setStep('pod'); }} className="mt-3 w-full text-center text-[13px] underline" style={{ color: 'var(--muted)' }}>
              Pick something else
            </button>
            </div>
            </div>
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
                      <motion.img key="pod" src={`/pets/eggs/${m.species}.png`} alt="" className="h-20 w-20 object-contain"
                        animate={{ rotate: [0, -6, 6, -8, 8, -4, 4, 0] }} transition={{ duration: 1.3, ease: 'easeInOut', delay: i * 0.04 }}
                        exit={{ scale: 1.3, opacity: 0, transition: { duration: 0.2 } }} />
                    ) : (
                      <motion.div key="pet" className="flex flex-col items-center" initial={{ scale: 0.4, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 16, delay: i * 0.06 }}>
                        <img src={petImage(m.species, 'ecstatic')} alt="" className="h-20 w-20 object-contain" />
                        <span className="flex items-center gap-1 text-[11px] font-bold num"><StockLogo address={m.stock?.address} ticker={m.ticker} size={16} />{m.ticker}</span>
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
            <div className="relative grid h-72 w-72 place-items-center" style={{ ['--pet' as string]: HUE[sp.id].main }}>
              <div className="stage-rays !w-[260%]" style={{ ['--rays' as string]: 'color-mix(in srgb, var(--accent) 22%, transparent)' }} aria-hidden />
              {cracked && <Confetti />}
              <AnimatePresence mode="wait">
                {!cracked ? (
                  <motion.img key="pod" src={`/pets/eggs/${sp.id}.png`} alt="" className="h-56 w-56 object-contain"
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
          <motion.section key="name" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="lg:mx-auto lg:grid lg:w-full lg:max-w-[1000px] lg:flex-1 lg:grid-cols-[300px_minmax(0,1fr)] lg:content-center lg:gap-x-10">
            {/* Desktop: the pet, its name and Adopt on the left; the six personalities two-up beside them. */}
            <div className="stage mx-auto mt-2 grid w-full max-w-[300px] place-items-center rounded-[24px] pb-1 pt-3 lg:col-start-1 lg:row-start-1 lg:mt-0 lg:self-end" style={{ ['--pet' as string]: HUE[sp.id].main }}>
              <div className="stage-rays" aria-hidden />
              <Pet id={sp.id} mood="happy" night={false} size={wide ? 190 : 170} base />
            </div>
            <label className="card mt-2 block px-4 py-3 lg:col-start-1 lg:row-start-2">
              <span className="block text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} autoFocus
                className="w-full bg-transparent text-[20px] font-bold outline-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }} />
            </label>
            <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-center">
              <p className="mt-4 hidden text-[12px] font-semibold uppercase tracking-wide lg:block" style={{ color: 'var(--muted)' }}>Personality — it is also how it trades</p>
              <PersonalityPicker value={personality} onChange={setPersonality} />
            </div>
            <p className="mt-3 text-center text-[12.5px] lg:hidden" style={{ color: 'var(--muted)' }}>The personality is also how it trades.</p>
            <button onClick={adopt} disabled={!name.trim()} className="pill mt-4 w-full text-[18px] disabled:opacity-40 lg:col-start-1 lg:row-start-3 lg:self-start">Adopt {name.trim() || sp.name}</button>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
