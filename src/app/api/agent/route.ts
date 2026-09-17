import { NextResponse } from 'next/server';
import { SPECIES, type Species } from '@/lib/pets';
import type { Personality } from '@/lib/store';
import { chat, clawpumpEnabled, createAgent } from '@/lib/clawpump';

// The brain behind a pet. With CLAWPUMP_API_KEY set, adopt creates a real agent (own wallet) and feed asks it to act;
// without it the client keeps its local template voice. Same shapes either way, so the switch is invisible to the UI.

type Body =
  | { action: 'adopt'; name: string; personality: Personality; species: Species['id'] }
  | { action: 'feed'; agentId: string; usd: number; species: Species['id']; marketOpen: boolean };

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  if (!clawpumpEnabled()) return NextResponse.json({ mode: 'local' });

  try {
    if (body.action === 'adopt') {
      const sp = SPECIES[body.species];
      const a = await createAgent(body.name, body.personality, sp.ticker);
      return NextResponse.json({ mode: 'clawpump', agentId: a.id, wallet: a.walletAddress });
    }
    if (body.action === 'feed') {
      const sp = SPECIES[body.species];
      const line = await chat(
        body.agentId,
        `You were just fed $${body.usd} USDT. ${body.marketOpen ? 'The market is open: buy' : 'The market is closed: plan to buy at the next open'} $${body.usd} of ${sp.ticker} (${sp.tokenSymbol} at ${sp.address} on BSC) with the USDT in your wallet, then tell your owner what you did in your voice.`,
      );
      return NextResponse.json({ mode: 'clawpump', line });
    }
  } catch (e) {
    return NextResponse.json({ mode: 'local', error: (e as Error).message }, { status: 200 });
  }
  return NextResponse.json({ error: 'bad action' }, { status: 400 });
}
