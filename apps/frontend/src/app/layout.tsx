import type { Metadata } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';

import { Providers } from '@/components/providers';

import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'GVD next-gen LMS',
  description: 'GVD next-gen LMS — Hệ thống đào tạo thực hành kỹ thuật công nghiệp tích hợp AI',
  icons: {
    icon: '/logo-gvd.svg',
  },
  // Phase 14 PWA stub — manifest + theme-color in meta. A real Service
  // Worker lands in Phase 18; for now this is enough for "Add to home
  // screen" on mobile + the system chrome picks up the brand blue.
  manifest: '/manifest.json',
  themeColor: '#1E40AF',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GVD next-gen LMS',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-background text-foreground font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
