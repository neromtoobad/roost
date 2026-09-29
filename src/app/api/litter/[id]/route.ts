import { NextResponse } from 'next/server';
import { litterById, type LitterMember } from '@/lib/litters';
import { chooseIssuer } from '@/lib/issuer';
import { industryFor } from '@/lib/company';
import { speciesFor } from '@/lib/pets';
import { cached } from '@/lib/swr';

// A litter, resolved: for each ticker in the theme, which issuer's token its pup hatches from (lib/
// issuer — real fills when a wallet is given) and which Fledgling its sector hatches (lib/pets).
//
//   /api/litter/mag7              by the traded price
//   /api/litter/mag7?wallet=0x…   by real fills for this wallet, $25 a pup

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const litter = litterById(id);
  if (!litter) return NextResponse.json({ error: 'no such litter' }, { status: 404 });
  const wallet = new URL(req.url).searchParams.get('wallet') ?? undefined;

  const resolve = async (): Promise<LitterMember[]> => Promise.all(litter.members.map(async (m) => {
    try {
      const choice = await cached(`issuer:${m.ticker}:${wallet?.toLowerCase() ?? '-'}:25`, () => chooseIssuer(m.ticker, { wallet, usd: 25 }), { fresh: 60_000, stale: 5 * 60_000 });
      if (!choice) return { ...m, stock: null, species: 'nimbus' as const, choice: null, error: `${m.ticker} is not listed on BSC right now` };
      // The sector picks the Fledgling. An ETF needs no lookup; a failed one hatches the default
      // cloud this time and is asked again next time, never cached.
      const industry = choice.pick.assetType === 3 ? null
        : await cached(`industry:${choice.pick.address.toLowerCase()}`, () => industryFor(choice.pick.address), { fresh: 6 * 3600_000, stale: 7 * 24 * 3600_000 }).catch(() => null);
      return {
        ...m, stock: choice.pick, species: speciesFor(industry, choice.pick.assetType),
        choice: { basis: choice.basis, savingPct: choice.savingPct, reason: choice.reason, options: choice.options },
      };
    } catch (e) {
      return { ...m, stock: null, species: 'nimbus' as const, choice: null, error: (e as Error).message };
    }
  }));

  const members = await resolve();
  return NextResponse.json({ ...litter, members }, { headers: { 'Cache-Control': 'private, max-age=30' } });
}
