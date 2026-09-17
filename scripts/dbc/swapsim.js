// Validate the backing path end to end against a live mainnet DBC pool: quote a buy, build the
// swap transaction, and simulate it. Nothing is signed or sent.
const { Connection, PublicKey, VersionedTransaction, TransactionMessage } = require('@solana/web3.js');
const { DynamicBondingCurveClient, SwapMode, getCurrentPoint } = require('@meteora-ag/dynamic-bonding-curve-sdk');
const BN = require('bn.js');

const RPC = process.env.RPC || 'https://api.mainnet-beta.solana.com';
const POOL = process.argv[2] || '5xckKJZwRR3D57W8qVD35EbX93P89kzYoJ1b2kn5aue9';

(async () => {
  const conn = new Connection(RPC, 'confirmed');
  const client = new DynamicBondingCurveClient(conn, 'confirmed');

  const pool = await client.state.getPool(POOL);
  const st = pool.poolState;
  const config = await client.state.getPoolConfig(st.config);
  const quoteDecimals = 6; // this pool's quote; ours comes from the species

  const amountIn = new BN(1 * 10 ** quoteDecimals);
  const currentPoint = await getCurrentPoint(conn, config.activationType);
  console.log('currentPoint =', currentPoint.toString(), 'activationType =', config.activationType);

  for (const vp of [pool, st]) {
    try {
      const q = client.pool.swapQuote2({
        virtualPool: vp, config, swapBaseForQuote: false, swapMode: SwapMode.ExactIn,
        amountIn, slippageBps: 100, hasReferral: false,
        eligibleForFirstSwapWithMinFee: false, currentPoint,
      });
      console.log(`\nquote OK with ${vp === pool ? 'wrapper' : 'poolState'}:`);
      for (const [k, v] of Object.entries(q)) console.log(`  ${k} =`, v?.toString?.() ?? v);
      break;
    } catch (e) {
      console.log(`quote failed with ${vp === pool ? 'wrapper' : 'poolState'}: ${e.message}`);
    }
  }

  // Simulate as somebody who has already traded this pool: they exist, and they hold the quote
  // token. getTokenLargestAccounts is rate-limited into uselessness on the public RPC.
  const recent = await conn.getSignaturesForAddress(new PublicKey(POOL), { limit: 5 });
  let backer = null;
  for (const r of recent) {
    const t = await conn.getTransaction(r.signature, { maxSupportedTransactionVersion: 0 });
    if (!t) continue;
    const keys = t.transaction.message.getAccountKeys
      ? t.transaction.message.getAccountKeys({ accountKeysFromLookups: t.meta?.loadedAddresses }).staticAccountKeys
      : t.transaction.message.accountKeys;
    backer = keys[0];
    break;
  }
  console.log('\nsimulating as a wallet that already traded this pool:', backer.toBase58());
  const tx = await client.pool.swap({
    owner: backer, pool: new PublicKey(POOL), amountIn, minimumAmountOut: new BN(0),
    swapBaseForQuote: false, referralTokenAccount: null, payer: backer,
  });
  const blockhash = (await conn.getLatestBlockhash()).blockhash;
  console.log('\ninstructions =', tx.instructions.length);

  const msg = new TransactionMessage({
    payerKey: backer, recentBlockhash: blockhash, instructions: tx.instructions,
  }).compileToV0Message();
  const sim = await conn.simulateTransaction(new VersionedTransaction(msg), { sigVerify: false, replaceRecentBlockhash: true });
  console.log('sim err =', JSON.stringify(sim.value.err));
  console.log('CU =', sim.value.unitsConsumed);
  console.log((sim.value.logs || []).slice(-6).join('\n'));
})();
