'use client';

import { Check } from 'lucide-react';
import clsx from 'clsx';
import type { MaterialRequest, PurchaseOrder, Quote } from '@/lib/types';
import { formatDateTime } from '@/lib/store';

interface PipelineTimelineProps {
  request: MaterialRequest;
  quotes: Quote[];
  pos: PurchaseOrder[];
}

type StageKey =
  | 'request'
  | 'rfq-sent'
  | 'quotes-received'
  | 'po-raised'
  | 'po-approved'
  | 'grn';

interface Stage {
  key: StageKey;
  label: string;
  timestamp?: string;
}

/**
 * Visualises the 6 stages of a procurement request:
 * Request -> RFQ Sent -> Quotes Received -> PO Raised -> Approved -> GRN
 *
 * Stages are derived from the request status and the linked PO state.
 * Active stage glows emerald; completed stages get a check.
 */
export function PipelineTimeline({
  request,
  quotes,
  pos,
}: PipelineTimelineProps) {
  const relatedPO = pos.find((p) => p.requestId === request.id);
  const earliestQuote = quotes
    .filter((q) => q.requestId === request.id)
    .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1))[0];

  // Order matters — index into this array drives "completed" logic.
  const statusOrder = [
    'pending',
    'inventory-checked',
    'rfq-sent',
    'quotes-received',
    'po-raised',
    'po-approved',
    'ordered',
    'delivered',
  ] as const;

  const rIdx = statusOrder.indexOf(request.status);

  const stages: Stage[] = [
    { key: 'request', label: 'Request', timestamp: request.raisedAt },
    {
      key: 'rfq-sent',
      label: 'RFQ Sent',
      timestamp: rIdx >= statusOrder.indexOf('rfq-sent') ? request.raisedAt : undefined,
    },
    {
      key: 'quotes-received',
      label: 'Quotes Received',
      timestamp: earliestQuote?.submittedAt,
    },
    {
      key: 'po-raised',
      label: 'PO Raised',
      timestamp: relatedPO?.raisedAt,
    },
    {
      key: 'po-approved',
      label: 'Approved',
      timestamp: relatedPO?.approvedAt,
    },
    {
      key: 'grn',
      label: 'GRN',
      timestamp: relatedPO?.grnLoggedAt,
    },
  ];

  const completed = (s: Stage): boolean => {
    switch (s.key) {
      case 'request':
        return true;
      case 'rfq-sent':
        return rIdx >= statusOrder.indexOf('rfq-sent');
      case 'quotes-received':
        return rIdx >= statusOrder.indexOf('quotes-received') || quotes.some((q) => q.requestId === request.id);
      case 'po-raised':
        return Boolean(relatedPO);
      case 'po-approved':
        return Boolean(
          relatedPO &&
            (relatedPO.status === 'approved' ||
              relatedPO.status === 'ordered' ||
              relatedPO.status === 'grn-logged')
        );
      case 'grn':
        return Boolean(relatedPO && relatedPO.status === 'grn-logged');
    }
  };

  // Active = the first non-completed stage.
  const firstIncomplete = stages.findIndex((s) => !completed(s));
  const activeIdx = firstIncomplete === -1 ? stages.length - 1 : firstIncomplete;

  return (
    <div className="w-full">
      {/* Horizontal stepper on >=sm, vertical on mobile */}
      <ol className="hidden sm:flex sm:items-start sm:justify-between sm:gap-2">
        {stages.map((s, i) => {
          const done = completed(s);
          const isActive = i === activeIdx && !done;
          return (
            <li key={s.key} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                {i > 0 ? (
                  <div
                    className={clsx(
                      'h-0.5 flex-1',
                      completed(stages[i - 1]) ? 'bg-emerald-400' : 'bg-slate-200'
                    )}
                  />
                ) : (
                  <div className="flex-1" />
                )}
                <div
                  className={clsx(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-full ring-2 transition',
                    done
                      ? 'bg-emerald-500 text-white ring-emerald-500'
                      : isActive
                      ? 'bg-white text-emerald-700 ring-emerald-500 ring-offset-2 ring-offset-white'
                      : 'bg-white text-slate-400 ring-slate-300'
                  )}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <span className="text-[10px] font-semibold">{i + 1}</span>
                  )}
                </div>
                {i < stages.length - 1 ? (
                  <div
                    className={clsx(
                      'h-0.5 flex-1',
                      done ? 'bg-emerald-400' : 'bg-slate-200'
                    )}
                  />
                ) : (
                  <div className="flex-1" />
                )}
              </div>
              <div
                className={clsx(
                  'mt-1 text-[11px] font-medium',
                  done
                    ? 'text-emerald-700'
                    : isActive
                    ? 'text-emerald-700'
                    : 'text-slate-500'
                )}
              >
                {s.label}
              </div>
              {s.timestamp ? (
                <div className="text-[10px] text-slate-400">
                  {formatDateTime(s.timestamp)}
                </div>
              ) : (
                <div className="text-[10px] text-slate-300">—</div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile vertical */}
      <ol className="space-y-2 sm:hidden">
        {stages.map((s, i) => {
          const done = completed(s);
          const isActive = i === activeIdx && !done;
          return (
            <li key={s.key} className="flex items-center gap-3">
              <div
                className={clsx(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full ring-2',
                  done
                    ? 'bg-emerald-500 text-white ring-emerald-500'
                    : isActive
                    ? 'bg-white text-emerald-700 ring-emerald-500'
                    : 'bg-white text-slate-400 ring-slate-300'
                )}
              >
                {done ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className="text-[9px] font-semibold">{i + 1}</span>
                )}
              </div>
              <div className="flex-1">
                <div
                  className={clsx(
                    'text-xs font-medium',
                    done || isActive ? 'text-slate-900' : 'text-slate-500'
                  )}
                >
                  {s.label}
                </div>
                {s.timestamp ? (
                  <div className="text-[10px] text-slate-400">
                    {formatDateTime(s.timestamp)}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
