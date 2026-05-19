import './globals.css';
import Navigation from '@/components/Navigation';
import SiteFooter from '@/components/SiteFooter';
import { Analytics } from '@vercel/analytics/next';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Suspense } from 'react';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} scroll-smooth`}
    >
      <body className="antialiased bg-background text-foreground flex flex-col h-screen overflow-hidden">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Suspense>
          <Navigation />
        </Suspense>
        <main id="main-content" className="flex-1 overflow-hidden">
          {children}
        </main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
