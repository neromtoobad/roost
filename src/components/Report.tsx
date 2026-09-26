'use client';
import { motion } from 'framer-motion';
import { petImage } from '@/lib/pets';
import { awayLabel } from '@/lib/engine';
import { isPaper, type Entry, type PetState } from '@/lib/store';

const ICON: Record<string, string> = { buy: '📈', lend: '🏦', yield: '✨', hold: '🤚', ask: '🙋', feed: '🍽', system: '🔔' };

/** A BSC transaction on BscScan. Signatures from the Solana era still resolve on Solscan. */
export function TxLink({ sig }: { sig: string }) {
  const bsc = sig.startsWith('0x');
  return (
    <a href={bsc ? `https://bscscan.com/tx/${sig}` : `https://solscan.io/tx/${sig}`} target="_blank" rel="noreferrer"
      className="mt-1 inline-block text-[11.5px] num" style={{ color: 'var(--accent)' }}>
      View on {bsc ? 'BscScan' : 'Solscan'} ↗
    </a>
  );
}

/** "While you were out. The appointment mechanic — the reason to open the app tomorrow. */
export function Report({ pet, fresh, awayMs, price, onClose }: {
  pet: PetState; fresh: Entry[]; awayMs: number; price: number | null; onClose: () => void;
}) {
  const buys = fresh.filter((f) => f.kind === 'buy');
  const spent = buys.reduce((s, f) => s + (f.usd ?? 0), 0);
  const earned = fresh.filter((f) => f.kind === 'yield').reduce((s, f) => s + (f.qty ?? 0), 0);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center" style={{ background: 'rgba(0,0,0,.45)' }} onClick={onClose}>
      <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="w-full max-w-[430px] rounded-t-[28px] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        style={{ background: 'var(--surface)', maxHeight: '86dvh', overflowY: 'auto' }}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: 'var(--line)' }} />
        <div className="flex items-center gap-3">
          <img src={petImage(pet.species, 'happy')} alt="" className="h-14 w-14 object-contain" />
          <div>
            <p className="text-[19px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>While you were out</p>
            <p className="text-[12.5px] num" style={{ color: 'var(--muted)' }}>{awayLabel(awayMs)} away · {fresh.length} {fresh.length === 1 ? 'action' : 'actions'}</p>
          </div>
        </div>

        {(spent > 0 || earned > 0) && (
          <div className={`mt-3 grid gap-2 ${spent > 0 && earned > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {spent > 0 && (
              <div className="rounded-[20px] px-3 py-2.5" style={{ background: 'var(--canvas)' }}>
                <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Deployed</p>
                <p className="text-[19px] font-bold num">${spent.toFixed(2)}</p>
              </div>
            )}
            {earned > 0 && (
              <div className="rounded-[20px] px-3 py-2.5" style={{ background: 'var(--canvas)' }}>
                <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Earned lending</p>
                <p className="text-[19px] font-bold num" style={{ color: 'var(--up)' }}>
                  {price ? `+$${(earned * price).toFixed(4)}` : `+${earned.toFixed(5)}`}
                </p>
              </div>
            )}
          </div>
        )}

        <ul className="mt-3 grid gap-2">
          {fresh.slice(-8).map((f, i) => (
            <li key={`${f.ts}-${i}`} className="flex items-start gap-3 rounded-[20px] px-3 py-2.5" style={{ background: 'var(--canvas)' }}>
              <span aria-hidden className="text-[16px] leading-6">{ICON[f.kind] ?? '•'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{f.text}</p>
                <p className="mt-0.5 text-[11px] num" style={{ color: 'var(--muted)' }}>
                  {new Date(f.ts).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  {f.qty != null && f.price != null && ` · ${f.qty.toFixed(4)} @ $${f.price.toFixed(2)}`}
                  {f.paper && ' · paper'}
                </p>
                {f.sig && <TxLink sig={f.sig} />}
              </div>
            </li>
          ))}
        </ul>

        <button onClick={onClose} className="pill mt-4 w-full text-[17px]">Good {pet.name.split(' ')[0]}</button>
      </motion.div>
    </div>
  );
}

/**
 * The pet asking before it does something. One tap either way. A live pet asks for every buy —
 * Roost cannot sign — so its yes is a signature, taken on the feed screen.
 */
export function Ask({ pet, price, onAnswer }: { pet: PetState; price: number | null; onAnswer: (yes: boolean) => void }) {
  if (!pet.proposal) return null;
  const { usd, reason } = pet.proposal;
  const live = !isPaper(pet);
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="card mt-3 px-4 py-3" style={{ outline: '3px solid var(--accent)', boxShadow: 'var(--glow)' }}>
      <p className="text-[15px] font-bold leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
        {pet.name} wants to put <span className="num">${usd.toFixed(0)}</span> in.
      </p>
      <p className="mt-1 text-[13px]" style={{ color: 'var(--muted)' }}>
        It&rsquo;s {reason}{price ? ` · $${price.toFixed(2)} now` : ''}.
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => onAnswer(true)} className="pill flex-1 text-[15px]">{live ? 'Sign it' : `Let ${pet.name.split(' ')[0]}`}</button>
        <button onClick={() => onAnswer(false)} className="flex-1 rounded-full border py-3 text-[15px] font-bold"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)', fontFamily: 'var(--font-display)' }}>Not today</button>
      </div>
    </motion.div>
  );
}
