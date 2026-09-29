// The company behind a tokenized stock, from Binance's RWA Data API: who runs it, what it does,
// which sector it sits in (that picks the Fledgling that hatches), and the numbers a first-time
// investor asks about — 52-week range, size, valuation, dividend.
//
// Two endpoints, both per token: `underlying-profile` and `underlying-market`. Neither carries an
// earnings date, and the token list's sector filter (`tabId`, documented with thirteen sectors
// from "AI Chips" to "Buffett Portfolio") is ignored by the gateway — every value returns all 448
// tickers. So the sector comes from the profile's `industry`, one token at a time.

import { request } from './binance';
import { CHAIN_ID, type Platform } from './pets';

export type Company = {
  industry: string | null;
  ceo: string | null;
  website: string | null;
  description: string | null;
  /** The issuer publishes a collateral (backing) report for this token. */
  collateralReport: { supported: boolean; url: string | null } | null;
  high52w: number | null;
  low52w: number | null;
  marketCap: number | null;
  peRatio: number | null;
  dividendYieldPct: number | null;
  latestDividend: number | null;
};

const num = (v: unknown) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) ? n : null;
};

type Profile = {
  protections?: { collateralReport?: { supported?: boolean; url?: string | null } };
  companyInfo?: { ceo?: string; website?: string; industry?: string; description?: string };
};
type Market = {
  marketData?: {
    high52W?: string; low52W?: string; marketCap?: string; peRatioTTM?: string;
    dividendYield?: string; latestDividend?: string;
  };
};

export async function companyFor(address: string, platform: Platform): Promise<Company | null> {
  const params = { binanceChainId: CHAIN_ID, tokenContractAddress: address };
  const [p, m] = await Promise.all([
    request('GET', '/api/v1/dex/market/rwa/underlying-profile', { params }),
    request('GET', '/api/v1/dex/market/rwa/underlying-market', { params }),
  ]);
  const profile = (p.json as { data?: Profile } | null)?.data;
  const market = (m.json as { data?: Market } | null)?.data?.marketData;
  if (!profile && !market) {
    const msg = (p.json as { msg?: string } | null)?.msg ?? '(no msg)';
    console.error(`[company] no profile or market data for ${address} — code=${p.code} msg=${msg}`);
    return null;
  }
  const info = profile?.companyInfo;
  const report = profile?.protections?.collateralReport;
  const yieldFrac = num(market?.dividendYield); // see dividendYieldPct below
  return {
    industry: info?.industry || null,
    ceo: info?.ceo || null,
    website: info?.website || null,
    description: info?.description || null,
    collateralReport: report ? { supported: Boolean(report.supported), url: report.url ?? null } : null,
    high52w: num(market?.high52W),
    low52w: num(market?.low52W),
    marketCap: num(market?.marketCap),
    peRatio: num(market?.peRatioTTM),
    // Same field, same response shape, different units by issuer: for Microsoft, bStock's MSFTB
    // says 0.007 and Ondo's MSFTon says 0.69 — a fraction and a percent for the same 0.7%.
    dividendYieldPct: yieldFrac === null ? null : platform === 'bstock' ? yieldFrac * 100 : yieldFrac,
    latestDividend: num(market?.latestDividend),
  };
}
