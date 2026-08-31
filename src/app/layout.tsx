import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';

import { ToastProvider } from '@/components/ui/toast';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/*
 * A separate display face for headings and statistics. Its wider apertures and taller
 * x-height are what let a 72px streak number carry a card on its own — Inter at that size
 * reads as body copy that happened to be scaled up.
 */
const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Daily Rounds',
    template: '%s · Daily Rounds',
  },
  description:
    'A consistency and accountability platform for medical students. Show up, do the work, build the streak.',
  applicationName: 'Daily Rounds',
  appleWebApp: { capable: true, title: 'Daily Rounds', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6fb' },
    { media: '(prefers-color-scheme: dark)', color: '#101019' },
  ],
};

/**
 * Applies the saved theme before first paint so there is no flash of the wrong scheme.
 * Kept inline and tiny on purpose.
 *
 * It stays a raw `<script>` in `<head>` rather than going through `next/script`. Every
 * `next/script` strategy available in the App Router defers execution until after
 * hydration begins, which is precisely one frame too late: the point of this script is to
 * have decided the theme before anything is painted.
 */
const THEME_SCRIPT = `
(function(){try{
  var s = localStorage.getItem('dr-theme');
  var dark = s === 'dark' || (!s && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${display.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="focus:bg-pulse-600 sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:rounded-xl focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
