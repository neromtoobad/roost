/**
 * Every tokenized stock's own logo, saved into the app.
 *
 *   npx tsx scripts/token-logos.ts
 *
 * The RWA list carries no icon, but Binance Web3's token search does: `icon`, a path on
 * bin.bnbstatic.com — the company's logo in the issuer's frame (bStock's gold ring, Ondo's grey).
 * Each is saved as a 96 px webp named by the token's address. src/lib/logos.json lists the addresses
 * that have one, and maps each ticker to its logo (bStock's first, as the app lists issuers), so the
 * app knows without asking. Served from Roost itself: no dependency on another site's image host at
 * runtime. Logos already saved are kept; re-run it when new tokens list.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { listStocks } from '../src/lib/quote';

for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const SEARCH = 'https://web3.binance.com/bapi/defi/v5/public/wallet-direct/buw/wallet/market/token/search';
const CDN = 'https://bin.bnbstatic.com';
const OUT = resolve(process.cwd(), 'public/logos');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function iconFor(symbol: string, address: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${SEARCH}?keyword=${encodeURIComponent(symbol)}&chainIds=56`, { headers: { accept: 'application/json' } });
      const j = (await r.json()) as { data?: { contractAddress: string; icon?: string }[] };
      const hit = j.data?.find((d) => d.contractAddress.toLowerCase() === address.toLowerCase());
      return hit?.icon ?? null;
    } catch {
      await sleep(800 * (attempt + 1));
    }
  }
  return null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const stocks = await listStocks();
  console.log(`${stocks.length} tokens on the RWA list`);
  const have: string[] = [];
  const missing: string[] = [];
  let i = 0;
  // A few at a time, gently: this is a public endpoint.
  async function worker() {
    while (i < stocks.length) {
      const s = stocks[i++];
      if (existsSync(resolve(OUT, `${s.address.toLowerCase()}.webp`))) { have.push(s.address.toLowerCase()); continue; }
      const icon = await iconFor(s.tokenSymbol, s.address);
      if (!icon) { missing.push(s.tokenSymbol); continue; }
      try {
        const img = await fetch(`${CDN}${icon}`);
        if (!img.ok) throw new Error(`HTTP ${img.status}`);
        const buf = Buffer.from(await img.arrayBuffer());
        await sharp(buf).resize(96, 96, { fit: 'cover' }).webp({ quality: 88 }).toFile(resolve(OUT, `${s.address.toLowerCase()}.webp`));
        have.push(s.address.toLowerCase());
      } catch (e) {
        missing.push(`${s.tokenSymbol} (${(e as Error).message})`);
      }
      await sleep(120);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  have.sort();
  const saved = new Set(have);
  const byTicker: Record<string, string> = {};
  for (const s of [...stocks].sort((a, b) => (a.platform === 'bstock' ? 0 : 1) - (b.platform === 'bstock' ? 0 : 1))) {
    const a = s.address.toLowerCase();
    if (saved.has(a) && !byTicker[s.ticker]) byTicker[s.ticker] = a;
  }
  writeFileSync(resolve(process.cwd(), 'src/lib/logos.json'), JSON.stringify({ addresses: have, byTicker }) + '\n');
  console.log(`saved ${have.length} logos; no icon for ${missing.length}${missing.length ? `: ${missing.join(', ')}` : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
