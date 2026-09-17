# Roost

**Adopt a Fledgling — a collectible creature that is also a trading rule, on BNB Smart Chain.**

You pick an egg, it hatches, you name it and choose its personality — which *is* its trading strategy. Then you feed it. Feeding is depositing; the Fledgling buys its home stock as a tokenized equity on BSC and writes a diary about what it did and why.

Built for [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks).

---

## The gap

A tokenized stock trades every hour of the week. The exchange behind it is open about **32 hours in 168**. For the other 136 the reference price is a number that stopped moving on Friday afternoon while the token kept trading.

That gap is the product. It is also the thing the API makes surprisingly hard to measure — see [What we verified](#what-we-verified-on-bsc).

## Why the pet is the interface, not decoration

**It lives on the market's clock.** The app has a day and a night, switched by the real NYSE session including holidays. During regular hours it's a warm off-white; at the close it turns into a dark terminal and the Fledgling's LEDs light the floor. There's a mood only a 24/7 chain can have:

> **Night Owl** — *"Wall Street sleeps. I don't."*

That is the entire thesis expressed as a facial expression. The token trades while the exchange is shut.

**Its mood is the market.** Eight states driven by the live print, the session, and how hungry it is — Ecstatic, Happy, Chill, Nervous, Sulking, Night Owl, Pajamas, Hungry. Hunger and session outrank price, so the care loop is never masked by a green day.

**It keeps going when you close the app.** A cron service replays the same deterministic engine every hour against the real hourly tape and writes the result and the diary lines to Postgres. The engine is pure, so the browser and the worker produce identical actions from identical bars.

And a Fledgling waiting on a yes/no from you is skipped entirely. The permission rule holds when nobody is watching, which is the only time it matters.

**It never holds your keys.** Roost decides; your wallet executes. That is a design commitment, not a limitation — see [Three layers](#three-layers).

## What we verified on BSC

Everything below was found by running against the live Binance Web3 API, and each is reproducible with a script in this repo.

**The RWA endpoint cannot give you the spread.** It looks like it can — `tokenPrice` and `referencePrice` sit in the same row. But `tokenPrice / (referencePrice × tokenToShareRatio)` is exactly `1.000` for **all 488 listed tokens**. `referencePrice` is derived, not an independent tape. Difference the two and you report a perfectly efficient market, always, including at 3am on a Sunday. The traded leg has to be a real aggregator quote. (`npm run check:quotes`)

**`tokenToShareRatio` is not optional.** Skip it and a 10:1 token reports a **900%** spread. `NFLXon`, `PPLTon` and `KLACon` all do exactly that if you forget.

**bStock and Ondo are not the same product.** bStock quotes and swaps through the ordinary aggregator. Ondo is request-for-quote and refuses outright — `userWalletAddress is required for RFQ (Ondo) quote`. There is no quoting an Ondo name without a taker. Even on bStock, the zero address returns *insufficient liquidity* on thinner books where a real address quotes fine, so the wallet is a hard requirement, not a nicety.

**`AAPLon` fills ~5.6% under its reference, repeatably**, at 0.05 price impact — far too small for our size to be moving it. The pool is priced there.

**bStock rows omit `marketStatus`.** They carry `statusInfo`, but only Ondo fills the field in. Read it naively and every bStock reports "the exchange is shut" while the NYSE is trading. Silence is not *closed* — where the API says nothing, Roost falls back to its own session clock and the report says which source answered.

**The gateway's sharp edges.** The signed `requestPath` must carry the `/build` prefix — Binance's own docs call omitting it the #1 cause of `40102`, and they're right. The chain parameter is `binanceChainId`, not `chainId`. Failures come back as **HTTP 200** with the error in the body's `code`, so status-code-only handling swallows them silently. Candle `bar` is case-sensitive lowercase (`1h`, not `1H`), and a candle's timestamp is at **index 5**, not index 0 the way Binance spot klines put it.

**Lending has no venue.** The DeFi API lists ten protocols on BSC, but none is confirmed to take a tokenized equity as collateral. Rather than emit a command that would fail on-chain, a Fledgling that wants to lend reports `blocked` and says why. Its shares sit idle rather than pretend to earn.

## The six

The home stock decides the species. Each carries one deliberate wrong detail — the Pop Mart principle: a face that resolves instantly is a face you forget.

| Fledgling | Species | Home stock | Token | Platform | Wrong detail |
|---|---|---|---|---|---|
| Nova | Robot cat | NVDA | `NVDAB` | bStock | left ear bent |
| Volt | Lightning dog | TSLA | `TSLAB` | bStock | right ear folded |
| Pip | Earbud hedgehog | AAPL | `AAPLon` | Ondo | one bent spine |
| Booster | Space frog | SPCX *(pre-IPO)* | `SPCXB` | bStock | mismatched eyes, crooked patch |
| Nimbus | Cloud | CRWV | `CRWVB` | bStock | drooping puff |
| Lurk | Night owl | RDDT | `RDDTon` | Ondo | one eye half closed |

Four swap; Pip and Lurk go through RFQ. That split is kept deliberately rather than flattened to one platform — it is the honest shape of the market, and two execution paths behind one interface is the interesting part.

## Three layers

Roost holds no keys at any layer. It decides; something the user controls executes.

**The app.** Connect a wallet (wagmi 3 over EIP-6963, so Binance Web3 Wallet announces itself by name), adopt, feed, watch. A Fledgling is bound to the wallet connected at adoption — without one it is explicitly **paper**, and every surface says so.

**Binance Agentic Wallet** — [`skills/roost/`](skills/roost). Agentic Wallet is MPC-keyless: the user signs in from the Binance App by QR, the key is never reconstructed anywhere, and an AI agent drives it through the `baw` CLI inside limits set in the App. So there is no server-side key and there should not be one. `POST /api/agent` returns the Fledgling's decision as one of four instructions — a `swap` carrying the exact `baw` command, an `ask` the owner must answer, a `hold`, or a `blocked` — and the skill runs it. The skill carries Binance's own hard rule: an `orderId` is **not** a completed swap; poll to `FINISHED` or `FAILED` before reporting anything, because the diary is meant to be checkable against the chain.

**BNB Agent Studio** — [`roostsignal/`](roostsignal). A Fledgling deployed as a seller agent: ERC-8004 identity, ERC-8183 task interface, A2A + MCP + X402 faces. What it sells is the gap — `/api/signal` reports it for **all 448 tokenized tickers on BSC**, not just the six with faces. Priced at 0.1 U on the ERC-8183 rail with the x402 rail free. Its system prompt's first rule is that every number must come from a tool call: an invented price is worse than no answer, because measured numbers are the entire product.

## Stack

Next.js 16 · TypeScript · Tailwind · Framer Motion · wagmi 3 + viem · Railway (app, Postgres, hourly cron)

| Purpose | Source | Auth |
|---|---|---|
| Tokenized stock list, reference price, market status | Binance Web3 **RWA Data API** | HMAC-SHA256 |
| Traded price, 24h change | Binance Web3 **Market API** | HMAC-SHA256 |
| Executable fill, price impact | Binance Web3 **Trading API** (aggregator) | HMAC-SHA256 |
| Hourly candles | Binance Web3 **Market API** | HMAC-SHA256 |
| Execution | Binance **Agentic Wallet** (`baw`) | QR / MPC, user-held |
| Seller agent | **BNB Agent Studio** (`bag`) | wallet keystore, user-held |

All signing lives in [`src/lib/binance.ts`](src/lib/binance.ts), which builds the wire path once and uses that one string for both the signature and the request — the two cannot drift apart.

## Run it

```bash
npm install
cp .env.example .env.local   # add BINANCE_W3_API_KEY and BINANCE_W3_API_SECRET
npm run dev
```

Open `http://localhost:3000`. No wallet needed to explore — connect only when money moves.

Verify the data path against the live API:

```bash
npm run check:api                     # credentials, clock drift, signature, RWA endpoints
npm run check:quotes -- 0xYourAddress # the price layer, and real fills for all six
npm run check:agent  -- 0xYourAddress # what each personality wants to do right now
```

`check:api` proves four things in order, because each only matters if the last passed, and decodes every documented error code to a plain-English cause. Dev switches: `?night=1` forces the night theme, `?mood=sulking` pins a mood.

To run one tick of the hourly worker by hand:

```bash
npm run worker
```

## Status

**Working and verified against the live API:** adoption and hatching, the feed loop with live pricing, the mood engine, the strategy engine and its diary, the two-source spread with real aggregator fills, hourly candles on both platforms, the wallet layer, the agent intent layer, and the seller agent's deliverable across 448 tickers.

**Honest gaps.** Nothing has executed on-chain yet — the `baw` hop and the Agent Studio deploy are both built and typechecked but have never run, because each needs a signed-in wallet. `DATABASE_URL` is unset locally, so the Board, duels and the hourly worker are inert until Postgres is attached. Lending is `blocked` for `diamond` and `quant` until a BSC venue exists. And `/api/holidays` still reads the NYSE closure calendar from Backpack's public API — a Solana-ecosystem venue, and the next thing to replace.
