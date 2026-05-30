import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  tone?: 'default' | 'warn' | 'danger' | 'success';
}

const toneStyles: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default:
    'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-800',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-800',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-800',
};

export function KpiCard({ label, value, icon: Icon, hint, tone = 'default' }: KpiCardProps) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className={clsx('grid h-11 w-11 place-items-center rounded-lg ring-1', toneStyles[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </div>
        <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
        {hint ? <div className="text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
      </div>
    </div>
  );
}
