# Asking a Fledgling what it wants, and running it

The loop is always the same: **ask Roost → show the user → execute → poll → report.** Never skip
the poll, and never skip the user.

---

## 1. Ask

```bash
curl -s -X POST "$ROOST_URL/api/agent" \
  -H 'Content-Type: application/json' \
  -d '{
        "species": "nova",
        "personality": "degen",
        "cash": 40,
        "heldQty": 0.18,
        "lentQty": 0,
        "lastBuyAt": 1789500000000,
        "totalFed": 80,
        "awaitingAnswer": false,
        "wallet": "0xYourAgenticWalletAddress"
      }'
```

`wallet` comes from `baw wallet address`. Pass it whenever you have it: Ondo names cannot be
quoted without it, and even on bStock a real taker address gets a routable quote where the zero
address returns *insufficient liquidity*.

`awaitingAnswer` must be `true` if the pet has an open question its owner has not answered. A
Fledgling with an unanswered question does not act. That rule holds when nobody is watching,
which is the only time it matters.

### The answer

```json
{
  "fledgling": {
    "species": "nova", "stock": "NVDA", "token": "NVDAB",
    "address": "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
    "platform": "bstock", "chainId": "56",
    "persona": "You are an unhinged 3am trading pet...",
    "quotingNeedsWallet": false
  },
  "instruction": {
    "kind": "swap",
    "summary": "Buy $16.00 of NVDA (NVDAB)",
    "reason": "Down 2.4% from the 24h high. Bought it.",
    "cli": "baw market-order swap --fromTokenQty 16.00 --fromToken 0x55d3... --toToken 0x02fc... --binanceChainId 56 --json",
    "usd": 16,
    "fromToken": "0x55d398326f99059fF775485246999027B3197955",
    "toToken": "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
    "chainId": "56"
  },
  "market": {
    "perToken": 219.29, "reference": 219.48, "spreadPct": -0.086,
    "pct24h": 2.17, "marketStatus": null,
    "priceSource": "aggregator-quote", "barsSource": "dex", "quoteDegraded": false
  },
  "expectedQty": 0.0729,
  "preflight": {
    "status": "would-succeed",
    "summary": "Simulated against this wallet just now: 16.00 USDT in, 0.07296 NVDAB out (at least 0.07223 after 1% slippage), plus about $0.02 of gas.",
    "spendsUsdt": 16, "receivesQty": 0.07296, "minReceiveQty": 0.07223, "slippagePct": 1,
    "gasUsd": 0.02, "usdtBalance": 325.8, "bnbBalance": 0.08,
    "executionMode": "SWAP", "spender": null, "failReason": null, "premiumPct": 0.06
  }
}
```

`preflight` is the same buy, built by the Binance aggregator for this wallet and run through the
Transaction API's simulator against current chain state. Nothing is signed or broadcast. It is
`null` unless the instruction is a `swap` and you passed `wallet`.

### Feeding now

When the user says "feed Nova $5" — or "buy $10 of my pet's stock" — they are not asking what the
pet wants. They are feeding it, and a fed Fledgling eats at once:

```bash
curl -s -X POST "$ROOST_URL/api/agent" \
  -H 'Content-Type: application/json' \
  -d '{ "action": "feed", "usd": 5, "species": "nova", "personality": "degen",
        "wallet": "0xYourAgenticWalletAddress" }'
```

The answer has the same shape as above, and the instruction is always a `swap` for exactly that
amount, at any hour — it does not wait for the market open or for the pet's rule to fire. Every
step below still applies: show the user the pre-flight, get their yes, run it, poll it. An open
question (`awaitingAnswer`) does not block a feed; that rule stops the pet acting on its own, and
here the owner is the one acting.

Ondo names (Pip, Lurk) have a $5 minimum and refuse to quote while their market is `closed` — the
pre-flight says so in its summary. Report it rather than retrying in another size.

### Releasing

"Sell half of Nova's NVDA", "take $20 out of my pet": the owner releasing some of what it holds.

```bash
curl -s -X POST "$ROOST_URL/api/agent" \
  -H 'Content-Type: application/json' \
  -d '{ "action": "release", "qty": 0.05, "species": "pip", "personality": "degen",
        "token": "0x405f38b90bebf1259062cf29da299f3398662bcb",
        "wallet": "0xYourAgenticWalletAddress" }'
```

`qty` is in tokens of the stock, not dollars — convert with `market.perToken` if the owner spoke in
dollars, and never ask to sell more than `baw` reports the wallet holding. The instruction is a
`swap` with `side: "sell"`, its `cli` sells that many tokens for USDT, and the pre-flight simulates
the sale the same way: it refuses a fill more than 3% under the token's reference price, and an
Ondo sale under $5 is refused by Ondo itself. Show it, get a yes, run it, poll it — as below.

`token` is the stock's contract address. Pass it whenever the pet hatched from a stock other than
its species' signature one (the web app shows it); without it, the signature stock is assumed.

---

## 2. Show the user, before anything moves

Say four things, in the pet's voice but with the numbers untouched:

- what it wants to do — `instruction.summary`
- **why** — `instruction.reason`, verbatim, because a deterministic engine produced it
- what they get — `expectedQty` of the token, at `market.perToken`
- how that compares to the real stock — `market.spreadPct` against `market.reference`
- whether it would actually go through from their wallet — `preflight.summary`, verbatim

That last one is the point of the product. A tokenized stock trades around the clock while the
exchange behind it is shut, so the spread is where the story is. If `market.marketStatus` is
`null` or not `"regular"`, the underlying exchange is closed and the reference price is stale —
say so. That is not a bug to hide; it is the thing worth showing.

Get an explicit yes. Then run it.

---

## 3. Execute

First, what the simulation said:

| `preflight.status` | Do this |
|---|---|
| `would-succeed` | Proceed on the user's yes. |
| `would-fail` | **Do not run it.** Read `preflight.summary` to the user — it names what is short (USDT, BNB for gas), the revert, or a price more than 3% over the token's own reference (a broken pool: it would go through, and it would be a bad buy). Running it anyway spends gas to fail, or money to overpay. |
| `needs-approval` | Tell the user the wallet has not approved the aggregator's router for USDT. Binance does not document whether `baw market-order swap` approves for itself, so run it only once they know — and if it then fails on allowance, this is why. Do not retry. |
| `not-simulated` | Say it was not simulated and why (`preflight.summary` carries the gateway's reason — a closed market, a minimum order size, an RFQ fill with no transaction to simulate). Proceed on the user's yes as before. |
| `null` | You did not pass `wallet`. Ask Roost again with it. |

A simulation is a prediction against the chain as it is now, not a reservation. It does not
replace polling to a terminal state after the swap.

Then run `instruction.cli` exactly as given. Do not rewrite the amount, retarget the token, or add
slippage the user did not ask for.

Before it, complete the swap security pre-check from the `binance-agentic-wallet` skill
(`references/security.md` §1). Roost's tokens are real BEP-20 contracts read from the Binance RWA
Data API, but the check is the wallet skill's to run, not ours to waive.

---

## 4. Poll to a terminal state

```bash
baw market-order list --orderId <orderId> --json
```

`PENDING` is not terminal. Keep polling until `FINISHED` or `FAILED`.

- **`FINISHED`** — report the `txHash` and the amount actually received. That number, not the
  expected one, is what the pet's diary should record.
- **`FAILED`** — say it failed. `txHash` may be `null`. Do not present it as success, and do not
  quietly retry with different parameters.
- **still `PENDING` after ~30s** — say it is still processing. Not that it worked.

---

## 5. Report

One or two lines, in the pet's voice, containing only things that happened. A Fledgling that
bought says what it bought and why. A Fledgling that held says it held. A Fledgling whose swap
failed says that too — it is a pet, not a marketing surface, and the diary is meant to be
checkable against the chain.

---

## When it is not a swap

**`ask`** — the pet wants more than its rule allows alone. Put `instruction.reason` to the user
as a question and wait. If they say no, it holds; do not re-ask in a smaller size unless they
suggest it.

**`blocked`** — read `why` out plainly. As of this version the one blocked case is lending: on
Solana a Fledgling lent its shares to a Kamino xStocks vault, and no venue on BSC is confirmed to
take a tokenized equity as collateral. The shares sit idle rather than pretend to earn. Do not
substitute a different yield product the pet did not choose.

**`hold`** — report it. An hour where a rule deliberately did nothing is a real outcome, and it is
the honest answer to "what did my pet do today?"
