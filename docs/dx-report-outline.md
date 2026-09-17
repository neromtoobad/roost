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
- **`AAPLon` trades persistently several percent under its reference** (-5.6%, -5.9%, -6.2% across
  runs) at 0.05 price impact, far too small for our size to explain. Worth watching across days.
- **Outside market hours: not yet measured.** Re-run `npm run dx` on a weekend. This is the single
  highest-value observation still missing, and it is the whole premise of the asset class.

_Your words:_

## 6. Redesign suggestions — if you were the engineer behind the developer platform, how would you rebuild it so someone can make a call the moment they land

Think about what you would have wanted in the first hour. Ours, as raw material:

- Return non-2xx status codes for failures.
- Either make `referencePrice` independent, or rename it and document that it is derived — as it
  stands the field invites a wrong calculation that looks right.
- One consistent chain parameter name, one consistent singular/plural convention.
- Populate `marketStatus` for every issuer, or document that it is issuer-supplied.
- A copy-pasteable signed request per language on the endpoint page itself, not only on the auth page.

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

_Your words:_
