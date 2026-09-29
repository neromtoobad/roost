'use client';
import { useEffect, useState } from 'react';
import { telegram } from '@/lib/sync';
import type { PetState } from '@/lib/store';

// "Remind me on Telegram": binds this Fledgling to a Telegram chat, so feeding days and the pet's
// own requests reach you where you already are. Shown only when the server has a bot and the pet
// has a server copy to bind. The link carries a one-time code, never the pet's public id.

export function TelegramLink({ pet }: { pet: PetState }) {
  const id = pet.remoteId;
  const [state, setState] = useState<{ id: string; enabled: boolean; linked: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // Asked again when the tab comes back into focus — that is when someone returns from Telegram.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const check = () => telegram(id, 'status').then((s) => {
      if (alive && s) setState({ id, enabled: s.enabled, linked: Boolean(s.linked) });
    });
    void check();
    window.addEventListener('focus', check);
    return () => { alive = false; window.removeEventListener('focus', check); };
  }, [id]);

  const s = state && state.id === id ? state : null;
  if (!id || !s?.enabled) return null;

  const link = async () => {
    setBusy(true);
    // Opened now, inside the tap, so a popup blocker lets it through; pointed at t.me once the
    // code exists.
    const w = window.open('', '_blank');
    const r = await telegram(id, 'link');
    setBusy(false);
    if (!r?.url) { w?.close(); return; }
    if (w) w.location.href = r.url; else window.location.href = r.url;
  };
  const unlink = async () => {
    setBusy(true);
    const r = await telegram(id, 'unlink');
    setBusy(false);
    if (r) setState({ id, enabled: true, linked: false });
  };

  return (
    <p className="mt-2 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>
      {s.linked ? (
        <>🔔 {pet.name} texts you on Telegram · <button className="underline" disabled={busy} onClick={() => void unlink()}>stop</button></>
      ) : (
        <button className="underline" disabled={busy} onClick={() => void link()}>🔔 {busy ? 'Opening Telegram…' : 'Remind me on Telegram'}</button>
      )}
    </p>
  );
}
