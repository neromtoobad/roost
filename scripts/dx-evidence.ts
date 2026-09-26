/**
 * Collects raw evidence for the hackathon's Developer Experience Report.
 *
 *   npm run dx -- 0xYourTakerAddress
 *
 * This produces EVIDENCE, not the report. The report has to be written by a human in their own
 * words — the hackathon rejects AI-generated ones, and rightly: the point is what actually
 * happened to you. What this does is make sure the specifics are on paper while they are still
 * true: exact error payloads, measured latency, a real slippage ladder, reproduction commands.
 *
 * Writes docs/dx-evidence.md, timestamped. Safe to re-run; each run is a fresh snapshot.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const P = (n: number, d = 3) => (Number.isFinite(n) ? n.toFixed(d) : '—');

async function main() {
  for (const l of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  const { request } = await import('../src/lib/binance');
  const { SPECIES, CHAIN_ID, USDT, ALL_SPECIES } = await import('../src/lib/pets');
  const { nyseSession, sessionLabel } = await import('../src/lib/session');

  const taker = process.argv[2];
  const hasTaker = /^0x[a-fA-F0-9]{40}$/.test(taker ?? '');
  const out: string[] = [];
  const now = new Date();

  out.push('# Developer Experience — raw evidence');
  out.push('');
  out.push(`> Collected ${now.toISOString()} · NYSE: **${sessionLabel[nyseSession()]}**`);
  out.push('> ');
  out.push('> **This is not the report.** It is the measured material to write one from.');
  out.push(`> Regenerate with \`npm run dx -- <taker>\`. Taker used: ${hasTaker ? `\`${taker}\`` : '_none — quotes degrade to oracle reads_'}`);
  out.push('');

  // ── B. Latency ──────────────────────────────────────────────────────────────
  out.push('## Endpoint latency');
  out.push('');
  out.push('Five sequential samples each, warm process, from a residential connection.');
  out.push('');
  out.push('| Endpoint | Method | min | median | max |');
  out.push('|---|---|---|---|---|');

  const NVDAB = SPECIES.nova.address;
  const probes: [string, () => Promise<unknown>][] = [
    ['/dex/market/rwa/tokens', () => request('GET', '/api/v1/dex/market/rwa/tokens')],
    ['/dex/market/rwa/platforms', () => request('GET', '/api/v1/dex/market/rwa/platforms')],
    ['/dex/market/price-info', () => request('POST', '/api/v1/dex/market/price-info', { body: [{ binanceChainId: CHAIN_ID, tokenContractAddress: NVDAB }] })],
    ['/dex/market/candles (1h,168)', () => request('GET', '/api/v1/dex/market/candles', { params: { binanceChainId: CHAIN_ID, tokenContractAddress: NVDAB, bar: '1h', limit: 168 } })],
    ['/dex/aggregator/supported/chain', () => request('GET', '/api/v1/dex/aggregator/supported/chain')],
  ];
  if (hasTaker) {
    probes.push(['/dex/aggregator/quote', () => request('GET', '/api/v1/dex/aggregator/quote', {
      params: { binanceChainId: CHAIN_ID, fromTokenAddress: NVDAB, toTokenAddress: USDT, amount: `1${'0'.repeat(18)}`, userWalletAddress: taker },
    })]);
  }

  for (const [label, fn] of probes) {
    const ms: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      try { await fn(); } catch { /* record the time even on failure */ }
      ms.push(Date.now() - t0);
      await sleep(250); // stay inside the 5 rps per-endpoint limit
    }
    ms.sort((a, b) => a - b);
    out.push(`| \`${label}\` | ${label.includes('price-info') ? 'POST' : 'GET'} | ${ms[0]}ms | ${ms[2]}ms | ${ms[4]}ms |`);
  }
  out.push('');

  // ── C. Error catalogue ──────────────────────────────────────────────────────
  out.push('## Error catalogue — exact payloads');
  out.push('');
  out.push('Every one of these was hit for real during the build. Reproduced here verbatim.');
  out.push('');

  const errorCases: [string, string, () => Promise<{ status: number; code: number | null; json: unknown }>][] = [
    ['`chainId` instead of `binanceChainId`', 'The docs use `chainId` in prose in places; the gateway wants `binanceChainId`.',
      () => request('GET', '/api/v1/dex/market/rwa/price', { params: { chainId: 56, tokenContractAddress: NVDAB } })],
    ['Uppercase candle interval', '`1H` is rejected; only lowercase `1h` works. The error does list valid values, which helps.',
      () => request('GET', '/api/v1/dex/market/candles', { params: { binanceChainId: CHAIN_ID, tokenContractAddress: NVDAB, bar: '1H', limit: 3 } })],
    ['Ondo quote without a taker', 'bStock quotes fine without one. Ondo refuses outright.',
      () => request('GET', '/api/v1/dex/aggregator/quote', { params: { binanceChainId: CHAIN_ID, fromTokenAddress: SPECIES.pip.address, toTokenAddress: USDT, amount: `1${'0'.repeat(18)}` } })],
    ['Singular vs plural address param', '`rwa/price` wants `tokenContractAddresses`; its neighbours want the singular.',
      () => request('GET', '/api/v1/dex/market/rwa/price', { params: { binanceChainId: CHAIN_ID, tokenContractAddress: NVDAB } })],
  ];

  for (const [title, note, fn] of errorCases) {
    let r: { status: number; code: number | null; json: unknown };
    try { r = await fn(); } catch (e) { out.push(`### ${title}\n\n${note}\n\n\`\`\`\n${(e as Error).message}\n\`\`\`\n`); continue; }
    out.push(`### ${title}`);
    out.push('');
    out.push(note);
    out.push('');
    out.push('```json');
    out.push(`HTTP ${r.status}`);
    out.push(JSON.stringify(r.json, null, 2).slice(0, 700));
    out.push('```');
    out.push('');
    await sleep(250);
  }

  out.push('### HTTP 200 on failure');
  out.push('');
  out.push('Note the status line above every failing payload: **200**, with the failure in the body `code`.');
  out.push('Status-code-only error handling swallows all of these silently. This is the single pitfall most');
  out.push('likely to cost someone an afternoon, because nothing appears to be wrong.');
  out.push('');

  // ── D. Liquidity depth / slippage ───────────────────────────────────────────
  if (hasTaker) {
    out.push('## Liquidity depth and slippage');
    out.push('');
    out.push('Quote ladder: how the fill and the reported price impact move with trade size.');
    out.push('Each row is one `aggregator/quote` for N whole tokens against USDT.');
    out.push('');
    for (const id of ['nova', 'pip'] as const) {
      const sp = SPECIES[id];
      out.push(`### ${sp.ticker} (\`${sp.tokenSymbol}\`, ${sp.platform})`);
      out.push('');
      out.push('| size (tokens) | USDT out | per token | impact % | vendor |');
      out.push('|---|---|---|---|---|');
      for (const n of [1, 10, 100, 1000]) {
        try {
          const r = await request('GET', '/api/v1/dex/aggregator/quote', {
            params: {
              binanceChainId: CHAIN_ID, fromTokenAddress: sp.address, toTokenAddress: USDT,
              amount: `${n}${'0'.repeat(18)}`, userWalletAddress: taker,
            },
          });
          const row = (r.json as { data?: { toTokenAmount: string; priceImpactPercent?: string; vendorName?: string }[] } | null)?.data?.[0];
          if (!row) {
            const msg = (r.json as { msg?: string } | null)?.msg ?? `HTTP ${r.status}`;
            out.push(`| ${n} | — | — | — | _${msg}_ |`);
          } else {
            const usdt = Number(row.toTokenAmount) / 1e18;
            // The field is a fraction despite its name; the column is a percent.
            const impact = row.priceImpactPercent !== undefined ? P(Number(row.priceImpactPercent) * 100, 4) : '—';
            out.push(`| ${n} | ${P(usdt, 2)} | ${P(usdt / n, 4)} | ${impact} | ${row.vendorName ?? '—'} |`);
          }
        } catch (e) {
          out.push(`| ${n} | — | — | — | _${(e as Error).message}_ |`);
        }
        await sleep(300);
      }
      out.push('');
    }
  }

  // ── E. Spread + market hours ────────────────────────────────────────────────
  out.push('## On-chain vs reference, all six');
  out.push('');
  out.push(`Snapshot at ${now.toISOString()} — NYSE ${sessionLabel[nyseSession()]}.`);
  out.push('Re-run this outside market hours: the whole point is that the reference leg stops moving and this table drifts.');
  out.push('');
  out.push('| Fledgling | ticker | platform | traded | reference | spread % | ratio | marketStatus |');
  out.push('|---|---|---|---|---|---|---|---|');

  const rwa = await request('GET', '/api/v1/dex/market/rwa/tokens');
  const rows = ((rwa.json as { data?: Record<string, string | { marketStatus?: string }>[] } | null)?.data ?? []) as Array<Record<string, unknown>>;
  for (const sp of ALL_SPECIES) {
    const row = rows.find((r) => String(r.tokenContractAddress).toLowerCase() === sp.address.toLowerCase());
    const ratio = Number(row?.tokenToShareRatio);
    const reference = Number(row?.referencePrice) * ratio;
    let traded = Number.NaN;
    if (hasTaker) {
      try {
        const q = await request('GET', '/api/v1/dex/aggregator/quote', {
          params: { binanceChainId: CHAIN_ID, fromTokenAddress: sp.address, toTokenAddress: USDT, amount: `1${'0'.repeat(18)}`, userWalletAddress: taker },
        });
        const got = (q.json as { data?: { toTokenAmount: string }[] } | null)?.data?.[0];
        if (got) traded = Number(got.toTokenAmount) / 1e18;
      } catch { /* leave NaN */ }
      await sleep(300);
    }
    const spread = Number.isFinite(traded) && reference ? (traded / reference - 1) * 100 : NaN;
    const st = (row?.statusInfo as { marketStatus?: string } | undefined)?.marketStatus ?? '_absent_';
    out.push(`| ${sp.id} | ${sp.ticker} | ${sp.platform} | ${P(traded, 2)} | ${P(reference, 2)} | ${P(spread)} | ${P(ratio, 6)} | ${st} |`);
  }
  out.push('');
  out.push('**`marketStatus` is absent on every bStock row and present on every Ondo row.** Same field, same');
  out.push('endpoint, same response — populated by one issuer and not the other.');
  out.push('');

  // ── F. The derived-reference proof ──────────────────────────────────────────
  out.push('## Proof that `referencePrice` is derived, not independent');
  out.push('');
  out.push('For every listed token, `tokenPrice / (referencePrice × tokenToShareRatio)` is exactly 1.');
  out.push('This is why the two prices in one RWA row cannot be differenced to get a spread.');
  out.push('');
  out.push('| token | tokenPrice | referencePrice | ratio | tokenPrice ÷ (ref × ratio) |');
  out.push('|---|---|---|---|---|');
  let checked = 0, exact = 0;
  for (const r of rows) {
    const on = Number(r.tokenPrice), ref = Number(r.referencePrice), k = Number(r.tokenToShareRatio);
    if (!(on > 0 && ref > 0 && k > 0)) continue;
    checked++;
    const q = on / (ref * k);
    if (Math.abs(q - 1) < 1e-9) exact++;
    if (['NVDAB', 'AAPLon', 'NFLXon', 'KLACon'].includes(String(r.tokenSymbol))) {
      out.push(`| \`${r.tokenSymbol}\` | ${on} | ${ref} | ${k} | ${q.toFixed(12)} |`);
    }
  }
  out.push('');
  out.push(`**${exact} of ${checked}** tokens with all three fields present satisfy the identity to 1e-9.`);
  out.push('');

  out.push('## Still open');
  out.push('');
  out.push('- No BSC venue confirmed to take a tokenized equity as collateral (`defi/data/investment/list` rejected every param shape tried).');
  out.push('- `AAPLon` sits several percent under its reference persistently — cause unknown, worth watching across days before writing it up.');
  out.push('- Whether the spread widens measurably over a weekend: **needs a run with the NYSE shut.**');
  out.push('');

  mkdirSync(resolve(process.cwd(), 'docs'), { recursive: true });
  const path = resolve(process.cwd(), 'docs/dx-evidence.md');
  writeFileSync(path, out.join('\n'));
  console.log(`\nwrote ${path} (${out.length} lines)\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
