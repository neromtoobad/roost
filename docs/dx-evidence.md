# Developer Experience — raw evidence

> Collected 2026-09-20T07:47:33.159Z · NYSE: **NYSE closed · weekend**
> 
> **This is not the report.** It is the measured material to write one from.
> Regenerate with `npm run dx -- <taker>`. Taker used: `0x8894E0a0c962CB723c1976a4421c95949bE2D4E3`

## Endpoint latency

Five sequential samples each, warm process, from a residential connection.

| Endpoint | Method | min | median | max |
|---|---|---|---|---|
| `/dex/market/rwa/tokens` | GET | 810ms | 1339ms | 2168ms |
| `/dex/market/rwa/platforms` | GET | 404ms | 424ms | 841ms |
| `/dex/market/price-info` | POST | 406ms | 416ms | 905ms |
| `/dex/market/candles (1h,168)` | GET | 414ms | 441ms | 769ms |
| `/dex/aggregator/supported/chain` | GET | 400ms | 413ms | 539ms |
| `/dex/aggregator/quote` | GET | 415ms | 426ms | 499ms |

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
  "timestamp": 1789890480225,
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
  "timestamp": 1789890480879,
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
  "timestamp": 1789890481533,
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
  "timestamp": 1789890482666,
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
| 1 | 220.57 | 220.5651 | 0.0005092890 | LiquidMesh |
| 10 | 2205.49 | 220.5493 | 0.0004273737 | LiquidMesh |
| 100 | 22049.04 | 220.4904 | 0.0001744109 | LiquidMesh |
| 1000 | 220356.59 | 220.3566 | 0.0002978280 | LiquidMesh |

### AAPL (`AAPLon`, ondo)

| size (tokens) | USDT out | per token | impact % | vendor |
|---|---|---|---|---|
| 1 | 335.28 | 335.2761 | 0.0000000000 | LiquidMesh |
| 10 | 3352.76 | 335.2761 | -0.0000000000 | LiquidMesh |
| 100 | 33527.61 | 335.2761 | -0.0000000000 | LiquidMesh |
| 1000 | — | — | — | _Insufficient liquidity for a quote. Please decrease the transaction amount or try again later._ |

## On-chain vs reference, all six

Snapshot at 2026-09-20T07:47:33.159Z — NYSE NYSE closed · weekend.
Re-run this outside market hours: the whole point is that the reference leg stops moving and this table drifts.

| Fledgling | ticker | platform | traded | reference | spread % | ratio | marketStatus |
|---|---|---|---|---|---|---|---|
| nova | NVDA | bstock | 220.57 | 220.72 | -0.071 | 1.000778 | _absent_ |
| volt | TSLA | bstock | 362.98 | 363.18 | -0.054 | 1.000000 | _absent_ |
| pip | AAPL | ondo | 335.28 | 336.37 | -0.327 | 1.003376 | offhours |
| booster | SPCX | bstock | 152.46 | 152.51 | -0.033 | 1.000000 | _absent_ |
| nimbus | CRWV | bstock | 80.92 | 81.26 | -0.416 | 1.000000 | _absent_ |
| lurk | RDDT | ondo | — | 151.76 | — | 1.000000 | closed |

**`marketStatus` is absent on every bStock row and present on every Ondo row.** Same field, same
endpoint, same response — populated by one issuer and not the other.

## Proof that `referencePrice` is derived, not independent

For every listed token, `tokenPrice / (referencePrice × tokenToShareRatio)` is exactly 1.
This is why the two prices in one RWA row cannot be differenced to get a spread.

| token | tokenPrice | referencePrice | ratio | tokenPrice ÷ (ref × ratio) |
|---|---|---|---|---|
| `AAPLon` | 336.3748019560658 | 335.24299687771395 | 1.003376073740221 | 1.000000000000 |
| `NVDAB` | 220.7216372486818 | 220.55 | 1.0007782237528078 | 1.000000000000 |
| `KLACon` | 17765.840423205744 | 1771.965427616047 | 10.026064925604905 | 1.000000000000 |
| `NFLXon` | 7192.6667 | 719.26667 | 10 | 1.000000000000 |

**488 of 488** tokens with all three fields present satisfy the identity to 1e-9.

## Still open

- No BSC venue confirmed to take a tokenized equity as collateral (`defi/data/investment/list` rejected every param shape tried).
- `AAPLon` sits several percent under its reference persistently — cause unknown, worth watching across days before writing it up.
- Whether the spread widens measurably over a weekend: **needs a run with the NYSE shut.**
