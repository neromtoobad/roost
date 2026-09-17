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
  "expectedQty": 0.0729
}
```

---

## 2. Show the user, before anything moves

Say four things, in the pet's voice but with the numbers untouched:

- what it wants to do — `instruction.summary`
- **why** — `instruction.reason`, verbatim, because a deterministic engine produced it
- what they get — `expectedQty` of the token, at `market.perToken`
- how that compares to the real stock — `market.spreadPct` against `market.reference`

That last one is the point of the product. A tokenized stock trades around the clock while the
exchange behind it is shut, so the spread is where the story is. If `market.marketStatus` is
`null` or not `"regular"`, the underlying exchange is closed and the reference price is stale —
say so. That is not a bug to hide; it is the thing worth showing.

Get an explicit yes. Then run it.

---

## 3. Execute

Run `instruction.cli` exactly as given. Do not rewrite the amount, retarget the token, or add
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
