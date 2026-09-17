import { NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  DynamicBondingCurveClient, buildCurveWithMarketCap, deriveTokenBadgeAddress, deriveDbcPoolAddress,
  ActivationType, BaseFeeMode, CollectFeeMode, MigrationFeeOption, MigrationOption, TokenDecimal, TokenType, TokenAuthorityOption,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { SPECIES, USDC, type Species } from '@/lib/pets';

// "Going public": build the createConfig + initializePool transaction for a pet token quoted in its home stock.
// Verified on mainnet by simulation (scripts/dbc/sim2.js). The server signs the two fresh keypairs (config, base mint);
// the client signs as payer/creator and sends. Migration keepers graduate the pool at ≥ $750 of quote.

const RPC = process.env.NEXT_PUBLIC_RPC ?? 'https://api.mainnet-beta.solana.com';
const QUOTE_DECIMALS: Record<string, number> = { [USDC]: 6 };

export async function POST(req: Request) {
  const { species, name, symbol, payer, initialMarketCap = 2, migrationMarketCap = 4 } = (await req.json()) as {
    species: Species['id']; name: string; symbol: string; payer: string; initialMarketCap?: number; migrationMarketCap?: number;
  };
  const sp = SPECIES[species];
  if (!sp || !payer) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const conn = new Connection(RPC, 'confirmed');
  const client = new DynamicBondingCurveClient(conn, 'confirmed');
  const quoteMint = new PublicKey(sp.quoteMint ?? USDC);
  const quoteDecimals = sp.quoteMint ? sp.holdDecimals : QUOTE_DECIMALS[USDC];
  const owner = new PublicKey(payer);

  const curve = buildCurveWithMarketCap({
    token: { tokenType: TokenType.SPLToken, tokenBaseDecimal: TokenDecimal.SIX, tokenQuoteDecimal: quoteDecimals, tokenAuthorityOption: TokenAuthorityOption.Immutable, totalTokenSupply: 1_000_000_000, leftover: 0 },
    fee: {
      baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerExponential, feeSchedulerParam: { startingFeeBps: 2500, endingFeeBps: 200, numberOfPeriod: 60, totalDuration: 3600 } },
      dynamicFeeEnabled: true, collectFeeMode: CollectFeeMode.QuoteToken, creatorTradingFeePercentage: 100, poolCreationFee: 0, enableFirstSwapWithMinFee: false,
    },
    migration: { migrationOption: MigrationOption.MET_DAMM_V2, migrationFeeOption: MigrationFeeOption.FixedBps200, migrationFee: { feePercentage: 0, creatorFeePercentage: 0 } },
    liquidityDistribution: { partnerLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: 0, creatorLiquidityPercentage: 90, creatorPermanentLockedLiquidityPercentage: 10 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp,
    initialMarketCap, migrationMarketCap, // in units of the quote stock
  });

  const config = Keypair.generate(), baseMint = Keypair.generate();
  const tx = await client.partner.createConfigAndPool({
    ...curve, config: config.publicKey, feeClaimer: owner, leftoverReceiver: owner, quoteMint, payer: owner,
    tokenBadge: sp.quoteMint ? deriveTokenBadgeAddress(quoteMint) : undefined,
    preCreatePoolParam: { name, symbol, uri: `https://stocklings.xyz/api/token/${symbol.toLowerCase()}.json`, poolCreator: owner, baseMint: baseMint.publicKey },
  });
  tx.feePayer = owner;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.partialSign(config, baseMint);

  return NextResponse.json({
    tx: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    config: config.publicKey.toBase58(),
    baseMint: baseMint.publicKey.toBase58(),
    pool: deriveDbcPoolAddress(quoteMint, baseMint.publicKey, config.publicKey).toBase58(),
    quote: sp.quoteMint ? sp.ticker : 'USDC',
    migrationQuoteThreshold: curve.migrationQuoteThreshold.toString(),
  });
}
