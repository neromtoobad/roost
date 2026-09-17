'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Transaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Confetti } from '@/components/Confetti';
import { ConnectPill } from '@/components/Wallet';
import { SPECIES, petImage } from '@/lib/pets';
import { readPet, saveLaunch, usePet } from '@/lib/store';
import { backLink, buildClaimTx, syncPet } from '@/lib/sync';
import { useSearch } from '@/lib/client';

// Going public: the pet's token launches on a Meteora DBC quoted in its home stock. Backers buy
// with the stock, and the curve pays the whole creator fee — in that same stock — to the pet. So
// backing a Stockling is feeding it. Keepers graduate the pool once the curve fills.
const MIN_STREAK = 3;

type Pool = { progress: number; raised: number; threshold: number; unclaimed: number; claimed: number;
  migrated: boolean; quoteTicker: string; backers: { count: number } | null };

export default function GoPublic() {
  const router = useRouter();
  const pet = usePet();
  const q = useSearch();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rung, setRung] = useState(false);
  const [pool, setPool] = useState<Pool | null>(null);
  const [copied, setCopied] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const poolAddr = pet?.launch?.pool ?? null;
  useEffect(() => {
    if (!poolAddr || !pet) return;
    let alive = true;
    fetch(`/api/pool/${poolAddr}?species=${pet.species}`).then((r) => r.json())
      .then((j: Pool) => { if (alive) setPool(j); }).catch(() => {});
    return () => { alive = false; };
  }, [poolAddr, pet?.species]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pet) return null;
  const sp = SPECIES[pet.species];
  const eligible = pet.streak >= MIN_STREAK || q.get('dev') === '1';
  const symbol = pet.name.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || sp.ticker;

  const ring = async () => {
    if (!publicKey) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ species: pet.species, name: pet.name, symbol, payer: publicKey.toBase58() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'launch failed');
      const tx = Transaction.from(Buffer.from(j.tx, 'base64'));
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, 'confirmed');
      saveLaunch(pet, { pool: j.pool, baseMint: j.baseMint, config: j.config, quote: j.quote, sig, ts: Date.now() });
      const saved = readPet(); if (saved) void syncPet(saved);
      setRung(true);
      setTimeout(() => router.push('/?public=1'), 1600);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  const collect = async () => {
    if (!publicKey) return;
    setClaiming(true); setErr(null);
    try {
      const j = await buildClaimTx(publicKey.toBase58());
      if (!j.tx) throw new Error(j.error ?? 'nothing to collect');
      const sig = await sendTransaction(Transaction.from(Buffer.from(j.tx, 'base64')), connection);
      await connection.confirmTransaction(sig, 'confirmed');
      if (poolAddr) fetch(`/api/pool/${poolAddr}?species=${pet.species}`).then((r) => r.json()).then(setPool).catch(() => {});
    } catch (e) {
      setErr((e as Error).message);
    } finally { setClaiming(false); }
  };

  const share = async () => {
    const link = backLink();
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-10 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="grid grid-cols-[40px_1fr_auto] items-center">
        <button onClick={() => router.back()} aria-label="Back" className="text-[22px]">‹</button>
        <span className="justify-self-center rounded-full border px-3 py-1.5 text-[12px] num" style={{ borderColor: 'var(--ink)' }}>Go public</span>
        <ConnectPill />
      </div>

      <div className="relative mx-auto mt-4 flex flex-col items-center">
        {rung && <Confetti count={40} />}
        <motion.div className="text-[72px] leading-none" aria-hidden
          animate={rung || busy ? { rotate: [0, -18, 18, -14, 14, -8, 8, 0] } : { rotate: 0 }} transition={{ duration: 1.2, repeat: busy ? Infinity : 0 }}>🔔</motion.div>
        <img src={petImage(pet.species, rung ? 'ecstatic' : 'happy')} alt="" className="-mt-2 h-52 w-52 object-contain" />
      </div>

      <h1 className="mt-2 text-center text-[26px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        {pet.launch ? `${pet.name} is public` : `${pet.name} is going public`}
      </h1>

      <div className="mt-4 grid gap-2">
        <div className="card flex items-center gap-3 px-4 py-3"><span aria-hidden>📈</span><span className="text-[14px]">Token <b className="num">${symbol}</b> quoted in <b>{sp.quoteMint ? sp.ticker : 'USDC'}</b></span></div>
        <div className="card flex items-center gap-3 px-4 py-3"><span aria-hidden>👥</span><span className="text-[14px]">Every trade pays a fee in <b>{sp.quoteMint ? sp.ticker : 'USDC'}</b> straight to {pet.name} — backing it is feeding it</span></div>
        <div className="card px-4 py-3">
          <div className="flex justify-between text-[12.5px]">
            <span style={{ color: 'var(--muted)' }}>Graduation</span>
            <span className="num">{pool ? `${pool.raised.toFixed(3)} / ${pool.threshold.toFixed(2)} ${pool.quoteTicker}` : pet.launch ? '…' : `0 / — ${sp.quoteMint ? sp.ticker : 'USDC'}`}</span>
          </div>
          <div className="mt-2 h-2 rounded-full" style={{ background: 'var(--line)' }}>
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, Math.round((pool?.progress ?? 0) * 100))}%`, background: 'var(--accent)' }} />
          </div>
          {pool && (
            <p className="mt-2 text-[11.5px] num" style={{ color: 'var(--muted)' }}>
              {pool.backers ? `${pool.backers.count} backer${pool.backers.count === 1 ? '' : 's'}` : 'backers hidden'}
              {pool.claimed + pool.unclaimed > 0 && ` · ${(pool.claimed + pool.unclaimed).toFixed(4)} ${pool.quoteTicker} paid in`}
            </p>
          )}
        </div>
      </div>

      {pet.launch ? (
        <>
          <button onClick={share} className="pill mt-5 w-full text-[16px]">{copied ? 'Link copied' : 'Share the backing link'}</button>
          {pool && pool.unclaimed > 0 && connected && (
            <button onClick={collect} disabled={claiming}
              className="mt-2 w-full rounded-full border py-3 text-[14px] font-bold disabled:opacity-60"
              style={{ borderColor: 'var(--accent)', background: 'var(--surface)', fontFamily: 'var(--font-display)' }}>
              {claiming ? 'Collecting…' : `Collect ${pool.unclaimed.toFixed(4)} ${pool.quoteTicker} from backers`}
            </button>
          )}
          <a className="mt-2 grid w-full place-items-center rounded-full border py-3 text-[14px] font-bold" style={{ borderColor: 'var(--line)', background: 'var(--surface)', fontFamily: 'var(--font-display)' }}
            href={`https://solscan.io/account/${pet.launch.pool}`} target="_blank" rel="noreferrer">View pool on Solscan</a>
        </>
      ) : !eligible ? (
        <p className="mt-5 text-center text-[14px]" style={{ color: 'var(--muted)' }}>Bond day {pet.streak} of {MIN_STREAK}. Keep showing up.</p>
      ) : !connected ? (
        <p className="mt-5 text-center text-[14px]" style={{ color: 'var(--muted)' }}>Connect a wallet to ring the bell.</p>
      ) : (
        <button onClick={ring} disabled={busy || rung} className="pill mt-5 w-full text-[18px] disabled:opacity-60">{rung ? 'Public!' : busy ? 'Ringing…' : 'Ring the bell'}</button>
      )}
      {err && <p className="mt-3 text-center text-[13px]" style={{ color: 'var(--down)' }}>{err}</p>}
      <p className="mt-3 text-center text-[12px]" style={{ color: 'var(--muted)' }}>One transaction: creates the curve and the pool on Meteora. You pay only network rent.</p>
    </main>
  );
}
