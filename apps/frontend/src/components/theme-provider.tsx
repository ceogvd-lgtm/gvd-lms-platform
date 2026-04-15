'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import * as React from 'react';

/**
 * App-wide theme provider — wraps next-themes.
 * Persists in localStorage as `lms-theme` and respects system preference
 * on first visit. Toggle via `useTheme()` from `next-themes`.
 */
type NextThemesProps = React.ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: NextThemesProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      storageKey="lms-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
