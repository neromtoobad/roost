import { createHash } from 'node:crypto';

// The Telegram pet: a bot that tells you when it is feeding day, when your Fledgling wants to buy,
// and what it did on its own — and answers when you ask after it. It never trades and never holds
// anything: every message that needs money links back to the app, where your own wallet signs.
//
// Off unless TELEGRAM_BOT_TOKEN is set (make a bot with @BotFather and paste its token). The app
// registers its webhook on startup; the hourly worker sends the reminders.
//
// Plain fetch to the Bot API, no library, and no 'server-only' guard: the worker is a bare Node
// process and imports this directly.

// Overridable for a self-hosted Bot API server (Telegram publishes one) — and for tests.
const API = (process.env.TELEGRAM_API_URL ?? 'https://api.telegram.org').replace(/\/$/, '');

export const telegramEnabled = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

/** Where the app lives, for the links in messages. Railway sets RAILWAY_PUBLIC_DOMAIN on its own. */
export function appUrl(): string | null {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return null;
}

/**
 * The secret Telegram sends back on every webhook call, so a stranger cannot post fake updates.
 * Derived from the token, so there is one less thing to configure; Telegram allows A-Z a-z 0-9 _ -.
 */
export const webhookSecret = () =>
  createHash('sha256').update(`roost-webhook:${process.env.TELEGRAM_BOT_TOKEN ?? ''}`).digest('hex').slice(0, 48);

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: T; description?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not set' };
  try {
    const r = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return (await r.json()) as { ok: boolean; result?: T; description?: string };
  } catch (e) {
    return { ok: false, description: (e as Error).message };
  }
}

let username: string | null = null;
/** The bot's @name, for t.me links. Asked once per process. */
export async function botUsername(): Promise<string | null> {
  if (username) return username;
  const r = await tg<{ username: string }>('getMe', {});
  username = r.ok && r.result?.username ? r.result.username : null;
  return username;
}

/** One message, with at most one button that opens the app. Failures are logged, never thrown. */
export async function say(chatId: number | string, text: string, button?: { text: string; url: string }): Promise<boolean> {
  const r = await tg('sendMessage', {
    chat_id: chatId, text, disable_web_page_preview: true,
    ...(button ? { reply_markup: { inline_keyboard: [[button]] } } : {}),
  });
  if (!r.ok) console.error(`[telegram] sendMessage to ${chatId} failed — ${r.description}`);
  return r.ok;
}

/** Point Telegram at /api/telegram. Idempotent; the app calls it on every start. */
export async function registerWebhook(): Promise<string> {
  const base = appUrl();
  if (!telegramEnabled()) return 'off (no TELEGRAM_BOT_TOKEN)';
  if (!base) return 'skipped: set PUBLIC_URL so Telegram knows where to reach the app';
  const r = await tg('setWebhook', {
    url: `${base}/api/telegram`, secret_token: webhookSecret(),
    allowed_updates: ['message'], drop_pending_updates: false,
  });
  return r.ok ? `webhook set to ${base}/api/telegram` : `setWebhook failed — ${r.description}`;
}

/** A link into the app that opens one pet (by its server id) on whatever screen `path` names. */
export function petLink(path: string, petId: string): string | null {
  const base = appUrl();
  if (!base) return null;
  return `${base}${path}${path.includes('?') ? '&' : '?'}pet=${petId}`;
}
