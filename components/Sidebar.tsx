'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ChefHat,
  Boxes,
  Truck,
  Receipt,
  FileText,
  Warehouse,
  BarChart3,
} from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import type { Role } from '@/lib/types';

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const itemsByRole: Record<Role, NavItem[]> = {
  owner: [
    { href: '/owner', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/procurement', label: 'Procurement', icon: Truck },
    { href: '/inventory', label: 'Inventory', icon: Boxes },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/documents', label: 'Documents', icon: FileText },
  ],
  manager: [
    { href: '/manager', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/inventory', label: 'Inventory', icon: Boxes },
    { href: '/documents', label: 'Documents', icon: FileText },
  ],
  chef: [
    { href: '/chef', label: 'Kitchen Dashboard', icon: ChefHat },
    { href: '/inventory', label: 'Inventory (view)', icon: Boxes },
  ],
  'store-manager': [
    { href: '/store-manager', label: 'Store Dashboard', icon: Warehouse },
    { href: '/inventory', label: 'Inventory', icon: Boxes },
    { href: '/procurement', label: 'Procurement', icon: Truck },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/documents', label: 'Documents', icon: FileText },
  ],
};

export function Sidebar() {
  const role = useStore((s) => s.role);
  const pathname = usePathname();
  const mounted = useMounted();

  if (!mounted || !role || pathname === '/') return null;

  const items = itemsByRole[role];

  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <nav className="card sticky top-20 p-2">
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Modules
        </div>
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                    active
                      ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
          <Receipt className="mr-1 inline h-3 w-3" />
          Demo data — localStorage only
        </div>
      </nav>
    </aside>
  );
}
