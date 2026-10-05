import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import './tokens.css';
import { isNight, nyseSession } from '@/lib/session';
import { Wallet } from '@/components/Wallet';
import { Footer, SessionTheme, TopBar } from '@/components/Nav';

const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-plex-mono' });
// The display face: names, titles and the big numbers. Chunky and a little playful, like the toys.
const brico = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz'], variable: '--font-brico' });

export const metadata: Metadata = {
  title: 'Roost',
  description: 'Adopt a Fledgling — an AI with its own wallet that invests for you.',
};
export const viewport: Viewport = { themeColor: '#FCD535', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // A first guess for the very first paint; SessionTheme keeps it on the live clock from then on.
  const session = isNight(nyseSession()) ? 'night' : 'day';
  return (
    <html lang="en" data-session={session} className={`${plex.variable} ${plexMono.variable} ${brico.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <Wallet>
          <SessionTheme />
          {/* Desktop is one fixed screen: the bar across the top, the page between, a slim footer.
              Pages fit the space and scroll their own long lists; if a window is too short anyway,
              only the page area scrolls. Phones scroll normally and use the tab bar. */}
          <div className="lg:flex lg:h-dvh lg:flex-col">
            <TopBar />
            <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{children}</div>
            <Footer />
          </div>
        </Wallet>
      </body>
    </html>
  );
}
