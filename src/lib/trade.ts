'use client';
import { useCallback, useState } from 'react';
import { getConnection, sendTransaction, switchChain, waitForTransactionReceipt } from 'wagmi/actions';
import { erc20Abi, formatUnits, parseEventLogs, type Hex } from 'viem';
import { config, BSC_CHAIN_ID } from './chain';
import { SPECIES, USDT, type Species } from './pets';
import type { BuyPlan, Preflight, UnsignedTx } from './preflight';

// Feeding a live Fledgling for real, from the browser.
//
// Roost holds no keys, so the owner's own wallet signs every step, in this order:
//
//   1. POST /api/trade      the aggregator's transaction for this wallet, simulated first
//   2. approve (if needed)  USDT for exactly this amount, to exactly the router that will spend it
//   3. swap                 the transaction that was simulated, unchanged
//   4. receipt              what actually arrived, read from the swap's own Transfer logs
//
// Step 4 is the one that goes in the diary. Not the quote and not the simulation: the chain.

export type BuyStep =
  | { at: 'idle' }
  | { at: 'checking' }
  | { at: 'approve'; preflight: Preflight }
  | { at: 'approving'; hash: string }
  | { at: 'buy'; preflight: Preflight }
  | { at: 'buying'; hash: string }
  | { at: 'done'; hash: string; qty: number; spent: number }
  | { at: 'stopped'; reason: string; hash?: string };

export type Bought = { hash: string; qty: number; spent: number };

const lower = (a: string | undefined) => (a ?? '').toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function plan(species: Species['id'], usd: number, wallet: string): Promise<BuyPlan> {
  const r = await fetch('/api/trade', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ species, usd, wallet }),
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

export function useBuy() {
  const [step, setStep] = useState<BuyStep>({ at: 'idle' });
  const reset = useCallback(() => setStep({ at: 'idle' }), []);

  const run = useCallback(async (species: Species['id'], usd: number, wallet: string): Promise<Bought | null> => {
    const sp = SPECIES[species];
    const stop = (reason: string, hash?: string) => { setStep({ at: 'stopped', reason, hash }); return null; };
    let approved = false;
    // What has already left for the chain. After that point "nothing was spent" stops being true.
    let sent: { hash: string; what: 'approval' | 'buy' } | null = null;

    try {
      // The Fledgling is bound to one wallet. Signing from another would buy into the wrong pocket.
      const c = getConnection(config);
      if (!c.isConnected || lower(c.address) !== lower(wallet)) {
        return stop(`This Fledgling is bound to ${wallet.slice(0, 6)}…${wallet.slice(-4)}. Switch to that account in your wallet.`);
      }
      if (c.chainId !== BSC_CHAIN_ID) await switchChain(config, { chainId: BSC_CHAIN_ID });

      setStep({ at: 'checking' });
      let p = await plan(species, usd, wallet);

      if (p.preflight.status === 'needs-approval') {
        if (!p.approval) return stop('Roost could not build an approval that matches this buy exactly, so it is not asking you to sign one.');
        setStep({ at: 'approve', preflight: p.preflight });
        const ah = await send(p.approval, wallet);
        sent = { hash: ah, what: 'approval' };
        setStep({ at: 'approving', hash: ah });
        const ar = await waitForTransactionReceipt(config, { hash: ah, chainId: BSC_CHAIN_ID });
        if (ar.status !== 'success') return stop('The approval reverted on-chain. Nothing was bought.', ah);
        approved = true;

        // The simulator's node can trail the one that mined the approval by a block or two.
        setStep({ at: 'checking' });
        for (let i = 0; i < 4; i++) {
          p = await plan(species, usd, wallet);
          if (p.preflight.status !== 'needs-approval') break;
          await sleep(2500);
        }
      }

      if (p.preflight.status !== 'would-succeed' || !p.swap) return stop(p.preflight.summary);

      setStep({ at: 'buy', preflight: p.preflight });
      const h = await send(p.swap, wallet);
      sent = { hash: h, what: 'buy' };
      setStep({ at: 'buying', hash: h });
      const rc = await waitForTransactionReceipt(config, { hash: h, chainId: BSC_CHAIN_ID });
      if (rc.status !== 'success') return stop('The swap reverted on-chain. The gas is spent; the USDT is not.', h);

      // What actually moved, from the receipt — the only number the diary should carry.
      const transfers = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: rc.logs });
      const total = (token: string, mine: (a: { from: string; to: string }) => boolean) => transfers
        .filter((l) => lower(l.address) === lower(token) && mine(l.args))
        .reduce((s, l) => s + l.args.value, BigInt(0));
      const qty = Number(formatUnits(total(sp.address, (a) => lower(a.to) === lower(wallet)), sp.decimals));
      const spent = Number(formatUnits(total(USDT, (a) => lower(a.from) === lower(wallet)), 18));
      if (!(qty > 0)) return stop(`The swap confirmed, but no ${sp.tokenSymbol} transfer to your wallet appears in its logs. Check it on BscScan before trusting any number here.`, h);

      setStep({ at: 'done', hash: h, qty, spent });
      return { hash: h, qty, spent: spent || usd };
    } catch (e) {
      const reason = why(e);
      if (sent?.what === 'buy') return stop(`${reason} The buy was already sent — check it on BscScan before trying again.`, sent.hash);
      if (sent && !approved) return stop(`${reason} The approval was sent but not confirmed here — check it on BscScan.`, sent.hash);
      return stop(approved ? `${reason} The approval stays in place, so the next try skips it.` : `${reason} Nothing was spent.`);
    }
  }, []);

  return { step, run, reset };
}

export const bscscan = (hash: string) => `https://bscscan.com/tx/${hash}`;
