import { Pool } from 'pg';
import { createHash } from 'node:crypto';

// Railway Postgres. Only the server holds the connection string, so ownership is enforced here
// rather than by row-level security: every write is scoped by a hash of the caller's owner key.
//
// Imported through ./db inside the app, which adds the server-only guard. The hourly worker is a
// plain Node process with no React around it, so it imports this module directly.

declare global {
  // Survive dev hot-reloads without leaking pools.
  var __roostPool: Pool | undefined;
  var __roostSchema: Promise<void> | undefined;
}

const connectionString = process.env.DATABASE_URL;

export const dbEnabled = () => Boolean(connectionString);

export function pool(): Pool {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  if (!globalThis.__roostPool) {
    globalThis.__roostPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      // Railway's Postgres image ships a self-signed certificate.
      ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalThis.__roostPool;
}

export const ownerHash = (ownerKey: string) => createHash('sha256').update(ownerKey, 'utf8').digest('hex');

const SCHEMA = `
create table if not exists pets (
  id           uuid primary key default gen_random_uuid(),
  owner_hash   text not null,
  species      text not null,
  ticker       text not null,
  name         text not null,
  personality  text not null,
  adopted_at   timestamptz not null default now(),
  streak       int not null default 1,
  cash         numeric not null default 0,
  lots         jsonb not null default '[]'::jsonb,
  lent_qty     numeric not null default 0,
  yield_qty    numeric not null default 0,
  last_tick_at timestamptz,
  agent_id     text,
  wallet       text,
  launch       jsonb,
  proposal     jsonb,
  paper        boolean not null default true,
  updated_at   timestamptz not null default now()
);
-- Added after the first deploy; the worker must not trade past an unanswered question.
alter table pets add column if not exists proposal jsonb;
create index if not exists pets_owner_hash_idx on pets (owner_hash);
create index if not exists pets_updated_idx    on pets (updated_at desc);

create table if not exists pet_entries (
  id     bigserial primary key,
  pet_id uuid not null references pets (id) on delete cascade,
  ts     timestamptz not null,
  kind   text not null,
  body   text not null,
  qty    numeric,
  price  numeric,
  usd    numeric,
  sig    text,
  paper  boolean default true
);
-- One action of a given kind per timestamp: re-syncing the same window is a no-op.
create unique index if not exists pet_entries_dedupe_idx on pet_entries (pet_id, ts, kind);
create index if not exists pet_entries_pet_ts_idx on pet_entries (pet_id, ts desc);

-- A duel is 24 hours, two Fledglings, best percentage move wins. Both portfolios are valued at the
-- challenge and again at the bell; storing the opening value is what makes the result checkable
-- afterwards instead of a claim.
create table if not exists duels (
  id         uuid primary key default gen_random_uuid(),
  a          uuid not null references pets (id) on delete cascade,
  b          uuid not null references pets (id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at    timestamptz not null,
  a_value    numeric not null,
  b_value    numeric not null,
  a_final    numeric,
  b_final    numeric,
  winner     uuid,
  settled_at timestamptz
);
create index if not exists duels_open_idx    on duels (ends_at) where settled_at is null;
create index if not exists duels_settled_idx on duels (settled_at desc);
`;

/** Idempotent, runs once per process. Keeps deploys to "push and go". */
export function ensureSchema(): Promise<void> {
  if (!globalThis.__roostSchema) {
    globalThis.__roostSchema = pool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((e) => { globalThis.__roostSchema = undefined; throw e; });
  }
  return globalThis.__roostSchema;
}
