# Stocklings

**Adopt a Stockling — an AI with its own wallet that invests for you.**

A Stockling is a collectible creature *and* an autonomous agent. You pick an egg, it hatches, you name it and choose its personality — which is also its trading strategy. Then you feed it. Feeding is depositing; the Stockling buys its home stock on Solana, lends it for yield, and writes a diary about what it did.

Built for [Stocklana](https://hackathons.solana.com/hackathons/stocklana), the Solana Foundation's tokenized-stock hackathon.

---

## Why it isn't a dashboard with a face

Four things make the pet the interface rather than decoration.

**It lives on the market's clock.** The app has a day and a night, switched by the real NYSE session — including holidays, pulled from Backpack's public calendar. During regular hours it's a warm off-white; at the close it turns into a dark terminal and the Stockling's LEDs light the floor. There's a mood only a 24/7 chain can have:

> **Night Owl** — *"Wall Street sleeps. I don't."*

That's the whole Solana thesis expressed as a facial expression. The token trades while the exchange is shut.

**Its mood is the market.** Eight states driven by the live print, the session, and how hungry it is — Ecstatic, Happy, Chill, Nervous, Sulking, Night Owl, Pajamas, Hungry. Hunger and session outrank price, so the care loop is never masked by a green day.

**It keeps going when you close the app.** A cron service replays the same deterministic engine every hour against the real hourly tape and writes the result and the diary lines to Postgres. Open the app the next morning and it pulls what happened and tells you about it. The Board counts how many of the last day's moves landed while the NYSE was shut — the number is read off the diary, not asserted.

The engine is pure, so the browser and the worker produce identical actions from identical bars. And a Stockling waiting on a yes/no from you is skipped entirely: the permission rule holds when nobody is watching, which is the only time it matters.

**It goes public, and then your friends can feed it.** After enough days together, a Stockling rings the bell: its token launches on a Meteora Dynamic Bonding Curve **quoted in its own home stock**, not SOL or USDC. `/back/<id>` is a page you send to someone who doesn't have a Stockling — they read the pet's record and its last diary lines, see how far the curve has filled, and buy its token with NVDA.

The curve collects its fee in the quote token and pays the whole creator share to the pet. So a trade doesn't pay the backer, it pays the Stockling, in the asset it already invests in. Backing it is feeding it. The owner collects that with a real `claimCreatorTradingFee` transaction, and Meteora's keepers graduate the pool once the curve fills.

## What we verified on mainnet

The stock-quoted launch was the project's one real technical unknown. It's resolved, and the method is in [`scripts/dbc/`](scripts/dbc):

- Meteora's DBC program whitelists quote mints through a `TokenBadge` PDA (`["token_badge", mint]`). Token-2022 mints otherwise need zero transfer fee and metadata-only extensions.
- Badges **exist** for all 30 Backpack Securities stocks and for xStocks `NVDAx`, `AAPLx`, `TSLAx`, `SPCXx` — every one is a valid quote asset. (`badges.js`)
- A full `createConfig + initializeVirtualPool` for a token quoted in **NVDAx** simulates clean against mainnet: `err: null`, 162,027 CU, one 1,125-byte transaction. (`sim2.js`)
- Tessera and PreStocks are excluded by the zero-fee rule (20 and 50 bps), so pre-IPO Stocklings hold their T-Token but launch quoted in a public stock.
- The backing swap quotes and simulates clean against a live mainnet pool: `err: null`, 32,403 CU. (`swapsim.js`; `probe.js` records the account shapes, which the SDK's generated types get wrong.)

One operational note from that work: the public RPC rate-limits `getTokenLargestAccounts` into uselessness, so backer counts degrade to "hidden" rather than failing. A dedicated RPC endpoint is worth having before launch day.

## The six

The home stock decides the species. Each carries one deliberate wrong detail — the Pop Mart principle: a face that resolves instantly is a face you forget.

| Stockling | Species | Home stock | Wrong detail |
|---|---|---|---|
| Nova | Robot cat | NVDA | left ear bent |
| Volt | Lightning dog | TSLA | right ear folded |
| Pip | Earbud hedgehog | AAPL | one bent spine |
| Booster | Space frog | SPCX | mismatched eyes, crooked patch |
| Nimbus | Cloud | OpenAI *(pre-IPO)* | drooping puff |
| Lurk | Night owl | RDDT | one eye half closed |

## Stack

Next.js 16 · TypeScript · Tailwind · Framer Motion · Solana wallet adapter (Phantom, Solflare) · Railway (app, Postgres, hourly cron)

Three services, one platform. `web` serves the app and owns the database credentials; `worker` runs `scripts/worker.ts` on `0 * * * *`; `Postgres` holds the pets. A device proves ownership with a random key kept in its own `localStorage` — only the SHA-256 lands in the database, and a write whose hash doesn't match is refused rather than forking a second pet.

| Purpose | Source | Auth |
|---|---|---|
| Exchange print | Backpack `ticker?source=External` | none |
| On-chain & pre-IPO price | Jupiter Price v3 | none |
| Market sessions & holidays | Backpack `market-holidays` | none |
| Stock-quoted launch | `@meteora-ag/dynamic-bonding-curve-sdk` | none |
| Agent brain & wallets | Clawpump Partner API | `CLAWPUMP_API_KEY` |

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. No wallet needed to explore — connect only when money moves.

Dev switches: `?night=1` forces the night theme, `?mood=sulking` pins a mood, `/public?dev=1` skips the bond requirement.

Optional, in `.env.local` (see `.env.example`):

```
DATABASE_URL=postgresql://...   # Railway → Postgres → DATABASE_PUBLIC_URL
CLAWPUMP_API_KEY=cpk_...        # real agents with their own wallets
PYTH_ACCESS_TOKEN=              # Pyth equity feeds
```

Every one is optional. Without `DATABASE_URL` the Board is empty and nothing syncs; without a Clawpump key the app runs on a local voice for each personality. Each screen works offline either way, and anything simulated is labelled **paper** wherever it appears.

To run one tick of the hourly worker by hand:

```bash
npm run worker
```

## Status

Working: adoption and hatching, the feed loop with live pricing, mood engine, the strategy engine and its diary, the hourly worker, "While you were out", the P&L Board, duels, shelf, day/night sessions, the go-public ceremony that builds and sends the real launch transaction, and the backing page with its swap and fee claim.

In progress: Blinks, and the daily spin.

## Credits

Character art generated with Higgsfield (`gpt-image-2.5`) from the prompts recorded in `docs/DESIGN.md`. Design tokens and the full character system are documented there.
