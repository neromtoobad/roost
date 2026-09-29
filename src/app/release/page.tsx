'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ConnectPill, useWallet } from '@/components/Wallet';
import { petImage, type Mood } from '@/lib/pets';
import { heldQty, isPaper, readPet, recordSell, stockOf, usePet } from '@/lib/store';
import { syncPet } from '@/lib/sync';
import { bscscan, useBuy, type BuyStep } from '@/lib/trade';

// Letting go of some of what a Fledgling holds. The other half of the loop: a pet you can only feed
// is a pet you can only lose money into. Same checks as feeding, the other way round — simulated
// against the wallet, priced against the reference, an exact approval of the token, and the diary
// written from the receipt.

const PORTIONS = [0.25, 0.5, 1] as const;
type Price = { price: number | null };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const busy = (s: BuyStep) => ['checking', 'approve', 'approving', 'buy', 'buying'].includes(s.at);

function progress(step: BuyStep, name: string, symbol: string): { text: string; tone: string; hash?: string } | null {
  switch (step.at) {
    case 'idle': return null;
    case 'checking': return { text: 'Simulating the sale against your wallet first…', tone: 'var(--muted)' };
    case 'approve': return { text: `Approve exactly this much ${symbol} in your wallet. Then the sale.`, tone: 'var(--ink)' };
    case 'approving': return { text: 'Approval confirming on BSC…', tone: 'var(--muted)', hash: step.hash };
    case 'buy': return { text: `Confirm the sale in your wallet. ${step.preflight.summary}`, tone: 'var(--ink)' };
    case 'buying': return { text: 'Sent. Waiting for BSC to confirm it…', tone: 'var(--muted)', hash: step.hash };
    case 'done': return { text: `${name} let go of ${step.qty.toFixed(4)} ${symbol}. $${step.usdt.toFixed(2)} USDT is back in your wallet.`, tone: 'var(--up)', hash: step.hash };
    case 'stopped': return { text: step.reason, tone: 'var(--down)', hash: step.hash };
  }
}

export default function ReleasePage() {
  const router = useRouter();
  const pet = usePet();
  const { address, isConnected } = useWallet();
  const { step, run, reset } = useBuy();
  const [portion, setPortion] = useState<number>(0.5);
  const [price, setPrice] = useState<number | null>(null);
  const [onChain, setOnChain] = useState<number | null>(null);
  const [paperDone, setPaperDone] = useState(false);

  const stock = pet ? stockOf(pet) : null;
  useEffect(() => {
    if (!stock) return;
    let alive = true;
    fetch(`/api/price/${stock.address}`).then((r) => r.json()).then((p: Price) => { if (alive) setPrice(p.price); }).catch(() => {});
    return () => { alive = false; };
  }, [stock?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the bound wallet really holds of this token. A pet can only release what is actually there.
  useEffect(() => {
    if (!pet?.wallet || !stock) return;
    let alive = true;
    fetch(`/api/holdings?wallet=${pet.wallet}&tokens=${stock.address}`)
      .then((r) => r.json())
      .then((h: { tokens?: Record<string, number> }) => { if (alive) setOnChain(h.tokens?.[stock.address.toLowerCase()] ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [pet?.wallet, stock?.address, step.at === 'done']); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pet || !stock) return null;
  const live = !isPaper(pet);
  const recorded = heldQty(pet);
  // Live: the smaller of what the diary says and what the wallet holds — never sell what is not there.
  const sellable = live && onChain !== null ? Math.min(recorded, onChain) : recorded;
  const qty = sellable * portion;
  const worth = price ? qty * price : null;
  const bound = pet.wallet ?? '';
  const matches = Boolean(address && bound && address.toLowerCase() === bound.toLowerCase());
  const line = progress(step, pet.name, stock.tokenSymbol);
  const mood: Mood = paperDone || step.at === 'done' ? 'happy' : step.at === 'stopped' ? 'sulking' : busy(step) ? 'nervous' : 'chill';

  const releaseLive = async () => {
    if (step.at === 'done') { router.push('/'); return; }
    const t = await run({ species: pet.species, stock }, qty, bound, 'sell');
    if (!t) return;
    const current = readPet() ?? pet;
    const { pet: next, fresh } = recordSell(current, { qty: t.qty, received: t.usdt, hash: t.hash });
    void syncPet(next, fresh);
  };

  const releasePaper = () => {
    if (!price) return;
    const { pet: next, fresh } = recordSell(pet, { qty, received: qty * price, paper: true });
    void syncPet(next, fresh);
    setPaperDone(true);
    setTimeout(() => router.push('/'), 1100);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-10 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="grid grid-cols-[40px_1fr_40px] items-center">
        <button onClick={() => router.back()} aria-label="Back" className="text-[22px]">‹</button>
        <span className="justify-self-center rounded-full border px-3 py-1.5 text-[12px] num" style={{ borderColor: 'var(--ink)' }}>
          Release from {pet.name}{live ? '' : ' · paper'}
        </span>
      </div>

      <div className="mx-auto mt-4 grid h-52 w-52 place-items-center">
        <motion.img src={petImage(pet.species, mood)} alt="" className="h-48 w-48 object-contain"
          animate={paperDone || step.at === 'done' ? { y: [0, -8, 0] } : {}} transition={{ duration: 0.5 }} />
      </div>

      <h1 className="mt-1 text-center text-[24px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        How much should {pet.name} let go of?
      </h1>

      <div className="card mt-4 grid grid-cols-2 gap-3 px-4 py-3 text-[13px]">
        <div>
          <p style={{ color: 'var(--muted)' }}>{pet.name} holds</p>
          <p className="num text-[16px] font-bold">{recorded.toFixed(4)} {stock.ticker}</p>
        </div>
        <div>
          <p style={{ color: 'var(--muted)' }}>{live ? 'Your wallet holds' : 'Worth now'}</p>
          <p className="num text-[16px] font-bold">
            {live ? (onChain === null ? '…' : `${onChain.toFixed(4)} ${stock.tokenSymbol}`) : price ? `$${(recorded * price).toFixed(2)}` : '—'}
          </p>
        </div>
      </div>

      {sellable <= 0 ? (
        <p className="card mt-4 px-4 py-3 text-center text-[14px]" style={{ color: 'var(--muted)' }}>
          {recorded <= 0 ? `Nothing to release yet — ${pet.name} has not bought any ${stock.ticker}.` : `Your wallet holds no ${stock.tokenSymbol} right now, so there is nothing to release from it.`}
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {PORTIONS.map((p) => (
              <button key={p} onClick={() => { setPortion(p); if (step.at === 'stopped') reset(); }} disabled={busy(step) || step.at === 'done'}
                className="rounded-full py-3 text-[16px] font-bold num"
                style={portion === p ? { background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: 'var(--glow)' } : { background: 'var(--surface)', border: '1px solid var(--line)' }}>
                {p === 1 ? 'All' : `${p * 100}%`}
              </button>
            ))}
          </div>
          <p className="card mt-3 px-4 py-3 text-[14px]">
            Sells <b className="num">{qty.toFixed(4)} {stock.tokenSymbol}</b>{worth ? <> — about <b className="num">${worth.toFixed(2)}</b> at today&rsquo;s price</> : null}. {live ? 'The USDT goes back to your wallet.' : 'On paper — nothing real moves.'}
          </p>
        </>
      )}

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

      {sellable > 0 && !live && (
        <button onClick={releasePaper} disabled={paperDone || !price} className="pill mt-4 w-full text-[18px]">{paperDone ? 'Released' : 'Release (paper)'}</button>
      )}
      {sellable > 0 && live && !isConnected && (
        <div className="card mt-4 flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
          <span>Connect the wallet {pet.name} is bound to, <span className="num">{short(bound)}</span>.</span>
          <ConnectPill />
        </div>
      )}
      {sellable > 0 && live && isConnected && !matches && (
        <p className="card mt-4 px-4 py-3 text-[13px]" style={{ color: 'var(--down)' }}>
          This wallet is <span className="num">{address ? short(address) : '—'}</span>. {pet.name} is bound to{' '}
          <span className="num">{short(bound)}</span> — switch accounts in your wallet.
        </p>
      )}
      {sellable > 0 && live && matches && (
        <button onClick={releaseLive} disabled={busy(step)} className="pill mt-4 w-full text-[18px]">
          {busy(step) ? 'Working…' : step.at === 'done' ? `Back to ${pet.name}` : step.at === 'stopped' ? 'Try again' : `Release ${qty.toFixed(4)} ${stock.ticker}`}
        </button>
      )}

      <p className="mt-3 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
        {live ? 'Roost never holds your keys or your USDT. A sale more than 3% under the reference price is refused.' : 'Paper: nothing real moves.'}
      </p>
    </main>
  );
}
