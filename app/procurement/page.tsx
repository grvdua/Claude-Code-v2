'use client';

import { useMemo } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { useStore, formatINR, formatDateTime } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import { ChevronRight } from 'lucide-react';

const pipelineLabels = ['Request', 'RFQ', 'Quotes', 'PO', 'Approval', 'GRN'];

export default function ProcurementPage() {
  const mounted = useMounted();
  const requests = useStore((s) => s.requests);
  const quotes = useStore((s) => s.quotes);
  const pos = useStore((s) => s.pos);
  const vendors = useStore((s) => s.vendors);

  const merged = useMemo(() => {
    return [...requests]
      .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1))
      .map((r) => {
      const rQuotes = quotes.filter((q) => q.requestId === r.id);
      const rPOs = pos.filter((p) => p.requestId === r.id);
      const stage = (() => {
        const po = rPOs[0];
        if (po?.status === 'grn-logged') return 5;
        if (po?.status === 'approved' || po?.status === 'ordered') return 4;
        if (po) return 3;
        if (rQuotes.length > 0) return 2;
        if (r.status === 'rfq-sent') return 1;
        return 0;
      })();
      return { request: r, quotes: rQuotes, pos: rPOs, stage };
    });
  }, [requests, quotes, pos]);

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Procurement pipeline</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Visibility from material request all the way through Goods Received Note.
        </p>
      </header>

      <section className="space-y-4">
        {merged.length === 0 ? (
          <div className="card p-5 text-sm text-slate-500 dark:text-slate-400">No procurement activity yet.</div>
        ) : (
          merged.map(({ request, quotes, pos, stage }) => (
            <article key={request.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {request.quantity} {request.unit} · {request.itemName}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Raised by {request.raisedBy} · {formatDateTime(request.raisedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={request.urgency} />
                  <StatusBadge status={request.status} />
                </div>
              </div>

              <ol className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                {pipelineLabels.map((label, idx) => (
                  <li key={label} className="flex items-center gap-2">
                    <span
                      className={
                        'rounded-full px-2.5 py-1 font-medium ring-1 ' +
                        (idx <= stage
                          ? 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/30 dark:text-brand-300 dark:ring-brand-800'
                          : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 ring-slate-200 dark:ring-slate-700')
                      }
                    >
                      {label}
                    </span>
                    {idx < pipelineLabels.length - 1 ? (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                    ) : null}
                  </li>
                ))}
              </ol>

              {quotes.length > 0 ? (
                <div className="mt-4">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Quotes ({quotes.length})
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {quotes.map((q) => {
                      const v = vendors.find((vv) => vv.id === q.vendorId);
                      return (
                        <li key={q.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-900 dark:text-slate-100">{v?.name ?? q.vendorId}</span>
                            <span className="font-semibold">{formatINR(q.totalPrice)}</span>
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">{formatINR(q.pricePerUnit)} / unit</div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {pos.length > 0 ? (
                <div className="mt-4">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Purchase Orders
                  </div>
                  <ul className="space-y-2">
                    {pos.map((p) => {
                      const v = vendors.find((vv) => vv.id === p.vendorId);
                      return (
                        <li key={p.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-mono">{p.id}</span>
                            <StatusBadge status={p.status} />
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-slate-600 dark:text-slate-300">{v?.name ?? p.vendorId}</span>
                            <span className="font-semibold">{formatINR(p.totalValue)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
