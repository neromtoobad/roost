/**
 * Same stock, two issuers: every ticker that bStock and Ondo both list on BSC, quoted both ways on each.
 *
 *   npm run cross -- 0xYourTakerAddress [usd]
 *
 * Writes docs/cross-issuer-<session>.md — one file per NYSE session (weekend, regular, overnight…)
 * rather than one file overall, because the interesting comparison is the same table with the
 * exchange open and shut, and a weekday run should not overwrite a weekend one.
 *
 * Uses lib/signal.ts, the same code /api/signal?cross=1 serves, so the evidence and the product
 * cannot disagree about what they measured.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const P = (n: number | null | undefined, d = 2) => (n !== null && n !== undefined && Number.isFinite(n) ? n.toFixed(d) : '—');
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** A gateway message, shortened to what a table cell can hold. The full text goes below the table. */
function short(note: string | null): string {
  if (!note) return '';
  if (note.includes('broken pool')) return 'broken pool';
  if (/closed/i.test(note)) return 'market closed';
  if (/liquidity/i.test(note)) return 'no liquidity';
  return 'error';
}

async function main() {
  for (const l of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  const { request } = await import('../src/lib/binance');
  const { crossIssuerBoard, crossIssuerReport } = await import('../src/lib/signal');
  const { nyseSession, sessionLabel } = await import('../src/lib/session');

  const taker = process.argv[2];
  if (!/^0x[a-fA-F0-9]{40}$/.test(taker ?? '')) {
    console.error('usage: npm run cross -- 0xTakerAddress [usd]\nOndo will not quote without a taker, so neither will this.');
    process.exit(1);
  }
  const usd = Number(process.argv[3]) || 100;
  const session = nyseSession();
  const now = new Date();

  const pairs = await crossIssuerBoard();
  if (!pairs.length) throw new Error('no ticker is listed by more than one issuer — or the RWA call failed; run npm run check:api');
  console.log(`${pairs.length} tickers listed by more than one issuer — quoting each both ways at $${usd}…`);

  type Report = NonNullable<Awaited<ReturnType<typeof crossIssuerReport>>>;
  const reports: Report[] = [];
  for (const [i, p] of pairs.entries()) {
    const r = await crossIssuerReport(p.ticker, taker, usd);
    if (r) reports.push(r);
    process.stdout.write(`\r  ${i + 1}/${pairs.length} ${p.ticker.padEnd(6)}`);
    await sleep(1100); // four quotes per ticker; stay inside 5 rps on aggregator/quote
  }
  console.log('');

  const platforms = [...new Set(reports.flatMap((r) => r.legs.map((l) => l.platform)))].sort();
  const out: string[] = [];

  out.push('# Same stock, two issuers — raw evidence');
  out.push('');
  out.push(`> Collected ${now.toISOString()} · NYSE: **${sessionLabel[session]}** · size **$${usd}** each side`);
  out.push('> ');
  out.push('> **This is not the report.** It is measured material to write one from.');
  out.push(`> Regenerate with \`npm run cross -- <taker> [usd]\`. Taker used: \`${taker}\``);
  out.push('');

  // ── What the issuers say they list ─────────────────────────────────────────
  out.push('## What the platforms endpoint claims vs what the token list returns');
  out.push('');
  const plat = await request('GET', '/api/v1/dex/market/rwa/platforms');
  const tok = await request('GET', '/api/v1/dex/market/rwa/tokens');
  const rows = ((tok.json as { data?: { platformId: string }[] } | null)?.data ?? []);
  const listed = ((plat.json as { data?: { platformId: string; chainDistribution?: { binanceChainId: string; tokenCount: number }[] }[] } | null)?.data ?? []);
  out.push('| platform | `rwa/platforms` says, BSC | `rwa/tokens` returns |');
  out.push('|---|---|---|');
  for (const p of listed) {
    const claimed = p.chainDistribution?.find((c) => c.binanceChainId === '56')?.tokenCount ?? '—';
    out.push(`| ${p.platformId} | ${claimed} | ${rows.filter((r) => r.platformId === p.platformId).length} |`);
  }
  out.push('');
  out.push(`Platforms returned: ${listed.map((p) => `\`${p.platformId}\``).join(', ')}. No xStocks on BSC through this API.`);
  out.push('`rwa/tokens` ignores `page`, `pageNo`, `pageSize` and `limit` — the gap is not pagination on our side.');
  out.push('');

  // ── Summary ────────────────────────────────────────────────────────────────
  const both = reports.filter((r) => r.legs.every((l) => l.bidPerShare !== null && l.askPerShare !== null && !l.bidNote && !l.askNote));
  const arbs = reports.map((r) => r.arbitrage).filter((a): a is NonNullable<typeof a> => a !== null);
  const positive = arbs.filter((a) => a.pct > 0).sort((a, b) => b.pct - a.pct);
  const afterGas = arbs.filter((a) => (a.afterGasUsd ?? 0) > 0).sort((a, b) => b.afterGasUsd! - a.afterGasUsd!);
  const gasPerSwap = median(reports.flatMap((r) => r.legs.map((l) => l.gasUsdPerSwap).filter((g): g is number => g !== null)));
  const gaps = reports.map((r) => r.referenceGapPct).filter((g): g is number => g !== null);
  const widestGap = [...reports].sort((a, b) => (b.referenceGapPct ?? 0) - (a.referenceGapPct ?? 0))[0];

  out.push('## Summary');
  out.push('');
  out.push(`- **${reports.length}** tickers listed by more than one issuer; **${both.length}** had a usable buy and sell on every issuer at $${usd}.`);
  out.push(`- Cross-issuer trades that clear before gas: **${positive.length} of ${arbs.length}**${positive.length ? ` (best: ${positive[0].buy} → ${positive[0].sell}, ${P(positive[0].pct, 3)}%)` : ''}. After gas: **${afterGas.length}**${afterGas.length ? ` (best: $${P(afterGas[0].afterGasUsd, 3)} on $${usd})` : ''}.`);
  out.push(`- Gas per swap, as the aggregator prices it in \`tradeFee\`: median **$${P(gasPerSwap, 4)}**, independent of size — so a two-swap trade at $${usd} starts ${P(gasPerSwap !== null ? (2 * gasPerSwap / usd) * 100 : null, 3)}% behind.`);
  for (const p of platforms) {
    const rts = reports.flatMap((r) => r.legs.filter((l) => l.platform === p && !l.bidNote && !l.askNote && l.roundTripPct !== null).map((l) => l.roundTripPct!));
    const reasons: Record<string, number> = {};
    for (const r of reports) {
      for (const l of r.legs.filter((x) => x.platform === p)) {
        const why = short(l.bidNote) || short(l.askNote);
        if (why) reasons[why] = (reasons[why] ?? 0) + 1;
      }
    }
    const why = Object.entries(reasons).map(([k, n]) => `${n} ${k}`).join(', ');
    const inverted = rts.filter((x) => x < 0).length;
    out.push(`- **${p}**: median round trip ${P(median(rts), 3)}% across ${rts.length} fully quoted${inverted ? ` (${inverted} with the ask *under* the bid — gone once gas is paid)` : ''}${why ? `; without a usable price on at least one side: ${why}` : ''}.`);
  }
  out.push(`- Reference disagreement between issuers: median ${P(median(gaps), 3)}%, widest ${P(widestGap?.referenceGapPct, 3)}% (${widestGap?.ticker}).`);
  out.push('');

  // ── The table ──────────────────────────────────────────────────────────────
  out.push('## Per ticker');
  out.push('');
  out.push('Per share, ratio applied. Bid = selling ~$' + usd + ' worth; ask = buying with $' + usd + '. Round trip = ask over bid on one issuer.');
  out.push('');
  const head = ['ticker', ...platforms.flatMap((p) => [`${p} bid`, `${p} ask`, `${p} RT %`]), 'ref gap %', 'cheaper to buy', 'pays more to sell', 'best cross-trade % (before gas)', 'after gas $', 'notes'];
  out.push(`| ${head.join(' | ')} |`);
  out.push(`|${head.map(() => '---').join('|')}|`);
  for (const r of reports) {
    const cells = [r.ticker];
    const notes: string[] = [];
    for (const p of platforms) {
      const l = r.legs.find((x) => x.platform === p);
      // Struck through: quoted, but dropped by the sanity check. A plain dash: never quoted.
      const cell = (v: number | null | undefined, note: string | null | undefined) => (note && v != null ? `~~${P(v)}~~` : P(v));
      cells.push(cell(l?.bidPerShare, l?.bidNote), cell(l?.askPerShare, l?.askNote), P(l?.roundTripPct, 3));
      if (l?.bidNote) notes.push(`${l.tokenSymbol} sell: ${short(l.bidNote)}`);
      if (l?.askNote) notes.push(`${l.tokenSymbol} buy: ${short(l.askNote)}`);
    }
    const b = r.cheapestBuy, s = r.bestSell, a = r.arbitrage;
    cells.push(
      P(r.referenceGapPct, 3),
      b ? `${b.tokenSymbol}${b.vsNextPct !== null ? ` (−${P(b.vsNextPct, 2)}%)` : ' (only)'}` : '—',
      s ? `${s.tokenSymbol}${s.vsNextPct !== null ? ` (+${P(s.vsNextPct, 2)}%)` : ' (only)'}` : '—',
      a ? P(a.pct, 3) : '—',
      a ? P(a.afterGasUsd, 3) : '—',
      notes.join('; '),
    );
    out.push(`| ${cells.join(' | ')} |`);
  }
  out.push('');
  out.push('Struck-through prices were quoted but dropped: more than 5% from their own issuer\'s reference.');
  out.push('');

  // ── Verbatim ───────────────────────────────────────────────────────────────
  out.push('## Why a side had no usable price — verbatim');
  out.push('');
  const seen = new Set<string>();
  for (const r of reports) {
    for (const l of r.legs) {
      for (const [side, note] of [['sell', l.bidNote], ['buy', l.askNote]] as const) {
        if (!note) continue;
        const key = note.includes('broken pool') ? `${l.tokenSymbol}${side}` : note.replace(/\d+d \d+h \d+m/, '…');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(`- \`${l.tokenSymbol}\` ${side}: ${note}`);
      }
    }
  }
  out.push('');
  out.push('## Verdicts, as /api/signal serves them');
  out.push('');
  for (const r of reports) out.push(`- **${r.ticker}** — ${r.verdict}`);
  out.push('');

  mkdirSync(resolve(process.cwd(), 'docs'), { recursive: true });
  const path = resolve(process.cwd(), `docs/cross-issuer-${session}.md`);
  writeFileSync(path, out.join('\n'));
  console.log(`\nwrote ${path}`);
  console.log(`${both.length}/${reports.length} fully quoted · ${positive.length}/${arbs.length} cross-trades clear before gas`);
}

main().catch((e) => { console.error(e); process.exit(1); });
