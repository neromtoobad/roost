---
name: roost
description: |
  Use when the user mentions Roost, a Fledgling, their pet stock, feeding a pet, adopting a
  Fledgling, Pango / Coil / Bara / Rivet / Patch / Fen, "what does my pet want to do",
  "did my pet trade", pet diary, tokenized stock pet, or any request to act on behalf of a
  Roost Fledgling on BNB Smart Chain.
metadata:
  author: roost
  version: '0.1.0'
  openclaw:
    requires:
      skills:
        - binance-agentic-wallet
---

# Roost

A Fledgling is a collectible creature that is also a trading rule. Its personality *is* its
strategy — `diamond` deploys at the open and never sells, `degen` buys dips in clips with a
cooldown, `boomer` trades regular hours and keeps a 20% reserve, `quant` rebalances weekly,
`night` buys only while the exchange is shut and at least 1% under the last close, `momentum`
adds weekly only while the price sits above its five-day average. None of them lends.

**Roost decides. It never executes.** Roost holds no keys and has no server-side wallet. When a
Fledgling wants to buy, Roost hands you the exact command, and you run it through the user's own
Binance Agentic Wallet — inside the daily limit and token scope they set in the Binance App.

That split is the whole design:

| | |
|---|---|
| **Roost** | the deterministic engine and the pet's reasons |
| **Agentic Wallet** | the keys, the limits, the confirmation |
| **You** | run the command, poll it to a terminal state, report honestly |

## Setup

Roost needs a base URL. Use `ROOST_URL` from the environment if set, otherwise ask the user
once and remember it for the session. Local development is `http://localhost:3210`.

The `binance-agentic-wallet` skill must be installed and signed in. Check with `baw wallet status`
before anything that spends. If it is not signed in, follow that skill's authentication flow —
do not attempt to work around it.

## Command routing

| User intent | Do this | Reference |
|---|---|---|
| What does my pet want to do? | `POST {ROOST_URL}/api/agent` | [execute.md](references/execute.md) |
| Feed my pet $X (it buys now) | `POST {ROOST_URL}/api/agent` with `"action": "feed", "usd": X`, then `baw market-order swap` | [execute.md](references/execute.md#feeding-now) |
| Feed my pet $X every week / fortnight / month | set it in the app, or keep the cadence yourself: `GET {ROOST_URL}/api/pet/<id>` says `feedingDue`, then feed as above | [execute.md](references/execute.md#feeding-days) |
| Sell / release some of my pet's stock | `POST {ROOST_URL}/api/agent` with `"action": "release", "qty": N`, then `baw market-order swap` | [execute.md](references/execute.md#releasing) |
| Did it actually trade? | `baw market-order list --orderId <id> --json` | [execute.md](references/execute.md) |
| What is my pet holding / how is it doing? | `GET {ROOST_URL}/api/pet/<id>` | — |
| What's the price / how far off the real stock is it? | `GET {ROOST_URL}/api/price/<species>` | — |
| What would I actually get filled at? | `GET {ROOST_URL}/api/fill/<species>?wallet=<address>` | — |
| Which issuer's NVDA is cheaper for me? | `GET {ROOST_URL}/api/issuer?ticker=NVDA&wallet=<address>&usd=25` — per share, real fills | [execute.md](references/execute.md#the-cheaper-issuer) |
| Feed my litter $X | `GET {ROOST_URL}/api/litter/<id>` for its members, split with the rule below, one feed per pup | [execute.md](references/execute.md#feeding-a-litter) |

## The four instruction kinds

`POST /api/agent` always answers with exactly one `instruction`. A feed (`"action": "feed"`)
always answers `swap`: the owner asked, so the pet does not wait for its rule. So does a release
(`"action": "release"`), with `instruction.side` of `"sell"`.

A Fledgling can hold any of the ~450 tokenized stocks on BSC, not only its species' signature one.
When it does, pass its token contract address as `"token"` on every call; without it, the species'
signature stock is assumed. Handle each one differently —
they are not interchangeable, and three of the four must not result in a trade.

- **`swap`** — the pet decided to buy. `instruction.cli` is the exact `baw` command, and
  `preflight` says whether it would go through from this wallet right now. Show the user the
  summary, reason, expected quantity and `preflight.summary`, get a yes, then run it. **Never run
  a swap whose `preflight.status` is `would-fail`.**
- **`ask`** — the pet wants to spend more than its rule lets it decide alone. **Do not trade.**
  Put the question to the user. Only if they agree does it become a swap.
- **`hold`** — nothing fired this hour, or the pet is waiting on an unanswered question. Say so.
  Holding is a decision; report it as one rather than inventing activity.
- **`blocked`** — the pet wants something this chain cannot currently do. Read `why` out to the
  user plainly. **Never substitute a different trade** because one was blocked.

## Rules

**An `orderId` is not a completed swap.** `baw market-order swap` returning `success: true` means
*submitted*. Poll `market-order list --orderId <id> --json` until `FINISHED` or `FAILED` before
telling the user anything settled. Reporting a submit as a success is the failure mode that
matters most here, because the pet's diary is supposed to be checkable against the chain.

**Never invent a reason.** Every instruction carries the pet's own `reason`, generated by a
deterministic engine from real price bars. Pass it through. Do not improve it, and do not supply
a rationale of your own for a trade the engine did not explain.

**The pet's voice is flavour; the numbers are not.** `fledgling.persona` tells you how it talks.
Quantities, prices, spreads and outcomes are reported exactly as returned.

**You are not advising.** Roost reports what a rule did and what the market shows. Never present
any of it as investment advice, and never talk the user past an `ask` or a `blocked`.

**Two platforms, two behaviours.** Four Fledglings hold bStock tokens, which quote and swap
normally. Bara (AAPL) and Fen (RDDT) hold Ondo tokens, which are request-for-quote: they will not
price at all without a wallet address, so always pass `wallet` when you have one. If
`market.quoteDegraded` is true, the price you are showing is an oracle read, not a real fill —
say so rather than quoting it as executable.
