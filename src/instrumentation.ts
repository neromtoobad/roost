// Warm the Board once the server is up, so the first visitor after a deploy is not the one who pays
// for it. That first load opens a connection to a database in another region from a fresh
// container and fetches prices from Binance — 18s on the first request after one deploy — and
// lib/swr keeps the result, so paying it here means nobody pays it there.
//
// It asks the running server for the routes over HTTP rather than calling them in-process: that is
// the code the Board actually runs, compiled the way the Board runs it, and the cache it fills lives
// in this same process. Not awaited — `register` has to finish before the server takes requests,
// and a slow database should delay the warm-up, not the site.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // The Telegram pet's webhook, pointed at this deploy. Idempotent, and not awaited for the same
  // reason as the warm-up below. Imported here, inside the Node-only branch, so no other runtime
  // ever loads node:crypto for it.
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const { registerWebhook } = await import('./lib/telegram');
    void registerWebhook().then((m) => console.log(`[telegram] ${m}`)).catch((e) => console.error('[telegram] webhook —', e.message));
  }

  if (!process.env.DATABASE_URL) return;
  const base = `http://127.0.0.1:${process.env.PORT || 3000}`;

  void (async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((r) => setTimeout(r, 1000));
      const started = Date.now();
      try {
        const r = await fetch(`${base}/api/leaderboard`);
        if (!r.ok) continue;
        await fetch(`${base}/api/duel`).catch(() => {});
        console.log(`[warm] board ready in ${Date.now() - started}ms`);
        return;
      } catch {
        // Not listening yet.
      }
    }
    console.error('[warm] gave up warming the board after 30s');
  })();
}
