import 'server-only';
import { ensureSchema, pool } from './pg';
import { pricesByAddress } from './quote';
import { SPECIES, type Species } from './pets';
import { MANAGERS, managerById, managerForRule, type ManagerId } from './managers';
import type { Personality } from './pet-math';

// A manager's public track record: every position filed under it, for every client, valued at the
// live print. Nothing in it is self-reported — quantities and cost come from the database, the
// price from Binance's market feed, and an on-chain trade is one with a BSC transaction hash.
//
// Live (a bound wallet, every trade signed) and paper are counted apart. Adding them together would
// be the one number on the page that lies.

export type Book = { positions: number; basis: number; value: number; returnPct: number | null; realized: number };

export type ManagerRecord = {
  id: ManagerId;
  clients: number;
  live: Book;
  paper: Book;
  trades: number;
  onchainTrades: number;
  lastTradeAt: number | null;
};

export type Trade = {
  ts: number; kind: string; text: string; ticker: string; tokenSymbol: string | null;
  qty: number | null; price: number | null; usd: number | null; sig: string | null; paper: boolean;
};

type Row = {
  manager: string | null; personality: Personality; owner_hash: string; species: string; ticker: string;
  token_address: string | null; paper: boolean; realized: string; held_qty: string; cost_basis: string;
};

const managerOf = (r: { manager: string | null; personality: Personality }): ManagerId =>
  managerById(r.manager)?.id ?? managerForRule(r.personality).id;
const addressOf = (r: { species: string; token_address: string | null }) =>
  (r.token_address ?? SPECIES[r.species as Species['id']]?.address ?? '').toLowerCase();

const emptyBook = (): Book => ({ positions: 0, basis: 0, value: 0, returnPct: null, realized: 0 });

/** A record with nothing in it — for a manager nobody has hired yet, or a deploy with no database. */
export const emptyRecord = (id: ManagerId): ManagerRecord =>
  ({ id, clients: 0, live: emptyBook(), paper: emptyBook(), trades: 0, onchainTrades: 0, lastTradeAt: null });

export async function managerRecords(): Promise<ManagerRecord[]> {
  await ensureSchema();
  const db = pool();
  const [{ rows }, acts] = await Promise.all([
    db.query<Row>(
      `select p.manager, p.personality, p.owner_hash, p.species, p.ticker, p.token_address, p.paper, p.realized,
              coalesce((select sum((l->>'qty')::numeric) from jsonb_array_elements(p.lots) l), 0) + p.yield_qty as held_qty,
              coalesce((select sum((l->>'qty')::numeric * (l->>'price')::numeric) from jsonb_array_elements(p.lots) l), 0) as cost_basis
         from pets p order by p.updated_at desc limit 3000`,
    ),
    db.query<{ manager: string | null; personality: Personality; n: string; onchain: string; last: Date }>(
      `select p.manager, p.personality, count(*) as n,
              sum(case when e.sig like '0x%' and e.paper = false then 1 else 0 end) as onchain, max(e.ts) as last
         from pet_entries e join pets p on p.id = e.pet_id
        where e.kind in ('buy', 'sell')
        group by p.manager, p.personality`,
    ),
  ]);

  const prices = await pricesByAddress([...new Set(rows.map(addressOf).filter(Boolean))]);
  const by = new Map<ManagerId, ManagerRecord & { owners: Set<string> }>(
    MANAGERS.map((m) => [m.id, { id: m.id, clients: 0, live: emptyBook(), paper: emptyBook(), trades: 0, onchainTrades: 0, lastTradeAt: null, owners: new Set() }]),
  );

  for (const r of rows) {
    const rec = by.get(managerOf(r))!;
    const book = r.paper ? rec.paper : rec.live;
    const qty = Number(r.held_qty) || 0, basis = Number(r.cost_basis) || 0;
    const px = prices[addressOf(r)] ?? null;
    book.positions++;
    book.basis += basis;
    book.value += px !== null ? qty * px : basis; // unpriced: carried at cost rather than at zero
    book.realized += Number(r.realized) || 0;
    rec.owners.add(r.owner_hash);
  }
  for (const a of acts.rows) {
    const rec = by.get(managerOf(a))!;
    rec.trades += Number(a.n) || 0;
    rec.onchainTrades += Number(a.onchain) || 0;
    const last = a.last?.getTime() ?? null;
    if (last && (!rec.lastTradeAt || last > rec.lastTradeAt)) rec.lastTradeAt = last;
  }

  return [...by.values()].map(({ owners, ...rec }) => {
    for (const b of [rec.live, rec.paper]) b.returnPct = b.basis > 0 ? ((b.value - b.basis) / b.basis) * 100 : null;
    return { ...rec, clients: owners.size };
  });
}

/** The latest trades and requests a manager made, for anyone to read. */
export async function recentTrades(id: ManagerId, limit = 15): Promise<Trade[]> {
  const m = managerById(id);
  if (!m) return [];
  await ensureSchema();
  const { rows } = await pool().query<{
    ts: Date; kind: string; body: string; ticker: string; token_symbol: string | null;
    qty: string | null; price: string | null; usd: string | null; sig: string | null; paper: boolean | null;
  }>(
    `select e.ts, e.kind, e.body, p.ticker, p.token_symbol, e.qty, e.price, e.usd, e.sig, e.paper
       from pet_entries e join pets p on p.id = e.pet_id
      where (p.manager = $1 or (p.manager is null and p.personality = $2)) and e.kind in ('buy', 'sell', 'ask')
      order by e.ts desc limit $3`,
    [m.id, m.rule, limit],
  );
  const n = (v: string | null) => (v === null ? null : Number(v));
  return rows.map((r) => ({
    ts: r.ts.getTime(), kind: r.kind, text: r.body, ticker: r.ticker, tokenSymbol: r.token_symbol,
    qty: n(r.qty), price: n(r.price), usd: n(r.usd), sig: r.sig, paper: r.paper ?? true,
  }));
}
