import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { dbEnabled, ensureSchema, ownerHash, pool } from '@/lib/db';
import { botUsername, telegramEnabled } from '@/lib/telegram';

// Linking a Fledgling to a Telegram chat. The owner proves it is their pet the same way every write
// does — the device's owner key, checked against the stored hash — and gets a t.me link carrying a
// one-time code. Opening it sends /start <code> to the bot, and the webhook (../route.ts) binds the
// chat. The code is random, never the pet's public id: anyone can see that on the Board.
//
//   { ownerKey, id, action: 'status' }  → { enabled, linked }
//   { ownerKey, id, action: 'link' }    → { enabled, url }
//   { ownerKey, id, action: 'unlink' }  → { enabled, linked: false }

type Body = { ownerKey?: string; id?: string; action?: 'status' | 'link' | 'unlink' };

export async function POST(req: Request) {
  if (!telegramEnabled() || !dbEnabled()) return NextResponse.json({ enabled: false });
  let b: Body;
  try { b = (await req.json()) as Body; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  if (!b.ownerKey || b.ownerKey.length < 16 || !b.id || !/^[0-9a-f-]{36}$/i.test(b.id)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const db = pool();
    const own = await db.query<{ tg_chat_id: string | null }>(
      'select tg_chat_id from pets where id=$1 and owner_hash=$2', [b.id, ownerHash(b.ownerKey)]);
    if (!own.rowCount) return NextResponse.json({ error: 'not your Fledgling' }, { status: 403 });

    if (b.action === 'unlink') {
      await db.query('update pets set tg_chat_id=null, tg_link=null where id=$1', [b.id]);
      return NextResponse.json({ enabled: true, linked: false });
    }
    if (b.action === 'link') {
      const bot = await botUsername();
      if (!bot) return NextResponse.json({ enabled: true, error: 'the bot did not answer — check TELEGRAM_BOT_TOKEN' }, { status: 503 });
      const code = randomBytes(12).toString('base64url'); // 16 chars of [A-Za-z0-9_-], what /start allows
      await db.query('update pets set tg_link=$2 where id=$1', [b.id, code]);
      return NextResponse.json({ enabled: true, url: `https://t.me/${bot}?start=${code}` });
    }
    return NextResponse.json({ enabled: true, linked: own.rows[0].tg_chat_id !== null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
