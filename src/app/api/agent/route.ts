import { NextResponse } from 'next/server';
import { SPECIES, type Species } from '@/lib/pets';
import type { Personality } from '@/lib/pet-math';
import { decide, type StrategyState } from '@/lib/strategy';
import { fetchBars } from '@/lib/bars';
import { quoteFor, fillFor } from '@/lib/quote';
import { brief, toInstruction } from '@/lib/agent';
import { preflightBuy } from '@/lib/preflight';

// What does this Fledgling want to do right now, and what exactly would run it?
//
// This is the endpoint the Roost skill calls before touching the user's Agentic Wallet. Roost
// decides; `baw` executes; nothing here holds a key or moves a coin. See lib/agent.ts.
//
// A swap also comes back simulated against the wallet that would sign it (lib/preflight.ts), so
// the owner hears "this would fail: the wallet holds 3 USDT" before saying yes, not after.

type Body = {
  action?: 'intent';
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

  const fledgling = brief(body.species, body.personality);

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

  const { bars, source } = await fetchBars(body.species, 7);
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
  const instruction = toInstruction(body.species, decide(body.personality, bars, i, state));

  // Price it so the agent can tell the owner what the money actually buys, before it runs.
  const wallet = /^0x[a-fA-F0-9]{40}$/.test(body.wallet ?? '') ? (body.wallet as `0x${string}`) : null;
  const [q, fill, preflight] = await Promise.all([
    quoteFor(body.species),
    wallet ? fillFor(body.species, wallet) : null,
    // Only a swap has a transaction to simulate, and only a wallet can be simulated against.
    wallet && instruction.kind === 'swap' ? preflightBuy(sp, instruction.usd, wallet) : null,
  ]);

  const perToken = fill?.perToken ?? q.price;
  const expectedQty = instruction.kind === 'swap' && perToken ? instruction.usd / perToken : null;

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
      barsSource: source,
      // Quoting an Ondo name without a wallet is refused by the RFQ desk, not by us.
      quoteDegraded: fill === null && sp.platform === 'ondo',
    },
    expectedQty,
    preflight,
  });
}
