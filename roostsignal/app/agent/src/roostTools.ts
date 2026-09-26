/**
 * What this Fledgling actually sells, as read-only tools.
 *
 * A tokenized stock trades every hour of the week. The exchange behind it is open about 32 hours
 * in 168. For the other 136 the reference price is a number that stopped moving on Friday
 * afternoon while the token kept trading. This agent reports that gap.
 *
 * The numbers come from Roost, which reads them from the Binance Web3 RWA Data and aggregator
 * APIs. They are NOT produced by the LLM — the LLM's job is to call these tools and explain what
 * came back. Measuring the gap correctly needs three things that are easy to get wrong:
 *
 *   · `referencePrice` is per underlying share and `tokenPrice` is per token; `tokenToShareRatio`
 *     bridges them. Skip it and a 10:1 token reports a 900% spread.
 *   · The RWA row's own two prices cannot be differenced — one is derived from the other, so the
 *     result is exactly 0.000% for every listed token.
 *   · The traded leg therefore has to be a real aggregator quote, which needs a taker address.
 *
 * Read-only by the studio definition: these are HTTP GETs. No signing, no chain mutation.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";

const ROOST_URL = () =>
  (process.env.ROOST_URL || "http://localhost:3210").replace(/\/+$/, "");

/** The taker address quotes are priced against. Ondo refuses to quote without one. */
const TAKER = () => process.env.ROOST_TAKER_ADDRESS || "";

async function getJson(path: string): Promise<unknown> {
  const url = `${ROOST_URL()}${path}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: `Roost returned non-JSON (HTTP ${res.status})`, url };
  }
  if (!res.ok) return { error: `Roost HTTP ${res.status}`, url, body };
  return body;
}

export const ROOST_TOOLS: ToolSet = {
  roost_spread_report: tool({
    description:
      "The gap between a tokenized stock on BNB Smart Chain and the real share it stands for. " +
      "Returns the executable on-chain price, the ratio-adjusted reference price, the spread in " +
      "percent, whether the underlying exchange is currently open, and when it reopens. " +
      "This is the agent's core product — call it before answering anything about a ticker, and " +
      "report only the numbers it returns.",
    inputSchema: z.object({
      ticker: z
        .string()
        .describe("underlying ticker, e.g. NVDA, AAPL, TSLA, SPCX, GOOGL"),
    }),
    execute: async ({ ticker }) => {
      const taker = TAKER();
      const q = taker ? `&wallet=${encodeURIComponent(taker)}` : "";
      return getJson(`/api/signal?ticker=${encodeURIComponent(ticker)}${q}`);
    },
  }),

  roost_list_tickers: tool({
    description:
      "Every tokenized stock ticker listed on BNB Smart Chain that this agent can report on, " +
      "with the issuing platform(s). Use when asked what is covered, or to resolve a company " +
      "name to a ticker before calling roost_spread_report.",
    inputSchema: z.object({}),
    execute: async () => getJson("/api/signal"),
  }),

  roost_cross_issuer: tool({
    description:
      "The same stock from two issuers. bStock and Ondo both list about 40 tickers on BNB Smart " +
      "Chain (NVDA, TSLA, GOOGL, SPY, SPCX, …). Returns a real buy and sell fill on each at the " +
      "same size, per share: which issuer is cheaper to buy from, which pays more to sell to, " +
      "whether buying on one and selling on the other clears anything before gas, and how far " +
      "the issuers' own reference prices disagree. Use for any question comparing issuers or " +
      "asking where a given trade executes best.",
    inputSchema: z.object({
      ticker: z
        .string()
        .describe("underlying ticker listed by both issuers, e.g. NVDA, TSLA, SPY"),
      usd: z
        .number()
        .min(1)
        .max(10000)
        .optional()
        .describe("trade size in USDT to quote each side at; default 100"),
    }),
    execute: async ({ ticker, usd }) => {
      const taker = TAKER();
      const q = taker ? `&wallet=${encodeURIComponent(taker)}` : "";
      const size = usd ? `&usd=${usd}` : "";
      return getJson(`/api/signal?ticker=${encodeURIComponent(ticker)}&cross=1${q}${size}`);
    },
  }),

  roost_widest_spreads: tool({
    description:
      "The tokenized stocks trading furthest from their reference price right now, widest first. " +
      "Use for 'where is the biggest gap' or 'what should I look at' questions. Slower than a " +
      "single report — prefer roost_spread_report when the caller named a ticker.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(25).optional().describe("default 10"),
    }),
    execute: async ({ limit }) =>
      getJson(`/api/signal?widest=1&limit=${limit ?? 10}`),
  }),
};
