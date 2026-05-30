'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Boxes, Users, X, TrendingUp, TrendingDown } from 'lucide-react';
import { useStore, formatINR, formatDate } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import { LineChart } from '@/components/charts/LineChart';
import { BarChart } from '@/components/charts/BarChart';
import type { InvoiceType } from '@/lib/types';

type Tab = 'items' | 'vendors' | 'monthly';

const INVOICE_TYPE_COLOR: Record<InvoiceType, string> = {
  'raw-material': '#0ea5e9',
  utility: '#f59e0b',
  rent: '#a855f7',
  packaging: '#10b981',
  marketing: '#ef4444',
  housekeeping: '#6366f1',
  other: '#64748b',
};

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
  });
}

export default function AnalyticsPage() {
  const mounted = useMounted();
  const role = useStore((s) => s.role);
  const inventory = useStore((s) => s.inventory);
  const vendors = useStore((s) => s.vendors);
  const priceHistory = useStore((s) => s.priceHistory);
  const vendorLedger = useStore((s) => s.vendorLedger);

  const [tab, setTab] = useState<Tab>('items');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);

  if (!mounted) return null;
  if (role !== 'owner' && role !== 'store-manager') {
    return (
      <div className="card p-5 text-sm text-slate-600 dark:text-slate-300">
        Analytics is available to Owner and Store Manager roles only.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white">
          <BarChart3 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Analytics</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Price trends, vendor performance, and monthly procurement spend.
          </p>
        </div>
      </header>

      <div className="card flex gap-1 p-1">
        {(
          [
            { id: 'items', label: 'Items', icon: Boxes },
            { id: 'vendors', label: 'Vendors', icon: Users },
            { id: 'monthly', label: 'Monthly Spend', icon: BarChart3 },
          ] as { id: Tab; label: string; icon: typeof Boxes }[]
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ' +
                (active
                  ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-900/30 dark:text-brand-300 dark:ring-brand-800'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800')
              }
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'items' ? (
        <ItemsTab
          selected={selectedItem}
          onSelect={setSelectedItem}
        />
      ) : null}
      {tab === 'vendors' ? (
        <VendorsTab
          selected={selectedVendor}
          onSelect={setSelectedVendor}
        />
      ) : null}
      {tab === 'monthly' ? <MonthlyTab /> : null}

      {selectedItem && tab === 'items' ? (
        <ItemDrawer itemId={selectedItem} onClose={() => setSelectedItem(null)} />
      ) : null}
      {selectedVendor && tab === 'vendors' ? (
        <VendorDrawer
          vendorId={selectedVendor}
          onClose={() => setSelectedVendor(null)}
        />
      ) : null}

      {/* Hidden imports to silence unused-warning in some builds. */}
      <span className="hidden">{inventory.length + vendors.length + priceHistory.length + vendorLedger.length}</span>
    </div>
  );
}

function ItemsTab({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const inventory = useStore((s) => s.inventory);
  const priceHistory = useStore((s) => s.priceHistory);

  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Inventory items</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Click an item to view its price history and consumption.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="table-th">Item</th>
              <th className="table-th">Category</th>
              <th className="table-th text-right">Current price</th>
              <th className="table-th text-right">3-mo avg</th>
              <th className="table-th text-right">Δ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {inventory.map((i) => {
              const phs = priceHistory.filter(
                (p) =>
                  p.itemId === i.id ||
                  p.itemName.toLowerCase() === i.name.toLowerCase()
              );
              const sorted = [...phs].sort(
                (a, b) =>
                  new Date(b.date).getTime() - new Date(a.date).getTime()
              );
              const current = sorted[0]?.unitPrice;
              const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
              const recent = phs.filter(
                (p) => new Date(p.date).getTime() >= cutoff
              );
              const avg =
                recent.length > 0
                  ? recent.reduce((s, p) => s + p.unitPrice, 0) / recent.length
                  : null;
              const delta =
                current != null && avg != null && avg > 0
                  ? ((current - avg) / avg) * 100
                  : null;
              return (
                <tr
                  key={i.id}
                  className={
                    'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 ' +
                    (selected === i.id ? 'bg-brand-50/40 dark:bg-brand-900/20' : '')
                  }
                  onClick={() => onSelect(i.id)}
                >
                  <td className="table-td font-medium">{i.name}</td>
                  <td className="table-td">{i.category}</td>
                  <td className="table-td text-right tabular-nums">
                    {current != null ? formatINR(current) : '—'}
                  </td>
                  <td className="table-td text-right tabular-nums">
                    {avg != null ? formatINR(avg) : '—'}
                  </td>
                  <td className="table-td text-right tabular-nums">
                    {delta != null ? (
                      <span
                        className={
                          'inline-flex items-center gap-1 ' +
                          (delta > 10
                            ? 'text-rose-600'
                            : delta < -10
                            ? 'text-emerald-600'
                            : 'text-slate-500 dark:text-slate-400')
                        }
                      >
                        {delta > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {delta.toFixed(1)}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ItemDrawer({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const inventory = useStore((s) => s.inventory);
  const priceHistory = useStore((s) => s.priceHistory);
  const journal = useStore((s) => s.journal);
  const vendors = useStore((s) => s.vendors);

  const item = inventory.find((i) => i.id === itemId);
  if (!item) return null;

  const phs = useMemoStable(
    () =>
      priceHistory
        .filter(
          (p) =>
            p.itemId === item.id ||
            p.itemName.toLowerCase() === item.name.toLowerCase()
        )
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [priceHistory, item.id, item.name]
  );

  const prices = phs.map((p) => p.unitPrice);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const avg = prices.length
    ? prices.reduce((s, n) => s + n, 0) / prices.length
    : 0;

  // Consumption rate heuristic: total wastage qty + (open inventory delta over period proxy).
  // For demo data we use wastage + last 30d gap as the rough indicator.
  // Formula documented in code:
  //   monthlyConsumption ≈ (wastageQty for this item in last 30 days)
  //                        + (currentQty 30d ago - currentQty today, when positive)
  // Since we only have current snapshot, we approximate using wastage only.
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const wastage30d = journal
    .filter(
      (j) =>
        j.type === 'wastage' &&
        j.itemName?.toLowerCase() === item.name.toLowerCase() &&
        new Date(j.timestamp).getTime() >= cutoff
    )
    .reduce((s, j) => s + (j.quantity ?? 0), 0);

  const last10 = [...phs]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  return (
    <section className="card border border-brand-200 dark:border-brand-800 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{item.name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {item.category} · current stock {item.quantity} {item.unit}
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-slate-100 dark:border-slate-800 p-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Price history (₹/{item.unit})
          </div>
          <LineChart
            data={phs.map((p) => ({
              label: formatDate(p.date).slice(0, 6),
              value: p.unitPrice,
            }))}
          />
        </div>
        <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Stats
          </div>
          <dl className="mt-2 space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Min</dt>
              <dd className="font-medium">{prices.length ? formatINR(min) : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Max</dt>
              <dd className="font-medium">{prices.length ? formatINR(max) : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Avg</dt>
              <dd className="font-medium">{prices.length ? formatINR(avg) : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Wastage 30d</dt>
              <dd className="font-medium">
                {wastage30d} {item.unit}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Est. monthly use</dt>
              <dd className="font-medium">
                ~{wastage30d} {item.unit}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
            Estimate based on logged wastage; refine once GRN history accumulates.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Last 10 purchases
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <th className="table-th">Date</th>
                <th className="table-th">Vendor</th>
                <th className="table-th text-right">Qty</th>
                <th className="table-th text-right">Unit price</th>
                <th className="table-th text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {last10.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-td text-center text-xs text-slate-500 dark:text-slate-400">
                    No purchase history yet.
                  </td>
                </tr>
              ) : (
                last10.map((p) => {
                  const v = vendors.find((vv) => vv.id === p.vendorId);
                  return (
                    <tr key={p.id}>
                      <td className="table-td text-xs">{formatDate(p.date)}</td>
                      <td className="table-td text-xs">
                        {v?.name ?? p.vendorName ?? '—'}
                      </td>
                      <td className="table-td text-right text-xs tabular-nums">
                        {p.quantity} {p.unit}
                      </td>
                      <td className="table-td text-right text-xs tabular-nums">
                        {formatINR(p.unitPrice)}
                      </td>
                      <td className="table-td text-right text-xs font-medium tabular-nums">
                        {formatINR(p.totalPrice)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function VendorsTab({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const vendors = useStore((s) => s.vendors);
  const vendorLedger = useStore((s) => s.vendorLedger);
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Vendors</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="table-th">Vendor</th>
              <th className="table-th">Category</th>
              <th className="table-th text-right">YTD spend</th>
              <th className="table-th text-right">Invoices</th>
              <th className="table-th text-right">Avg invoice</th>
              <th className="table-th">Last order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {vendors.map((v) => {
              const entries = vendorLedger.filter((e) => e.vendorId === v.id);
              const ytd = entries
                .filter((e) => new Date(e.invoiceDate).getTime() >= yearStart)
                .reduce((s, e) => s + e.totalAmount, 0);
              const sorted = [...entries].sort(
                (a, b) =>
                  new Date(b.invoiceDate).getTime() -
                  new Date(a.invoiceDate).getTime()
              );
              const last = sorted[0];
              const avg = entries.length
                ? entries.reduce((s, e) => s + e.totalAmount, 0) / entries.length
                : 0;
              return (
                <tr
                  key={v.id}
                  className={
                    'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 ' +
                    (selected === v.id ? 'bg-brand-50/40 dark:bg-brand-900/20' : '')
                  }
                  onClick={() => onSelect(v.id)}
                >
                  <td className="table-td font-medium">{v.name}</td>
                  <td className="table-td text-xs">{v.category}</td>
                  <td className="table-td text-right tabular-nums">
                    {formatINR(ytd)}
                  </td>
                  <td className="table-td text-right tabular-nums">
                    {entries.length}
                  </td>
                  <td className="table-td text-right tabular-nums">
                    {entries.length ? formatINR(avg) : '—'}
                  </td>
                  <td className="table-td text-xs text-slate-500 dark:text-slate-400">
                    {last ? formatDate(last.invoiceDate) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VendorDrawer({
  vendorId,
  onClose,
}: {
  vendorId: string;
  onClose: () => void;
}) {
  const vendors = useStore((s) => s.vendors);
  const vendorLedger = useStore((s) => s.vendorLedger);
  const priceHistory = useStore((s) => s.priceHistory);

  const vendor = vendors.find((v) => v.id === vendorId);
  if (!vendor) return null;

  const entries = [...vendorLedger]
    .filter((e) => e.vendorId === vendor.id)
    .sort(
      (a, b) =>
        new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()
    );

  // Items supplied with avg prices
  const itemMap = new Map<string, { qty: number; total: number; count: number }>();
  for (const p of priceHistory) {
    if (p.vendorId !== vendor.id) continue;
    const existing = itemMap.get(p.itemName) ?? {
      qty: 0,
      total: 0,
      count: 0,
    };
    existing.qty += p.quantity;
    existing.total += p.totalPrice;
    existing.count += 1;
    itemMap.set(p.itemName, existing);
  }

  return (
    <section className="card border border-brand-200 dark:border-brand-800 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{vendor.name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {vendor.category} · {entries.length} invoice
            {entries.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Ledger
          </div>
          <div className="max-h-72 overflow-y-auto">
            {entries.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">No invoices yet.</div>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {entries.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between rounded border border-slate-100 dark:border-slate-800 px-2 py-1.5"
                  >
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {e.invoiceNumber || 'No #'} · {formatDate(e.invoiceDate)}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {e.itemName ?? '—'}{' '}
                        {e.quantity != null
                          ? `· ${e.quantity} ${e.unit ?? ''}`
                          : ''}
                      </div>
                    </div>
                    <div className="font-semibold tabular-nums">
                      {formatINR(e.totalAmount)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Items supplied
          </div>
          {itemMap.size === 0 ? (
            <div className="text-xs text-slate-500 dark:text-slate-400">No items recorded.</div>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {Array.from(itemMap.entries()).map(([name, agg]) => (
                <li key={name} className="flex justify-between">
                  <span className="text-slate-700 dark:text-slate-200">{name}</span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">
                    avg {formatINR(agg.total / Math.max(1, agg.qty))}/unit · {agg.count}x
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function MonthlyTab() {
  const vendorLedger = useStore((s) => s.vendorLedger);
  const data = useMemoStable(() => {
    // 6 month buckets, oldest -> newest for chart left->right.
    const now = new Date();
    const buckets: Record<string, Record<InvoiceType, number>> = {};
    const orderedKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      orderedKeys.push(k);
      buckets[k] = {
        'raw-material': 0,
        utility: 0,
        rent: 0,
        packaging: 0,
        marketing: 0,
        housekeeping: 0,
        other: 0,
      };
    }
    for (const e of vendorLedger) {
      const k = monthKey(e.invoiceDate);
      if (!buckets[k]) continue;
      buckets[k][e.invoiceType ?? 'other'] += e.totalAmount;
    }
    return orderedKeys.map((k) => ({
      label: monthLabel(k),
      segments: (
        Object.keys(INVOICE_TYPE_COLOR) as InvoiceType[]
      )
        .filter((t) => buckets[k][t] > 0)
        .map((t) => ({
          key: t,
          value: buckets[k][t],
          color: INVOICE_TYPE_COLOR[t],
        })),
    }));
  }, [vendorLedger]);

  const totalAll = data.reduce(
    (s, d) => s + (d.segments?.reduce((a, b) => a + b.value, 0) ?? 0),
    0
  );

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Monthly procurement spend</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          6-month total · {formatINR(totalAll)}
        </span>
      </div>
      <div className="mt-3">
        <BarChart data={data} formatValue={(v) => `₹${Math.round(v / 1000)}k`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {(Object.keys(INVOICE_TYPE_COLOR) as InvoiceType[]).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded"
              style={{ backgroundColor: INVOICE_TYPE_COLOR[t] }}
            />
            <span className="text-slate-600 dark:text-slate-300">{t}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

// Tiny wrapper so dev tools show useful names — equivalent to useMemo.
function useMemoStable<T>(factory: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, deps);
}
