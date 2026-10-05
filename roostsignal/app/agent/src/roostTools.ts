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

// The live app by default: `bag deploy` ships only its own fixed list of secrets to the managed
// runtime, never a project's other .env.local keys, so a deployed agent has no ROOST_URL of its
// own. Locally, set ROOST_URL=http://localhost:3210 to point it at a dev server.
const ROOST_URL = () =>
  (process.env.ROOST_URL || "https://roost.nerom.site").replace(/\/+$/, "");

/**
 * The taker address quotes are priced against. Ondo refuses to quote without one. Defaults to
 * this agent's own wallet (a quote only — nothing is signed), for the same reason as above.
 */
const TAKER = () => process.env.ROOST_TAKER_ADDRESS || "0x33eeB13C4DF0aCC6efd57F3d5FD061c155E44dF7";

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

// ── without the model ─────────────────────────────────────────────────────────

/** The six Fledglings by name, so "what is Pango doing" finds NVDA. */
const CREATURES: Record<string, string> = { pango: "NVDA", coil: "TSLA", bara: "AAPL", rivet: "SPCX", patch: "CRWV", fen: "RDDT" };
const NOT_TICKERS = new Set(["I", "A", "AN", "THE", "US", "USA", "ETF", "NYSE", "BSC", "BNB", "AI", "OK", "USD", "USDT", "CEO", "IPO", "PM", "AM", "UTC"]);

/** The stock a prompt asks about: an explicit ticker first, then a Fledgling's name. */
export function tickerIn(prompt: string): string | null {
  for (const w of prompt.match(/\b[A-Z]{1,5}\b/g) ?? []) if (!NOT_TICKERS.has(w)) return w;
  for (const [name, t] of Object.entries(CREATURES)) if (new RegExp(`\\b${name}\\b`, "i").test(prompt)) return t;
  return null;
}

type Signal = {
  ticker: string; name?: string; tokenSymbol?: string; onChain?: number; reference?: number; spreadPct?: number;
  underlyingOpen?: boolean; hoursUntilOpen?: number | null; pct24h?: number | null; priceSource?: string; verdict?: string; error?: string;
};

/**
 * The answer when the language model cannot be reached: Roost's own measured report, said plainly.
 * The numbers are the product and never came from the model, so a buyer still gets them — only
 * the commentary is missing, and the answer says so.
 */
export async function reportWithoutModel(prompt: string): Promise<string> {
  const ticker = tickerIn(prompt);
  if (!ticker) return "Name a stock to report on: a ticker like NVDA, TSLA or AAPL, or a Fledgling (Pango, Coil, Bara, Rivet, Patch, Fen).";
  const taker = TAKER();
  const r = (await getJson(`/api/signal?ticker=${encodeURIComponent(ticker)}${taker ? `&wallet=${encodeURIComponent(taker)}` : ""}`)) as Signal | null;
  if (!r || r.error || r.onChain == null || r.reference == null || r.spreadPct == null) {
    return `No report for ${ticker}: ${r?.error ?? "Roost did not answer"}.`;
  }
  const usd = (n: number) => `$${n.toFixed(2)}`;
  const signed = (n: number, dp: number) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
  return [
    `${r.name ?? ticker} (${r.tokenSymbol ?? ticker}) on BNB Smart Chain: ${usd(r.onChain)} a share on-chain against ${usd(r.reference)} for the real share, a ${signed(r.spreadPct, 3)} gap.`,
    r.verdict ?? "",
    !r.underlyingOpen && r.hoursUntilOpen != null ? `The exchange reopens in about ${Math.round(r.hoursUntilOpen)} hours.` : "",
    r.pct24h != null ? `Over 24 hours the token moved ${signed(r.pct24h, 2)}.` : "",
    r.priceSource === "oracle" ? "The on-chain price is a read, not an executable quote." : "",
    "(Roost's measured report, without commentary: the language model was unavailable.)",
  ].filter(Boolean).join(" ");
}
