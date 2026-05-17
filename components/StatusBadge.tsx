import clsx from 'clsx';
import type { POStatus, RequestStatus, Urgency } from '@/lib/types';

type AnyStatus = POStatus | RequestStatus | Urgency | string;

const labels: Record<string, string> = {
  pending: 'Pending',
  'inventory-checked': 'Inventory Checked',
  'rfq-sent': 'RFQ Sent',
  'quotes-received': 'Quotes Received',
  'po-raised': 'PO Raised',
  'po-approved': 'PO Approved',
  ordered: 'Ordered',
  delivered: 'Delivered',
  'pending-approval': 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  'grn-logged': 'GRN Logged',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const tones: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700 ring-slate-200',
  'inventory-checked': 'bg-sky-50 text-sky-700 ring-sky-200',
  'rfq-sent': 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  'quotes-received': 'bg-violet-50 text-violet-700 ring-violet-200',
  'po-raised': 'bg-amber-50 text-amber-700 ring-amber-200',
  'po-approved': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ordered: 'bg-blue-50 text-blue-700 ring-blue-200',
  delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'pending-approval': 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  'grn-logged': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  low: 'bg-slate-100 text-slate-700 ring-slate-200',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function StatusBadge({ status }: { status: AnyStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1',
        tones[status] ?? 'bg-slate-100 text-slate-700 ring-slate-200'
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
