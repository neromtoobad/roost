// Find a live DBC pool on mainnet and print the runtime shape of the accounts we read.
// The SDK's generated TypeScript types collapse to `any` for VirtualPool and SwapResult2, so the
// field names in src/lib/dbc.ts are taken from here rather than from the .d.ts.
const { Connection, PublicKey } = require('@solana/web3.js');
const { DynamicBondingCurveClient, DYNAMIC_BONDING_CURVE_PROGRAM_ID } = require('@meteora-ag/dynamic-bonding-curve-sdk');

const RPC = process.env.RPC || 'https://api.mainnet-beta.solana.com';

(async () => {
  const conn = new Connection(RPC, 'confirmed');
  const client = new DynamicBondingCurveClient(conn, 'confirmed');
  const program = new PublicKey(DYNAMIC_BONDING_CURVE_PROGRAM_ID);

  const sigs = await conn.getSignaturesForAddress(program, { limit: 12 });
  console.log(`${sigs.length} recent DBC signatures`);

  for (const s of sigs) {
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx) continue;
    const keys = tx.transaction.message.getAccountKeys
      ? tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses }).staticAccountKeys
      : tx.transaction.message.accountKeys;

    for (const k of keys) {
      let pool = null;
      try { pool = await client.state.getPool(k); } catch { continue; }
      if (!pool) continue;

      const st = pool.poolState ?? pool;
      console.log('\n=== pool', k.toBase58());
      console.log('wrapper keys:', Object.keys(pool).join(', '));
      console.log('poolState keys:', Object.keys(st).join(', '));
      for (const f of ['baseMint', 'config', 'creator', 'quoteReserve', 'baseReserve', 'isMigrated', 'sqrtPrice'])
        if (st[f] !== undefined) console.log(`  ${f} =`, st[f].toString());

      const cfgWrap = await client.state.getPoolConfig(st.config);
      const config = cfgWrap?.poolConfig ?? cfgWrap;
      console.log('config wrapper keys:', Object.keys(cfgWrap).join(', '));
      console.log('config keys:', Object.keys(config).join(', '));
      for (const f of ['quoteMint', 'tokenDecimal', 'quoteTokenFlag', 'activationType', 'migrationQuoteThreshold'])
        if (config[f] !== undefined) console.log(`  ${f} =`, config[f].toString());

      const progress = await client.state.getPoolQuoteTokenCurveProgress(k).catch((e) => `err ${e.message}`);
      const threshold = await client.state.getPoolMigrationQuoteThreshold(k).catch((e) => `err ${e.message}`);
      const fees = await client.state.getPoolFeeBreakdown(k).catch((e) => `err ${e.message}`);
      console.log('progress =', progress);
      console.log('threshold =', threshold.toString());
      console.log('creator fees =', fees.creator ? Object.entries(fees.creator).map(([n, v]) => `${n}:${v}`).join(' ') : fees);
      process.exit(0);
    }
  }
  console.log('no pool found in the last 12 transactions');
})();
