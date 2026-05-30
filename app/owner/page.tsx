'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Boxes,
  Receipt,
  ClipboardList,
  FileWarning,
  Activity,
  TrendingUp,
  Truck,
  Brain,
  Wallet,
  Trash2,
} from 'lucide-react';
import { KpiCard } from '@/components/KpiCard';
import { StatusBadge } from '@/components/StatusBadge';
import { LineChart } from '@/components/charts/LineChart';
import {
  useStore,
  PO_APPROVAL_THRESHOLD,
  formatINR,
  formatDate,
  formatDateTime,
  daysUntil,
  todayKey,
} from '@/lib/store';
import { useMounted } from '@/lib/useMounted';

export default function OwnerPage() {
  const mounted = useMounted();
  const pos = useStore((s) => s.pos);
  const inventory = useStore((s) => s.inventory);
  const expenses = useStore((s) => s.expenses);
  const requests = useStore((s) => s.requests);
  const journal = useStore((s) => s.journal);
  const documents = useStore((s) => s.documents);
  const vendors = useStore((s) => s.vendors);
  const vendorLedger = useStore((s) => s.vendorLedger);
  const priceHistory = useStore((s) => s.priceHistory);
  const lastReorderPrediction = useStore((s) => s.lastReorderPrediction);
  const revenue = useStore((s) => s.revenue);
  const addRevenue = useStore((s) => s.addRevenue);
  const deleteRevenue = useStore((s) => s.deleteRevenue);
  const approvePO = useStore((s) => s.approvePO);
  const rejectPO = useStore((s) => s.rejectPO);

  const [revDate, setRevDate] = useState<string>(todayKey());
  const [revAmount, setRevAmount] = useState('');
  const [revNotes, setRevNotes] = useState('');
  const [revError, setRevError] = useState<string | null>(null);

  const reorderAlertsCount = useMemo(() => {
    if (!lastReorderPrediction) return 0;
    return lastReorderPrediction.result.items.filter(
      (it) => it.urgency === 'critical' || it.urgency === 'high'
    ).length;
  }, [lastReorderPrediction]);

  const pendingPOs = useMemo(
    () => pos.filter((p) => p.status === 'pending-approval' && p.totalValue >= PO_APPROVAL_THRESHOLD),
    [pos]
  );
  const lowStock = useMemo(
    () => inventory.filter((i) => i.quantity <= i.reorderLevel),
    [inventory]
  );
  const todaysExpenses = useMemo(() => {
    const key = todayKey();
    return expenses.filter((e) => e.date.slice(0, 10) === key);
  }, [expenses]);
  const openRequests = useMemo(
    () => requests.filter((r) => r.status !== 'delivered'),
    [requests]
  );
  const todaysJournal = useMemo(() => {
    const key = todayKey();
    return journal.filter((j) => j.timestamp.slice(0, 10) === key);
  }, [journal]);
  const expiring = useMemo(
    () => documents.filter((d) => daysUntil(d.expiryDate) <= 30),
    [documents]
  );

  const thisMonthSpend = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return vendorLedger
      .filter((e) => new Date(e.invoiceDate).getTime() >= start)
      .reduce((s, e) => s + e.totalAmount, 0);
  }, [vendorLedger]);

  const priceAlerts = useMemo(() => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const byItem = new Map<string, number[]>();
    for (const p of priceHistory) {
      const name = p.itemName.toLowerCase();
      if (!byItem.has(name)) byItem.set(name, []);
      byItem.get(name)!.push(p.unitPrice);
    }
    let count = 0;
    for (const p of priceHistory) {
      if (new Date(p.date).getTime() < cutoff) continue;
      const all = byItem.get(p.itemName.toLowerCase()) ?? [];
      if (all.length < 2) continue;
      const avg = all.reduce((s, n) => s + n, 0) / all.length;
      if (avg > 0 && p.unitPrice > avg * 1.1) count += 1;
    }
    return count;
  }, [priceHistory]);

  // Monday-start week key: returns YYYY-MM-DD for the Monday of the given date.
  const weekKeyFor = (d: Date): string => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay(); // 0 = Sun, 1 = Mon, ...
    const offset = day === 0 ? -6 : 1 - day; // shift back to Monday
    x.setDate(x.getDate() + offset);
    return x.toISOString().slice(0, 10);
  };

  const thisWeekStart = useMemo(() => weekKeyFor(new Date()), []);

  const weeklyRevenueSeries = useMemo(() => {
    // Last 12 weeks, Monday-start, in chronological order.
    const buckets: { key: string; label: string; value: number }[] = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i * 7);
      const key = weekKeyFor(d);
      const label = new Date(key).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
      });
      buckets.push({ key, label, value: 0 });
    }
    const indexByKey = new Map(buckets.map((b, i) => [b.key, i]));
    for (const r of revenue) {
      const wk = weekKeyFor(new Date(r.date));
      const idx = indexByKey.get(wk);
      if (idx !== undefined) buckets[idx].value += r.amount;
    }
    return buckets;
  }, [revenue]);

  const thisWeekRevenue = useMemo(
    () =>
      revenue
        .filter((r) => weekKeyFor(new Date(r.date)) === thisWeekStart)
        .reduce((s, r) => s + r.amount, 0),
    [revenue, thisWeekStart]
  );

  const thisWeekExpenses = useMemo(
    () =>
      expenses
        .filter((e) => weekKeyFor(new Date(e.date)) === thisWeekStart)
        .reduce((s, e) => s + e.amount, 0),
    [expenses, thisWeekStart]
  );

  const thisWeekDelta = thisWeekRevenue - thisWeekExpenses;

  const submitRevenue = (e: React.FormEvent) => {
    e.preventDefault();
    setRevError(null);
    const amt = Number(revAmount);
    if (!revDate) {
      setRevError('Pick a date.');
      return;
    }
    if (!amt || amt <= 0) {
      setRevError('Amount must be a positive number.');
      return;
    }
    addRevenue({
      date: revDate,
      amount: amt,
      notes: revNotes.trim() || undefined,
      source: 'manual',
    });
    setRevAmount('');
    setRevNotes('');
  };

  const recentRevenueEntries = useMemo(
    () =>
      [...revenue]
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 5),
    [revenue]
  );

  const recentActivity = useMemo(() => {
    const items: { id: string; when: string; text: string }[] = [];
    pos.slice(-5).forEach((p) =>
      items.push({
        id: 'a-po-' + p.id,
        when: p.approvedAt ?? p.raisedAt,
        text: `PO ${p.id.slice(0, 8)} — ${p.status.replace('-', ' ')} (${formatINR(p.totalValue)})`,
      })
    );
    requests.slice(-5).forEach((r) =>
      items.push({
        id: 'a-req-' + r.id,
        when: r.raisedAt,
        text: `Request: ${r.quantity} ${r.unit} ${r.itemName} — ${r.status}`,
      })
    );
    return items.sort((a, b) => (a.when < b.when ? 1 : -1)).slice(0, 6);
  }, [pos, requests]);

  if (!mounted) return null;

  const totalExpenseToday = todaysExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Good morning, Boss</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Here’s the brief for today.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Pending Approvals"
          value={pendingPOs.length}
          icon={ClipboardList}
          tone={pendingPOs.length ? 'warn' : 'default'}
          hint="POs over ₹10,000"
        />
        <KpiCard
          label="Low Stock Items"
          value={lowStock.length}
          icon={Boxes}
          tone={lowStock.length ? 'danger' : 'success'}
          hint="At or below reorder level"
        />
        <KpiCard
          label="Today’s Expenses"
          value={formatINR(totalExpenseToday)}
          icon={Receipt}
          hint={`${todaysExpenses.length} entries`}
        />
        <KpiCard
          label="Open Procurement"
          value={openRequests.length}
          icon={Activity}
          tone="default"
          hint="Active requests"
        />
        <KpiCard
          label="This month spend"
          value={formatINR(thisMonthSpend)}
          icon={Truck}
          tone="default"
          hint="Procurement to date"
        />
        <KpiCard
          label="Price trend alerts"
          value={priceAlerts}
          icon={TrendingUp}
          tone={priceAlerts ? 'warn' : 'success'}
          hint="Items >10% above 3-mo avg"
        />
        <Link
          href="/inventory#reorder-suggestions"
          className="rounded-xl outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="View AI reorder suggestions"
        >
          <KpiCard
            label="Reorder alerts"
            value={reorderAlertsCount}
            icon={Brain}
            tone={reorderAlertsCount ? 'danger' : 'default'}
            hint={
              lastReorderPrediction
                ? 'Critical + high urgency items'
                : 'Run AI analysis from Inventory'
            }
          />
        </Link>
        <KpiCard
          label="Revenue vs Expenses (week)"
          value={`${thisWeekDelta >= 0 ? '+' : '-'}${formatINR(Math.abs(thisWeekDelta))}`}
          icon={Wallet}
          tone={thisWeekDelta >= 0 ? 'success' : 'danger'}
          hint={`Revenue ${formatINR(thisWeekRevenue)} − Expenses ${formatINR(thisWeekExpenses)}`}
        />
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pending PO approvals</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Purchase orders above ₹10,000 require your sign-off.</p>
          </div>
        </div>
        {pendingPOs.length === 0 ? (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">No POs awaiting approval.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="table-th">PO</th>
                  <th className="table-th">Vendor</th>
                  <th className="table-th">Items</th>
                  <th className="table-th">Value</th>
                  <th className="table-th">Raised</th>
                  <th className="table-th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pendingPOs.map((po) => {
                  const vendor = vendors.find((v) => v.id === po.vendorId);
                  return (
                    <tr key={po.id}>
                      <td className="table-td font-mono text-xs">{po.id}</td>
                      <td className="table-td">{vendor?.name ?? po.vendorId}</td>
                      <td className="table-td">
                        {po.items.map((it) => `${it.quantity} ${it.unit} ${it.itemName}`).join(', ')}
                      </td>
                      <td className="table-td font-semibold">{formatINR(po.totalValue)}</td>
                      <td className="table-td text-xs text-slate-500 dark:text-slate-400">{formatDateTime(po.raisedAt)}</td>
                      <td className="table-td text-right">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => approvePO(po.id, 'Owner')}
                            className="btn btn-primary text-xs"
                          >
                            <CheckCircle2 className="h-4 w-4" /> Approve
                          </button>
                          <button onClick={() => rejectPO(po.id)} className="btn btn-danger text-xs">
                            <XCircle className="h-4 w-4" /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Today’s chef journal</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Prep, batch, marination & wastage from the kitchen.</p>
          <ul className="mt-3 space-y-2">
            {todaysJournal.length === 0 ? (
              <li className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">Nothing logged yet today.</li>
            ) : (
              todaysJournal.map((j) => (
                <li key={j.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={j.type} />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(j.timestamp)}</span>
                  </div>
                  <div className="mt-1 text-slate-700 dark:text-slate-200">{j.description}</div>
                  {j.itemName ? (
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {j.itemName} {j.quantity ? `· ${j.quantity}` : null}
                    </div>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Document expiry alerts</h2>
            <FileWarning className="h-4 w-4 text-amber-600 dark:text-amber-300" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Anything expiring in the next 30 days.</p>
          <ul className="mt-3 space-y-2">
            {expiring.length === 0 ? (
              <li className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">All documents healthy.</li>
            ) : (
              expiring.map((d) => {
                const days = daysUntil(d.expiryDate);
                const expired = days < 0;
                return (
                  <li
                    key={d.id}
                    className={
                      'flex items-center justify-between rounded-lg border p-3 text-sm ' +
                      (expired
                        ? 'border-rose-200 bg-rose-50'
                        : 'border-amber-200 bg-amber-50')
                    }
                  >
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{d.name}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">{d.category}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-medium">
                        {d.expiryDate ? formatDate(d.expiryDate) : '—'}
                      </div>
                      <div className={expired ? 'text-rose-700' : 'text-amber-700'}>
                        {expired ? `Expired ${Math.abs(days)}d ago` : `In ${days}d`}
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Revenue
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Manual entry — POS integration coming later
          </span>
        </div>
        {revError ? (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
            {revError}
          </div>
        ) : null}
        <form
          onSubmit={submitRevenue}
          className="grid gap-3 sm:grid-cols-5 items-end"
        >
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={revDate}
              onChange={(e) => setRevDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Amount (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              className="input"
              value={revAmount}
              onChange={(e) => setRevAmount(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes (optional)</label>
            <input
              className="input"
              value={revNotes}
              onChange={(e) => setRevNotes(e.target.value)}
              placeholder="Dine-in, takeaway split, event..."
            />
          </div>
          <div>
            <button type="submit" className="btn btn-primary w-full">
              Add revenue
            </button>
          </div>
        </form>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Last 12 weeks
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Mon-Sun totals
            </span>
          </div>
          {revenue.length === 0 ? (
            <div className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
              No revenue logged yet. Add entries above to see the trend.
            </div>
          ) : (
            <LineChart
              data={weeklyRevenueSeries.map((b) => ({
                label: b.label,
                value: b.value,
              }))}
              yLabel="₹"
              color="#10b981"
              height={200}
            />
          )}
        </div>

        {recentRevenueEntries.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Recent entries
            </h3>
            <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {recentRevenueEntries.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {formatINR(r.amount)}{' '}
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        · {formatDate(r.date)}
                      </span>
                    </div>
                    {r.notes ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {r.notes}
                      </div>
                    ) : null}
                  </div>
                  <button
                    onClick={() => deleteRevenue(r.id)}
                    className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline dark:text-rose-400"
                    title="Delete entry"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="card p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent activity</h2>
        </div>
        <ul className="mt-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {recentActivity.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2">
              <span className="text-slate-700 dark:text-slate-200">{a.text}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(a.when)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
