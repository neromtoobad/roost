# Developer Experience — raw evidence

> Collected 2026-09-17T16:32:39.043Z · NYSE: **NYSE open · regular session**
> 
> **This is not the report.** It is the measured material to write one from.
> Regenerate with `npm run dx -- <taker>`. Taker used: `0x8894E0a0c962CB723c1976a4421c95949bE2D4E3`

## Endpoint latency

Five sequential samples each, warm process, from a residential connection.

| Endpoint | Method | min | median | max |
|---|---|---|---|---|
| `/dex/market/rwa/tokens` | GET | 1236ms | 1871ms | 3415ms |
| `/dex/market/rwa/platforms` | GET | 417ms | 418ms | 1205ms |
| `/dex/market/price-info` | POST | 472ms | 781ms | 962ms |
| `/dex/market/candles (1h,168)` | GET | 448ms | 494ms | 500ms |
| `/dex/aggregator/supported/chain` | GET | 422ms | 507ms | 2627ms |
| `/dex/aggregator/quote` | GET | 449ms | 465ms | 923ms |

## Error catalogue — exact payloads

Every one of these was hit for real during the build. Reproduced here verbatim.

### `chainId` instead of `binanceChainId`

The docs use `chainId` in prose in places; the gateway wants `binanceChainId`.

```json
HTTP 200
{
  "code": 40001,
  "msg": "Parameter binanceChainId is required",
  "data": null,
  "timestamp": 1789662795075,
  "success": false
}
```

### Uppercase candle interval

`1H` is rejected; only lowercase `1h` works. The error does list valid values, which helps.

```json
HTTP 200
{
  "code": 40001,
  "msg": "Parameter bar error: Invalid bar value: 1H, valid values: 12h,15m,1M,1d,1h,1m,1s,1w,2h,30m,30s,3d,3m,4h,5m,5s,6h,8h",
  "data": null,
  "timestamp": 1789662795997,
  "success": false
}
```

### Ondo quote without a taker

bStock quotes fine without one. Ondo refuses outright.

```json
HTTP 200
{
  "code": 40001,
  "msg": "userWalletAddress is required for RFQ (Ondo) quote",
  "data": null,
  "timestamp": 1789662796661,
  "success": false
}
```

### Singular vs plural address param

`rwa/price` wants `tokenContractAddresses`; its neighbours want the singular.

```json
HTTP 200
{
  "code": 40001,
  "msg": "Parameter tokenContractAddresses is required",
  "data": null,
  "timestamp": 1789662797331,
  "success": false
}
```

### HTTP 200 on failure

Note the status line above every failing payload: **200**, with the failure in the body `code`.
Status-code-only error handling swallows all of these silently. This is the single pitfall most
likely to cost someone an afternoon, because nothing appears to be wrong.

## Liquidity depth and slippage

Quote ladder: how the fill and the reported price impact move with trade size.
Each row is one `aggregator/quote` for N whole tokens against USDT.

### NVDA (`NVDAB`, bstock)

| size (tokens) | USDT out | per token | impact % | vendor |
|---|---|---|---|---|
| 1 | 218.99 | 218.9879 | 0.0004701349 | LiquidMesh |
| 10 | 2189.59 | 218.9590 | 0.0006945856 | LiquidMesh |
| 100 | — | — | — | _Insufficient liquidity for a quote. Please decrease the transaction amount or try again later._ |
| 1000 | — | — | — | _Insufficient liquidity for a quote. Please decrease the transaction amount or try again later._ |

### AAPL (`AAPLon`, ondo)

| size (tokens) | USDT out | per token | impact % | vendor |
|---|---|---|---|---|
| 1 | 317.03 | 317.0294 | 0.0531554818 | LiquidMesh |
| 10 | — | — | — | _Insufficient liquidity for a quote. Please decrease the transaction amount or try again later._ |
| 100 | — | — | — | _Insufficient liquidity for a quote. Please decrease the transaction amount or try again later._ |
| 1000 | — | — | — | _Insufficient liquidity for a quote. Please decrease the transaction amount or try again later._ |

## On-chain vs reference, all six

Snapshot at 2026-09-17T16:32:39.043Z — NYSE NYSE open · regular session.
Re-run this outside market hours: the whole point is that the reference leg stops moving and this table drifts.

| Fledgling | ticker | platform | traded | reference | spread % | ratio | marketStatus |
|---|---|---|---|---|---|---|---|
| nova | NVDA | bstock | 218.99 | 219.15 | -0.075 | 1.000778 | _absent_ |
| volt | TSLA | bstock | 367.46 | 367.56 | -0.026 | 1.000000 | _absent_ |
| pip | AAPL | ondo | 316.99 | 338.06 | -6.234 | 1.003376 | regular |
| booster | SPCX | bstock | 154.69 | 154.75 | -0.037 | 1.000000 | _absent_ |
| nimbus | CRWV | bstock | 79.84 | 80.41 | -0.710 | 1.000000 | _absent_ |
| lurk | RDDT | ondo | 152.63 | 152.71 | -0.049 | 1.000000 | regular |

**`marketStatus` is absent on every bStock row and present on every Ondo row.** Same field, same
endpoint, same response — populated by one issuer and not the other.

## Proof that `referencePrice` is derived, not independent

For every listed token, `tokenPrice / (referencePrice × tokenToShareRatio)` is exactly 1.
This is why the two prices in one RWA row cannot be differenced to get a spread.

| token | tokenPrice | referencePrice | ratio | tokenPrice ÷ (ref × ratio) |
|---|---|---|---|---|
| `NVDAB` | 219.15041543738985 | 218.98 | 1.0007782237528078 | 1.000000000000 |
| `AAPLon` | 338.06113089453436 | 336.92365180122886 | 1.003376073740221 | 1.000000000000 |
| `KLACon` | 16888.496461753875 | 1684.4591160210286 | 10.026064925604905 | 1.000000000000 |
| `NFLXon` | 7567.3333 | 756.73333 | 10 | 1.000000000000 |

**488 of 488** tokens with all three fields present satisfy the identity to 1e-9.

## Still open

- No BSC venue confirmed to take a tokenized equity as collateral (`defi/data/investment/list` rejected every param shape tried).
- `AAPLon` sits several percent under its reference persistently — cause unknown, worth watching across days before writing it up.
- Whether the spread widens measurably over a weekend: **needs a run with the NYSE shut.**
