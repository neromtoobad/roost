import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import './tokens.css';
import { isNight, nyseSession } from '@/lib/session';
import { Wallet } from '@/components/Wallet';

const display = Fredoka({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });
const body = Nunito({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Roost',
  description: 'Adopt a Fledgling — an AI with its own wallet that invests for you.',
};
export const viewport: Viewport = { themeColor: '#C8FF3D', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = isNight(nyseSession()) ? 'night' : 'day';
  return (
    <html lang="en" data-session={session} className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased"><Wallet>{children}</Wallet></body>
    </html>
  );
}
