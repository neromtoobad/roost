# Same stock, two issuers — raw evidence

> Collected 2026-09-26T13:04:55.128Z · NYSE: **NYSE closed · weekend** · size **$100** each side
> 
> **This is not the report.** It is measured material to write one from.
> Regenerate with `npm run cross -- <taker> [usd]`. Taker used: `0x8894E0a0c962CB723c1976a4421c95949bE2D4E3`

## What the platforms endpoint claims vs what the token list returns

| platform | `rwa/platforms` says, BSC | `rwa/tokens` returns |
|---|---|---|
| ondo | 458 | 442 |
| bstock | 80 | 46 |

Platforms returned: `ondo`, `bstock`. No xStocks on BSC through this API.
`rwa/tokens` ignores `page`, `pageNo`, `pageSize` and `limit` — the gap is not pagination on our side.

## Summary

- **40** tickers listed by more than one issuer; **15** had a usable buy and sell on every issuer at $100.
- Cross-issuer trades that clear before gas: **0 of 17**. After gas: **0**.
- Gas per swap, as the aggregator prices it in `tradeFee`: median **$0.0324**, independent of size — so a two-swap trade at $100 starts 0.065% behind.
- **bstock**: median round trip 0.227% across 39 fully quoted; without a usable price on at least one side: 1 no liquidity.
- **ondo**: median round trip 0.211% across 15 fully quoted (1 with the ask *under* the bid — gone once gas is paid); without a usable price on at least one side: 16 market closed, 4 broken pool, 5 no liquidity.
- Reference disagreement between issuers: median 0.285%, widest 2.226% (IBM).

## Per ticker

Per share, ratio applied. Bid = selling ~$100 worth; ask = buying with $100. Round trip = ask over bid on one issuer.

| ticker | bstock bid | bstock ask | bstock RT % | ondo bid | ondo ask | ondo RT % | ref gap % | cheaper to buy | pays more to sell | best cross-trade % (before gas) | after gas $ | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IBM | 225.76 | 226.28 | 0.229 | — | — | — | 2.226 | IBMB (only) | IBMB (only) | — | — | IBMon sell: market closed; IBMon buy: market closed |
| QCOM | 202.42 | 202.98 | 0.280 | — | — | — | 1.947 | QCOMB (only) | QCOMB (only) | — | — | QCOMon sell: market closed; QCOMon buy: market closed |
| SPY | 770.28 | 770.34 | 0.008 | 765.93 | ~~898.94~~ | — | 1.010 | SPYB (only) | SPYB (+0.57%) | -0.573 | -0.636 | SPYon buy: broken pool |
| TSM | 449.95 | 452.17 | 0.492 | 451.57 | 451.39 | -0.039 | 1.009 | TSMon (−0.17%) | TSMon (+0.36%) | -0.132 | -0.194 |  |
| SOXL | 150.38 | 150.60 | 0.149 | — | — | — | 0.926 | SOXLB (only) | SOXLB (only) | — | — | SOXLon sell: market closed; SOXLon buy: market closed |
| ORCL | 137.22 | 137.60 | 0.274 | — | — | — | 0.848 | ORCLB (only) | ORCLB (only) | — | — | ORCLon sell: no liquidity; ORCLon buy: no liquidity |
| LITE | 934.40 | 935.89 | 0.159 | — | — | — | 0.792 | LITEB (only) | LITEB (only) | — | — | LITEon sell: market closed; LITEon buy: market closed |
| AXTI | 77.97 | 78.34 | 0.477 | — | — | — | 0.785 | AXTIB (only) | AXTIB (only) | — | — | AXTIon sell: market closed; AXTIon buy: market closed |
| AVGO | 353.28 | 354.17 | 0.252 | 353.57 | 354.29 | 0.202 | 0.723 | AVGOB (−0.03%) | AVGOon (+0.08%) | -0.167 | -0.232 |  |
| NOK | 10.34 | 10.39 | 0.523 | — | — | — | 0.638 | NOKB (only) | NOKB (only) | — | — | NOKon sell: market closed; NOKon buy: market closed |
| WDC | 457.75 | 459.45 | 0.372 | — | — | — | 0.573 | WDCB (only) | WDCB (only) | — | — | WDCon sell: market closed; WDCon buy: market closed |
| CRWV | — | 87.14 | — | — | — | — | 0.534 | CRWVB (only) | — | — | — | CRWVB sell: no liquidity; CRWVon sell: market closed; CRWVon buy: market closed |
| MSFT | 517.34 | 518.11 | 0.147 | ~~254.95~~ | ~~1024502549.14~~ | — | 0.489 | MSFTB (only) | MSFTB (only) | — | — | MSFTon sell: broken pool; MSFTon buy: broken pool |
| TQQQ | 79.27 | 79.55 | 0.350 | 79.35 | 79.51 | 0.202 | 0.485 | TQQQon (−0.05%) | TQQQon (+0.10%) | -0.248 | -0.312 |  |
| QQQ | 743.83 | 743.88 | 0.006 | 740.45 | 751.80 | 1.532 | 0.479 | QQQB (−1.06%) | QQQB (+0.46%) | -0.461 | -0.524 |  |
| HOOD | 118.34 | 118.76 | 0.356 | — | — | — | 0.422 | HOODB (only) | HOODB (only) | — | — | HOODon sell: market closed; HOODon buy: market closed |
| META | 746.55 | 747.67 | 0.151 | 747.04 | 748.62 | 0.211 | 0.316 | METAB (−0.13%) | METAon (+0.07%) | -0.085 | -0.144 |  |
| BABA | 110.25 | 110.42 | 0.153 | — | — | — | 0.315 | BABAB (only) | BABAB (only) | — | — | BABAon sell: market closed; BABAon buy: market closed |
| AAOI | 100.76 | 101.31 | 0.540 | — | — | — | 0.308 | AAOIB (only) | AAOIB (only) | — | — | AAOIon sell: market closed; AAOIon buy: market closed |
| GOOGL | 342.81 | 343.09 | 0.084 | 339.34 | 347.69 | 2.463 | 0.297 | GOOGLB (−1.34%) | GOOGLB (+1.02%) | -1.095 | -1.157 |  |
| NVDA | 224.16 | 224.22 | 0.029 | 224.04 | 228.91 | 2.175 | 0.272 | NVDAB (−2.09%) | NVDAB (+0.05%) | -0.081 | -0.149 |  |
| CBRS | 206.72 | 207.19 | 0.227 | — | — | — | 0.229 | CBRSB (only) | CBRSB (only) | — | — | CBRSon sell: market closed; CBRSon buy: market closed |
| NBIS | 238.19 | 239.09 | 0.377 | — | — | — | 0.197 | NBISB (only) | NBISB (only) | — | — | NBISon sell: market closed; NBISon buy: market closed |
| MRVL | 262.47 | 263.00 | 0.202 | 262.25 | 262.72 | 0.179 | 0.192 | MRVLon (−0.11%) | MRVLB (+0.08%) | -0.094 | -0.158 |  |
| RKLB | 73.97 | 74.14 | 0.224 | — | — | — | 0.189 | RKLBB (only) | RKLBB (only) | — | — | RKLBon sell: market closed; RKLBon buy: market closed |
| GLW | 155.38 | 156.23 | 0.550 | 155.89 | 156.20 | 0.200 | 0.166 | GLWon (−0.02%) | GLWon (+0.33%) | -0.218 | -0.292 |  |
| MU | 1081.88 | 1083.14 | 0.116 | 1079.96 | 1082.96 | 0.278 | 0.155 | MUon (−0.02%) | MUB (+0.18%) | -0.099 | -0.173 |  |
| COIN | 195.12 | 195.74 | 0.313 | 195.31 | 195.70 | 0.200 | 0.100 | COINon (−0.02%) | COINon (+0.09%) | -0.218 | -0.281 |  |
| PLTR | 189.67 | 190.12 | 0.235 | — | — | — | 0.091 | PLTRB (only) | PLTRB (only) | — | — | PLTRon sell: market closed; PLTRon buy: market closed |
| SPCX | 148.57 | 148.61 | 0.028 | 148.59 | 151.64 | 2.051 | 0.084 | SPCXB (−2.04%) | SPCXon (+0.01%) | -0.015 | -0.080 |  |
| EWY | 186.60 | 187.14 | 0.288 | — | — | — | 0.080 | EWYB (only) | EWYB (only) | — | — | EWYon sell: market closed; EWYon buy: market closed |
| DRAM | 62.15 | 62.24 | 0.138 | 62.21 | 62.34 | 0.205 | 0.072 | DRAMB (−0.16%) | DRAMon (+0.10%) | -0.042 | -0.109 |  |
| TSLA | 371.66 | 371.82 | 0.041 | 371.20 | 372.03 | 0.223 | 0.066 | TSLAB (−0.06%) | TSLAB (+0.12%) | -0.100 | -0.170 |  |
| ARM | 310.75 | 312.04 | 0.415 | — | — | — | 0.066 | ARMB (only) | ARMB (only) | — | — | ARMon sell: no liquidity; ARMon buy: no liquidity |
| MSTR | 158.80 | 159.27 | 0.295 | — | — | — | 0.072 | MSTRB (only) | MSTRB (only) | — | — | MSTRon sell: no liquidity; MSTRon buy: no liquidity |
| AMD | 629.12 | 630.21 | 0.173 | ~~559.98~~ | ~~665.53~~ | — | 0.053 | AMDB (only) | AMDB (only) | — | — | AMDon sell: broken pool; AMDon buy: broken pool |
| SKHY | 191.20 | 191.50 | 0.156 | — | — | — | 0.034 | SKHYB (only) | SKHYB (only) | — | — | SKHYon sell: no liquidity; SKHYon buy: no liquidity |
| INTC | 122.85 | 123.20 | 0.288 | 122.87 | — | — | 0.045 | INTCB (only) | INTCon (+0.02%) | -0.270 | -0.338 | INTCon buy: no liquidity |
| CRCL | 88.56 | 88.71 | 0.167 | 88.53 | 89.83 | 1.470 | 0.085 | CRCLB (−1.26%) | CRCLB (+0.04%) | -0.204 | -0.273 |  |
| SNDK | 1775.74 | 1776.27 | 0.030 | ~~478.99~~ | ~~16005.95~~ | — | 0.007 | SNDKB (only) | SNDKB (only) | — | — | SNDKon sell: broken pool; SNDKon buy: broken pool |

Struck-through prices were quoted but dropped: more than 5% from their own issuer's reference.

## Why a side had no usable price — verbatim

- `IBMon` sell: The stock market is currently closed. Expected to open in 1d 11h 0m.
- `SPYon` buy: 15.5% over its own reference (the aggregator reports 14.0% price impact) — a broken pool, not a price; left out of routing
- `ORCLon` sell: Insufficient liquidity for a quote. Please decrease the transaction amount or try again later.
- `MSFTon` sell: 51.0% under its own reference (the aggregator reports 100.0% price impact) — a broken pool, not a price; left out of routing
- `MSFTon` buy: 196982260.0% over its own reference (the aggregator reports 100.0% price impact) — a broken pool, not a price; left out of routing
- `AMDon` sell: 11.1% under its own reference (the aggregator reports 8.2% price impact) — a broken pool, not a price; left out of routing
- `AMDon` buy: 5.7% over its own reference (the aggregator reports 8.3% price impact) — a broken pool, not a price; left out of routing
- `SNDKon` sell: 73.0% under its own reference (the aggregator reports 100.0% price impact) — a broken pool, not a price; left out of routing
- `SNDKon` buy: 801.0% over its own reference (the aggregator reports 93.2% price impact) — a broken pool, not a price; left out of routing

## Verdicts, as /api/signal serves them

- **IBM** — Only IBMB can be bought at a usable price for $100 right now. Only IBMB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 2.23%.
- **QCOM** — Only QCOMB can be bought at a usable price for $100 right now. Only QCOMB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 1.95%.
- **SPY** — Only SPYB can be bought at a usable price for $100 right now. It fetches 0.57% more sold as SPYB. No arbitrage between them: buying one and selling the other loses 0.57% before gas. The issuers disagree on the reference itself by 1.01%. SPYon's buy quote is 15.5% over its own reference (the aggregator reports 14.0% price impact), so it is left out.
- **TSM** — TSM costs 0.17% less to buy as TSMon. It fetches 0.36% more sold as TSMon. No arbitrage between them: buying one and selling the other loses 0.13% before gas. The issuers disagree on the reference itself by 1.01%.
- **SOXL** — Only SOXLB can be bought at a usable price for $100 right now. Only SOXLB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.93%.
- **ORCL** — Only ORCLB can be bought at a usable price for $100 right now. Only ORCLB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.85%.
- **LITE** — Only LITEB can be bought at a usable price for $100 right now. Only LITEB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.79%.
- **AXTI** — Only AXTIB can be bought at a usable price for $100 right now. Only AXTIB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.78%.
- **AVGO** — AVGO costs the same to buy on either issuer. It fetches the same sold on either issuer. No arbitrage between them: buying one and selling the other loses 0.17% before gas. The issuers disagree on the reference itself by 0.72%.
- **NOK** — Only NOKB can be bought at a usable price for $100 right now. Only NOKB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.64%.
- **WDC** — Only WDCB can be bought at a usable price for $100 right now. Only WDCB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.57%.
- **CRWV** — Only CRWVB can be bought at a usable price for $100 right now. Neither issuer will take CRWV back at a usable price for $100 right now. The issuers disagree on the reference itself by 0.53%.
- **MSFT** — Only MSFTB can be bought at a usable price for $100 right now. Only MSFTB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.49%. MSFTon's sell quote is 51.0% under its own reference (the aggregator reports 100.0% price impact), so it is left out. MSFTon's buy quote is 196982260.0% over its own reference (the aggregator reports 100.0% price impact), so it is left out.
- **TQQQ** — TQQQ costs the same to buy on either issuer. It fetches 0.10% more sold as TQQQon. No arbitrage between them: buying one and selling the other loses 0.25% before gas. The issuers disagree on the reference itself by 0.49%.
- **QQQ** — QQQ costs 1.06% less to buy as QQQB. It fetches 0.46% more sold as QQQB. No arbitrage between them: buying one and selling the other loses 0.46% before gas. The issuers disagree on the reference itself by 0.48%.
- **HOOD** — Only HOODB can be bought at a usable price for $100 right now. Only HOODB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.42%.
- **META** — META costs 0.13% less to buy as METAB. It fetches the same sold on either issuer. No arbitrage between them: buying one and selling the other loses 0.08% before gas. The issuers disagree on the reference itself by 0.32%.
- **BABA** — Only BABAB can be bought at a usable price for $100 right now. Only BABAB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.32%.
- **AAOI** — Only AAOIB can be bought at a usable price for $100 right now. Only AAOIB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.31%.
- **GOOGL** — GOOGL costs 1.34% less to buy as GOOGLB. It fetches 1.02% more sold as GOOGLB. No arbitrage between them: buying one and selling the other loses 1.10% before gas. The issuers disagree on the reference itself by 0.30%.
- **NVDA** — NVDA costs 2.09% less to buy as NVDAB. It fetches the same sold on either issuer. No arbitrage between them: buying one and selling the other loses 0.08% before gas. The issuers disagree on the reference itself by 0.27%.
- **CBRS** — Only CBRSB can be bought at a usable price for $100 right now. Only CBRSB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.23%.
- **NBIS** — Only NBISB can be bought at a usable price for $100 right now. Only NBISB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.20%.
- **MRVL** — MRVL costs 0.11% less to buy as MRVLon. It fetches the same sold on either issuer. No arbitrage between them: buying one and selling the other loses 0.09% before gas. The issuers disagree on the reference itself by 0.19%.
- **RKLB** — Only RKLBB can be bought at a usable price for $100 right now. Only RKLBB can be sold at a usable price for $100 right now. The issuers disagree on the reference itself by 0.19%.
- **GLW** — GLW costs the same to buy on either issuer. It fetches 0.33% more sold as GLWon. No arbitrage between them: buying one and selling the other loses 0.22% before gas. The issuers disagree on the reference itself by 0.17%.
- **MU** — MU costs the same to buy on either issuer. It fetches 0.18% more sold as MUB. No arbitrage between them: buying one and selling the other loses 0.10% before gas. The issuers disagree on the reference itself by 0.16%.
- **COIN** — COIN costs the same to buy on either issuer. It fetches the same sold on either issuer. No arbitrage between them: buying one and selling the other loses 0.22% before gas.
- **PLTR** — Only PLTRB can be bought at a usable price for $100 right now. Only PLTRB can be sold at a usable price for $100 right now.
- **SPCX** — SPCX costs 2.04% less to buy as SPCXB. It fetches the same sold on either issuer. No arbitrage between them: buying one and selling the other loses 0.02% before gas.
- **EWY** — Only EWYB can be bought at a usable price for $100 right now. Only EWYB can be sold at a usable price for $100 right now.
- **DRAM** — DRAM costs 0.16% less to buy as DRAMB. It fetches the same sold on either issuer. No arbitrage between them: buying one and selling the other loses 0.04% before gas.
- **TSLA** — TSLA costs the same to buy on either issuer. It fetches 0.12% more sold as TSLAB. No arbitrage between them: buying one and selling the other loses 0.10% before gas.
- **ARM** — Only ARMB can be bought at a usable price for $100 right now. Only ARMB can be sold at a usable price for $100 right now.
- **MSTR** — Only MSTRB can be bought at a usable price for $100 right now. Only MSTRB can be sold at a usable price for $100 right now.
- **AMD** — Only AMDB can be bought at a usable price for $100 right now. Only AMDB can be sold at a usable price for $100 right now. AMDon's sell quote is 11.1% under its own reference (the aggregator reports 8.2% price impact), so it is left out. AMDon's buy quote is 5.7% over its own reference (the aggregator reports 8.3% price impact), so it is left out.
- **SKHY** — Only SKHYB can be bought at a usable price for $100 right now. Only SKHYB can be sold at a usable price for $100 right now.
- **INTC** — Only INTCB can be bought at a usable price for $100 right now. It fetches the same sold on either issuer. No arbitrage between them: buying one and selling the other loses 0.27% before gas.
- **CRCL** — CRCL costs 1.26% less to buy as CRCLB. It fetches the same sold on either issuer. No arbitrage between them: buying one and selling the other loses 0.20% before gas.
- **SNDK** — Only SNDKB can be bought at a usable price for $100 right now. Only SNDKB can be sold at a usable price for $100 right now. SNDKon's sell quote is 73.0% under its own reference (the aggregator reports 100.0% price impact), so it is left out. SNDKon's buy quote is 801.0% over its own reference (the aggregator reports 93.2% price impact), so it is left out.
