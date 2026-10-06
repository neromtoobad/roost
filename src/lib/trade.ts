'use client';
import { useCallback, useRef, useState } from 'react';
import { getConnection, sendTransaction, signTypedData, switchChain, waitForTransactionReceipt } from 'wagmi/actions';
import { erc20Abi, formatUnits, parseEventLogs, type Hex } from 'viem';
import { config, BSC_CHAIN_ID } from './chain';
import { USDT, type Species, type Stock } from './pets';
import type { BuyPlan, Preflight, RfqOrder, TypedData, UnsignedTx } from './preflight';

// Feeding a live Fledgling for real, or releasing some of what it holds, from the browser.
//
// Roost holds no keys, so the owner's own wallet signs every step, in this order:
//
//   1. POST /api/trade      the aggregator's transaction for this wallet, simulated first
//   2. approve (if needed)  exactly this amount — USDT for a buy, the stock token for a sale — to
//                           exactly the router that will spend it
//   3. swap                 the transaction that was simulated, unchanged
//   4. receipt              what actually arrived, read from the swap's own Transfer logs
//
// Step 4 is the one that goes in the diary. Not the quote and not the simulation: the chain.
//
// A request-for-quote fill (Ondo, mostly in market hours) swaps step 3 for an order: the owner
// signs EIP-712 typed data, /api/trade/order hands it to Binance's RFQ desk, and the vendor
// settles it on-chain. Step 4 is then read from the vendor's settlement transaction, the same way.

export type BuyStep =
  | { at: 'idle' }
  | { at: 'checking' }
  | { at: 'approve'; preflight: Preflight }
  | { at: 'approving'; hash: string }
  | { at: 'buy'; preflight: Preflight }
  | { at: 'buying'; hash: string }
  | { at: 'sign'; preflight: Preflight }
  | { at: 'settling'; orderId: string }
  | { at: 'done'; hash: string; qty: number; usdt: number }
  | { at: 'stopped'; reason: string; hash?: string };

/** What the receipt says moved: tokens in and USDT out for a buy, the other way for a sale. */
export type Traded = { hash: string; side: 'buy' | 'sell'; qty: number; usdt: number };

/** Whose stock, and which Fledgling asks: the species decides nothing about the price. */
export type Target = { species: Species['id']; stock: Stock };

const lower = (a: string | undefined) => (a ?? '').toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function plan(t: Target, side: 'buy' | 'sell', amount: number, wallet: string): Promise<BuyPlan> {
  const r = await fetch('/api/trade', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      species: t.species, token: t.stock.address, side, wallet,
      ...(side === 'sell' ? { qty: amount } : { usd: amount }),
    }),
  });
  const j = (await r.json()) as BuyPlan & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Roost answered HTTP ${r.status}`);
  return j;
}

function send(tx: UnsignedTx, wallet: string) {
  return sendTransaction(config, {
    account: wallet as Hex,
    chainId: BSC_CHAIN_ID,
    to: tx.to as Hex,
    data: tx.data as Hex,
    value: BigInt(tx.value || '0'),
    // The aggregator's own limit: the wallet's estimate can fail on a route it cannot see.
    gas: BigInt(tx.gas),
  });
}

/** A wallet refusal is the owner changing their mind, not an error to show in red. */
function why(e: unknown): string {
  const err = e as { name?: string; shortMessage?: string; message?: string; cause?: { name?: string } };
  const text = `${err.name ?? ''} ${err.cause?.name ?? ''} ${err.shortMessage ?? ''} ${err.message ?? ''}`;
  if (/UserRejected|rejected|denied|cancel/i.test(text)) return 'You cancelled in the wallet.';
  return err.shortMessage ?? err.message ?? 'Something went wrong talking to the wallet.';
}

/** viem wants integers as bigints; the desk sends them as strings. Walk the declared types. */
function typed(td: TypedData) {
  const types = Object.fromEntries(Object.entries(td.types).filter(([k]) => k !== 'EIP712Domain'));
  const coerce = (type: string, v: unknown): unknown => {
    if (type.endsWith(']')) return Array.isArray(v) ? v.map((x) => coerce(type.slice(0, type.lastIndexOf('[')), x)) : v;
    if (/^u?int\d*$/.test(type)) return typeof v === 'string' || typeof v === 'number' ? BigInt(v) : v;
    const fields = types[type];
    if (fields && v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(fields.map((f) => [f.name, coerce(f.type, o[f.name])]));
    }
    return v;
  };
  const domain = { ...td.domain } as Record<string, unknown>;
  if (domain.chainId !== undefined) domain.chainId = Number(domain.chainId);
  return { domain, types, primaryType: td.primaryType, message: coerce(td.primaryType, td.message) as Record<string, unknown> };
}

const TERMINAL = new Set(['FILLED', 'FAILED', 'EXPIRED', 'CANCELLED']);

/** Hand the signed order to the desk and wait for it to settle, or not. */
async function settle(order: RfqOrder, signature: string, onSubmitted: (id: string) => void): Promise<{ status: string; txHash: string | null; orderId: string }> {
  const r = await fetch('/api/trade/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order.orderId, vendor: order.vendor, signingScheme: order.signingScheme, signature, requestId: crypto.randomUUID() }),
  });
  const j = (await r.json()) as { orderId?: string; error?: string };
  if (!r.ok || !j.orderId) throw new Error(j.error ?? `Roost answered HTTP ${r.status}`);
  onSubmitted(j.orderId);
  // RFQ orders carry a deadline of minutes; give it five, then say where it stands.
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    const s = await fetch(`/api/trade/order?id=${encodeURIComponent(j.orderId)}`).then((x) => x.json() as Promise<{ status?: string; txHash?: string | null }>).catch(() => null);
    if (s?.status && TERMINAL.has(s.status)) return { status: s.status, txHash: s.txHash ?? null, orderId: j.orderId };
  }
  return { status: 'PENDING', txHash: null, orderId: j.orderId };
}

export function useBuy() {
  const [step, setStep] = useState<BuyStep>({ at: 'idle' });
  const reset = useCallback(() => setStep({ at: 'idle' }), []);
  // Why the last run stopped, readable right after it returns — a queue of buys (a litter) decides
  // from it whether to go on to the next pup, and state set during the run has not rendered yet.
  const stopped = useRef<{ reason: string; hash?: string } | null>(null);
  const lastStop = useCallback(() => stopped.current, []);

  /** `amount` is USDT for a buy, tokens of the stock for a sale. */
  const run = useCallback(async (t: Target, amount: number, wallet: string, side: 'buy' | 'sell' = 'buy'): Promise<Traded | null> => {
    const sp = t.stock;
    const selling = side === 'sell';
    const deal = selling ? 'sale' : 'buy';
    const stop = (reason: string, hash?: string) => { stopped.current = { reason, hash }; setStep({ at: 'stopped', reason, hash }); return null; };
    stopped.current = null;
    let approved = false;
    // What has already left for the chain. After that point "nothing was spent" stops being true.
    let sent: { hash: string; what: 'approval' | 'buy' | 'order' } | null = null;

    try {
      // The Fledgling is bound to one wallet. Signing from another would buy into the wrong pocket.
      const c = getConnection(config);
      if (!c.isConnected || lower(c.address) !== lower(wallet)) {
        return stop(`This Fledgling is bound to ${wallet.slice(0, 6)}…${wallet.slice(-4)}. Switch to that account in your wallet.`);
      }
      if (c.chainId !== BSC_CHAIN_ID) await switchChain(config, { chainId: BSC_CHAIN_ID });

      setStep({ at: 'checking' });
      let p = await plan(t, side, amount, wallet);

      if (p.preflight.status === 'needs-approval') {
        if (!p.approval) return stop(`Roost could not build an approval that matches this ${deal} exactly, so it is not asking you to sign one.`);
        setStep({ at: 'approve', preflight: p.preflight });
        const ah = await send(p.approval, wallet);
        sent = { hash: ah, what: 'approval' };
        setStep({ at: 'approving', hash: ah });
        const ar = await waitForTransactionReceipt(config, { hash: ah, chainId: BSC_CHAIN_ID });
        if (ar.status !== 'success') return stop(`The approval reverted on-chain. Nothing was ${selling ? 'sold' : 'bought'}.`, ah);
        approved = true;

        // The simulator's node can trail the one that mined the approval by a block or two.
        setStep({ at: 'checking' });
        for (let i = 0; i < 4; i++) {
          p = await plan(t, side, amount, wallet);
          if (p.preflight.status !== 'needs-approval') break;
          await sleep(2500);
        }
      }

      let h: string;
      if (p.order) {
        // Request-for-quote: an order to sign, settled by the vendor. Nothing leaves the wallet
        // until the desk fills it, and the allowance caps it at exactly this trade.
        setStep({ at: 'sign', preflight: p.preflight });
        const t = typed(p.order.typedData);
        const sig = await signTypedData(config, { account: wallet as Hex, ...t } as Parameters<typeof signTypedData>[1]);
        sent = { hash: '', what: 'order' };
        const res = await settle(p.order, sig, (id) => setStep({ at: 'settling', orderId: id }));
        if (res.status !== 'FILLED' || !res.txHash) {
          return res.status === 'PENDING'
            ? stop(`The order (${res.orderId}) is still with the desk after five minutes. It fills or expires on its own; check your wallet before trying again.`)
            : stop(`The desk did not fill the order (${res.status.toLowerCase()}), so nothing left your wallet. Prices move; try again in a minute.`);
        }
        h = res.txHash;
        sent = { hash: h, what: 'buy' };
        setStep({ at: 'buying', hash: h });
      } else {
        if (p.preflight.status !== 'would-succeed' || !p.swap) return stop(p.preflight.summary);

        setStep({ at: 'buy', preflight: p.preflight });
        h = await send(p.swap, wallet);
        sent = { hash: h, what: 'buy' };
        setStep({ at: 'buying', hash: h });
      }
      const rc = await waitForTransactionReceipt(config, { hash: h as Hex, chainId: BSC_CHAIN_ID });
      if (rc.status !== 'success') return stop(`The swap reverted on-chain. The gas is spent; the ${selling ? sp.tokenSymbol : 'USDT'} is not.`, h);

      // What actually moved, from the receipt — the only number the diary should carry.
      const transfers = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: rc.logs });
      const total = (token: string, mine: (a: { from: string; to: string }) => boolean) => transfers
        .filter((l) => lower(l.address) === lower(token) && mine(l.args))
        .reduce((s, l) => s + l.args.value, BigInt(0));
      const toMe = (a: { to: string }) => lower(a.to) === lower(wallet);
      const fromMe = (a: { from: string }) => lower(a.from) === lower(wallet);
      const qty = Number(formatUnits(total(sp.address, selling ? fromMe : toMe), sp.decimals));
      const usdt = Number(formatUnits(total(USDT, selling ? toMe : fromMe), 18));
      const landed = selling ? usdt : qty;
      if (!(landed > 0)) {
        return stop(`The swap confirmed, but no ${selling ? 'USDT' : sp.tokenSymbol} transfer to your wallet appears in its logs. Check it on BscScan before trusting any number here.`, h);
      }

      setStep({ at: 'done', hash: h, qty, usdt });
      return { hash: h, side, qty: qty || (selling ? amount : 0), usdt: usdt || (selling ? 0 : amount) };
    } catch (e) {
      const reason = why(e);
      if (sent?.what === 'buy') return stop(`${reason} The ${deal} was already sent — check it on BscScan before trying again.`, sent.hash);
      if (sent?.what === 'order') return stop(`${reason} The signed order may already be with the desk — check your wallet before trying again.`);
      if (sent && !approved) return stop(`${reason} The approval was sent but not confirmed here — check it on BscScan.`, sent.hash);
      return stop(approved ? `${reason} The approval stays in place, so the next try skips it.` : `${reason} Nothing was spent.`);
    }
  }, []);

  return { step, run, reset, lastStop };
}

export const bscscan = (hash: string) => `https://bscscan.com/tx/${hash}`;
