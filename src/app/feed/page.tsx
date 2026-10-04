'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ConnectPill, useWallet } from '@/components/Wallet';
import { ManagerAvatar } from '@/components/ManagerAvatar';
import { managerById, managerForRule } from '@/lib/managers';
import { feedPetRemote, feedingDay, isPaper, readPetByUid, recordBuy, stockOf, useFocusPet, usePet } from '@/lib/store';
import { CADENCE_LABEL, isDue } from '@/lib/care';
import { syncPet } from '@/lib/sync';
import { nyseSession } from '@/lib/session';
import { useSearch } from '@/lib/client';
import { bscscan, useBuy, type BuyStep } from '@/lib/trade';
import { usd as money } from '@/lib/format';

// One position, one buy. Three ways in:
//
//   ?proposal=1   a memo — the manager's rule fired and it is asking for a signature
//   ?due=1        a contribution day for a live mandate, which only its owner can sign
//   (neither)     a one-off top-up of this one stock
//
// A live buy is the aggregator's swap for this wallet, simulated first, approved for exactly this
// amount, and recorded from the receipt — never from the quote. Paper credits the manager and lets
// the rule place it.

const AMOUNTS = { bstock: [10, 25, 50, 100], ondo: [10, 25, 50, 100] } as const;
type Price = { price: number | null; pct24h: number; source: string; reference?: number | null };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const busy = (s: BuyStep) => ['checking', 'approve', 'approving', 'buy', 'buying'].includes(s.at);

function progress(step: BuyStep, ticker: string): { text: string; tone: string; hash?: string } | null {
  switch (step.at) {
    case 'idle': return null;
    case 'checking': return { text: 'Simulating it against your wallet first…', tone: 'var(--muted)' };
    case 'approve': return { text: 'Approve exactly this much USDT in your wallet. Then the buy.', tone: 'var(--ink)' };
    case 'approving': return { text: 'Approval confirming on BSC…', tone: 'var(--muted)', hash: step.hash };
    case 'buy': return { text: `Confirm the buy in your wallet. ${step.preflight.summary}`, tone: 'var(--ink)' };
    case 'buying': return { text: 'Sent. Waiting for BSC to confirm it…', tone: 'var(--muted)', hash: step.hash };
    case 'done': return { text: `Done. ${step.qty.toFixed(4)} ${ticker} is in your wallet.`, tone: 'var(--up)', hash: step.hash };
    case 'stopped': return { text: step.reason, tone: 'var(--down)', hash: step.hash };
  }
}

export default function FeedPage() {
  const router = useRouter();
  const pet = usePet();
  const q = useSearch();
  // From a memo, a mandate or Telegram: the link names the position.
  const elsewhere = useFocusPet(q);
  const { address, isConnected } = useWallet();
  const { step, run, reset } = useBuy();
  const [pick, setPick] = useState<number | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [paperDone, setPaperDone] = useState(false);

  useEffect(() => {
    if (!pet) return;
    let alive = true;
    fetch(`/api/price/${stockOf(pet).address}`).then((r) => (r.ok ? r.json() : null)).then((p: Price | null) => { if (alive && p) setPrice(p); }).catch(() => {});
    return () => { alive = false; };
  }, [pet?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pet) return null;
  const m = managerById(pet.mandate?.manager) ?? managerForRule(pet.personality);
  const sp = stockOf(pet);
  const live = !isPaper(pet);
  const back = pet.mandate ? `/mandate?key=${pet.mandate.key}` : '/';
  const signing = q.get('proposal') === '1' && pet.proposal ? pet.proposal : null;
  const due = q.get('due') === '1' && pet.schedule && isDue(pet.schedule) ? pet.schedule : null;
  const amounts = AMOUNTS[sp.platform];
  const amount = signing ? signing.usd : due ? due.usd : pick ?? amounts[1];
  const shares = price?.price ? amount / price.price : null;
  const bound = pet.wallet ?? '';
  const matches = Boolean(address && bound && address.toLowerCase() === bound.toLowerCase());
  const line = progress(step, sp.ticker);
  const settle = (p: typeof pet) => (due ? feedingDay(p, 'kept') : p);

  const addPaper = () => {
    void feedPetRemote(pet, amount, nyseSession() === 'regular').then((p) => syncPet(settle(p)));
    setPaperDone(true);
    setTimeout(() => router.push(back), 900);
  };
  /** Live, but let the manager time it: a pledge, which comes back as a memo when the rule fires. */
  const pledge = () => {
    void feedPetRemote(pet, amount, nyseSession() === 'regular').then((p) => syncPet(settle(p)));
    router.push(back);
  };
  const buyNow = async () => {
    if (step.at === 'done') { router.push(back); return; }
    const b = await run({ species: pet.species, stock: sp }, amount, bound);
    if (!b) return;
    // The position may have ticked while the wallet was open; record against the latest copy.
    const current = readPetByUid(pet.uid!) ?? pet;
    const reason = signing ? `You signed ${m.name}'s memo: ${b.qty.toFixed(4)} ${sp.ticker} — ${signing.reason}.` : undefined;
    const { pet: bought, fresh } = recordBuy(current, { hash: b.hash, qty: b.qty, spent: b.usdt, fromCash: Boolean(signing), reason });
    void syncPet(settle(bought), fresh);
  };

  const heading = signing ? `${m.name} wants ${money(signing.usd)} in ${sp.ticker}.`
    : due ? `Contribution day: ${money(due.usd)} into ${sp.ticker}, ${CADENCE_LABEL[due.every]}.`
    : `Add to ${sp.ticker}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-10 pt-[max(16px,env(safe-area-inset-top))] lg:max-w-[1000px] lg:px-10 lg:pb-12 lg:pt-8">
      <div className="flex items-center justify-between">
        <Link href={back} className="text-[13px]" style={{ color: 'var(--muted)' }}>‹ {m.name}&rsquo;s mandate</Link>
        <ConnectPill />
      </div>

      {elsewhere && (
        <p className="card mt-3 px-3 py-2 text-[12.5px]" style={{ color: 'var(--down)' }}>
          That link is for a position held in another browser. This is the one held here.
        </p>
      )}

      <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-10">
        <section>
          <div className="flex items-center gap-3">
            <ManagerAvatar manager={m} size={52} />
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>{signing ? 'Memo' : due ? 'Contribution' : 'Top-up'}{live ? '' : ' · paper'}</p>
              <p className="text-[14px]" style={{ color: 'var(--muted)' }}>{m.name} · {m.title}</p>
            </div>
          </div>
          <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight lg:text-[36px]" style={{ fontFamily: 'var(--font-display)' }}>{heading}</h1>

          <div className="card mt-4 grid grid-cols-2 gap-3 px-4 py-3 text-[13px]">
            <div>
              <p style={{ color: 'var(--muted)' }}>Stock</p>
              <p className="text-[15px] font-semibold">{sp.company}</p>
              <p className="num text-[12px]" style={{ color: 'var(--muted)' }}>{sp.ticker} · {sp.tokenSymbol}</p>
            </div>
            <div>
              <p style={{ color: 'var(--muted)' }}>Price now</p>
              <p className="num text-[15px] font-semibold">{price?.price ? money(price.price) : '…'}</p>
              {shares && <p className="num text-[12px]" style={{ color: 'var(--muted)' }}>≈ {shares.toFixed(4)} for {money(amount)}</p>}
            </div>
          </div>

          <p className="mt-3 text-[14px] leading-relaxed">
            {signing
              ? <>The rule fired: <b>{signing.reason}</b>. {m.voice.asks}</>
              : live
                ? <>A real buy from your wallet. {m.name}&rsquo;s rule: {m.rules[0].toLowerCase()}</>
                : <>Paper. {m.name} places it by the rule: {m.rules[0].toLowerCase()}</>}
          </p>
          {live && (
            <ol className="mt-3 grid gap-1 text-[12.5px]" style={{ color: 'var(--muted)' }}>
              <li>1 · Simulated against your wallet with Binance&rsquo;s Transaction API</li>
              <li>2 · Refused if it costs more than 3% over {sp.ticker}&rsquo;s reference price</li>
              <li>3 · An approval of exactly this much USDT, to exactly the router that spends it</li>
              <li>4 · The swap you sign — then recorded from the receipt, not the quote</li>
            </ol>
          )}
        </section>

        <aside className="mt-5 lg:sticky lg:top-8 lg:mt-0">
          <div className="card px-4 py-4">
            {!signing && !due && (
              <div className="grid grid-cols-4 gap-2">
                {amounts.map((a) => (
                  <button key={a} onClick={() => { setPick(a); if (step.at === 'stopped') reset(); }} disabled={busy(step) || step.at === 'done'}
                    className="rounded-[12px] py-2.5 text-[14px] font-semibold num"
                    style={amount === a ? { background: 'var(--ink)', color: 'var(--canvas)' } : { background: 'var(--canvas)', border: '1px solid var(--line)' }}>${a}</button>
                ))}
              </div>
            )}

            {line && (
              <div className="mt-3 text-[13px]" style={{ color: line.tone }}>
                <p className="font-semibold leading-snug">{line.text}</p>
                {line.hash && <a href={bscscan(line.hash)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] num underline">View on BscScan ↗</a>}
              </div>
            )}

            {!live && (
              <button onClick={addPaper} disabled={paperDone} className="pill mt-3 w-full text-[15px]">{paperDone ? 'Added' : `Add ${money(amount, 0)} (paper)`}</button>
            )}
            {live && !isConnected && (
              <div className="mt-3 flex items-center justify-between gap-3 text-[12.5px]">
                <span>Connect the wallet this mandate is bound to, <span className="num">{short(bound)}</span>.</span>
                <ConnectPill />
              </div>
            )}
            {live && isConnected && !matches && (
              <p className="mt-3 text-[12.5px]" style={{ color: 'var(--down)' }}>
                This wallet is <span className="num">{address ? short(address) : '—'}</span>; the mandate is bound to <span className="num">{short(bound)}</span>. Switch accounts in your wallet.
              </p>
            )}
            {live && matches && (
              <button onClick={() => void buyNow()} disabled={busy(step)} className="pill mt-3 w-full text-[15px]">
                {busy(step) ? 'Working…' : step.at === 'done' ? `Back to ${m.name}` : step.at === 'stopped' ? 'Try again' : signing ? `Sign · ${money(amount)}` : `Buy now · ${money(amount)}`}
              </button>
            )}
            {live && !signing && (step.at === 'idle' || step.at === 'stopped') && (
              <button onClick={pledge} className="mt-2 w-full text-center text-[12.5px] underline" style={{ color: 'var(--muted)' }}>
                Or let {m.name} time it — you will get a memo to sign when the rule fires
              </button>
            )}
          </div>
          <p className="mt-2 px-1 text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
            {live ? 'Roost never holds your keys or your USDT.' : 'Paper: no wallet was bound when this manager was hired, so nothing real moves.'}
          </p>
        </aside>
      </div>
    </main>
  );
}
