import { NextResponse } from 'next/server';
import { request } from '@/lib/binance';
import { CHAIN_ID, USDT, isAddress } from '@/lib/pets';

// What the wallet actually holds, from Binance's Wallet API — the check on everything the diary
// says. A Fledgling's own record is what it bought and sold; this is what is there. They can
// differ for honest reasons (the owner traded that token elsewhere), and the app shows both.
//
//   GET /api/holdings?wallet=0x…&tokens=0xa,0xb   → { usdt, bnb, tokens: { [address]: qty } }
//
// Up to 18 stock tokens per call: the endpoint takes 20 entries, and USDT and BNB are always two.

type Asset = { tokenContractAddress?: string; balance?: string };

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const wallet = p.get('wallet') ?? '';
  if (!isAddress(wallet)) return NextResponse.json({ error: 'wallet must be an address' }, { status: 400 });
  const tokens = [...new Set((p.get('tokens') ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(isAddress))].slice(0, 18);

  const r = await request('POST', '/api/v1/dex/balance/token-balances-by-address', {
    body: {
      address: wallet,
      // An empty contract address is the Wallet API's name for the chain's native asset.
      tokenContractAddresses: [USDT, '', ...tokens].map((t) => ({ binanceChainId: CHAIN_ID, tokenContractAddress: t })),
    },
  });
  if (r.code !== 0) {
    const msg = (r.json as { msg?: string } | null)?.msg ?? `HTTP ${r.status}`;
    return NextResponse.json({ error: 'the Wallet API did not answer', upstream: `code=${r.code} ${msg}` }, { status: 502 });
  }
  const assets = (r.json as { data?: { tokenAssets?: Asset[] }[] } | null)?.data?.[0]?.tokenAssets ?? [];
  // A token the wallet does not hold comes back absent rather than as "0"; the call succeeded, so absent is none.
  const qty = (match: (a: string) => boolean) => {
    const v = Number(assets.find((x) => match((x.tokenContractAddress ?? '').toLowerCase()))?.balance ?? 0);
    return Number.isFinite(v) ? v : 0;
  };
  return NextResponse.json({
    usdt: qty((a) => a === USDT.toLowerCase()),
    bnb: qty((a) => a === '' || a === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'),
    tokens: Object.fromEntries(tokens.map((t) => [t, qty((a) => a === t)])),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
