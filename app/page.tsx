'use client';

import { useRouter } from 'next/navigation';
import { Crown, ChefHat, Warehouse, ClipboardList, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { Role } from '@/lib/types';

interface RoleCard {
  role: Role;
  title: string;
  blurb: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  perks: string[];
}

const cards: RoleCard[] = [
  {
    role: 'owner',
    title: 'Owner',
    blurb: 'Daily brief, approvals & full visibility.',
    href: '/owner',
    icon: Crown,
    perks: ['Approve POs', 'Low-stock alerts', 'Document expiry'],
  },
  {
    role: 'manager',
    title: 'Restaurant Manager',
    blurb: 'Day-to-day operations and staff.',
    href: '/manager',
    icon: ClipboardList,
    perks: ['Expense log', 'Staff attendance', 'Today’s totals'],
  },
  {
    role: 'chef',
    title: 'Head Chef',
    blurb: 'Journal, wastage & raw material requests.',
    href: '/chef',
    icon: ChefHat,
    perks: ['Prep & batch log', 'Wastage tracking', 'Raise requests'],
  },
  {
    role: 'store-manager',
    title: 'Store Manager',
    blurb: 'Inventory, procurement & vendor flow.',
    href: '/store-manager',
    icon: Warehouse,
    perks: ['RFQs & quotes', 'Raise POs', 'GRN entry'],
  },
];

export default function HomePage() {
  const router = useRouter();
  const setRole = useStore((s) => s.setRole);

  const pick = (card: RoleCard) => {
    setRole(card.role);
    router.push(card.href);
  };

  return (
    <div className="space-y-8">
      <section className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
          MVP demo — runs entirely in your browser
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Run your restaurant from anywhere.
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
          RestaurantOS connects your kitchen, store, manager and owner with a single procurement workflow,
          live inventory across locations, and a document vault that never lets a license expire.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.role}
              onClick={() => pick(c)}
              className="card group flex flex-col items-start gap-3 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white shadow-sm">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <div className="text-base font-semibold text-slate-900">{c.title}</div>
                <div className="mt-0.5 text-sm text-slate-600">{c.blurb}</div>
              </div>
              <ul className="space-y-1 text-xs text-slate-500">
                {c.perks.map((p) => (
                  <li key={p} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />
                    {p}
                  </li>
                ))}
              </ul>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-brand-700 group-hover:gap-2">
                Enter
                <ArrowRight className="h-4 w-4 transition-all" />
              </span>
            </button>
          );
        })}
      </section>

      <section className="card p-5">
        <div className="text-sm font-semibold text-slate-900">What’s inside</div>
        <ul className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <li>• 4-role gated workspaces (Owner, Manager, Chef, Store)</li>
          <li>• Procurement pipeline: request → RFQ → quote → PO → approval → GRN</li>
          <li>• Multi-location inventory (Restaurant / Store 1 / Store 2)</li>
          <li>• Chef daily journal, wastage log, raw-material requests</li>
          <li>• Owner approvals above ₹10,000 with audit trail</li>
          <li>• Document vault with 30-day expiry alerts</li>
        </ul>
      </section>
    </div>
  );
}
