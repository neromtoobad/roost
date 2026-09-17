'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Transaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { ConnectPill } from '@/components/Wallet';
import { Confetti } from '@/components/Confetti';
import { SPECIES, petImage, type Species } from '@/lib/pets';
import { PERSONALITIES, type Personality, type Launch } from '@/lib/store';

// The page you send to a friend. A stranger with no Stockling of their own can read the pet's
// record, see how far its curve has filled, and back it with the stock it invests in.

type Pet = {
  id: string; name: string; species: Species['id']; ticker: string; personality: Personality;
  streak: number; paper: boolean; launch: Launch | null;
  qty: number; basis: number; lentQty: number;
  recent: { ts: number; kind: string; text: string }[];
};

type Pool = {
  progress: number; raised: number; threshold: number; price: number | null;
  unclaimed: number; claimed: number; migrated: boolean; quoteTicker: string;
  backers: { count: number } | null; error?: string;
};

const AMOUNTS = [0.05, 0.1, 0.25];

export function BackClient({ id }: { id: string }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [pet, setPet] = useState<Pet | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [amount, setAmount] = useState(AMOUNTS[1]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/pet/${id}`).then((r) => r.json()).then((j: Pet & { error?: string }) => {
      if (!alive) return;
      if (j.error) { setMissing(true); return; }
      setPet(j);
      if (j.launch?.pool) {
        fetch(`/api/pool/${j.launch.pool}?species=${j.species}`).then((r) => r.json())
          .then((p: Pool) => { if (alive) setPool(p); }).catch(() => {});
      }
    }).catch(() => { if (alive) setMissing(true); });
    return () => { alive = false; };
  }, [id]);

  const back = async () => {
    if (!publicKey || !pet) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/back', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pet.id, backer: publicKey.toBase58(), amount }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'could not build the transaction');
      const sig = await sendTransaction(Transaction.from(Buffer.from(j.tx, 'base64')), connection);
      await connection.confirmTransaction(sig, 'confirmed');
      setDone(sig);
      // Tell the pet it was fed. The server checks the signature before it writes anything.
      void fetch('/api/back/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pet.id, sig, amount }),
      }).catch(() => {});
      fetch(`/api/pool/${pet.launch!.pool}?species=${pet.species}`).then((x) => x.json()).then(setPool).catch(() => {});
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  if (missing) return (
    <main className="mx-auto grid min-h-dvh max-w-[430px] place-items-center px-6 text-center">
      <div>
        <p className="text-[17px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>No Stockling here.</p>
        <Link href="/adopt" className="pill mt-4 grid place-items-center px-6 text-[15px]">Adopt one</Link>
      </div>
    </main>
  );
  if (!pet) return <main className="mx-auto grid min-h-dvh max-w-[430px] place-items-center"><p className="text-[13px] num" style={{ color: 'var(--muted)' }}>loading…</p></main>;

  const sp = SPECIES[pet.species];
  const quote = pool?.quoteTicker ?? (sp.quoteMint ? sp.ticker : 'USDC');
  const symbol = pet.name.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || sp.ticker;
  const pct = pool ? Math.round(pool.progress * 100) : 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-10 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="grid grid-cols-[1fr_auto] items-center">
        <Link href="/" className="text-[13px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>Stocklings</Link>
        <ConnectPill />
      </div>

      <div className="relative mx-auto mt-3 flex flex-col items-center">
        {done && <Confetti count={40} />}
        <img src={petImage(pet.species, done ? 'ecstatic' : 'happy')} alt="" className="h-44 w-44 object-contain" />
      </div>

      <h1 className="mt-1 text-center text-[26px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>{pet.name}</h1>
      <p className="text-center text-[13px]" style={{ color: 'var(--muted)' }}>
        {PERSONALITIES[pet.personality]?.icon} {PERSONALITIES[pet.personality]?.name} · {sp.ticker} · day {pet.streak}
        {pet.paper && ' · paper'}
      </p>

      <div className="card mt-4 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[12.5px]" style={{ color: 'var(--muted)' }}>Holds</span>
          <span className="text-[15px] font-bold num">{pet.qty.toFixed(4)} {sp.ticker}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-[12.5px]" style={{ color: 'var(--muted)' }}>Put in</span>
          <span className="text-[13px] num">${pet.basis.toFixed(2)}{pet.lentQty > 0 && ' · lending'}</span>
        </div>
      </div>

      {pet.recent.length > 0 && (
        <ul className="mt-3 grid gap-1.5">
          {pet.recent.slice(0, 3).map((e) => (
            <li key={`${e.ts}-${e.kind}`} className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
              <span className="num">{new Date(e.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> — {e.text}
            </li>
          ))}
        </ul>
      )}

      {!pet.launch ? (
        <p className="mt-6 text-center text-[14px]" style={{ color: 'var(--muted)' }}>
          {pet.name} hasn&rsquo;t gone public yet. Nothing to back — come back when it rings the bell.
        </p>
      ) : (
        <>
          <div className="card mt-4 px-4 py-3">
            <div className="flex justify-between text-[12.5px]">
              <span style={{ color: 'var(--muted)' }}>Curve</span>
              <span className="num">
                {pool ? `${pool.raised.toFixed(3)} / ${pool.threshold.toFixed(2)} ${quote}` : '—'}
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full" style={{ background: 'var(--line)' }}>
              <div className="h-2 rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: 'var(--accent)' }} />
            </div>
            <p className="mt-2 text-[11.5px] num" style={{ color: 'var(--muted)' }}>
              {pool?.migrated ? 'Graduated to a full pool.' : `${pct}% to graduation`}
              {pool?.backers && ` · ${pool.backers.count} backer${pool.backers.count === 1 ? '' : 's'}`}
              {pool && pool.claimed + pool.unclaimed > 0 && ` · ${(pool.claimed + pool.unclaimed).toFixed(4)} ${quote} paid to ${pet.name}`}
            </p>
          </div>

          <p className="mt-4 text-center text-[13.5px]">
            Your <b>{quote}</b> buys <b className="num">${symbol}</b> on its curve. Every trade pays a fee in {quote}
            {' '}straight to {pet.name} — backing it is feeding it.
          </p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {AMOUNTS.map((a) => (
              <button key={a} onClick={() => setAmount(a)}
                className="rounded-full border py-2.5 text-[14px] font-bold num"
                style={{ borderColor: a === amount ? 'var(--accent)' : 'var(--line)', background: 'var(--surface)' }}>
                {a} {quote}
              </button>
            ))}
          </div>

          {done ? (
            <a className="pill mt-4 grid w-full place-items-center text-[16px]" href={`https://solscan.io/tx/${done}`} target="_blank" rel="noreferrer">
              Backed. View the transaction
            </a>
          ) : !connected ? (
            <p className="mt-4 text-center text-[14px]" style={{ color: 'var(--muted)' }}>Connect a wallet holding {quote} to back {pet.name}.</p>
          ) : (
            <button onClick={back} disabled={busy} className="pill mt-4 w-full text-[18px] disabled:opacity-60">
              {busy ? 'Backing…' : `Back ${pet.name}`}
            </button>
          )}
          {pool?.error && <p className="mt-3 text-center text-[12px]" style={{ color: 'var(--muted)' }}>Curve unreadable right now: {pool.error}</p>}
          {err && <p className="mt-3 text-center text-[13px]" style={{ color: 'var(--down)' }}>{err}</p>}
        </>
      )}

      <Link href="/adopt" className="mt-6 text-center text-[13px]" style={{ color: 'var(--muted)' }}>
        Adopt your own →
      </Link>
    </main>
  );
}
