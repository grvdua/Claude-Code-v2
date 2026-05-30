'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';

/**
 * Keeps `<html class="dark">` in sync with the persisted theme preference,
 * including 'system' which follows prefers-color-scheme. Pair this with the
 * inline no-flash script in app/layout.tsx — that handles first paint, this
 * handles updates after hydration.
 */
export function ThemeManager() {
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    const apply = () => {
      const resolved =
        theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : theme;
      document.documentElement.classList.toggle('dark', resolved === 'dark');
    };

    apply();

    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => apply();
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    return undefined;
  }, [theme]);

  return null;
}
