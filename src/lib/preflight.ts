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
import { CHAIN_ID, USDT, type Stock } from './pets';
import { referencePerToken } from './quote';

/**
 * The most a buy may pay above its token's own reference price. Measured on a Saturday: bStock
 * asks sat within 0.6% of their references, sane weekend Ondo asks 1–2% over — and broken pools
 * 5.7% (AMDon), 15.5% (SPYon) and 800% (SNDKon) over, every one of which would have gone through.
 * A buy can succeed and still be a bad buy; the simulation cannot tell those apart, this can.
 */
export const MAX_PREMIUM_PCT = 3;
/** Above this the buy still goes ahead, but the owner is told what they are paying over. */
const NOTE_PREMIUM_PCT = 1;
// A sale is guarded the same way from the other side: a fill more than MAX_PREMIUM_PCT under the
// token's reference is a broken pool taking the shares cheap, and it is refused.

/** What a plan needs to know about the stock. Any Stock (and any Species) has these. */
type Tradable = Pick<Stock, 'ticker' | 'tokenSymbol' | 'address' | 'decimals'>;

export type Preflight = {
  /**
   * would-succeed   simulated against this wallet and it went through
   * needs-approval  the only thing stopping it is an allowance for the aggregator's router —
   *                 USDT for a buy, the stock token for a sale
   * would-fail      it reverts, the price is broken, or the wallet is short of what it spends or
   *                 of BNB for gas
   * not-simulated   there was nothing to simulate (an RFQ fill) or the gateway would not say
   */
  status: 'would-succeed' | 'needs-approval' | 'would-fail' | 'not-simulated';
  side: 'buy' | 'sell';
  /** One sentence for the owner, before they are asked to say yes. */
  summary: string;
  /** What the simulation moved, from the wallet's side, in whole tokens. A buy fills the first
   *  two, a sale the next two. */
  spendsUsdt: number | null;
  receivesQty: number | null;
  sellsQty: number | null;
  receivesUsdt: number | null;
  /** The floor the transaction enforces: fewer than this and it reverts rather than fills. */
  minReceiveQty: number | null;
  slippagePct: number | null;
  /** The swap's gas in USD, as the aggregator prices it. Not included in the amounts above. */
  gasUsd: number | null;
  usdtBalance: number | null;
  bnbBalance: number | null;
  /** How much of the stock token the wallet holds. */
  tokenBalance: number | null;
  executionMode: string | null;
  /** The contract that needs a USDT allowance, when that is what stops it. */
  spender: string | null;
  /** Verbatim from the simulation, or from the gateway when it would not build a transaction. */
  failReason: string | null;
  /** The quoted price per token against the token's own reference: positive is above it — bad
   *  for a buy, good for a sale. Null if unchecked. */
  premiumPct: number | null;
  simulatedAt: number;
};

type QuoteRow = { quoteId: string; executionMode?: string; tradeFee?: string; approveTarget?: string; toTokenAmount?: string };
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

/** What the wallet holds of USDT, BNB and (optionally) one stock token, from the Wallet API. */
async function balances(wallet: string, token?: string): Promise<{ usdt: number | null; bnb: number | null; token: number | null }> {
  const none = { usdt: null, bnb: null, token: null };
  try {
    const r = await request('POST', '/api/v1/dex/balance/token-balances-by-address', {
      body: {
        address: wallet,
        // An empty contract address is the Wallet API's name for the chain's native asset.
        tokenContractAddresses: [
          { binanceChainId: CHAIN_ID, tokenContractAddress: USDT },
          { binanceChainId: CHAIN_ID, tokenContractAddress: '' },
          ...(token ? [{ binanceChainId: CHAIN_ID, tokenContractAddress: token }] : []),
        ],
      },
    });
    if (r.code !== 0) return none;
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
      token: token ? held((a) => a === lower(token)) : null,
    };
  } catch {
    return none;
  }
}

/** A transaction for the owner's wallet to sign, exactly as the aggregator built it. */
export type UnsignedTx = { to: string; data: string; value: string; gas: string };

export type BuyPlan = {
  preflight: Preflight;
  /** The swap, present only when the simulation says it would go through. */
  swap: UnsignedTx | null;
  /** An allowance for exactly this amount, present only when that is all that stands in the way. */
  approval: UnsignedTx | null;
};

/** Would buying `usd` of this stock go through from `wallet`, right now? */
export async function preflightBuy(sp: Tradable, usd: number, wallet: string): Promise<Preflight> {
  return (await planBuy(sp, usd, wallet)).preflight;
}

/** Would selling `qty` tokens of this stock go through from `wallet`, right now? */
export async function preflightSell(sp: Tradable, qty: number, wallet: string): Promise<Preflight> {
  return (await planSell(sp, qty, wallet)).preflight;
}

/**
 * The same check, plus what to sign. The web app hands `approval` then `swap` to the owner's
 * wallet; nothing here signs, and a transaction that does not match the request is refused
 * rather than passed on — the wallet prompt is the last line of defence, not the only one.
 */
export function planBuy(sp: Tradable, usd: number, wallet: string, opts: { maxPremiumPct?: number } = {}): Promise<BuyPlan> {
  return plan('buy', sp, usd, wallet, opts);
}

/** Releasing shares: `qty` whole tokens of the stock back to USDT, through the same checks. */
export function planSell(sp: Tradable, qty: number, wallet: string, opts: { maxPremiumPct?: number } = {}): Promise<BuyPlan> {
  return plan('sell', sp, qty, wallet, opts);
}

async function plan(
  side: 'buy' | 'sell', sp: Tradable, size: number, wallet: string,
  { maxPremiumPct = MAX_PREMIUM_PCT }: { maxPremiumPct?: number },
): Promise<BuyPlan> {
  const buying = side === 'buy';
  const out: Preflight = {
    status: 'not-simulated', side, summary: '', spendsUsdt: null, receivesQty: null, sellsQty: null, receivesUsdt: null,
    minReceiveQty: null, slippagePct: null, gasUsd: null, usdtBalance: null, bnbBalance: null, tokenBalance: null,
    executionMode: null, spender: null, failReason: null, premiumPct: null, simulatedAt: Date.now(),
  };
  const only = (preflight: Preflight): BuyPlan => ({ preflight, swap: null, approval: null });
  // The gateway's own reason is the useful part ("market is currently closed", "minimum order
  // amount is 5 USD"), so it goes in the sentence, not only in `failReason`.
  const notSimulated = (why: string, failReason: string | null = null): BuyPlan => only({
    ...out, status: 'not-simulated', failReason,
    summary: `Not simulated: ${why}${failReason ? ` — ${failReason.replace(/\.+$/, '')}` : ''}.`,
  });

  // What leaves the wallet, in base units, and the pair in the direction of travel.
  const from = buying ? USDT : sp.address;
  const to = buying ? sp.address : USDT;
  const inDecimals = buying ? USDT_DECIMALS : sp.decimals;
  const outDecimals = buying ? sp.decimals : USDT_DECIMALS;
  const amount = baseUnits(size, inDecimals);
  const pair = { binanceChainId: CHAIN_ID, fromTokenAddress: from, toTokenAddress: to, amount, userWalletAddress: wallet };

  try {
    const [held, q, reference] = await Promise.all([
      balances(wallet, sp.address),
      request('GET', '/api/v1/dex/aggregator/quote', { params: pair }),
      referencePerToken(sp.address).catch(() => null),
    ]);
    out.usdtBalance = held.usdt;
    out.bnbBalance = held.bnb;
    out.tokenBalance = held.token;

    const quote = (q.json as { data?: QuoteRow[] } | null)?.data?.[0];
    if (!quote) return notSimulated('the aggregator would not quote it', gatewayMsg(q));
    out.executionMode = quote.executionMode ?? null;
    const gasUsd = Number(quote.tradeFee);
    out.gasUsd = Number.isFinite(gasUsd) ? gasUsd : null;

    // Price before anything else, RFQ included: a trade that would go through can still be a bad
    // one, and nobody should be asked to approve anything for it.
    const got = Number(quote.toTokenAmount) / 10 ** outDecimals;
    const perToken = buying ? size / got : got / size;
    out.premiumPct = reference && Number.isFinite(perToken) && perToken > 0 ? (perToken / reference - 1) * 100 : null;
    const against = `$${perToken.toFixed(2)} a token against $${reference?.toFixed(2)}`;
    if (out.premiumPct !== null && buying && out.premiumPct > maxPremiumPct) {
      return only({
        ...out, status: 'would-fail',
        summary: `Not buying: this fill costs ${out.premiumPct.toFixed(1)}% more than ${sp.ticker}'s reference price (${against}). The pool is thin or broken right now; paying that is not a trade, it is a donation.`,
      });
    }
    if (out.premiumPct !== null && !buying && -out.premiumPct > maxPremiumPct) {
      return only({
        ...out, status: 'would-fail',
        summary: `Not selling: this fill pays ${(-out.premiumPct).toFixed(1)}% less than ${sp.ticker}'s reference price (${against}). The pool is thin or broken right now; the shares are worth more than it is offering.`,
      });
    }
    // Under the limit but worth knowing, before an approval as much as before the swap.
    const priceNote = out.premiumPct === null
      ? ' Not checked against the reference price — the RWA list did not answer.'
      : buying && out.premiumPct > NOTE_PREMIUM_PCT
        ? ` That is ${out.premiumPct.toFixed(1)}% over ${sp.ticker}'s reference price.`
        : !buying && -out.premiumPct > NOTE_PREMIUM_PCT
          ? ` That is ${(-out.premiumPct).toFixed(1)}% under ${sp.ticker}'s reference price.`
          : '';

    if (quote.executionMode === 'RFQ') {
      const rfq = notSimulated('this is a request-for-quote fill, settled from a signed order rather than a transaction, so there is nothing on-chain to simulate before the desk fills it');
      return { ...rfq, preflight: { ...rfq.preflight, summary: rfq.preflight.summary + priceNote } };
    }

    // autoSlippage rather than a number of ours: the preflight should not tighten or loosen what
    // the owner's wallet will actually accept.
    const s = await request('GET', '/api/v1/dex/aggregator/swap', { params: { quoteId: quote.quoteId, ...pair, autoSlippage: 'true' } });
    const tx = (s.json as { data?: { tx?: Tx } } | null)?.data?.tx;
    if (!tx) return notSimulated('the aggregator would not build the transaction', gatewayMsg(s));
    // Spends a token, so it carries no BNB; comes from this wallet; goes to the router the quote named.
    const mismatch = lower(tx.from) !== lower(wallet) ? `sender ${tx.from}`
      : Number(tx.value || 0) !== 0 ? `value ${tx.value}`
      : quote.approveTarget && lower(tx.to) !== lower(quote.approveTarget) ? `router ${tx.to}, quote named ${quote.approveTarget}`
      : null;
    if (mismatch) return notSimulated('the aggregator returned a transaction that does not match this trade, so it is not passed on', mismatch);
    const min = Number(tx.minReceiveAmount) / 10 ** outDecimals;
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
    if (buying && held.usdt !== null && held.usdt < size) {
      short.push(`the wallet holds ${held.usdt.toFixed(2)} USDT and this buy needs ${size.toFixed(2)}`);
    }
    if (!buying && held.token !== null && held.token < size) {
      short.push(`the wallet holds ${held.token.toPrecision(4)} ${sp.tokenSymbol} and this sale needs ${size.toPrecision(4)}`);
    }
    if (held.bnb !== null && Number.isFinite(gasBnb) && held.bnb < gasBnb) {
      short.push(`it holds ${held.bnb.toPrecision(2)} BNB and the swap needs about ${gasBnb.toPrecision(2)} BNB for gas`);
    }
    if (short.length) return only({ ...out, status: 'would-fail', summary: `Would fail: ${short.join('; ')}.` });

    const spentSymbol = buying ? 'USDT' : sp.tokenSymbol;
    if (sim.status === 'SUCCESS') {
      const mine = (sim.balanceChanges ?? []).filter((c) => lower(c.owner) === lower(wallet));
      const moved = (token: string) => {
        const c = mine.find((x) => lower(x.contractAddress) === lower(token));
        const v = Number(c?.change);
        return c && Number.isFinite(v) ? v : null;
      };
      const tok = moved(sp.address);
      const usdt = moved(USDT);
      if (buying) {
        out.receivesQty = tok !== null ? tok / 10 ** sp.decimals : null;
        out.spendsUsdt = usdt !== null ? -usdt / 10 ** USDT_DECIMALS : null;
      } else {
        out.sellsQty = tok !== null ? -tok / 10 ** sp.decimals : null;
        out.receivesUsdt = usdt !== null ? usdt / 10 ** USDT_DECIMALS : null;
      }
      const inText = buying ? `${(out.spendsUsdt ?? size).toFixed(2)} USDT` : `${(out.sellsQty ?? size).toPrecision(4)} ${sp.tokenSymbol}`;
      const gotAmount = buying ? out.receivesQty : out.receivesUsdt;
      const outText = gotAmount === null ? `an unreported amount of ${buying ? sp.tokenSymbol : 'USDT'}`
        : buying ? `${gotAmount.toPrecision(4)} ${sp.tokenSymbol}` : `${gotAmount.toFixed(2)} USDT`;
      const floor = out.minReceiveQty !== null
        ? ` (at least ${buying ? out.minReceiveQty.toPrecision(4) : out.minReceiveQty.toFixed(2)} after ${out.slippagePct ?? '?'}% slippage)` : '';
      const gas = out.gasUsd !== null ? `, plus about $${out.gasUsd.toFixed(2)} of gas` : '';
      return {
        preflight: { ...out, status: 'would-succeed', summary: `Simulated against this wallet just now: ${inText} in, ${outText} out${floor}${gas}.${priceNote}` },
        swap: { to: tx.to, data: tx.data, value: tx.value || '0', gas: tx.gas },
        approval: null,
      };
    }

    // Is a missing allowance what stopped it? USDT says so in its revert ("exceeds allowance");
    // the stock tokens revert with no reason at all. So ask the chain rather than the message:
    // simulating the approval reports the allowance as it stands, in `allowanceChanges`.
    const approval = await approvalFor(from, amount, tx.to);
    const allowance = approval ? await currentAllowance(wallet, approval, from, tx.to) : null;
    const needsAllowance = /allowance/i.test(sim.failReason ?? '') || (allowance !== null && allowance < BigInt(amount));
    if (needsAllowance) {
      const haveIt = buying ? held.usdt !== null : held.token !== null;
      const fine = haveIt && held.bnb !== null ? `The ${spentSymbol} and the gas are there; it` : 'It';
      const preflight: Preflight = {
        ...out, status: 'needs-approval', spender: tx.to,
        summary: `Would not go through yet: this wallet has not allowed the aggregator's router (${abbrev(tx.to)}) to spend this much of its ${spentSymbol}. ${fine} needs an approval first.${priceNote}`,
      };
      return { preflight, swap: null, approval };
    }
    return only({ ...out, status: 'would-fail', summary: `Would fail: ${sim.failReason || 'the simulation reverted without giving a reason'}.` });
  } catch (e) {
    return notSimulated('the gateway call failed', (e as Error).message);
  }
}

/** What `owner` has allowed `spender` to take of `token`, read by simulating the approval. */
async function currentAllowance(owner: string, approval: UnsignedTx, token: string, spender: string): Promise<bigint | null> {
  try {
    const r = await request('POST', '/api/v1/dex/pre-transaction/simulate', {
      body: { binanceChainId: CHAIN_ID, evmTx: { from: owner, to: approval.to, value: '0', data: approval.data } },
    });
    const changes = (r.json as { data?: { allowanceChanges?: { tokenAddress?: string; owner?: string; spender?: string; preAmount?: string }[] } } | null)
      ?.data?.allowanceChanges ?? [];
    const c = changes.find((x) => lower(x.tokenAddress) === lower(token) && lower(x.owner) === lower(owner) && lower(x.spender) === lower(spender));
    return c?.preAmount !== undefined ? BigInt(c.preAmount) : null;
  } catch {
    return null;
  }
}

/**
 * An allowance of `token` for exactly `amount`, to exactly `router`, or null. Exact rather than
 * unlimited: it costs the owner a second signature per trade, and in exchange nothing can ever
 * pull more from their wallet than the trade they just agreed to.
 */
async function approvalFor(token: string, amount: string, router: string): Promise<UnsignedTx | null> {
  const r = await request('GET', '/api/v1/dex/aggregator/approve-transaction', {
    params: { binanceChainId: CHAIN_ID, tokenContractAddress: token, approveAmount: amount },
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
  return ok ? { to: token, data, value: '0', gas: row?.gasLimit || '70000' } : null;
}
