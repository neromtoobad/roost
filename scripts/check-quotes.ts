/**
 * Exercises the rebuilt price layer against the live API.
 *
 *   npm run check:quotes
 *
 * Imports are dynamic and inside main() because .env.local has to be loaded before
 * lib/binance reads the credentials at call time.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function main() {
  for (const l of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }

  const { quotesFor, pricesFor, fillFor } = await import('../src/lib/quote');
  const { fetchBars } = await import('../src/lib/bars');
  const { ALL_SPECIES } = await import('../src/lib/pets');

  const t0 = Date.now();
  const quotes = await quotesFor(ALL_SPECIES.map((s) => s.id));
  const ms = Date.now() - t0;

  console.log(`\n\x1b[1mQuotes\x1b[0m ${D(`(all six in ${ms}ms — two upstream calls total)`)}\n`);
  console.log('  species    stock  plat     traded      reference   spread     24h       status    src');
  for (const sp of ALL_SPECIES) {
    const q = quotes[sp.id];
    const f = (n: number | null) => (n === null ? '—' : n.toFixed(2));
    const spread = q.spreadPct === null ? '—'.padEnd(10)
      : `${q.spreadPct >= 0 ? '+' : ''}${q.spreadPct.toFixed(3)}%`.padEnd(10);
    console.log(
      `  ${sp.id.padEnd(10)} ${sp.ticker.padEnd(6)} ${sp.platform.padEnd(8)} ` +
      `${f(q.price).padEnd(11)} ${f(q.reference).padEnd(11)} ${spread}` +
      `${((q.pct24h >= 0 ? '+' : '') + q.pct24h.toFixed(2) + '%').padEnd(10)}` +
      `${(q.marketStatus ?? '—').padEnd(10)}${q.source === 'dex' ? G(q.source) : R(q.source)}`,
    );
  }

  console.log('\n\x1b[1mpricesFor (leaderboard / duels path)\x1b[0m');
  console.log(' ', await pricesFor(['NVDA', 'AAPL', 'RDDT', 'ZZZZ']));

  console.log('\n\x1b[1mBars\x1b[0m');
  for (const id of ['nova', 'pip'] as const) {
    const b = await fetchBars(id, 2);
    const last = b.bars.at(-1);
    console.log(
      `  ${id.padEnd(8)} ${String(b.bars.length).padStart(3)} bars  source=${b.source === 'dex' ? G(b.source) : R(b.source)}` +
      (last ? D(`  last close ${last.close.toFixed(2)} @ ${new Date(last.t).toISOString()}`) : ''),
    );
  }

  // The executable leg, which needs a taker. Pass one: npm run check:quotes -- 0xYourAddress
  const wallet = process.argv[2];
  if (/^0x[a-fA-F0-9]{40}$/.test(wallet ?? '')) {
    console.log(`\n\x1b[1mExecutable fills\x1b[0m ${D(`taker ${wallet}`)}\n`);
    console.log('  species    plat     fill        reference   spread       impact   vendor');
    for (const sp of ALL_SPECIES) {
      const f = await fillFor(sp.id, wallet as `0x${string}`);
      const n = (x: number | null, d = 2) => (x === null ? '—' : x.toFixed(d));
      const spread = f.spreadPct === null ? '—' : `${f.spreadPct >= 0 ? '+' : ''}${f.spreadPct.toFixed(3)}%`;
      console.log(
        `  ${sp.id.padEnd(10)} ${sp.platform.padEnd(8)} ${n(f.perToken).padEnd(11)} ` +
        `${n(quotes[sp.id].reference).padEnd(11)} ${spread.padEnd(12)} ${n(f.priceImpactPct, 4).padEnd(8)} ` +
        `${f.vendor ?? ''}${f.error ? R(f.error) : ''}`,
      );
    }
  } else {
    console.log(D('\nno taker address given — skipping executable fills.'));
    console.log(D('  npm run check:quotes -- 0xYourAddress'));
  }

  const open = ALL_SPECIES.filter((s) => quotes[s.id].marketStatus === 'regular').length;
  console.log(D(`\nunderlying market: ${open}/6 reporting "regular"\n`));
}

main().catch((e) => { console.error(e); process.exit(1); });
