import type { Metadata, Viewport } from 'next';
import { Inter, Outfit } from 'next/font/google';

import { ToastProvider } from '@/components/ui/toast';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const outfit = Outfit({
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
    { media: '(prefers-color-scheme: light)', color: '#fbfcfe' },
    { media: '(prefers-color-scheme: dark)', color: '#131a26' },
  ],
};

/**
 * Applies the saved theme before first paint so there is no flash of the wrong scheme.
 * Kept inline and tiny on purpose.
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
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${outfit.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:rounded-xl focus:bg-pulse-600 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
