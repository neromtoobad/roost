/**
 * Finds a tokenized stock that fills by request-for-quote right now and builds the order the web
 * app would ask a wallet to sign — without signing anything.
 *
 *   npm run check:rfq -- [wallet] [usd]
 *
 * RFQ routes show up mostly for Ondo names while the NYSE trades; overnight everything swaps.
 * The wallet should hold the USDT, or the plan stops at the funds check before building the order.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  for (const l of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  const { request, baseUnits } = await import('../src/lib/binance');
  const { CHAIN_ID, USDT } = await import('../src/lib/pets');
  const { planBuy } = await import('../src/lib/preflight');
  const { nyseSession, sessionLabel } = await import('../src/lib/session');
  const wallet = process.argv[2] ?? '0xe7aa82bd4659b5af2b16d0af5dcab42fe8089b40';
  const usd = Number(process.argv[3] ?? 10);

  const res = await fetch('https://roost.nerom.site/api/stocks').then((r) => r.json()) as { results: { tokens: { tokenSymbol: string; ticker: string; address: `0x${string}`; decimals: number; platform: string }[] }[] };
  const tokens = res.results.flatMap((r) => r.tokens).filter((t) => t.platform === 'ondo');
  console.log(`NYSE: ${sessionLabel[nyseSession()]} · ${tokens.length} Ondo tokens · $${usd} for ${wallet}`);

  const modes: Record<string, number> = {};
  for (const t of tokens) {
    const q = await request('GET', '/api/v1/dex/aggregator/quote', {
      params: { binanceChainId: CHAIN_ID, fromTokenAddress: USDT, toTokenAddress: t.address, amount: baseUnits(usd, 18), userWalletAddress: wallet },
    });
    const row = (q.json as { data?: { executionMode?: string; vendorName?: string }[] } | null)?.data?.[0];
    const mode = row ? `${row.executionMode}/${row.vendorName}` : 'no quote';
    modes[mode] = (modes[mode] ?? 0) + 1;
    if (row?.executionMode !== 'RFQ') continue;
    console.log(`\n${t.tokenSymbol}: ${mode}`);
    const plan = await planBuy({ ticker: t.ticker, tokenSymbol: t.tokenSymbol, address: t.address, decimals: t.decimals }, usd, wallet);
    console.log(`  status   ${plan.preflight.status}`);
    console.log(`  summary  ${plan.preflight.summary}`);
    if (plan.approval) console.log(`  approval ${plan.approval.to} · ${plan.approval.data.slice(0, 10)}… to ${plan.preflight.spender}`);
    if (plan.order) {
      const td = plan.order.typedData;
      console.log(`  order    ${plan.order.vendor} #${plan.order.orderId} · ${td.primaryType} on ${String(td.domain.name)} (chain ${String(td.domain.chainId)})`);
      console.log(`  message  ${JSON.stringify(td.message).slice(0, 400)}`);
    }
    if (plan.order || plan.approval) break;
  }
  console.log('\nroutes:', modes);
}
main();
