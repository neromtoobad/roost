import { NextResponse } from 'next/server';
import { dbEnabled, ensureSchema, pool } from '@/lib/db';
import { appUrl, petLink, say, telegramEnabled, webhookSecret } from '@/lib/telegram';
import { pricesByAddress } from '@/lib/quote';
import { SPECIES, type Species } from '@/lib/pets';
import { CADENCE_LABEL, isDue, stage, type Care, type Schedule } from '@/lib/care';
import type { Lot, Proposal } from '@/lib/pet-math';

// The Telegram pet's ears. Telegram posts every message sent to the bot here; the secret header
// proves it is Telegram. Four things it understands:
//
//   /start <code>   bind this chat to the Fledgling whose app made the code (see ./link)
//   /pets           how every Fledgling bound to this chat is doing
//   /stop           unbind them all
//   anything else   what it can do
//
// Always answers 200 once the secret checks out: a non-200 makes Telegram retry the same update.

type Update = { message?: { text?: string; chat?: { id: number } } };

type Row = {
  id: string; name: string; ticker: string; species: string; token_address: string | null; paper: boolean;
  lots: Lot[] | null; yield_qty: string; cash: string; streak: number; realized: string;
  schedule: Schedule | null; care: Care | null; proposal: Proposal | null;
};

const HELP = [
  'I am your Fledgling on Telegram. I tell you when it is feeding day, when I want to buy, and what I did on my own.',
  'I never trade from here — anything with money opens Roost, where your own wallet signs.',
  '',
  '/buddies — how your Fledglings are doing',
  '/stop — no more messages',
].join('\n');

async function status(chat: number) {
  const { rows } = await pool().query<Row>(
    `select id, name, ticker, species, token_address, paper, lots, yield_qty, cash, streak, realized, schedule, care, proposal
       from pets where tg_chat_id=$1 order by adopted_at`, [chat]);
  if (!rows.length) {
    await say(chat, 'No Fledglings are bound to this chat. Open one in Roost and tap "Remind me on Telegram".', link('Open Roost', '/'));
    return;
  }
  const addr = (r: Row) => (r.token_address ?? SPECIES[r.species as Species['id']]?.address ?? '').toLowerCase();
  const prices = await pricesByAddress(rows.map(addr).filter(Boolean)).catch(() => ({} as Record<string, number | null>));
  const now = Date.now();
  const blocks = rows.map((r) => {
    const lots = r.lots ?? [];
    const qty = lots.reduce((s, l) => s + l.qty, 0) + Number(r.yield_qty);
    const basis = lots.reduce((s, l) => s + l.qty * l.price, 0);
    const px = prices[addr(r)] ?? null;
    const value = px !== null ? qty * px : null;
    const pnl = value !== null && basis > 0 ? ((value - basis) / basis) * 100 : null;
    const s = r.schedule;
    return [
      `${r.name} · ${r.ticker} · ${stage(r.care ?? undefined, s ?? undefined).name}${r.paper ? ' · paper' : ''}`,
      `${qty.toFixed(4)} held${value !== null ? ` ≈ $${value.toFixed(2)}` : ''}${pnl !== null ? ` (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%)` : ''}${Number(r.cash) >= 1 ? ` · $${Number(r.cash).toFixed(0)} waiting` : ''}`,
      `Day ${r.streak} of the streak${s && !s.paused ? ` · $${s.usd} ${CADENCE_LABEL[s.every]}${isDue(s, now) ? ' — due now' : `, next ${new Date(s.nextAt).toUTCString().slice(0, 11)}`}` : ''}`,
      ...(r.proposal ? [`Wants to buy $${r.proposal.usd.toFixed(2)}: ${r.proposal.reason}.`] : []),
    ].join('\n');
  });
  await say(chat, blocks.join('\n\n'), link('Open Roost', '/'));
}

function link(text: string, path: string, petId?: string) {
  const url = petId ? petLink(path, petId) : appUrl() ? `${appUrl()}${path}` : null;
  return url ? { text, url } : undefined;
}

async function handle(chat: number, text: string) {
  const [first, arg] = text.trim().split(/\s+/, 2);
  const cmd = first.split('@')[0].toLowerCase();
  const db = pool();

  if (cmd === '/start' && arg) {
    const { rows } = await db.query<{ id: string; name: string; ticker: string }>(
      'update pets set tg_chat_id=$1, tg_link=null where tg_link=$2 returning id, name, ticker', [chat, arg]);
    if (!rows.length) {
      await say(chat, 'That link has already been used, or has expired. Open Roost and tap "Remind me on Telegram" again.', link('Open Roost', '/'));
      return;
    }
    const p = rows[0];
    await say(chat, `🐣 ${p.name} (${p.ticker}) will message you here — on feeding days, when it wants to buy, and when it does something on its own.\n\n${HELP.split('\n').slice(1).join('\n')}`, link(`Open ${p.name}`, '/', p.id));
    return;
  }
  if (cmd === '/buddies' || cmd === '/pets' || cmd === '/status') return status(chat); // /pets: the old name, kept working
  if (cmd === '/stop') {
    const r = await db.query('update pets set tg_chat_id=null where tg_chat_id=$1', [chat]);
    await say(chat, r.rowCount ? `Done — ${r.rowCount === 1 ? 'your Fledgling will' : `your ${r.rowCount} Fledglings will`} stop texting. They are fine; they just won't write.` : 'Nothing was bound to this chat.');
    return;
  }
  await say(chat, HELP, link('Open Roost', '/'));
}

export async function POST(req: Request) {
  if (!telegramEnabled() || !dbEnabled()) return NextResponse.json({ error: 'telegram is off' }, { status: 404 });
  if (req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 401 });
  }
  let u: Update;
  try { u = (await req.json()) as Update; } catch { return NextResponse.json({ ok: true }); }
  const chat = u.message?.chat?.id, text = u.message?.text;
  if (!chat || !text) return NextResponse.json({ ok: true });
  try {
    await ensureSchema();
    await handle(chat, text);
  } catch (e) {
    console.error('[telegram] update failed —', (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
