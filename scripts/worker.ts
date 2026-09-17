/**
 * The hour hand.
 *
 * Stocklings are supposed to trade whether or not you are looking at them — that is the whole point
 * of the Night Owl, who hunts dips at 3am while the NYSE is shut. Railway cron runs this once an
 * hour; the work itself lives in src/lib/tick.ts, shared with /api/tick so a run can also be
 * triggered on demand.
 */
import { pool } from '../src/lib/pg';
import { runTick } from '../src/lib/tick';

async function main() {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
  const s = await runTick();
  console.log(`tick ${new Date(s.at).toISOString()} — ${s.pets} pets`);
  for (const l of s.lines) console.log(`  ${l}`);
  console.log(`done — ${s.acted} acted, ${s.waiting} waiting on their owner`);
  await pool().end();
}

main().catch((e) => { console.error(e); process.exit(1); });
