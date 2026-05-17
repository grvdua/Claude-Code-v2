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
  default: 'bg-brand-50 text-brand-700 ring-brand-200',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export function KpiCard({ label, value, icon: Icon, hint, tone = 'default' }: KpiCardProps) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className={clsx('grid h-11 w-11 place-items-center rounded-lg ring-1', toneStyles[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-2xl font-semibold text-slate-900">{value}</div>
        {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
      </div>
    </div>
  );
}
