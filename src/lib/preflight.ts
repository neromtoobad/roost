// Simulate before you spend.
//
// Roost decides and the user's wallet executes. Between the two there used to be only a quote —
// a price, not a promise. The Transaction API's `pre-transaction/simulate` closes the gap: it runs
// the transaction the aggregator builds for this wallet against current chain state and reports
// the balances that would move, or the revert. Nothing is signed and nothing is broadcast.
//
// It earned its place the first time it ran. Twelve wallets that had just used the aggregator's
// router, each asked to buy $1 of NVDAB: eleven would have reverted — six on balance, five on
// allowance. A quote says neither.
//
// It is a proxy, and says so. `baw market-order swap` builds its own transaction; this simulates
// the same trade built by the Binance aggregator for the same wallet. Balance, gas and the pool
// are shared. The router — and so the allowance — may not be, which is why a missing allowance is
// its own status rather than a failure.
//
// The endpoint has no reference page yet. What it actually takes, found by running it:
//
//   · The body is `{ binanceChainId, evmTx: { from, to, value, data } }`. Anything else gets an
//     error naming `evmParams`, a field that does not exist, as code 50000 — "internal error,
//     retry" — for what is a validation failure. An empty body gets a bare "Parameter error".
//   · The official JS connector marks `evmTx`, `solTx` and `tronTx` all required. Only the one
//     matching the chain may be sent.
//   · `balanceChanges[].change` is signed and in base units. Gas paid in BNB is not in it.

import { request, baseUnits } from './binance';
import { CHAIN_ID, USDT, type Species } from './pets';

export type Preflight = {
  /**
   * would-succeed   simulated against this wallet and it went through
   * needs-approval  the only thing stopping it is a USDT allowance for the aggregator's router
   * would-fail      it reverts, or the wallet is short of USDT or of BNB for gas
   * not-simulated   there was nothing to simulate (an RFQ fill) or the gateway would not say
   */
  status: 'would-succeed' | 'needs-approval' | 'would-fail' | 'not-simulated';
  /** One sentence for the owner, before they are asked to say yes. */
  summary: string;
  /** What the simulation moved, from the wallet's side, in whole tokens. */
  spendsUsdt: number | null;
  receivesQty: number | null;
  /** The floor the transaction enforces: fewer than this and it reverts rather than fills. */
  minReceiveQty: number | null;
  slippagePct: number | null;
  /** The swap's gas in USD, as the aggregator prices it. Not included in the amounts above. */
  gasUsd: number | null;
  usdtBalance: number | null;
  bnbBalance: number | null;
  executionMode: string | null;
  /** The contract that needs a USDT allowance, when that is what stops it. */
  spender: string | null;
  /** Verbatim from the simulation, or from the gateway when it would not build a transaction. */
  failReason: string | null;
  simulatedAt: number;
};

type QuoteRow = { quoteId: string; executionMode?: string; tradeFee?: string; approveTarget?: string };
type Tx = { from: string; to: string; value: string; data: string; gas: string; gasPrice: string; minReceiveAmount?: string; slippagePercent?: string };
type Simulation = {
  status?: string;
  failReason?: string | null;
  balanceChanges?: { contractAddress?: string; change?: string; owner?: string }[];
};

const USDT_DECIMALS = 18; // USDT on BSC is 18, not the 6 it uses on Ethereum.
const lower = (a: string | undefined) => (a ?? '').toLowerCase();
const abbrev = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const gatewayMsg = (r: { status: number; json: unknown }) => (r.json as { msg?: string } | null)?.msg ?? `HTTP ${r.status}`;

/** USDT and BNB held, from the Wallet API. Null when it would not say. */
async function balances(wallet: string): Promise<{ usdt: number | null; bnb: number | null }> {
  try {
    const r = await request('POST', '/api/v1/dex/balance/token-balances-by-address', {
      body: {
        address: wallet,
        // An empty contract address is the Wallet API's name for the chain's native asset.
        tokenContractAddresses: [
          { binanceChainId: CHAIN_ID, tokenContractAddress: USDT },
          { binanceChainId: CHAIN_ID, tokenContractAddress: '' },
        ],
      },
    });
    if (r.code !== 0) return { usdt: null, bnb: null };
    const assets = (r.json as { data?: { tokenAssets?: { tokenContractAddress?: string; balance?: string }[] }[] } | null)
      ?.data?.[0]?.tokenAssets ?? [];
    // A token the wallet does not hold can come back absent rather than as "0"; the call itself
    // succeeded, so absent means none.
    const held = (match: (a: string) => boolean) => {
      const v = Number(assets.find((x) => match(lower(x.tokenContractAddress)))?.balance ?? 0);
      return Number.isFinite(v) ? v : null;
    };
    return {
      usdt: held((a) => a === lower(USDT)),
      bnb: held((a) => a === '' || a === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'),
    };
  } catch {
    return { usdt: null, bnb: null };
  }
}

/** A transaction for the owner's wallet to sign, exactly as the aggregator built it. */
export type UnsignedTx = { to: string; data: string; value: string; gas: string };

export type BuyPlan = {
  preflight: Preflight;
  /** The swap, present only when the simulation says it would go through. */
  swap: UnsignedTx | null;
  /** A USDT approval for exactly this amount, present only when that is all that stands in the way. */
  approval: UnsignedTx | null;
};

/** Would buying `usd` of this Fledgling's token go through from `wallet`, right now? */
export async function preflightBuy(sp: Species, usd: number, wallet: string): Promise<Preflight> {
  return (await planBuy(sp, usd, wallet)).preflight;
}

/**
 * The same check, plus what to sign. The web app hands `approval` then `swap` to the owner's
 * wallet; nothing here signs, and a transaction that does not match the request is refused
 * rather than passed on — the wallet prompt is the last line of defence, not the only one.
 */
export async function planBuy(sp: Species, usd: number, wallet: string): Promise<BuyPlan> {
  const out: Preflight = {
    status: 'not-simulated', summary: '', spendsUsdt: null, receivesQty: null, minReceiveQty: null,
    slippagePct: null, gasUsd: null, usdtBalance: null, bnbBalance: null, executionMode: null,
    spender: null, failReason: null, simulatedAt: Date.now(),
  };
  const only = (preflight: Preflight): BuyPlan => ({ preflight, swap: null, approval: null });
  // The gateway's own reason is the useful part ("market is currently closed", "minimum order
  // amount is 5 USD"), so it goes in the sentence, not only in `failReason`.
  const notSimulated = (why: string, failReason: string | null = null): BuyPlan => only({
    ...out, status: 'not-simulated', failReason,
    summary: `Not simulated: ${why}${failReason ? ` — ${failReason.replace(/\.+$/, '')}` : ''}.`,
  });

  const amount = baseUnits(usd, USDT_DECIMALS);
  const pair = { binanceChainId: CHAIN_ID, fromTokenAddress: USDT, toTokenAddress: sp.address, amount, userWalletAddress: wallet };

  try {
    const [held, q] = await Promise.all([
      balances(wallet),
      request('GET', '/api/v1/dex/aggregator/quote', { params: pair }),
    ]);
    out.usdtBalance = held.usdt;
    out.bnbBalance = held.bnb;

    const quote = (q.json as { data?: QuoteRow[] } | null)?.data?.[0];
    if (!quote) return notSimulated('the aggregator would not quote it', gatewayMsg(q));
    out.executionMode = quote.executionMode ?? null;
    const gasUsd = Number(quote.tradeFee);
    out.gasUsd = Number.isFinite(gasUsd) ? gasUsd : null;
    if (quote.executionMode === 'RFQ') {
      return notSimulated('this is a request-for-quote fill, settled from a signed order rather than a transaction, so there is nothing on-chain to simulate before the desk fills it');
    }

    // autoSlippage rather than a number of ours: the preflight should not tighten or loosen what
    // the owner's wallet will actually accept.
    const s = await request('GET', '/api/v1/dex/aggregator/swap', { params: { quoteId: quote.quoteId, ...pair, autoSlippage: 'true' } });
    const tx = (s.json as { data?: { tx?: Tx } } | null)?.data?.tx;
    if (!tx) return notSimulated('the aggregator would not build the transaction', gatewayMsg(s));
    // Spends USDT, so it carries no BNB; comes from this wallet; goes to the router the quote named.
    const mismatch = lower(tx.from) !== lower(wallet) ? `sender ${tx.from}`
      : Number(tx.value || 0) !== 0 ? `value ${tx.value}`
      : quote.approveTarget && lower(tx.to) !== lower(quote.approveTarget) ? `router ${tx.to}, quote named ${quote.approveTarget}`
      : null;
    if (mismatch) return notSimulated('the aggregator returned a transaction that does not match this buy, so it is not passed on', mismatch);
    const min = Number(tx.minReceiveAmount) / 10 ** sp.decimals;
    out.minReceiveQty = Number.isFinite(min) ? min : null;
    out.slippagePct = Number.isFinite(Number(tx.slippagePercent)) ? Number(tx.slippagePercent) : null;
    const gasBnb = (Number(tx.gas) * Number(tx.gasPrice)) / 1e18;

    const r = await request('POST', '/api/v1/dex/pre-transaction/simulate', {
      body: { binanceChainId: CHAIN_ID, evmTx: { from: tx.from, to: tx.to, value: tx.value, data: tx.data } },
    });
    const sim = (r.json as { data?: Simulation } | null)?.data;
    if (!sim?.status) return notSimulated('the simulation did not answer', gatewayMsg(r));
    out.failReason = sim.failReason || null;

    // Shortfalls the owner can fix come first — all of them, so one top-up fixes it.
    const short: string[] = [];
    if (held.usdt !== null && held.usdt < usd) {
      short.push(`the wallet holds ${held.usdt.toFixed(2)} USDT and this buy needs ${usd.toFixed(2)}`);
    }
    if (held.bnb !== null && Number.isFinite(gasBnb) && held.bnb < gasBnb) {
      short.push(`it holds ${held.bnb.toPrecision(2)} BNB and the swap needs about ${gasBnb.toPrecision(2)} BNB for gas`);
    }
    if (short.length) return only({ ...out, status: 'would-fail', summary: `Would fail: ${short.join('; ')}.` });

    if (sim.status === 'SUCCESS') {
      const mine = (sim.balanceChanges ?? []).filter((c) => lower(c.owner) === lower(wallet));
      const moved = (token: string) => {
        const c = mine.find((x) => lower(x.contractAddress) === lower(token));
        const v = Number(c?.change);
        return c && Number.isFinite(v) ? v : null;
      };
      const got = moved(sp.address);
      const paid = moved(USDT);
      out.receivesQty = got !== null ? got / 10 ** sp.decimals : null;
      out.spendsUsdt = paid !== null ? -paid / 10 ** USDT_DECIMALS : null;
      const qty = out.receivesQty !== null ? out.receivesQty.toPrecision(4) : 'an unreported amount of';
      const floor = out.minReceiveQty !== null ? ` (at least ${out.minReceiveQty.toPrecision(4)} after ${out.slippagePct ?? '?'}% slippage)` : '';
      const gas = out.gasUsd !== null ? `, plus about $${out.gasUsd.toFixed(2)} of gas` : '';
      return {
        preflight: {
          ...out, status: 'would-succeed',
          summary: `Simulated against this wallet just now: ${(out.spendsUsdt ?? usd).toFixed(2)} USDT in, ${qty} ${sp.tokenSymbol} out${floor}${gas}.`,
        },
        swap: { to: tx.to, data: tx.data, value: tx.value || '0', gas: tx.gas },
        approval: null,
      };
    }

    if (/allowance/i.test(sim.failReason ?? '')) {
      const fine = held.usdt !== null && held.bnb !== null ? 'The USDT and the gas are there; it' : 'It';
      const preflight: Preflight = {
        ...out, status: 'needs-approval', spender: tx.to,
        summary: `Would not go through yet: this wallet has not allowed the aggregator's router (${abbrev(tx.to)}) to spend this much of its USDT. ${fine} needs an approval first.`,
      };
      return { preflight, swap: null, approval: await approvalFor(amount, tx.to) };
    }
    return only({ ...out, status: 'would-fail', summary: `Would fail: ${sim.failReason || 'the simulation reverted without giving a reason'}.` });
  } catch (e) {
    return notSimulated('the gateway call failed', (e as Error).message);
  }
}

/**
 * A USDT approval for exactly `amount`, to exactly `router`, or null. Exact rather than unlimited:
 * it costs the owner a second signature per buy, and in exchange nothing can ever pull more USDT
 * from their wallet than the buy they just agreed to.
 */
async function approvalFor(amount: string, router: string): Promise<UnsignedTx | null> {
  const r = await request('GET', '/api/v1/dex/aggregator/approve-transaction', {
    params: { binanceChainId: CHAIN_ID, tokenContractAddress: USDT, approveAmount: amount },
  });
  const row = (r.json as { data?: { data?: string; dexContractAddress?: string; gasLimit?: string }[] } | null)?.data?.[0];
  const data = row?.data ?? '';
  // approve(address spender, uint256 amount): selector, then two 32-byte words.
  const spender = `0x${data.slice(34, 74)}`;
  const approved = data.length >= 138 ? BigInt(`0x${data.slice(74, 138)}`) : null;
  const ok = data.startsWith('0x095ea7b3')
    && lower(spender) === lower(router)
    && lower(row?.dexContractAddress) === lower(router)
    && approved !== null && approved === BigInt(amount);
  return ok ? { to: USDT, data, value: '0', gas: row?.gasLimit || '70000' } : null;
}
