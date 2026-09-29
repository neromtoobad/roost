import { NextResponse } from 'next/server';
import { SPECIES, type Species } from '@/lib/pets';
import type { Personality } from '@/lib/pet-math';
import { decide, type StrategyState } from '@/lib/strategy';
import { fetchBars } from '@/lib/bars';
import { quoteForStock, fillForStock, resolveStock } from '@/lib/quote';
import { brief, feedInstruction, releaseInstruction, toInstruction, type Instruction } from '@/lib/agent';
import { preflightBuy, preflightSell } from '@/lib/preflight';

// What does this Fledgling want to do right now, and what exactly would run it?
//
// This is the endpoint the Roost skill calls before touching the user's Agentic Wallet. Roost
// decides; `baw` executes; nothing here holds a key or moves a coin. See lib/agent.ts.
//
// A swap also comes back simulated against the wallet that would sign it (lib/preflight.ts), so
// the owner hears "this would fail: the wallet holds 3 USDT" before saying yes, not after.
//
// Three actions:
//   intent (default)  what the pet's own rule wants this hour — often nothing, outside market hours
//   feed + usd        the owner feeding it now: a buy for exactly that amount, at any hour
//   release + qty     the owner taking some back: a sale of that many tokens for USDT
//
// `token` names the stock when the pet hatched from one of the ~450 rather than its species'
// signature stock; without it, the species decides.

type Body = {
  action?: 'intent' | 'feed' | 'release';
  /** For `feed`: how much USDT the owner is feeding it. */
  usd?: number;
  /** For `release`: how many tokens to sell. */
  qty?: number;
  /** The stock's token address, when it is not the species' signature stock. */
  token?: string;
  /** The pet's name, for the summary the owner reads. */
  name?: string;
  species: Species['id'];
  personality: Personality;
  cash?: number;
  heldQty?: number;
  lentQty?: number;
  lastBuyAt?: number;
  totalFed?: number;
  /** An unanswered question outranks everything: the pet waits rather than acting. */
  awaitingAnswer?: boolean;
  /** Needed to quote Ondo names at all, and to price bStock against a real taker. */
  wallet?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ error: 'expected a JSON body' }, { status: 400 }); }

  const sp = SPECIES[body.species];
  if (!sp) return NextResponse.json({ error: 'unknown species' }, { status: 400 });
  if (!['diamond', 'degen', 'boomer', 'quant'].includes(body.personality)) {
    return NextResponse.json({ error: 'unknown personality' }, { status: 400 });
  }

  const stock = body.token ? await resolveStock(body.token) : sp;
  if (!stock) return NextResponse.json({ error: `no tokenized stock at ${body.token} on BSC` }, { status: 404 });
  const fledgling = brief(body.species, body.personality, stock);
  const name = body.name?.slice(0, 32);

  let instruction: Instruction;
  let barsSource: string | null = null;

  if (body.action === 'feed') {
    const usd = Number(body.usd);
    if (!Number.isFinite(usd) || usd < 1 || usd > 10_000) {
      return NextResponse.json({ error: 'feed needs usd between 1 and 10000' }, { status: 400 });
    }
    // An open question stops the pet acting on its own. The owner feeding it is not the pet acting.
    instruction = feedInstruction(body.species, Math.round(usd * 100) / 100, stock, name);
  } else if (body.action === 'release') {
    const qty = Number(body.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: 'release needs a positive qty of tokens' }, { status: 400 });
    }
    instruction = releaseInstruction(body.species, qty, (await quoteForStock(stock)).price, stock, name);
  } else {
    if (body.awaitingAnswer) {
      return NextResponse.json({
        fledgling,
        instruction: {
          kind: 'hold',
          summary: 'Waiting on its owner.',
          reason: 'It asked a question and has not been answered. It does not act until it is.',
        },
      });
    }

    const { bars, source } = await fetchBars(stock, 7);
    if (!bars.length) {
      return NextResponse.json({
        fledgling,
        instruction: { kind: 'blocked', summary: 'No price history.', reason: 'The tape is empty.', why: 'No candles returned for this token, so no rule can fire.' },
      });
    }

    const state: StrategyState = {
      cash: body.cash ?? 0,
      heldQty: body.heldQty ?? 0,
      lentQty: body.lentQty ?? 0,
      lastBuyAt: body.lastBuyAt ?? 0,
      totalFed: body.totalFed ?? 0,
    };

    const i = bars.length - 1;
    instruction = toInstruction(body.species, decide(body.personality, bars, i, state), stock);
    barsSource = source;
  }

  // Price it so the agent can tell the owner what the money actually buys, before it runs.
  const wallet = /^0x[a-fA-F0-9]{40}$/.test(body.wallet ?? '') ? (body.wallet as `0x${string}`) : null;
  const [q, fill, preflight] = await Promise.all([
    quoteForStock(stock),
    wallet ? fillForStock(stock, wallet) : null,
    // Only a swap has a transaction to simulate, and only a wallet can be simulated against.
    wallet && instruction.kind === 'swap'
      ? instruction.side === 'sell' ? preflightSell(stock, instruction.qty ?? 0, wallet) : preflightBuy(stock, instruction.usd, wallet)
      : null,
  ]);

  const perToken = fill?.perToken ?? q.price;
  const expectedQty = instruction.kind === 'swap' && instruction.side !== 'sell' && perToken ? instruction.usd / perToken : null;

  return NextResponse.json({
    fledgling,
    instruction,
    market: {
      perToken,
      reference: q.reference,
      spreadPct: fill?.spreadPct ?? q.spreadPct,
      pct24h: q.pct24h,
      marketStatus: q.marketStatus,
      priceSource: fill ? 'aggregator-quote' : q.source,
      barsSource,
      // Quoting an Ondo name without a wallet is refused by the RFQ desk, not by us.
      quoteDegraded: fill === null && stock.platform === 'ondo',
    },
    expectedQty,
    preflight,
  });
}
