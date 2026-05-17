'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChefHat, LogOut } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import type { Role } from '@/lib/types';

const roleLabel: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Restaurant Manager',
  chef: 'Head Chef',
  'store-manager': 'Store Manager',
};

export function Nav() {
  const router = useRouter();
  const role = useStore((s) => s.role);
  const setRole = useStore((s) => s.setRole);
  const mounted = useMounted();

  const handleSwitch = () => {
    setRole(null);
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white shadow-sm">
            <ChefHat className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="text-base font-semibold text-slate-900">RestaurantOS</div>
            <div className="text-[11px] text-slate-500">Run your restaurant from anywhere</div>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {mounted && role ? (
            <>
              <span className="hidden rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 sm:inline">
                {roleLabel[role]}
              </span>
              <button onClick={handleSwitch} className="btn btn-secondary text-xs">
                <LogOut className="h-4 w-4" />
                Switch role
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
