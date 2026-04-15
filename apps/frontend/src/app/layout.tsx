import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';

import { Providers } from '@/components/providers';

import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'LMS Platform',
  description: 'Hệ thống LMS thế hệ mới tích hợp AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning className={plusJakarta.variable}>
      <body className="font-sans bg-white dark:bg-dark-bg text-slate-900 dark:text-slate-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
