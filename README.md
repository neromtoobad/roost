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

**`priceImpactPercent` is a fraction, not a percent.** `0.946` is a 94.6% impact — `SNDKon` filled 97% under its reference on a Saturday with exactly that in the field. We misread it ourselves: `AAPLon` filling ~5.6% under its reference "at 0.05 impact" looked like a pool priced off the share, and was a 5% impact on a thin book. The same token filled 0.33% under on a Sunday. A guard written as `impact > 1` passes a fill that loses 95%. Separately, `tradeFee` is the swap's gas in USD (~$0.03 whatever the size), and it is not taken out of the quoted amount.

**The same stock from two issuers is two prices, and two references.** bStock and Ondo both list 40 tickers on BSC — NVDA, TSLA, SPCX and CRWV among them, four of the six. Quoted both ways on a Saturday (`npm run cross`):

- **No arbitrage worth the name.** In the recorded run, all 17 pairs quotable on both sides lost money before gas — 0.02% to 1.1% at $100. A run fifteen minutes earlier had two that cleared; the better, DRAM at +0.09%, came to about two cents once the two swaps' gas was paid.
- **But a real routing choice.** NVDA sold for the same on either issuer, and cost **2.1% more to buy as `NVDAon`** than as `NVDAB`; SPCX 2.0% more, widening to 3.6% at $500. On a weekend bStock's round trip was a median 0.23% and never above 0.6%.
- **The references disagree.** Per share, ratio applied, at the same instant: NVDA 224.18 vs 224.80, IBM 2.2% apart. There is no single "reference price" to measure a gap against — each issuer carries its own.
- **Off-hours, Ondo is mostly shut and partly broken.** 16 of the 40 Ondo tokens refused to quote (*"The stock market is currently closed"*), 5 had no liquidity at $100, and 4 quoted from broken pools — `MSFTon` offered a buy 196 million percent over its reference. Roost checks every side against its own issuer's reference and keeps anything more than 5% off out of the answer.

**bStock rows omit `marketStatus`.** They carry `statusInfo`, but only Ondo fills the field in. Read it naively and every bStock reports "the exchange is shut" while the NYSE is trading. Silence is not *closed* — where the API says nothing, Roost falls back to its own session clock and the report says which source answered.

**The gateway's sharp edges.** The signed `requestPath` must carry the `/build` prefix — Binance's own docs call omitting it the #1 cause of `40102`, and they're right. The chain parameter is `binanceChainId`, not `chainId`. Failures come back as **HTTP 200** with the error in the body's `code`, so status-code-only handling swallows them silently. Candle `bar` is case-sensitive lowercase (`1h`, not `1H`), and a candle's timestamp is at **index 5**, not index 0 the way Binance spot klines put it.

**The rate limit is shared, and a burst looks like a replay.** The docs say five requests a second per endpoint. Measured, the RWA Data endpoints share *one* budget of about three a second — profile and market data each at 2.9/s together drew `42900`, either alone did not — while the aggregator took four quotes a second without complaint. And two identical signed requests in the same millisecond are refused as a replay: `401`, `40103`, *"Duplicate request detected"*. Seven litter pups asking for the token list at once got exactly that. So every call leaves [`lib/binance`](src/lib/binance.ts) in a paced lane, loads are single-flight, and a rate-limited lookup is never cached as an answer — a cached `null` briefly hatched Nvidia as a cloud.

**Simulate catches what a quote cannot.** Twelve wallets that had just used the aggregator's router, each asked to buy $1 of NVDAB: eleven would have reverted — six on balance, five on allowance. Every one had a perfectly good quote. The endpoint has no reference page yet; its body is `{ binanceChainId, evmTx: { from, to, value, data } }`, and anything else gets an error naming `evmParams` — a field that does not exist — as code `50000`, the "internal error, retry" code.

**Lending has no venue.** The DeFi API lists ten protocols on BSC, but none is confirmed to take a tokenized equity as collateral. Rather than emit a command that would fail on-chain, a Fledgling that wants to lend reports `blocked` and says why. Its shares sit idle rather than pretend to earn.

## Any stock, six Fledglings

A Fledgling can hatch from **any of the ~450 tokenized stocks and ETFs on BSC** — search by ticker or company name, read its company card (sector, CEO, 52-week range, P/E, dividend, the issuer's collateral report, and how far the token trades from the share), and hatch it. The sector decides which of the six hatches: Technology a Nova, Energy and Materials a Volt, Consumer and Healthcare a Pip, Industrials (aerospace lives there) a Booster, ETFs a Nimbus, Communication and Financials a Lurk. You can keep a **nest** of several, one portfolio across them, and **release** shares back to USDT through the same simulation and price guard as feeding.

**Habits, not hype.** A Fledgling can have a **feeding day** — $10 every week, fortnight or month. A paper one is fed on the day by the hourly worker; a live one waits for its owner's signature (or an Agentic Wallet keeping the schedule), and missed days are skipped, never stacked into a catch-up buy. There is a free daily **pet** (once every 12 hours), a streak that **forgives one missed day a week**, and **growth stages** — Hatchling, Fledgling, Flyer, Legend — earned by days visited, pets given and feeding days kept, never by returns or deposit size. When a token's share ratio rises, a dividend was reinvested, and the pet says it grew. Confetti is kept for hatching and care milestones; nothing that moves money gets a celebration — the thing Robinhood removed in 2021 and settled over in 2024.

**Litters.** Four themes hatch as several pups at once — **Magnificent 7**, **AI Chips**, **Whole market** (SPY, QQQ, IWM, GLD) and **Buffett Portfolio** — Binance's own sector names, curated here because the token list ignores the `tabId` that is documented to filter by them. A litter shares a personality and a wallet and is fed as one: each feed is a **rebalance with new money** ([`lib/litters`](src/lib/litters.ts)) — it tops up whoever has fallen furthest below an equal share first, and nobody is sold to make room. Live, that is one real buy per pup that eats, each simulated and signed in turn; a share too small to be worth a trade (Ondo refuses $5 and under) waits for the next feed, the fullest pup first.

**The cheaper share.** Two issuers sell most of the big names, and a pet should not pick by habit. When one hatches, [`lib/issuer`](src/lib/issuer.ts) prices one share through each — real aggregator fills for the owner's wallet when one is connected, the traded price when not — per share, ratio applied, broken pools thrown out. It hatches from the cheaper, says why in its first diary line, and leaves the other a tap away. A cheaper route the web app cannot sign (request-for-quote) loses to one it can, and the pet says so. Measured on a Tuesday pre-market at $25: the price feed called GOOGL and QQQ a tie between issuers; the real fills made **`GOOGLB` 1.26% cheaper per share than `GOOGLon`, and `QQQB` 1.40% cheaper than `QQQon`** — the difference between reading a price and asking for one. `MSFTon` was still quoting from a broken pool, and was left out.

**A pet on Telegram.** "Remind me on Telegram" binds a Fledgling to a chat with a one-time code. The hourly worker then messages it on feeding days (with a **Sign it** button that opens that pet's feed screen), when its rule wants to buy, and when a paper pet did something on its own; `/pets` asks how they are all doing, `/stop` ends it. It never trades from the chat — anything with money opens Roost, where the owner's wallet signs. Off unless `TELEGRAM_BOT_TOKEN` is set.

The six each have a signature stock, and one deliberate wrong detail — the Pop Mart principle: a face that resolves instantly is a face you forget.

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

Feeding a live Fledgling is a real buy, signed in the owner's own wallet: Roost builds the aggregator's transaction for that wallet, simulates it, asks for a USDT approval of exactly this amount when one is needed, then the swap — and writes the diary from the receipt's own Transfer logs, linked to BscScan, rather than from the quote. It refuses a fill priced more than 3% over the token's own reference — a buy can go through and still be a bad buy, and some off-hours pools are broken. Or the owner can just fund it and let its rule decide: when the rule fires, the pet asks for a signature instead of pretending it traded. Roost never records a trade for a live Fledgling that the chain did not.

**Binance Agentic Wallet** — [`skills/roost/`](skills/roost). Agentic Wallet is MPC-keyless: the user signs in from the Binance App by QR, the key is never reconstructed anywhere, and an AI agent drives it through the `baw` CLI inside limits set in the App. So there is no server-side key and there should not be one. `POST /api/agent` returns the Fledgling's decision as one of four instructions — a `swap` carrying the exact `baw` command, an `ask` the owner must answer, a `hold`, or a `blocked` — and the skill runs it. Or the owner feeds it (`"action": "feed", "usd": 5`) and it eats at once, at any hour: the same `baw` swap, without waiting for the market open or for its rule to fire. Before it does, every `swap` comes back **simulated against the wallet that would sign it**: the aggregator builds the unsigned transaction, the Transaction API's `simulate` runs it against current chain state, and the Wallet API reads the USDT and BNB behind it. A buy that would revert — no USDT, no BNB for gas, no allowance — is caught before the owner says yes, and the skill will not run one that would fail. The skill carries Binance's own hard rule: an `orderId` is **not** a completed swap; poll to `FINISHED` or `FAILED` before reporting anything, because the diary is meant to be checkable against the chain.

**BNB Agent Studio** — [`roostsignal/`](roostsignal). A Fledgling deployed as a seller agent: ERC-8004 identity, ERC-8183 task interface, A2A + MCP + X402 faces. What it sells is the gap — `/api/signal` reports it for **all 448 tokenized tickers on BSC**, not just the six with faces — and, for the 40 that two issuers list, where the same share executes best (`/api/signal?ticker=NVDA&cross=1&wallet=…`). Priced at 0.1 U on the ERC-8183 rail with the x402 rail free. Its system prompt's first rule is that every number must come from a tool call: an invented price is worse than no answer, because measured numbers are the entire product.

## Stack

Next.js 16 · TypeScript · Tailwind · Framer Motion · wagmi 3 + viem · Railway (app, Postgres, hourly cron)

| Purpose | Source | Auth |
|---|---|---|
| Tokenized stock list, reference price, market status | Binance Web3 **RWA Data API** | HMAC-SHA256 |
| Traded price, 24h change | Binance Web3 **Market API** | HMAC-SHA256 |
| Executable fill, price impact, unsigned swap tx | Binance Web3 **Trading API** (aggregator) | HMAC-SHA256 |
| Pre-flight simulation of every buy | Binance Web3 **Transaction API** (`simulate`) | HMAC-SHA256 |
| USDT and BNB behind the wallet | Binance Web3 **Wallet API** | HMAC-SHA256 |
| Hourly candles | Binance Web3 **Market API** | HMAC-SHA256 |
| Execution | Binance **Agentic Wallet** (`baw`) | QR / MPC, user-held |
| Seller agent | **BNB Agent Studio** (`bag`) | wallet keystore, user-held |
| Feeding-day reminders | Telegram **Bot API** (webhook in, `sendMessage` out) | bot token, secret header |

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
npm run cross        -- 0xYourAddress # bStock vs Ondo on every ticker both list → docs/cross-issuer-<session>.md
```

`check:api` proves four things in order, because each only matters if the last passed, and decodes every documented error code to a plain-English cause. Dev switches: `?night=1` forces the night theme, `?mood=sulking` pins a mood.

The Telegram pet is optional. Make a bot with [@BotFather](https://t.me/BotFather), then set `TELEGRAM_BOT_TOKEN` on the app and the worker, and `PUBLIC_URL` (the app's https address) wherever Railway does not already provide `RAILWAY_PUBLIC_DOMAIN` — the worker, which has no domain of its own, needs it for the links it sends. The app registers its webhook on every start.

To run one tick of the hourly worker by hand:

```bash
npm run worker
```

## Status

**Working and verified against the live API:** hatching from any of the ~450 listed stocks with a company card, the cheaper issuer chosen by real fills per share, litters of four to seven fed as one rebalance, the Telegram pet (link, webhook, status, stop, and the worker's reminders — run end to end against a local Postgres and a stand-in Bot API; a real bot needs its token), a nest of several Fledglings with one portfolio view, releasing shares with FIFO cost and realized P&L, on-chain holdings from the Wallet API, adoption and hatching, the feed loop with live pricing, the mood engine, the strategy engine and its diary, the two-source spread with real aggregator fills, hourly candles on both platforms, the wallet layer, the agent intent layer, the seller agent's deliverable across 448 tickers, the cross-issuer comparison across the 40 both issuers list, and the pre-flight simulation — run against live wallets in all four outcomes (would succeed, needs approval, would fail, not simulated). Its path through `/api/agent` fires only when a rule does, which needs a market-hours bar; `npm run check:agent -- 0xYourAddress` shows it then.

**Honest gaps.** Nothing has executed on-chain yet — the web app's real feed, the `baw` hop and the Agent Studio deploy are all built, and the web feed's build-and-simulate step is verified against live wallets, but none has signed a transaction, because each needs the owner's wallet. The web feed handles swap-mode fills; an Ondo name routed as request-for-quote (typically Pip and Lurk on a weekday) stops with that reason rather than attempting it. `DATABASE_URL` is unset locally, so the Board, duels and the hourly worker are inert until Postgres is attached. Lending is `blocked` for `diamond` and `quant` until a BSC venue exists. And `/api/holidays` still reads the NYSE closure calendar from Backpack's public API — a Solana-ecosystem venue, and the next thing to replace.
