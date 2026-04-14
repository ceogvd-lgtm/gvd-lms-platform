import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'LMS Platform',
  description: 'Hệ thống LMS thế hệ mới tích hợp AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="font-sans bg-white dark:bg-dark-bg text-slate-900 dark:text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
