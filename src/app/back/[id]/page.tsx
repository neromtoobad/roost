import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { dbEnabled, ensureSchema, pool } from '@/lib/db';
import { SPECIES, petImage, type Species } from '@/lib/pets';
import { BackClient } from './BackClient';

// A server shell around the backing page, so a link pasted into a chat unfurls with the
// Stockling's face and its actual record rather than the app's generic title.

async function summary(id: string) {
  if (!dbEnabled()) return null;
  try {
    await ensureSchema();
    const { rows } = await pool().query<{ name: string; species: string; ticker: string; streak: number; launch: unknown }>(
      `select name, species, ticker, streak, launch from pets where id = $1`, [id],
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const pet = await summary(id);
  if (!pet) return { title: 'Stocklings' };

  const sp = SPECIES[pet.species as Species['id']];
  const host = (await headers()).get('host');
  const base = host ? `https://${host}` : undefined;
  const title = `Back ${pet.name}`;
  const description = pet.launch
    ? `${pet.name} invests in ${pet.ticker} on its own. Day ${pet.streak}. Back it with ${sp?.quoteMint ? pet.ticker : 'USDC'} — every trade feeds it.`
    : `${pet.name} invests in ${pet.ticker} on its own. Day ${pet.streak}.`;
  const image = sp ? `${base ?? ''}${petImage(sp.id, 'hero')}` : undefined;

  return {
    title, description,
    metadataBase: base ? new URL(base) : undefined,
    openGraph: { title, description, images: image ? [image] : undefined, type: 'website' },
    twitter: { card: 'summary_large_image', title, description, images: image ? [image] : undefined },
  };
}

export default async function Back({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BackClient id={id} />;
}
