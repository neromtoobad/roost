import { NextResponse } from 'next/server';
import { request } from '@/lib/binance';

// A request-for-quote order, after the owner has signed it.
//
// POST { orderId, vendor, signature, requestId, signingScheme? }  → { orderId, status }
//   hands the owner's EIP-712 signature to Binance's RFQ desk, which forwards it to the vendor.
// GET  ?id=<orderId>                                             → { status, txHash, ... }
//   where it has got to: PENDING_VENDOR, PENDING_ONCHAIN, then FILLED (with the settlement's
//   transaction hash), FAILED, EXPIRED or CANCELLED.
//
// Roost signs nothing here either. The signature is the owner's, made in their wallet over the
// order /api/trade built for their address; an order nobody signed is worthless to the desk.

const msg = (r: { status: number; json: unknown }) => (r.json as { msg?: string } | null)?.msg ?? `HTTP ${r.status}`;
const VENDORS = new Set(['InchFusion', 'CowSwap', 'PcsXRfq']);

type Body = { orderId?: string; vendor?: string; signature?: string; requestId?: string; signingScheme?: string | null };

export async function POST(req: Request) {
  let b: Body;
  try { b = (await req.json()) as Body; }
  catch { return NextResponse.json({ error: 'expected a JSON body' }, { status: 400 }); }
  if (!b.orderId || !/^[\w.:-]{1,200}$/.test(b.orderId)) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  if (!b.vendor || !VENDORS.has(b.vendor)) return NextResponse.json({ error: 'unknown RFQ vendor' }, { status: 400 });
  if (!/^0x[0-9a-fA-F]{130}$/.test(b.signature ?? '')) return NextResponse.json({ error: 'signature must be a 65-byte hex string' }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(b.requestId ?? '')) return NextResponse.json({ error: 'requestId must be a UUID' }, { status: 400 });

  const r = await request('POST', '/api/v1/dex/aggregator/order/submit', {
    body: {
      requestId: b.requestId, userSignature: b.signature, vendor: b.vendor,
      // The desk's name for it: `rfq.orderId` from /swap, not the route's quoteId.
      quoteId: b.orderId,
      ...(b.signingScheme ? { signingScheme: b.signingScheme } : {}),
    },
  });
  const d = (r.json as { data?: { orderId?: string; status?: string } } | null)?.data;
  if (r.code !== 0 || !d?.orderId) return NextResponse.json({ error: `the RFQ desk refused the order — ${msg(r)}` }, { status: 502 });
  return NextResponse.json({ orderId: d.orderId, status: d.status ?? 'PENDING_VENDOR' }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^[\w.:-]{1,200}$/.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const r = await request('GET', `/api/v1/dex/aggregator/order/${encodeURIComponent(id)}`);
  const d = (r.json as { data?: { status?: string; txHash?: string | null; fromAmount?: string | null; toAmount?: string | null } } | null)?.data;
  if (r.code !== 0 || !d?.status) return NextResponse.json({ error: msg(r) }, { status: 502 });
  return NextResponse.json(
    { status: d.status, txHash: d.txHash ?? null, fromAmount: d.fromAmount ?? null, toAmount: d.toAmount ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
