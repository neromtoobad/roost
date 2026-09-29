# Developer Experience Report — outline

**You write this one.** The hackathon rejects AI-generated reports, and it is worth 25% of the
score — the same weight as creativity, and more than product quality. What follows is the seven
sections they ask for, each paired with the evidence we actually collected, so you are writing
from material rather than from a blank page.

Measured evidence: [`dx-evidence.md`](dx-evidence.md) — regenerate any time with `npm run dx -- <taker>`.
Submit at: https://forms.gle/EUQ39xf54GHjC2ys5

A note on tone: they ask for specifics and say vague feedback does not count. Every item below is
something that actually cost time. Where an answer is "this was good", say so — a report that is
only complaints reads as less honest than one that distinguishes.

---

## 1. Onboarding — how long from opening the docs to your first successful API call, and where you got stuck

Only you can answer the timing. Things observed in this session that belong here:

- The dev portal issues a key and secret, but nothing indicates where they go in a project. Ours
  initially landed in the committed `.env.example` template rather than the git-ignored
  `.env.local` — a one-character difference in filename between "safe" and "secret in your repo".
- The first call cannot succeed without knowing about the `/build` base path, which is documented
  but on the authentication page rather than anywhere near the endpoint reference.
- `llms.txt` / `llms-full.txt` exist and are genuinely useful — worth saying so.
- `curl` from a plain terminal returns HTTP 202 with an empty body (bot challenge). The docs
  examples are all curl-shaped. Worth mentioning if you hit it.

_Your words:_

## 2. Documentation issues — which page had the error, and where on it

Vague feedback explicitly does not count, so name the page and the spot. Candidates from the build:

- Authentication page: the `/build` prefix warning is correct and prominent — this one is done well.
- Parameter naming is inconsistent across the reference: `binanceChainId` (not `chainId`),
  `tokenContractAddresses` plural on `rwa/price` but singular on its neighbours.
- Nothing warns that failures return **HTTP 200**.

_Your words:_

## 3. API pitfalls — error messages that made no sense, edge cases that bit you, latency

Evidence: the error catalogue and latency table in `dx-evidence.md`. Strongest items:

- **HTTP 200 on failure.** Status-code-only handling swallows every error silently.
- **`referencePrice` is derived.** `tokenPrice / (referencePrice × tokenToShareRatio)` = 1.000 for
  **488 of 488** tokens. The row looks like it carries two prices; it carries one. This is the
  finding most worth leading with — it silently produces a "perfectly efficient market" forever.
- **`tokenToShareRatio` is mandatory.** Skip it and 10:1 tokens report 900% spreads.
- **Candle shape.** `bar` is case-sensitive lowercase; the timestamp is at index **5**, not 0 the
  way Binance spot klines put it.
- **Latency.** `rwa/tokens` medians ~1.9s and spikes past 3s; everything else sits around 0.4–0.8s.
  It is also the call you need first and most often.
- **`priceImpactPercent` is a fraction.** `0.946` means 94.6%. `SNDKon` filled 97% under its
  reference on 2026-09-26 with 0.946 in the field; `AMDon` 24% under with 0.219. We read our own
  "0.05 impact" on `AAPLon` as negligible and built a finding on it — it was 5%. Any guard written
  as `impact > 1` (percent) passes a 95% loss. See `cross-issuer-weekend.md`.
- **`tradeFee` is gas in USD, not a trading fee** — ~$0.02–0.04, independent of size, and not taken
  out of `toTokenAmount`. `feeAmount` / `actualSwapAmount` come back null. Undocumented either way.
- **`rwa/tokens` and `rwa/platforms` disagree.** Platforms says 80 bStock tokens on BSC; tokens
  returns 46 (Ondo: 458 vs 442). `page`, `pageNo`, `pageSize` and `limit` are all ignored, so it is
  not pagination on the caller's side.

- **`simulate` has no reference page**, and its errors send you the wrong way. The Transaction API
  introduction lists it; no page gives its body. An empty body returns a bare `Parameter error`.
  A body without the right key returns `code 50000` — the "internal error, retry" code — with
  `evmParams is required for EVM chains`. There is no `evmParams`: the field is `evmTx`, found only
  by reading the JS connector's generated types. The connector in turn marks `evmTx`, `solTx` and
  `tronTx` all required when exactly one may be sent.
- **A simulation works once you have it.** `{ binanceChainId, evmTx: { from, to, value, data } }`
  → `status`, `failReason` (the revert string, verbatim), signed base-unit `balanceChanges` and
  `allowanceChanges`. ~1.5–2s. The successful one matched the quote to 0.005%.
- **Ondo's minimum order is enforced at the quote**: `Minimum order amount is 5 USD.` — for an
  order of exactly $5.
- **The token list's sector filter is ignored.** `rwa/tokens` documents `tabId` with thirteen
  sectors (AI Chips, Magnificent 7, ETF, Upcoming Earnings, Buffett Portfolio…). Every value —
  and none — returns the same 448 tickers. Sector has to come from `underlying-profile`, one call per
  token (median ~420ms; 163 profiles took 111s).
- **`dividendYield` changes units by issuer, in one response shape.** For Microsoft, bStock's MSFTB
  says `0.007` and Ondo's MSFTon says `0.69` — a fraction and a percent for the same 0.7%. (Same
  class of bug as `priceImpactPercent`.)
- **Stock tokens revert without a reason when the allowance is short.** USDT says
  `transfer amount exceeds allowance`; NVDAB says only `execution reverted`. Code that looks for
  "allowance" in the revert tells a first-time seller the sale "would fail" when it only needs an
  approval. What works: simulate the `approve` itself — its `allowanceChanges[].preAmount` is the
  current allowance, read without a node.
- **The rate limit is not the documented one.** "5 requests/sec per endpoint" — measured on
  2026-09-29, the RWA Data endpoints share one budget of about three a second: `underlying-profile`
  and `underlying-market` each at 2.9/s together drew `42900`s, either alone did not. The aggregator
  took eight quotes at four a second cleanly. Seven company lookups fired together (a themed basket
  of seven) came back as seven `42900`s.
- **A burst of identical requests is a "replay".** Seven identical signed `GET rwa/tokens` in the
  same millisecond: one answered, the rest got `HTTP 401 code=40103 "Duplicate request detected"`
  — an auth-family code and status for what is a concurrency problem, undocumented on the auth
  page's error table. Fix on our side: single-flight the load. Fix on theirs: document it, or
  dedupe server-side and answer all of them.
- **No earnings date anywhere** — not in `underlying-profile`, `underlying-market`, nor the
  (ignored) "Upcoming Earnings" tab — though the agentic-wallet docs' own example strategy is an
  earnings watcher.

**The one that cost the most, and could not be found locally.** Deploying to Railway's default
`sfo` region, every RWA call returned:

```
HTTP 200  code=40304  msg=Service not available due to compliance restriction
```

Three separate problems stacked on top of each other:

- **It is an IP geo-block**, and the restricted list (US, Canada, Netherlands, UK, Japan) covers a
  large share of default cloud regions. On Railway only Singapore is viable — `us-west2`,
  `us-east4` and `europe-west4` are all prohibited.
- **`40304` is undocumented.** The error table on the authentication page lists 40001, 40101,
  40102, 40103, 40104, 42900, 50000, 50001. Not 40304 — the code for the single most likely
  production failure.
- **It is invisible until production.** The key is issued without a warning, works perfectly from
  a local machine, and then returns an empty token list in the deployed app. Combined with HTTP
  200, the symptom is not "you are blocked" but "the market appears to have no tokens in it".

What made it findable in the end was adding our own error propagation — the API gave a usable
message the whole time, but only to code that bothered to read `code` on a 200 response.

_Your words:_

## 4. AI stack feedback — Wallet Skills, Agentic Wallet, the CLI: what worked, what did not, what is missing

We read the Agentic Wallet skill and ran the Agent Studio CLI. Observations:

- Skills shipped **inside the npm package** as plain markdown is a good design — readable before
  installing, versioned with the tool.
- `bag doctor` is the best part of the toolchain: ordered, actionable, distinguishes PASS/WARN/INFO,
  and each WARN names its fix. It caught `max_price` being empty, which is a real signing footgun.
- `bag init` failed its dependency install because `pnpm` was absent, but said exactly that and left
  a usable scaffold. Good failure.
- The Agentic Wallet skill's insistence that **an `orderId` is not a completed swap** — poll to a
  terminal state — is the kind of warning most SDKs omit and then people ship the bug.
- Missing: no way to exercise the `baw` path without a real Binance MPC wallet, so the last hop
  cannot be tested in CI or by a reviewer. Worth requesting a sandbox/dry-run mode.
- `bunx` is required for `bag deploy` but not `bag init`; that is documented, and doctor flags it.
- The market-order page does not say whether `baw market-order swap` handles the ERC-20 approval
  itself, which router it uses, or its default slippage. Roost simulates the aggregator's swap for
  the same wallet as a pre-flight, and has to report a missing router allowance as "needs
  approval" rather than "will fail" because it cannot know.

_Your words:_

## 5. Tokenized-stock specifics — liquidity depth, slippage, behaviour outside market hours, the on-chain vs reference gap, and how bStocks / Ondo / xStocks differ in practice

This is the section our evidence is strongest on. See the slippage ladder and spread table.

- **Depth is far thinner than expected.** `NVDAB` quotes at 1 and 10 tokens and returns
  *insufficient liquidity* at 100 (~$22k). `AAPLon` fails at **10** tokens (~$3.2k). One-token
  quotes work everywhere; anything institutional does not.
- **bStock vs Ondo is not cosmetic.** bStock swaps through the ordinary aggregator. Ondo is RFQ and
  refuses to quote at all without a `userWalletAddress`. Same endpoint, different contract.
- **`marketStatus` is absent on every bStock row and present on every Ondo row.** Read it naively
  and half your tokens report a shut exchange while the NYSE is trading.
- **Even the zero address is not a valid taker** — thin books return insufficient liquidity for it
  where a real address quotes fine.
- **~~`AAPLon` trades persistently several percent under its reference~~ — retracted.** The
  -5.6% runs were at "0.05 price impact", which is 5% (see section 3). On Sunday it filled -0.33%.
- **Outside market hours, measured twice** (Sunday 2026-09-20 in `dx-evidence.md`, Saturday
  2026-09-26 in `cross-issuer-weekend.md`): against its own issuer's reference, the on-chain price
  does not wander — -0.03% to -0.42% across the six. It tracks the frozen reference rather than
  discovering price.
- **xStocks is not on BSC through this API.** `rwa/platforms` returns `ondo` and `bstock` only.
- **Same stock, two issuers** (`cross-issuer-weekend.md`, 40 tickers listed by both):
  - no cross-issuer arbitrage worth the name — 0 of 17 quotable pairs cleared even before gas in the
    recorded run; a run 15 minutes earlier had DRAM at +0.09%, about two cents on $100 after gas;
  - a real routing gap instead: NVDA cost 2.1% more to buy as `NVDAon` than `NVDAB`, SPCX 2.0%
    (3.6% at $500), while selling was within 0.05% on either;
  - the two issuers publish different reference prices for the same share (median 0.28% apart,
    IBM 2.2%);
  - on a Saturday 16 of 40 Ondo tokens refused to quote ("market is currently closed"), 5 had no
    liquidity at $100, 4 quoted from broken pools. bStock quoted 39 of 40 both ways.
  - Ondo's `marketStatus` distinguishes `offhours` (quotes) from `closed` (refuses) — the field is
    useful where it exists.
- **The price feed and a real fill disagree about which issuer is cheaper.** Tuesday 2026-09-29
  ~09:00 UTC (pre-market), $25 per ticker, per share with the ratio applied: `price-info` put GOOGL
  and QQQ within 0.04% across issuers; real aggregator buy quotes for one wallet made `GOOGLB`
  1.26% cheaper than `GOOGLon`, and `QQQB` 1.40% cheaper than `QQQon`. NVDA, META and TSLA were
  within 0.03% either way. `MSFTon` was still quoting from its broken pool (a buy ~200 million
  percent over its reference) — the third sighting, across four days.
- **The aggregator routes into broken pools, and they stay broken.** Monday 2026-09-28 ~07:45 UTC,
  Ondo's overnight session: a $10 buy of `MSFTon` quoted 197 million percent over its reference —
  the same pool was broken on Saturday — `SNDKon` +809%, `AMDon` +3.5%. Each would have gone
  through; the simulation says "success". The only warning in the response is
  `priceImpactPercent`, a fraction under a percent's name. Roost now refuses any buy more than 3%
  over the token's own reference before asking for an approval.

_Your words:_

## 6. Redesign suggestions — if you were the engineer behind the developer platform, how would you rebuild it so someone can make a call the moment they land

Think about what you would have wanted in the first hour. Ours, as raw material:

- Return non-2xx status codes for failures.
- Either make `referencePrice` independent, or rename it and document that it is derived — as it
  stands the field invites a wrong calculation that looks right.
- One consistent chain parameter name, one consistent singular/plural convention.
- Populate `marketStatus` for every issuer, or document that it is issuer-supplied.
- Rename `priceImpactPercent` or make it a percent. Document `tradeFee` as gas in USD.
- A copy-pasteable signed request per language on the endpoint page itself, not only on the auth page.
- Document 40304, and surface the region restriction at key-issuance time rather than at first
  production request. A line in the Developer Portal saying which regions the key will not work
  from would have saved an hour of debugging that looked like an empty market.

_Your words:_

## 7. Requested capabilities — endpoints, SDK support, features or tooling you want added

- A depth/liquidity endpoint. Discovering tradable size by binary-searching `aggregator/quote`
  until it stops erroring is not a good interface.
- A dry-run/sandbox for Agentic Wallet so the execution path is testable without a funded MPC wallet.
- A venue that accepts tokenized equities as collateral — `defi/data/investment/list` rejected every
  parameter shape tried, and no BSC protocol is confirmed to take one, so "buy and hold" is the only
  strategy the asset class currently supports.
- Historical reference prices, so the weekend gap can be measured retrospectively rather than only
  by being awake for it.
- One reference per underlying, or a documented reason why bStock and Ondo carry different ones
  for the same share at the same instant.
- Bundle simulation, or state overrides on `simulate`. A first buy is two transactions — approve,
  then swap — and the swap cannot be simulated until the approval is on-chain, so a first-time
  buyer's pre-flight can only ever say "needs approval".

_Your words:_
