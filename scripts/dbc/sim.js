const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } = require('@solana/web3.js');
const sdk = require('@meteora-ag/dynamic-bonding-curve-sdk');
const { DynamicBondingCurveClient, buildCurveWithMarketCap, ActivationType, BaseFeeMode, CollectFeeMode,
  MigrationFeeOption, MigrationOption, TokenDecimal, TokenType, TokenAuthorityOption, deriveTokenBadgeAddress } = sdk;
const NVDAx = new PublicKey('Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh');
(async () => {
  const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const client = new DynamicBondingCurveClient(conn, 'confirmed');
  // pick a funded nominal payer for simulation (sigVerify off) — Meteora migration keepers
  const cands = ['CQdrEsYAxRqkwmpycuTwnMKggr3cr9fqY8Qma4J9TudY','DeQ8dPv6ReZNQ45NfiWwS5CchWpB2BVq1QMyNV8L2uSW','5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'];
  let payer, best = 0;
  for (const c of cands) { const b = await conn.getBalance(new PublicKey(c)); console.log('balance', c.slice(0,8), (b/LAMPORTS_PER_SOL).toFixed(3), 'SOL'); if (b > best) { best = b; payer = new PublicKey(c); } }
  const badge = deriveTokenBadgeAddress(NVDAx);
  const badgeInfo = await client.state.getTokenBadge(NVDAx);
  console.log('NVDAx token badge', badge.toBase58(), badgeInfo ? 'FOUND, mint=' + badgeInfo.tokenMint.toBase58() : 'missing');
  const quoteDecimals = (await conn.getParsedAccountInfo(NVDAx)).value.data.parsed.info.decimals;
  console.log('NVDAx decimals', quoteDecimals);
  const curve = buildCurveWithMarketCap({
    token: { tokenType: TokenType.SPLToken, tokenBaseDecimal: TokenDecimal.SIX, tokenQuoteDecimal: quoteDecimals, tokenAuthorityOption: TokenAuthorityOption.Immutable, totalTokenSupply: 1_000_000_000, leftover: 0 },
    fee: { baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerExponential, feeSchedulerParam: { startingFeeBps: 2500, endingFeeBps: 200, numberOfPeriod: 60, totalDuration: 3600 } },
           dynamicFeeEnabled: true, collectFeeMode: CollectFeeMode.QuoteToken, creatorTradingFeePercentage: 100, poolCreationFee: 0, enableFirstSwapWithMinFee: false },
    migration: { migrationOption: MigrationOption.MET_DAMM_V2, migrationFeeOption: MigrationFeeOption.FixedBps200, migrationFee: { feePercentage: 0, creatorFeePercentage: 0 } },
    liquidityDistribution: { partnerLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: 0, creatorLiquidityPercentage: 90, creatorPermanentLockedLiquidityPercentage: 10 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp,
    initialMarketCap: 2,      // in NVDAx (~$430)
    migrationMarketCap: 4,    // in NVDAx (~$860 > $750 keeper threshold)
  });
  console.log('curve built: migrationQuoteThreshold =', curve.migrationQuoteThreshold.toString(), 'quote base units; curve points:', curve.curve.length);
  const config = Keypair.generate();
  const tx = await client.partner.createConfig({ ...curve, config: config.publicKey, feeClaimer: payer, leftoverReceiver: payer, quoteMint: NVDAx, payer, tokenBadge: badge });
  tx.feePayer = payer; tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  const vtx = new VersionedTransaction(tx.compileMessage());
  const sim = await conn.simulateTransaction(vtx, { sigVerify: false, replaceRecentBlockhash: true }).catch(e => ({ err: e.message }));
  const v = sim.value || sim;
  console.log('\n=== SIMULATION: createConfig with NVDAx quote + badge ===');
  console.log('err:', JSON.stringify(v.err));
  console.log('units:', v.unitsConsumed);
  (v.logs || []).filter(l => /Instruction|Error|error|success|badge|Badge|Quote/.test(l)).forEach(l => console.log(' ', l));
})().catch(e => { console.error('ERR', e.message); if (e.logs) e.logs.forEach(l=>console.error(' ',l)); process.exit(1); });
