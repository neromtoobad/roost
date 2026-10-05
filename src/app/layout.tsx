import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import './tokens.css';
import { isNight, nyseSession } from '@/lib/session';
import { Wallet } from '@/components/Wallet';
import { Footer, SessionTheme, TopBar } from '@/components/Nav';

const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-plex-mono' });

export const metadata: Metadata = {
  title: 'Roost',
  description: 'Adopt a Fledgling — an AI with its own wallet that invests for you.',
};
export const viewport: Viewport = { themeColor: '#FCD535', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // A first guess for the very first paint; SessionTheme keeps it on the live clock from then on.
  const session = isNight(nyseSession()) ? 'night' : 'day';
  return (
    <html lang="en" data-session={session} className={`${plex.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <Wallet>
          <SessionTheme />
          {/* Desktop has a bar across the top and a footer; phones use the tab bar. */}
          <TopBar />
          <div className="lg:min-h-[calc(100dvh-65px)]">{children}</div>
          <Footer />
        </Wallet>
      </body>
    </html>
  );
}
