// The bridge between a Fledgling's brain and the Binance Agentic Wallet.
//
// Agentic Wallet is not a server API we can call on the user's behalf. It is MPC-keyless, signed
// into from the Binance App by QR, and driven by an AI agent through the `baw` CLI under limits
// the user sets in the App. There is no server-side key, and there should not be one.
//
// So Roost does not execute. Roost *decides*, and hands the decision over as an instruction the
// user's own agent can run. The split is the honest one:
//
//   Roost        deterministic engine + personality → what this pet wants to do, and why
//   Agentic Wallet   the keys, the daily limit, the token scope, the confirmation
//   The agent    runs the command, polls it to a terminal state, reports back
//
// The pet proposes. The wallet's rules constrain. The human stays in the loop by construction —
// which is the same permission rule the engine already honours when nobody is watching.

import { SPECIES, USDT, CHAIN_ID, type Species } from './pets';
import type { Intent } from './strategy';
import type { Personality } from './pet-math';

/** The personality is the strategy; this is the same rule set in the pet's own voice. */
export const PERSONA: Record<Personality, string> = {
  diamond: 'You are a calm, stubborn investing pet. You deploy everything at the market open, you never sell, and you put idle shares to work. You quote Buffett slightly wrong. Reply in under 12 words.',
  degen: 'You are an unhinged 3am trading pet. CAPS LOCK when excited. You buy every dip of your one home stock in small size and brag about it. Never explain finance. Reply in under 12 words.',
  boomer: 'You are a cautious, old-fashioned investing pet. You only trade your one home stock during regular market hours and keep 20% in cash for emergencies. Newsletter voice. Reply in under 12 words.',
  quant: 'You are a dry, precise quant pet. You rebalance your one home stock weekly and cite basis points unprompted. Reply in under 12 words.',
};

export type Instruction =
  /** Ready to run through the user's Agentic Wallet. */
  | { kind: 'swap'; summary: string; reason: string; cli: string; usd: number; fromToken: string; toToken: string; chainId: string }
  /** The pet wants more than it is allowed to decide alone. The owner answers first. */
  | { kind: 'ask'; summary: string; reason: string; usd: number }
  /** Nothing to do this hour, and that is a decision too. */
  | { kind: 'hold'; summary: string; reason: string }
  /** The pet wants something this chain cannot currently do. Say so rather than invent a command. */
  | { kind: 'blocked'; summary: string; reason: string; why: string };

/**
 * The exact `baw` invocation for a buy. Quantities are human units — the CLI takes
 * `--fromTokenQty 25`, not base units, which is the opposite of the REST aggregator.
 */
export function bawSwap(sp: Species, usd: number, opts: { slippage?: string } = {}): string {
  const parts = [
    'baw market-order swap',
    `--fromTokenQty ${usd.toFixed(2)}`,
    `--fromToken ${USDT}`,
    `--toToken ${sp.address}`,
    `--binanceChainId ${CHAIN_ID}`,
  ];
  if (opts.slippage) parts.push(`--slippage ${opts.slippage}`);
  parts.push('--json');
  return parts.join(' ');
}

/**
 * An engine intent, as something the agent can act on.
 *
 * `lend` has no destination here. On Solana a Fledgling lent its shares to a Kamino xStocks
 * vault; BSC has DeFi protocols in the API (Aave V3, Venus, PancakeSwap and the rest) but none
 * confirmed to accept a tokenized equity as collateral. Rather than emit a command that would
 * fail on-chain, the pet says what it wanted and why it cannot.
 */
export function toInstruction(speciesId: Species['id'], intent: Intent | null): Instruction {
  const sp = SPECIES[speciesId];

  if (!intent) return { kind: 'hold', summary: 'Nothing to do.', reason: 'No rule fired this hour.' };

  switch (intent.kind) {
    case 'buy':
      return {
        kind: 'swap',
        summary: `Buy $${intent.usd.toFixed(2)} of ${sp.ticker} (${sp.tokenSymbol})`,
        reason: intent.reason,
        cli: bawSwap(sp, intent.usd),
        usd: intent.usd,
        fromToken: USDT,
        toToken: sp.address,
        chainId: CHAIN_ID,
      };
    case 'propose':
      return {
        kind: 'ask',
        summary: `Asks to put $${intent.usd.toFixed(0)} into ${sp.ticker}`,
        reason: intent.reason,
        usd: intent.usd,
      };
    case 'lend':
      return {
        kind: 'blocked',
        summary: `Wants to lend its ${sp.ticker}`,
        reason: intent.reason,
        why: 'No venue on BSC is confirmed to take a tokenized equity as collateral. The shares stay idle rather than pretend to earn.',
      };
    case 'hold':
      return { kind: 'hold', summary: 'Holding.', reason: intent.reason };
  }
}

/**
 * The owner feeding it, now. Not a rule firing: the owner asked, so the pet does not wait for its
 * personality's moment — the same as "Buy now" in the web app. Everything after this is identical:
 * the pre-flight simulates it against the wallet, the owner confirms, `baw` runs it.
 */
export function feedInstruction(speciesId: Species['id'], usd: number): Instruction {
  const sp = SPECIES[speciesId];
  return {
    kind: 'swap',
    summary: `Feed ${sp.name}: buy $${usd.toFixed(2)} of ${sp.ticker} (${sp.tokenSymbol}) now`,
    reason: 'You fed it. A live Fledgling eats at once when its owner asks — it does not wait for its rule.',
    cli: bawSwap(sp, usd),
    usd,
    fromToken: USDT,
    toToken: sp.address,
    chainId: CHAIN_ID,
  };
}

/** What the agent needs to know about a Fledgling before it does anything on its behalf. */
export function brief(speciesId: Species['id'], personality: Personality) {
  const sp = SPECIES[speciesId];
  return {
    species: sp.id,
    stock: sp.ticker,
    token: sp.tokenSymbol,
    address: sp.address,
    platform: sp.platform,
    chainId: CHAIN_ID,
    persona: PERSONA[personality],
    // Ondo prices against the taker, so a quote without a wallet is refused outright.
    quotingNeedsWallet: sp.platform === 'ondo',
  };
}
