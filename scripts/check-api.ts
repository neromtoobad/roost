/**
 * Connectivity check for the Binance Web3 API.
 *
 *   npm run check:api
 *
 * Proves four things in order, because each one only matters if the last passed:
 * credentials are present, the clock is inside the signing window, the signature is
 * accepted, and the RWA endpoints return the tokenized stocks Roost is built on.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request, HINTS, BinanceApiError, type Params } from '../src/lib/binance';

// tsx does not read .env.local on its own.
function loadEnv(file: string) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const [, k, raw] = m;
      if (process.env[k]) continue;
      process.env[k] = raw.replace(/^['"]|['"]$/g, '').trim();
    }
  } catch { /* no .env.local — fall back to the ambient environment */ }
}
loadEnv('.env.local');

const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;

let failures = 0;

async function probe(label: string, path: string, params?: Params) {
  process.stdout.write(`  ${label.padEnd(34)} `);
  try {
    const r = await request('GET', path, { params });
    const ok = r.status >= 200 && r.status < 300 && (r.code === null || r.code === 0);
    const data = (r.json as { data?: unknown } | null)?.data;
    const payload = data !== undefined ? data : r.json;
    const n = Array.isArray(payload) ? payload.length
      : payload && typeof payload === 'object' ? Object.keys(payload).length : 0;

    if (ok) {
      console.log(`${G('ok')}  ${DIM(`${r.status} · ${r.ms}ms · ${n} ${Array.isArray(payload) ? 'items' : 'fields'}`)}`);
      return payload;
    }
    failures++;
    const msg = (r.json as { msg?: string } | null)?.msg ?? r.text.slice(0, 120);
    console.log(`${R('FAIL')}  ${r.status}${r.code !== null ? ` code=${r.code}` : ''} — ${msg}`);
    if (r.code !== null && HINTS[r.code]) console.log(`${' '.repeat(38)}${Y('→ ' + HINTS[r.code])}`);
    return null;
  } catch (e) {
    failures++;
    if (e instanceof BinanceApiError) {
      console.log(`${R('FAIL')}  ${e.message}`);
      if (e.hint) console.log(`${' '.repeat(38)}${Y('→ ' + e.hint)}`);
    } else {
      console.log(`${R('FAIL')}  ${(e as Error).message}`);
    }
    return null;
  }
}

async function main() {
  console.log('\n\x1b[1mBinance Web3 API — connectivity check\x1b[0m\n');

  // 1. Credentials
  const key = process.env.BINANCE_W3_API_KEY;
  const secret = process.env.BINANCE_W3_API_SECRET;
  console.log('\x1b[1mCredentials\x1b[0m');
  console.log(`  BINANCE_W3_API_KEY                 ${key ? G(`set (${key.length} chars)`) : R('MISSING')}`);
  console.log(`  BINANCE_W3_API_SECRET              ${secret ? G(`set (${secret.length} chars)`) : R('MISSING')}`);
  if (!key || !secret) {
    console.log(`\n${R('Cannot continue.')} Put both in .env.local — see .env.example.\n`);
    process.exit(1);
  }

  // 2. Clock — signatures are rejected outside a 5s default window.
  console.log('\n\x1b[1mClock\x1b[0m');
  try {
    const t0 = Date.now();
    const head = await fetch('https://web3.binance.com/build/api/v1/dex/market/supported/chain', { method: 'HEAD' });
    const rtt = Date.now() - t0;
    const serverDate = head.headers.get('date');
    if (serverDate) {
      const skew = Date.now() - new Date(serverDate).getTime() - rtt / 2;
      const bad = Math.abs(skew) > 3000;
      console.log(`  drift vs Binance                   ${bad ? R(`${Math.round(skew)}ms`) : G(`${Math.round(skew)}ms`)} ${DIM(`(rtt ${rtt}ms)`)}`);
      if (bad) console.log(`${' '.repeat(38)}${Y('→ Over 3s of drift will trigger 40103. Sync with NTP.')}`);
    } else {
      console.log(`  drift vs Binance                   ${DIM('no Date header')}`);
    }
  } catch (e) {
    console.log(`  drift vs Binance                   ${Y('could not measure')} ${DIM((e as Error).message)}`);
  }

  // 3. Signature accepted at all
  console.log('\n\x1b[1mSignature\x1b[0m');
  await probe('aggregator/supported/chain', '/api/v1/dex/aggregator/supported/chain');

  // 4. The RWA layer Roost actually runs on
  console.log('\n\x1b[1mRWA (tokenized stocks)\x1b[0m');
  await probe('rwa/platforms', '/api/v1/dex/market/rwa/platforms');
  const tokens =
    (await probe('rwa/tokens', '/api/v1/dex/market/rwa/tokens')) ??
    (await probe('rwa/tokens (chainId=56)', '/api/v1/dex/market/rwa/tokens', { chainId: 56 }));

  // What Roost needs to know: which tickers exist, and do our six map onto them.
  if (Array.isArray(tokens) && tokens.length) {
    const rows = tokens as Array<Record<string, unknown>>;
    const sym = (t: Record<string, unknown>) =>
      String(t.symbol ?? t.tokenSymbol ?? t.ticker ?? t.underlyingSymbol ?? '').toUpperCase();
    const symbols = [...new Set(rows.map(sym).filter(Boolean))].sort();

    console.log(`\n\x1b[1mTokens returned\x1b[0m ${DIM(`(${rows.length} rows, ${symbols.length} symbols)`)}`);
    for (let i = 0; i < symbols.length; i += 12) console.log('  ' + symbols.slice(i, i + 12).join('  '));

    console.log('\n\x1b[1mRoost species → is the home stock listed?\x1b[0m');
    const want: Array<[string, string]> = [
      ['nova', 'NVDA'], ['volt', 'TSLA'], ['pip', 'AAPL'],
      ['booster', 'SPCX'], ['nimbus', 'OPENAI'], ['lurk', 'RDDT'],
    ];
    for (const [id, ticker] of want) {
      const hit = symbols.find((s) => s === ticker || s.replace(/[BX]$/, '') === ticker || s.startsWith(ticker));
      console.log(`  ${id.padEnd(10)} ${ticker.padEnd(8)} ${hit ? G(`found as ${hit}`) : R('not listed — needs remapping')}`);
    }

    console.log(`\n${DIM('Full first row, so we can see the real field names:')}`);
    console.log(DIM('  ' + JSON.stringify(rows[0], null, 2).split('\n').join('\n  ')));
  }

  console.log(failures === 0 ? `\n${G('All checks passed.')}\n` : `\n${R(`${failures} check(s) failed.`)}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(R('\nUnexpected error:'), e); process.exit(1); });
