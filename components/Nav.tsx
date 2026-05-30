'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChefHat, LogOut, Sun, Moon, Monitor } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import { ThemeManager } from './ThemeManager';
import type { Role, ThemePreference } from '@/lib/types';

const roleLabel: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Restaurant Manager',
  chef: 'Head Chef',
  'store-manager': 'Store Manager',
};

const THEME_CYCLE: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const THEME_LABEL: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function Nav() {
  const router = useRouter();
  const role = useStore((s) => s.role);
  const setRole = useStore((s) => s.setRole);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const mounted = useMounted();

  const handleSwitch = () => {
    setRole(null);
    router.push('/');
  };

  const cycleTheme = () => setTheme(THEME_CYCLE[theme]);
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <ThemeManager />
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white shadow-sm">
            <ChefHat className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">RestaurantOS</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Run your restaurant from anywhere</div>
          </div>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          {mounted ? (
            <button
              onClick={cycleTheme}
              className="btn btn-secondary text-xs"
              title={`Theme: ${THEME_LABEL[theme]} (click to cycle)`}
              aria-label={`Theme: ${THEME_LABEL[theme]} — click to cycle`}
            >
              <ThemeIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{THEME_LABEL[theme]}</span>
            </button>
          ) : null}
          {mounted && role ? (
            <>
              <span className="hidden rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 sm:inline dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-800">
                {roleLabel[role]}
              </span>
              <button onClick={handleSwitch} className="btn btn-secondary text-xs">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Switch role</span>
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
