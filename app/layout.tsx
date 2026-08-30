import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: 'AfterPulse · Post-event care loop',
  description:
    'A wearable-triggered Guava voice check-in that creates structured context for clinician review.',
  openGraph: {
    title: 'AfterPulse',
    description: 'From physiological signal to clinician context.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'AfterPulse wearable-to-clinician care loop',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AfterPulse',
    description: 'From physiological signal to clinician context.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
