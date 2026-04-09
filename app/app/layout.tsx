import './globals.css';
import Navigation from '@/components/Navigation';
import type { Metadata } from 'next';
import { Inter, Libre_Baskerville } from 'next/font/google';
import { Suspense } from 'react';
import { Analytics } from '@vercel/analytics/next';

const serif = Libre_Baskerville({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-serif',
  display: 'swap',
});

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Suriname Time Machine',
  description:
    'Explore historical plantations of Suriname through linked open data and interactive maps',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="antialiased font-sans bg-stm-warm-50 text-stm-warm-900 flex flex-col h-screen overflow-hidden">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Suspense>
          <Navigation />
        </Suspense>
        <main id="main-content" className="flex-1 overflow-hidden">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
