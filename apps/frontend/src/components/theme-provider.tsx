'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import * as React from 'react';

/**
 * App-wide theme provider — wraps next-themes.
 *
 * Persists in localStorage as `lms-theme`. First-time visitors (no stored
 * choice yet) default to **dark**. Once the user toggles via the ☀️/🌙
 * button, that choice overrides the default on every subsequent visit.
 *
 * We intentionally skip `enableSystem` so the default is deterministic —
 * previously a user on a light-mode Windows would land on a light LMS
 * even though the brand palette is designed dark-first.
 */
type NextThemesProps = React.ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: NextThemesProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange={false}
      storageKey="lms-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
