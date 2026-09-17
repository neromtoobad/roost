const { Connection, Keypair, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const sdk = require('@meteora-ag/dynamic-bonding-curve-sdk');
const { DynamicBondingCurveClient, buildCurveWithMarketCap, ActivationType, BaseFeeMode, CollectFeeMode, MigrationFeeOption, MigrationOption, TokenDecimal, TokenType, TokenAuthorityOption, deriveTokenBadgeAddress } = sdk;
const NVDAx = new PublicKey('Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh');
const payer = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'); // funded account, simulation only
(async () => {
  const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const client = new DynamicBondingCurveClient(conn, 'confirmed');
  const curve = buildCurveWithMarketCap({
    token: { tokenType: TokenType.SPLToken, tokenBaseDecimal: TokenDecimal.SIX, tokenQuoteDecimal: 8, tokenAuthorityOption: TokenAuthorityOption.Immutable, totalTokenSupply: 1_000_000_000, leftover: 0 },
    fee: { baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerExponential, feeSchedulerParam: { startingFeeBps: 2500, endingFeeBps: 200, numberOfPeriod: 60, totalDuration: 3600 } }, dynamicFeeEnabled: true, collectFeeMode: CollectFeeMode.QuoteToken, creatorTradingFeePercentage: 100, poolCreationFee: 0, enableFirstSwapWithMinFee: false },
    migration: { migrationOption: MigrationOption.MET_DAMM_V2, migrationFeeOption: MigrationFeeOption.FixedBps200, migrationFee: { feePercentage: 0, creatorFeePercentage: 0 } },
    liquidityDistribution: { partnerLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: 0, creatorLiquidityPercentage: 90, creatorPermanentLockedLiquidityPercentage: 10 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp, initialMarketCap: 2, migrationMarketCap: 4,
  });
  const config = Keypair.generate(), baseMint = Keypair.generate();
  const tx = await client.partner.createConfigAndPool({ ...curve, config: config.publicKey, feeClaimer: payer, leftoverReceiver: payer, quoteMint: NVDAx, payer, tokenBadge: deriveTokenBadgeAddress(NVDAx),
    preCreatePoolParam: { name: 'Nova', symbol: 'NOVA', uri: 'https://tamastonk.xyz/nova.json', poolCreator: payer, baseMint: baseMint.publicKey } });
  tx.feePayer = payer; tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  const vtx = new VersionedTransaction(tx.compileMessage());
  console.log('tx size', vtx.serialize().length, 'bytes, instructions', tx.instructions.length);
  const sim = await conn.simulateTransaction(vtx, { sigVerify: false, replaceRecentBlockhash: true });
  const v = sim.value;
  console.log('=== SIMULATION: createConfig + initializePool (NOVA / NVDAx) ===');
  console.log('err:', JSON.stringify(v.err), '| units:', v.unitsConsumed);
  (v.logs || []).filter(l => /Instruction:|Error|error|failed|dbcij.*(success|failed)/.test(l)).forEach(l => console.log(' ', l));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
