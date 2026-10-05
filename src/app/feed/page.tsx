'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { ConnectPill, useWallet } from '@/components/Wallet';
import { petImage, type Mood } from '@/lib/pets';
import { PERSONALITIES, feedPetRemote, feedingDay, isPaper, readPet, recordBuy, setSchedule, stockOf, useFocusPet, usePet } from '@/lib/store';
import { CADENCE_LABEL, isDue, type Cadence } from '@/lib/care';
import { syncPet } from '@/lib/sync';
import { nyseSession } from '@/lib/session';
import { useSearch } from '@/lib/client';
import { bscscan, useBuy, type BuyStep } from '@/lib/trade';

// Ondo refuses orders of exactly $5 ("Minimum order amount is 5 USD"), so its pets start higher.
const AMOUNTS = { bstock: [5, 10, 25, 50], ondo: [10, 25, 50, 100] } as const;
type Price = { price: number | null; pct24h: number; source: string };

/** What the pet will actually do with the money — its strategy, not a generic "buy now". */
function plan(personality: string, open: boolean, name: string): string {
  if (personality === 'degen') return `${name} will hunt a 2% dip, at any hour.`;
  if (personality === 'boomer') return open ? `${name} will deploy it now, keeping 20% in reserve.` : `${name} will wait for regular hours. Not before.`;
  if (personality === 'quant') return `${name} will deploy it at the next weekly rebalance.`;
  if (personality === 'night') return open ? `${name} waits for the close — it only buys while the exchange sleeps.` : `${name} will buy any 1% discount to the last close, tonight.`;
  if (personality === 'momentum') return `${name} will buy at the next open, if it's above its five-day average.`;
  return open ? `${name} will deploy it now.` : `${name} will deploy it at the open.`;
}

/** The same plan in a few words, for the "When" row of the preview. */
function when(personality: string, open: boolean): string {
  if (personality === 'degen') return 'On a 2% dip';
  if (personality === 'boomer') return open ? 'Now, 80% of it' : 'In regular hours';
  if (personality === 'quant') return 'At the weekly rebalance';
  if (personality === 'night') return open ? 'After the close' : 'Tonight, 1% under the close';
  if (personality === 'momentum') return 'Next open, if trending';
  return open ? 'Now' : 'At the open';
}

/** The same rules for a live pet, which can only ask: Roost cannot sign. */
const later: Record<string, string> = {
  diamond: 'buy at the open', degen: 'hunt a 2% dip', boomer: 'buy in regular hours', quant: 'buy at the weekly rebalance',
  night: 'buy a discount while the exchange sleeps', momentum: 'buy strength at the open',
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const busy = (s: BuyStep) => ['checking', 'approve', 'approving', 'buy', 'buying'].includes(s.at);

/** One line for where the real buy has got to, in the order the wallet will see it. */
function progress(step: BuyStep, name: string, ticker: string): { text: string; tone: string; hash?: string } | null {
  switch (step.at) {
    case 'idle': return null;
    case 'checking': return { text: 'Simulating it against your wallet first…', tone: 'var(--muted)' };
    case 'approve': return { text: 'Approve exactly this much USDT in your wallet. Then the buy.', tone: 'var(--ink)' };
    case 'approving': return { text: 'Approval confirming on BSC…', tone: 'var(--muted)', hash: step.hash };
    case 'buy': return { text: `Confirm the buy in your wallet. ${step.preflight.summary}`, tone: 'var(--ink)' };
    case 'buying': return { text: 'Bought. Waiting for BSC to confirm it…', tone: 'var(--muted)', hash: step.hash };
    case 'done': return { text: `${name} ate. ${step.qty.toFixed(4)} ${ticker} is in your wallet.`, tone: 'var(--up)', hash: step.hash };
    case 'stopped': return { text: step.reason, tone: 'var(--down)', hash: step.hash };
  }
}

// A fed pet is content, not ecstatic: feeding is not an event to celebrate, only care milestones are.
function face(step: BuyStep, paperDone: boolean): Mood {
  if (paperDone || step.at === 'done') return 'happy';
  if (step.at === 'stopped') return 'sulking';
  if (busy(step)) return 'nervous';
  return 'hungry';
}

export default function FeedPage() {
  const router = useRouter();
  const pet = usePet();
  const q = useSearch();
  // From the Telegram pet: "Sign it" names the pet, which may not be the one last on screen.
  const elsewhere = useFocusPet(q);
  const { address, isConnected } = useWallet();
  const { step, run, reset } = useBuy();
  const [usd, setUsd] = useState<number | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [paperDone, setPaperDone] = useState(false);
  // Make it a habit: the same feed on a schedule. Scheduled saving beats everything else (lib/care).
  const [repeat, setRepeat] = useState<Cadence | null>(null);
  const [funds, setFunds] = useState<{ wallet: string; usdt: number; bnb: number } | null>(null);

  useEffect(() => {
    if (!pet) return;
    let alive = true;
    fetch(`/api/price/${stockOf(pet).address}`).then((r) => r.json()).then((p: Price) => { if (alive) setPrice(p); }).catch(() => {});
    return () => { alive = false; };
  }, [pet?.uid, pet?.species]); // eslint-disable-line react-hooks/exhaustive-deps

  // A live pet spends the bound wallet's USDT: read it once, so "not enough" shows here, not in the wallet.
  const wallet = pet?.wallet ?? null;
  useEffect(() => {
    if (!wallet) return;
    let alive = true;
    fetch(`/api/holdings?wallet=${wallet}`).then((r) => (r.ok ? r.json() : null))
      .then((h: { usdt?: number; bnb?: number } | null) => { if (alive && h && typeof h.usdt === 'number') setFunds({ wallet, usdt: h.usdt, bnb: h.bnb ?? 0 }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [wallet]);

  if (!pet) return null;
  const sp = stockOf(pet);
  const live = !isPaper(pet);
  const open = nyseSession() === 'regular';
  // Arriving from "Sign it": the amount is the pet's own decision, not a choice on this screen.
  const signing = live && q.get('proposal') === '1' && pet.proposal ? pet.proposal : null;
  const amounts = AMOUNTS[sp.platform];
  // Arriving from "Sign it" on a feeding day: the amount is the schedule's, and a success keeps it.
  const due = q.get('due') === '1' && pet.schedule && isDue(pet.schedule) ? pet.schedule : null;
  const amount = signing ? signing.usd : due ? due.usd : usd ?? amounts[0];
  const shares = price?.price ? amount / price.price : null;
  const bound = pet.wallet ?? '';
  const matches = Boolean(address && bound && address.toLowerCase() === bound.toLowerCase());
  const line = progress(step, pet.name, sp.ticker);
  const held = live && funds && funds.wallet === bound ? funds : null;
  const shortUsdt = held !== null && held.usdt + 1e-9 < amount;
  const shortGas = held !== null && held.bnb < 0.0003;
  const cta = busy(step) ? 'Working…' : step.at === 'done' ? `Back to ${pet.name}` : step.at === 'stopped' ? 'Try again' : `Buy now · $${amount}`;

  /** After any feed: a feeding day kept, or a new schedule set from the Repeat choice. */
  const settle = (p: typeof pet) => (due ? feedingDay(p, 'kept') : repeat ? setSchedule(p, amount, repeat) : p);

  const feedPaper = () => {
    void feedPetRemote(pet, amount, open).then((p) => syncPet(settle(p)));
    setPaperDone(true);
    setTimeout(() => router.push('/?fed=1'), 1100);
  };

  // Fund it and let its rule decide when — the engine will ask for a signature when it fires.
  const feedLater = () => {
    void feedPetRemote(pet, amount, open).then((p) => syncPet(settle(p)));
    router.push('/?fed=1');
  };

  const buyNow = async () => {
    if (step.at === 'done') { router.push('/?fed=1'); return; }
    const b = await run({ species: pet.species, stock: sp }, amount, bound);
    if (!b) return;
    // The pet may have ticked while the wallet was open; record against the latest copy.
    const current = readPet() ?? pet;
    const reason = signing ? `You signed. ${b.qty.toFixed(4)} ${sp.ticker} — ${signing.reason}.` : undefined;
    const { pet: bought, fresh } = recordBuy(current, { hash: b.hash, qty: b.qty, spent: b.usdt, fromCash: Boolean(signing), reason });
    void syncPet(settle(bought), fresh);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-10 pt-[max(12px,env(safe-area-inset-top))] lg:h-full lg:min-h-0 lg:max-w-[1200px] lg:px-10 lg:pb-6 lg:pt-6">
      <div className="grid grid-cols-[40px_1fr_40px] items-center">
        <button onClick={() => router.back()} aria-label="Back" className="text-[22px]">‹</button>
        <span className="justify-self-center rounded-full border px-3 py-1.5 text-[12px] num" style={{ borderColor: 'var(--ink)' }}>
          {signing ? `${pet.name} asks` : `Feed ${pet.name}`}{live ? '' : ' · paper'}
        </span>
      </div>

      {elsewhere && (
        <p className="card mt-3 px-3 py-2 text-[12.5px]" style={{ color: 'var(--down)' }}>
          That link is for a Fledgling that lives in another browser. This is {pet.name} — the one hatched here.
        </p>
      )}

      {/* Desktop: the pet and the question on the left, the choices on the right. */}
      <div className="lg:mt-4 lg:grid lg:grid-cols-2 lg:items-center lg:gap-8 xl:gap-14">
      <div className="lg:rounded-[var(--radius-card)] lg:border lg:border-[var(--line)] lg:bg-[var(--surface)] lg:px-6 lg:py-10">
      <div className="relative mx-auto mt-4 grid h-56 w-56 place-items-center lg:mt-0 lg:h-64 lg:w-64 xl:tall:h-80 xl:tall:w-80">
        <motion.img src={petImage(pet.species, face(step, paperDone))} alt="" className="h-52 w-52 object-contain lg:h-60 lg:w-60 xl:tall:h-76 xl:tall:w-76"
          animate={paperDone || step.at === 'done' ? { y: [0, -6, 0] } : {}} transition={{ duration: 0.4 }} />
      </div>

      <h1 className="mt-1 text-center text-[24px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        {signing ? `${pet.name} wants $${signing.usd.toFixed(2)} in.` : due ? `Feeding day: $${due.usd} ${CADENCE_LABEL[due.every]}.` : `How much do you want to feed ${pet.name}?`}
      </h1>

      </div>
      {/* The tray: how much, how often, exactly what happens, and one button. */}
      <div className="card mt-5 px-4 pb-4 pt-4 lg:mt-0 lg:px-6 lg:pb-5 lg:pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11.5px] font-medium uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>
            {signing ? 'It asks for' : due ? 'Feeding day' : 'Amount'}
          </p>
          {held && <p className="num text-[12px]" style={{ color: 'var(--muted)' }}>Wallet {held.usdt.toFixed(2)} USDT</p>}
        </div>
        <div className="mt-1 text-[44px] font-semibold leading-none tracking-[-0.02em]">
          <NumberFlow value={amount} locales="en-US" format={{ style: 'currency', currency: 'USD', minimumFractionDigits: amount % 1 ? 2 : 0 }} className="dim-cents" />
        </div>
        <p className="mt-1.5 min-h-[18px] text-[12.5px] num" style={{ color: shortUsdt || shortGas ? 'var(--down)' : 'var(--muted)' }}>
          {shortUsdt ? `Not enough USDT: the wallet holds $${held!.usdt.toFixed(2)}.`
            : shortGas ? 'The wallet needs a little BNB for gas.'
            : shares ? `≈ ${shares.toFixed(4)} ${sp.ticker} at today’s price` : ''}
        </p>

        {!signing && !due && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {amounts.map((a) => (
              <button key={a} onClick={() => { setUsd(a); if (step.at === 'stopped') reset(); }} disabled={busy(step) || step.at === 'done'}
                className="h-10 rounded-full text-[14.5px] font-semibold num transition-colors"
                style={amount === a ? { background: 'var(--accent)', color: 'var(--on-accent)' } : { background: 'var(--surface-2)', border: '1px solid var(--line)' }}>${a}</button>
            ))}
          </div>
        )}

        {!signing && !due && (
          <div className="mt-4">
            <p className="text-[11.5px] font-medium uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>Repeat</p>
            <div className="mt-1.5 grid grid-cols-4 rounded-full p-1 text-[12.5px] font-semibold" style={{ background: 'var(--surface-2)' }} role="radiogroup" aria-label="Repeat">
              {([null, 'week', 'fortnight', 'month'] as (Cadence | null)[]).map((c) => (
                <button key={c ?? 'once'} role="radio" aria-checked={repeat === c} onClick={() => setRepeat(c)} disabled={busy(step) || step.at === 'done'}
                  className="rounded-full py-1.5 transition-colors"
                  style={repeat === c ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(0,0,0,.2)' } : { color: 'var(--muted)' }}>
                  {c === null ? 'Once' : c === 'week' ? 'Weekly' : c === 'fortnight' ? '2 weeks' : 'Monthly'}
                </button>
              ))}
            </div>
            {repeat && (
              <p className="mt-1.5 text-[12px]" style={{ color: 'var(--muted)' }}>
                ${amount} {CADENCE_LABEL[repeat]} from today. {live ? 'You still sign each one — Roost never holds your keys.' : 'On paper, it feeds itself.'}
              </p>
            )}
          </div>
        )}

        {/* What happens, in plain words — the balance change before anything is signed. */}
        <dl className="mt-4 divide-y rounded-[12px] border text-[13.5px]" style={{ borderColor: 'var(--line)' }}>
          {[
            ['You put in', `−$${amount.toFixed(2)} ${live ? 'USDT' : 'on paper'}`, 'var(--ink)'],
            [`${pet.name} gets`, shares ? `≈ ${shares.toFixed(4)} ${sp.ticker}` : '—', 'var(--up)'],
            ['When', signing ? 'Now — its rule fired' : live ? 'Now — you sign it' : when(pet.personality, open), 'var(--ink)'],
          ].map(([k, v, tone]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-3.5 py-2.5 lg:py-2" style={{ borderColor: 'var(--line)' }}>
              <dt style={{ color: 'var(--muted)' }}>{k}</dt>
              <dd className="num font-medium" style={{ color: tone }}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2.5 flex items-start gap-2 text-[12.5px] leading-snug" style={{ color: 'var(--muted)' }}>
          <span aria-hidden>{PERSONALITIES[pet.personality].icon}</span>
          <span>
            {signing
              ? <>Its rule fired: {signing.reason}. Nothing moves until you sign.</>
              : live
                ? <>{pet.name} buys it now, from your wallet — you sign each step.</>
                : plan(pet.personality, open, pet.name)}
          </span>
        </p>

        {line && (
          <div className="mt-3 rounded-[12px] px-3.5 py-2.5 text-[13px]" style={{ color: line.tone, background: 'var(--surface-2)' }}>
            <p className="font-semibold leading-snug">{line.text}</p>
            {line.hash && (
              <a href={bscscan(line.hash)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] num" style={{ color: 'var(--accent-ink)' }}>
                View on BscScan ↗
              </a>
            )}
          </div>
        )}

        {!live && (
          <button onClick={feedPaper} disabled={paperDone} className="pill mt-4 w-full text-[18px]">
            <Morph text={paperDone ? 'Fed!' : `Feed $${amount}`} />
          </button>
        )}

        {live && !isConnected && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-[12px] px-3.5 py-2.5 text-[13px]" style={{ background: 'var(--surface-2)' }}>
            <span>Connect the wallet {pet.name} is bound to, <span className="num">{short(bound)}</span>.</span>
            <ConnectPill />
          </div>
        )}
        {live && isConnected && !matches && (
          <p className="mt-4 rounded-[12px] px-3.5 py-2.5 text-[13px]" style={{ color: 'var(--down)', background: 'var(--surface-2)' }}>
            This wallet is <span className="num">{address ? short(address) : '—'}</span>. {pet.name} is bound to{' '}
            <span className="num">{short(bound)}</span> — switch accounts in your wallet.
          </p>
        )}
        {live && matches && (
          <button onClick={buyNow} disabled={busy(step) || ((shortUsdt || shortGas) && step.at === 'idle')} className="pill mt-4 w-full text-[18px] disabled:opacity-40">
            <Morph text={cta} />
          </button>
        )}
        {live && !signing && (step.at === 'idle' || step.at === 'stopped') && (
          <button onClick={feedLater} className="mt-3 w-full text-center text-[13px] underline" style={{ color: 'var(--muted)' }}>
            Or just feed it — let {pet.name} {later[pet.personality]} and ask you to sign then
          </button>
        )}

        <p className="mt-3 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
          {live
            ? 'Roost never holds your keys. The diary records what the chain says, not the quote.'
            : 'Paper: no wallet was bound at adoption, so nothing real moves.'}
        </p>
      </div>
      </div>
    </main>
  );
}

/** A button label that slides to its next word instead of snapping — Continue becoming Confirm. */
function Morph({ text }: { text: string }) {
  return (
    <span className="relative inline-grid overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={text} initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}>{text}</motion.span>
      </AnimatePresence>
    </span>
  );
}
