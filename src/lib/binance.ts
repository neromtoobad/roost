// Signed client for the Binance Web3 API.
//
// Two rules the gateway is unforgiving about, both from
// https://web3.binance.com/en/dev-docs/authentication:
//
//   1. Everything is served under a `/build` base path, and the SIGNED path must carry
//      that prefix too. Signing `/api/v1/...` while sending `/build/api/v1/...` is the
//      documented #1 cause of `40102 Invalid signature`.
//   2. The signed query string must be byte-identical to the one on the wire — same
//      order, same encoding. So we build it once and use that one string for both.
//
// Never import this from a Client Component: it reads the secret from the environment.
// Route handlers, server components and scripts only.

import { createHmac } from 'node:crypto';

const HOST = 'https://web3.binance.com';
const PREFIX = '/build';

export type Method = 'GET' | 'POST';

/** What the gateway's error codes actually mean in practice. */
export const HINTS: Record<number, string> = {
  40001: 'Invalid request parameters — check required query params for this endpoint.',
  40101: 'API key missing, invalid or disabled. Check BINANCE_W3_API_KEY.',
  40102: "Signature mismatch. Usual cause: the signed path is missing the '/build' prefix, or the query string was re-ordered or re-encoded between signing and sending.",
  40103: 'Timestamp expired or request replayed. Check the system clock against NTP.',
  40104: 'API key lacks permission for this endpoint.',
  42900: 'Rate limited. Default is 5 requests/sec per endpoint — back off and retry.',
  50000: 'Binance-side internal error. Retry.',
  50001: 'Service temporarily unavailable. Retry.',
};

export class BinanceApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'BinanceApiError';
  }
}

export type Params = Record<string, string | number | boolean | undefined | null>;

/** Query string in the exact form that gets both signed and sent. Order is preserved. */
function queryString(params?: Params): string {
  if (!params) return '';
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const configured = () =>
  Boolean(process.env.BINANCE_W3_API_KEY && process.env.BINANCE_W3_API_SECRET);

/**
 * One signed request. Returns the raw outcome without throwing, so callers (and the
 * connectivity check) can inspect status, code and headers for themselves.
 */
export async function request(
  method: Method,
  path: string,
  opts: { params?: Params; body?: unknown } = {},
): Promise<{ status: number; code: number | null; json: unknown; text: string; headers: Headers; ms: number }> {
  const key = process.env.BINANCE_W3_API_KEY;
  const secret = process.env.BINANCE_W3_API_SECRET;
  if (!key || !secret) {
    throw new BinanceApiError(
      0, null,
      'BINANCE_W3_API_KEY / BINANCE_W3_API_SECRET are not set.',
      'Copy .env.example to .env.local and fill in the credentials from https://web3.binance.com/en/dev-portal',
    );
  }

  const bodyStr = opts.body === undefined ? '' : JSON.stringify(opts.body);
  const wirePath = `${PREFIX}${path}${queryString(opts.params)}`;
  const timestamp = new Date().toISOString();

  const sign = createHmac('sha256', secret)
    .update(timestamp + method + wirePath + bodyStr, 'utf8')
    .digest('base64');

  const started = Date.now();
  const res = await fetch(HOST + wirePath, {
    method,
    headers: {
      'X-OC-APIKEY': key,
      'X-OC-TIMESTAMP': timestamp,
      'X-OC-SIGN': sign,
      'X-OC-RECV-WINDOW': '20000',
      ...(bodyStr ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(bodyStr ? { body: bodyStr } : {}),
  });
  const ms = Date.now() - started;

  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body, keep text */ }

  const rawCode = (json as { code?: unknown } | null)?.code;
  const code = typeof rawCode === 'number' ? rawCode : Number.isFinite(Number(rawCode)) && rawCode !== undefined ? Number(rawCode) : null;

  return { status: res.status, code, json, text, headers: res.headers, ms };
}

/** Signed request that throws BinanceApiError on failure and unwraps `data`. */
async function call<T>(method: Method, path: string, opts: { params?: Params; body?: unknown } = {}): Promise<T> {
  const r = await request(method, path, opts);
  const failed = !(r.status >= 200 && r.status < 300) || (r.code !== null && r.code !== 0);
  if (failed) {
    const msg = (r.json as { msg?: string } | null)?.msg ?? r.text.slice(0, 200) ?? `HTTP ${r.status}`;
    throw new BinanceApiError(r.status, r.code, msg, r.code !== null ? HINTS[r.code] : undefined);
  }
  const data = (r.json as { data?: unknown } | null)?.data;
  return (data !== undefined ? data : r.json) as T;
}

export const get = <T>(path: string, params?: Params) => call<T>('GET', path, { params });
export const post = <T>(path: string, body?: unknown) => call<T>('POST', path, { body });
