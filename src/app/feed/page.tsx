'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ConnectPill, useWallet } from '@/components/Wallet';
import { petImage, type Mood } from '@/lib/pets';
import { PERSONALITIES, feedPetRemote, feedingDay, isPaper, readPet, recordBuy, setSchedule, stockOf, usePet } from '@/lib/store';
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
  return open ? `${name} will deploy it now and lend it out.` : `${name} will deploy it at the open and lend it out.`;
}

/** The same rules for a live pet, which can only ask: Roost cannot sign, and it does not lend. */
const later: Record<string, string> = {
  diamond: 'buy at the open', degen: 'hunt a 2% dip', boomer: 'buy in regular hours', quant: 'buy at the weekly rebalance',
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
  const { address, isConnected } = useWallet();
  const { step, run, reset } = useBuy();
  const [usd, setUsd] = useState<number | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [paperDone, setPaperDone] = useState(false);
  // Make it a habit: the same feed on a schedule. Scheduled saving beats everything else (lib/care).
  const [repeat, setRepeat] = useState<Cadence | null>(null);

  useEffect(() => {
    if (!pet) return;
    let alive = true;
    fetch(`/api/price/${stockOf(pet).address}`).then((r) => r.json()).then((p: Price) => { if (alive) setPrice(p); }).catch(() => {});
    return () => { alive = false; };
  }, [pet?.uid, pet?.species]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-10 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="grid grid-cols-[40px_1fr_40px] items-center">
        <button onClick={() => router.back()} aria-label="Back" className="text-[22px]">‹</button>
        <span className="justify-self-center rounded-full border px-3 py-1.5 text-[12px] num" style={{ borderColor: 'var(--ink)' }}>
          {signing ? `${pet.name} asks` : `Feed ${pet.name}`}{live ? '' : ' · paper'}
        </span>
      </div>

      <div className="relative mx-auto mt-4 grid h-56 w-56 place-items-center">
        <motion.img src={petImage(pet.species, face(step, paperDone))} alt="" className="h-52 w-52 object-contain"
          animate={paperDone || step.at === 'done' ? { y: [0, -6, 0] } : {}} transition={{ duration: 0.4 }} />
      </div>

      <h1 className="mt-1 text-center text-[24px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        {signing ? `${pet.name} wants $${signing.usd.toFixed(2)} in.` : due ? `Feeding day: $${due.usd} ${CADENCE_LABEL[due.every]}.` : `How much do you want to feed ${pet.name}?`}
      </h1>

      {!signing && !due && (
        <div className="mt-5 grid grid-cols-4 gap-2">
          {amounts.map((a) => (
            <button key={a} onClick={() => { setUsd(a); if (step.at === 'stopped') reset(); }} disabled={busy(step) || step.at === 'done'}
              className="rounded-full py-3 text-[16px] font-bold num"
              style={amount === a ? { background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: 'var(--glow)' } : { background: 'var(--surface)', border: '1px solid var(--line)' }}>${a}</button>
          ))}
        </div>
      )}

      {!signing && !due && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>Repeat</p>
          <div className="mt-1.5 grid grid-cols-4 gap-2">
            {([null, 'week', 'fortnight', 'month'] as (Cadence | null)[]).map((c) => (
              <button key={c ?? 'once'} onClick={() => setRepeat(c)} disabled={busy(step) || step.at === 'done'}
                className="rounded-full py-2 text-[12.5px] font-bold"
                style={repeat === c ? { background: 'var(--ink)', color: 'var(--canvas)' } : { background: 'var(--surface)', border: '1px solid var(--line)' }}>
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

      <div className="card mt-4 flex items-start gap-3 px-4 py-3 text-[14px]">
        <span aria-hidden>{PERSONALITIES[pet.personality].icon}</span>
        <span>
          {signing
            ? <>Its rule fired: {signing.reason}. Nothing moves until you sign.</>
            : live
              ? <>{pet.name} buys it now, from your wallet — you sign each step.</>
              : plan(pet.personality, open, pet.name)}
          {shares && <> About <b className="num">{shares.toFixed(4)} {sp.ticker}</b> at today&rsquo;s price.</>}
        </span>
      </div>

      {line && (
        <div className="card mt-3 px-4 py-3 text-[13.5px]" style={{ color: line.tone }}>
          <p className="font-semibold leading-snug">{line.text}</p>
          {line.hash && (
            <a href={bscscan(line.hash)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] num" style={{ color: 'var(--accent)' }}>
              View on BscScan ↗
            </a>
          )}
        </div>
      )}

      {!live && (
        <button onClick={feedPaper} disabled={paperDone} className="pill mt-4 w-full text-[18px]">{paperDone ? 'Fed!' : 'Confirm'}</button>
      )}

      {live && !isConnected && (
        <div className="card mt-4 flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
          <span>Connect the wallet {pet.name} is bound to, <span className="num">{short(bound)}</span>.</span>
          <ConnectPill />
        </div>
      )}
      {live && isConnected && !matches && (
        <p className="card mt-4 px-4 py-3 text-[13px]" style={{ color: 'var(--down)' }}>
          This wallet is <span className="num">{address ? short(address) : '—'}</span>. {pet.name} is bound to{' '}
          <span className="num">{short(bound)}</span> — switch accounts in your wallet.
        </p>
      )}
      {live && matches && (
        <button onClick={buyNow} disabled={busy(step)} className="pill mt-4 w-full text-[18px]">
          {busy(step) ? 'Working…' : step.at === 'done' ? `Back to ${pet.name}` : step.at === 'stopped' ? 'Try again' : `Buy now · $${amount}`}
        </button>
      )}
      {live && !signing && (step.at === 'idle' || step.at === 'stopped') && (
        <button onClick={feedLater} className="mt-3 text-center text-[13px] underline" style={{ color: 'var(--muted)' }}>
          Or just feed it — let {pet.name} {later[pet.personality]} and ask you to sign then
        </button>
      )}

      <p className="mt-3 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
        {live
          ? 'Roost never holds your keys. The diary records what the chain says, not the quote.'
          : 'Paper: no wallet was bound at adoption, so nothing real moves.'}
      </p>
    </main>
  );
}
