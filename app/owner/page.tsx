'use client';

import { useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Boxes,
  Receipt,
  ClipboardList,
  FileWarning,
  Activity,
} from 'lucide-react';
import { KpiCard } from '@/components/KpiCard';
import { StatusBadge } from '@/components/StatusBadge';
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
  const approvePO = useStore((s) => s.approvePO);
  const rejectPO = useStore((s) => s.rejectPO);

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
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">Good morning, Boss</h1>
        <p className="text-sm text-slate-600">Here’s the brief for today.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Pending PO approvals</h2>
            <p className="text-xs text-slate-500">Purchase orders above ₹10,000 require your sign-off.</p>
          </div>
        </div>
        {pendingPOs.length === 0 ? (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No POs awaiting approval.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="table-th">PO</th>
                  <th className="table-th">Vendor</th>
                  <th className="table-th">Items</th>
                  <th className="table-th">Value</th>
                  <th className="table-th">Raised</th>
                  <th className="table-th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
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
                      <td className="table-td text-xs text-slate-500">{formatDateTime(po.raisedAt)}</td>
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
          <h2 className="text-lg font-semibold text-slate-900">Today’s chef journal</h2>
          <p className="text-xs text-slate-500">Prep, batch, marination & wastage from the kitchen.</p>
          <ul className="mt-3 space-y-2">
            {todaysJournal.length === 0 ? (
              <li className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Nothing logged yet today.</li>
            ) : (
              todaysJournal.map((j) => (
                <li key={j.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={j.type} />
                    <span className="text-xs text-slate-500">{formatDateTime(j.timestamp)}</span>
                  </div>
                  <div className="mt-1 text-slate-700">{j.description}</div>
                  {j.itemName ? (
                    <div className="mt-0.5 text-xs text-slate-500">
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
            <h2 className="text-lg font-semibold text-slate-900">Document expiry alerts</h2>
            <FileWarning className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-xs text-slate-500">Anything expiring in the next 30 days.</p>
          <ul className="mt-3 space-y-2">
            {expiring.length === 0 ? (
              <li className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">All documents healthy.</li>
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
                      <div className="font-medium text-slate-900">{d.name}</div>
                      <div className="text-xs text-slate-600">{d.category}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-medium">{formatDate(d.expiryDate)}</div>
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
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
        </div>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {recentActivity.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2">
              <span className="text-slate-700">{a.text}</span>
              <span className="text-xs text-slate-500">{formatDateTime(a.when)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
