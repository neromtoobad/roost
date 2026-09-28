/**
 * What does each personality want to do right now, against the live tape?
 *
 *   npm run check:agent -- [0xWalletAddress]
 *
 * This is the same path POST /api/agent takes: real candles, the real engine, the real
 * instruction. Nothing is executed — Roost never executes. See src/lib/agent.ts.
 *
 * With a wallet, every swap is also simulated against it (src/lib/preflight.ts): signed by nobody,
 * broadcast nowhere, but it says whether the buy would go through from that wallet right now.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function main() {
  for (const l of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  const { decide } = await import('../src/lib/strategy');
  const { fetchBars } = await import('../src/lib/bars');
  const { toInstruction, brief, feedInstruction } = await import('../src/lib/agent');
  const { quoteFor, fillFor } = await import('../src/lib/quote');
  const { preflightBuy } = await import('../src/lib/preflight');
  const { SPECIES } = await import('../src/lib/pets');

  const wallet = process.argv[2];
  const hasWallet = /^0x[a-fA-F0-9]{40}$/.test(wallet ?? '');
  const species = 'nova' as const;

  const { bars, source } = await fetchBars(species, 7);
  console.log(`\n${B('Tape')}  ${bars.length} hourly bars (${source}), last close ${bars.at(-1)?.close.toFixed(2)}`);

  const q = await quoteFor(species);
  const fill = hasWallet ? await fillFor(species, wallet as `0x${string}`) : null;
  const per = fill?.perToken ?? q.price;
  console.log(`${B('Market')} ${q.ticker} at ${per?.toFixed(2)} vs reference ${q.reference?.toFixed(2)} ` +
    D(`(${fill ? 'aggregator quote' : 'oracle read'}${hasWallet ? '' : ' — no wallet given'})`));

  console.log(`\n${B('What each personality wants, same tape, same cash')}\n`);
  for (const p of ['diamond', 'degen', 'boomer', 'quant'] as const) {
    const state = { cash: 40, heldQty: 0.18, lentQty: 0.05, lastBuyAt: Date.now() - 9 * 86400e3, totalFed: 80 };
    const ins = toInstruction(species, decide(p, bars, bars.length - 1, state));
    const tag = ins.kind === 'swap' ? G('SWAP') : ins.kind === 'ask' ? Y('ASK ') : ins.kind === 'blocked' ? Y('BLCK') : D('HOLD');
    console.log(`  ${tag}  ${p.padEnd(9)} ${ins.summary}`);
    console.log(`        ${D(ins.reason)}`);
    if (ins.kind === 'swap') {
      const qty = per ? ins.usd / per : null;
      console.log(`        ${D(`→ about ${qty?.toFixed(5)} ${brief(species, p).token}`)}`);
      console.log(`        ${D(ins.cli)}`);
      if (hasWallet) {
        const pf = await preflightBuy(SPECIES[species], ins.usd, wallet);
        const mark = pf.status === 'would-succeed' ? G('SIM ✓') : pf.status === 'not-simulated' ? D('SIM –') : Y('SIM ✗');
        console.log(`        ${mark} ${pf.summary}`);
      }
    }
    if (ins.kind === 'blocked') console.log(`        ${Y('why: ' + ins.why)}`);
    console.log();
  }

  // What the owner gets when they feed it themselves: a swap now, whatever the rules say.
  const feed = feedInstruction(species, 5);
  console.log(`${B('Feeding it $5 now')}  ${D('— action: feed, at any hour')}`);
  console.log(`  ${G('SWAP')}  ${feed.summary}`);
  if (feed.kind === 'swap') {
    console.log(`        ${D(feed.cli)}`);
    if (hasWallet) {
      const pf = await preflightBuy(SPECIES[species], feed.usd, wallet);
      const mark = pf.status === 'would-succeed' ? G('SIM ✓') : pf.status === 'not-simulated' ? D('SIM –') : Y('SIM ✗');
      console.log(`        ${mark} ${pf.summary}`);
    }
  }
  console.log();

  // The rule that matters most: an unanswered question stops everything.
  console.log(B('Awaiting an answer'));
  console.log(`  ${D('a Fledgling with an open question does not act — the route short-circuits before the engine runs')}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
