/**
 * Which tokenized stocks does BSC actually list, and do Roost's species map onto them?
 *
 *   npx tsx scripts/rwa-map.ts
 *
 * Matches on `underlyingTicker` rather than the token symbol, because the symbol carries a
 * platform suffix (`B` = bStock, `ON`/`on` = Ondo) and prefix-matching a symbol gives false hits.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from '../src/lib/binance';

for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

type Row = {
  tokenSymbol: string; underlyingTicker: string; underlyingName: string; platformId: string;
  tokenContractAddress: string; decimals: string; tokenPrice: string; referencePrice: string;
  statusInfo?: { marketStatus: string; openState: boolean; nextOpenTime: number };
};

async function main() {
  const rows = await get<Row[]>('/api/v1/dex/market/rwa/tokens');

  const byPlatform = rows.reduce<Record<string, number>>((a, r) => ((a[r.platformId] = (a[r.platformId] ?? 0) + 1), a), {});
  console.log(`\n${rows.length} tokenized stocks on BSC — by platform:`, byPlatform);

  console.log('\nExact underlyingTicker matches for Roost\'s six:');
  for (const t of ['NVDA', 'TSLA', 'AAPL', 'SPCX', 'RDDT', 'OPENAI']) {
    const hits = rows.filter((r) => r.underlyingTicker?.toUpperCase() === t);
    console.log(`\n  ${t} → ${hits.length} listing(s)`);
    for (const h of hits) {
      const on = Number(h.tokenPrice), ref = Number(h.referencePrice);
      const gap = ref ? (on / ref - 1) * 100 : NaN;
      console.log(
        `     ${h.tokenSymbol.padEnd(9)} ${h.platformId.padEnd(7)} ${h.tokenContractAddress} dec=${String(h.decimals).padEnd(3)}` +
        ` on-chain ${String(on).padEnd(9)} ref ${String(ref).padEnd(9)} gap ${gap >= 0 ? '+' : ''}${gap.toFixed(3)}%  ${h.statusInfo?.marketStatus ?? '?'}`,
      );
    }
  }

  console.log('\nPre-IPO / private shaped (candidates for Nimbus):');
  const pre = rows.filter((r) => /openai|anthropic|spacex|stripe|private|pre-?ipo|xai|databricks|anduril/i.test(
    `${r.underlyingName ?? ''} ${r.tokenSymbol ?? ''} ${r.underlyingTicker ?? ''}`));
  pre.length
    ? pre.forEach((r) => console.log(`  ${r.tokenSymbol.padEnd(9)} ${r.platformId.padEnd(7)} ${String(r.underlyingTicker).padEnd(6)} ${r.underlyingName}`))
    : console.log('  (none)');

  const withStatus = rows.filter((r) => r.statusInfo);
  const open = withStatus.filter((r) => r.statusInfo!.openState).length;
  console.log(`\nMarket status right now: ${open} open, ${withStatus.length - open} closed (of ${withStatus.length} reporting)`);

  // The whole Roost thesis in one number: how far on-chain has drifted from the frozen reference.
  const gaps = rows
    .map((r) => ({ s: r.tokenSymbol, g: (Number(r.tokenPrice) / Number(r.referencePrice) - 1) * 100 }))
    .filter((x) => Number.isFinite(x.g))
    .sort((a, b) => Math.abs(b.g) - Math.abs(a.g));
  console.log('\nWidest on-chain vs reference gaps:');
  gaps.slice(0, 8).forEach((x) => console.log(`  ${x.s.padEnd(9)} ${x.g >= 0 ? '+' : ''}${x.g.toFixed(2)}%`));
}

main().catch((e) => { console.error(e); process.exit(1); });
