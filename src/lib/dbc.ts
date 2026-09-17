import { Connection, PublicKey } from '@solana/web3.js';
import {
  DynamicBondingCurveClient, SwapMode, getCurrentPoint, getPriceFromSqrtPrice,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';

// The bonding curve a Stockling's token lives on, quoted in its home stock.
//
// Backers buy with the stock. The curve collects its fee in the quote token and pays the whole
// creator share to the pet's owner, so a trade doesn't pay the backer — it pays the pet. Backing a
// Stockling is feeding it, in the same asset it already invests in.
//
// The SDK's generated types collapse to `any` for pool accounts and quote results, so the shapes
// below were read off mainnet rather than off the .d.ts (scripts/dbc/probe.js). Two gotchas the
// types don't tell you: getPool returns a { poolState } wrapper, and swapQuote2 wants that wrapper
// rather than the inner state.

const RPC = process.env.NEXT_PUBLIC_RPC ?? 'https://api.mainnet-beta.solana.com';
const BASE_DECIMALS = 6; // TokenDecimal.SIX, matching what /api/launch builds

type PoolAccount = { poolState: {
  baseMint: PublicKey; config: PublicKey; creator: PublicKey;
  baseReserve: BN; quoteReserve: BN; sqrtPrice: BN; isMigrated: number;
} };
type ConfigAccount = { quoteMint: PublicKey; activationType: number; migrationQuoteThreshold: BN };
type Quote = { outputAmount: BN; tradingFee: BN; protocolFee: BN; minimumAmountOut?: BN };

let cached: { conn: Connection; client: DynamicBondingCurveClient } | null = null;

export function dbc() {
  if (!cached) {
    const conn = new Connection(RPC, 'confirmed');
    cached = { conn, client: new DynamicBondingCurveClient(conn, 'confirmed') };
  }
  return cached;
}

const ui = (x: BN, decimals: number) => Number(x.toString()) / 10 ** decimals;

async function load(pool: string) {
  const { client } = dbc();
  const wrapper = (await client.state.getPool(pool)) as unknown as PoolAccount | null;
  if (!wrapper) throw new Error('No pool at that address.');
  const config = (await client.state.getPoolConfig(wrapper.poolState.config)) as unknown as ConfigAccount | null;
  if (!config) throw new Error('That pool has no config.');
  return { wrapper, state: wrapper.poolState, config };
}

export type PoolState = {
  pool: string;
  baseMint: string;
  quoteMint: string;
  creator: string;
  /** 0–1 along the curve. Meteora's keepers migrate the pool when it fills. */
  progress: number;
  raised: number;
  threshold: number;
  /** Quote per Stockling token, right now. */
  price: number | null;
  /** Home stock the pet can claim — fees its backers have already paid it. */
  unclaimed: number;
  claimed: number;
  migrated: boolean;
};

export async function poolState(pool: string, quoteDecimals: number): Promise<PoolState> {
  const { client } = dbc();
  const { state, config } = await load(pool);

  const [progress, fees] = await Promise.all([
    client.state.getPoolQuoteTokenCurveProgress(pool).catch(() => 0),
    client.state.getPoolFeeBreakdown(pool).catch(() => null),
  ]);

  let price: number | null = null;
  try { price = Number(getPriceFromSqrtPrice(state.sqrtPrice, BASE_DECIMALS, quoteDecimals).toString()); } catch {}

  return {
    pool,
    baseMint: state.baseMint.toBase58(),
    quoteMint: config.quoteMint.toBase58(),
    creator: state.creator.toBase58(),
    progress: Math.max(0, Math.min(1, progress)),
    raised: ui(state.quoteReserve, quoteDecimals),
    threshold: ui(config.migrationQuoteThreshold, quoteDecimals),
    price,
    unclaimed: fees ? ui(fees.creator.unclaimedQuoteFee, quoteDecimals) : 0,
    claimed: fees ? ui(fees.creator.claimedQuoteFee, quoteDecimals) : 0,
    migrated: Number(state.isMigrated) > 0,
  };
}

/** What a backer gets for `amount` of the home stock, and the transaction that does it. */
export async function buildBack(params: {
  pool: string; backer: string; amount: number; quoteDecimals: number; slippageBps?: number;
}) {
  const { client, conn } = dbc();
  const { pool, backer, amount, quoteDecimals, slippageBps = 100 } = params;
  const { wrapper, config } = await load(pool);

  const amountIn = new BN(Math.round(amount * 10 ** quoteDecimals));
  if (amountIn.lten(0)) throw new Error('Amount must be greater than zero.');

  const quote = client.pool.swapQuote2({
    virtualPool: wrapper as never, config: config as never,
    swapBaseForQuote: false,          // stock in, Stockling token out
    swapMode: SwapMode.ExactIn,
    amountIn, slippageBps, hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint: await getCurrentPoint(conn, config.activationType),
  }) as unknown as Quote;

  const minimumAmountOut = quote.minimumAmountOut ?? new BN(0);
  const owner = new PublicKey(backer);
  const tx = await client.pool.swap({
    owner, pool: new PublicKey(pool), amountIn, minimumAmountOut,
    swapBaseForQuote: false, referralTokenAccount: null, payer: owner,
  });
  tx.feePayer = owner;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

  return {
    tx: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    amountIn: amount,
    amountOut: ui(quote.outputAmount, BASE_DECIMALS),
    minimumOut: ui(minimumAmountOut, BASE_DECIMALS),
    fee: ui(quote.tradingFee.add(quote.protocolFee), quoteDecimals),
  };
}

/** The pet collecting what its backers have paid it. Signed by the owner, who created the pool. */
export async function buildClaim(pool: string, creator: string) {
  const { client, conn } = dbc();
  const owner = new PublicKey(creator);
  const tx = await client.creator.claimCreatorTradingFee({
    creator: owner, payer: owner, pool: new PublicKey(pool),
    maxBaseAmount: new BN(0),        // these curves collect their fee in the quote token
    maxQuoteAmount: new BN('18446744073709551615'),
  });
  tx.feePayer = owner;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  return { tx: tx.serialize({ requireAllSignatures: false }).toString('base64') };
}

/**
 * How many wallets hold the Stockling's token. Returns null rather than throwing: the public RPC
 * rate-limits getTokenLargestAccounts hard, and a missing backer count must not break the page.
 */
export async function backers(baseMint: string): Promise<{ count: number; top: number[] } | null> {
  try {
    const { conn } = dbc();
    const largest = await conn.getTokenLargestAccounts(new PublicKey(baseMint));
    const held = largest.value.map((a) => a.uiAmount ?? 0).filter((n) => n > 0);
    return { count: held.length, top: held.slice(0, 5) };
  } catch {
    return null;
  }
}
