'use client';

import { useMemo, useState } from 'react';
import { Receipt, Users, ClipboardList } from 'lucide-react';
import { KpiCard } from '@/components/KpiCard';
import { useStore, formatINR, formatDate, todayKey } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';

const MANAGER = 'Restaurant Manager';

export default function ManagerPage() {
  const mounted = useMounted();
  const expenses = useStore((s) => s.expenses);
  const staff = useStore((s) => s.staff);
  const addExpense = useStore((s) => s.addExpense);
  const toggleAttendance = useStore((s) => s.toggleAttendance);

  const [category, setCategory] = useState('Utilities');
  const [amount, setAmount] = useState('');
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');

  const today = todayKey();
  const todaysExpenses = useMemo(
    () => expenses.filter((e) => e.date.slice(0, 10) === today),
    [expenses, today]
  );
  const total = todaysExpenses.reduce((s, e) => s + e.amount, 0);
  const presentCount = staff.filter((s) => s.attendance[today]).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const a = Number(amount);
    if (!a || a <= 0) return;
    addExpense({
      category,
      amount: a,
      vendor: vendor.trim(),
      notes: notes.trim(),
      loggedBy: MANAGER,
    });
    setAmount('');
    setVendor('');
    setNotes('');
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Manager Dashboard</h1>
        <p className="text-sm text-slate-600">Track daily expenses and staff attendance.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Today’s expenses" value={formatINR(total)} icon={Receipt} hint={`${todaysExpenses.length} entries`} />
        <KpiCard
          label="Staff present"
          value={`${presentCount} / ${staff.length}`}
          icon={Users}
          tone={presentCount === staff.length ? 'success' : 'warn'}
        />
        <KpiCard label="Date" value={formatDate(new Date().toISOString())} icon={ClipboardList} />
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-slate-900">Log expense</h2>
        <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-4">
          <div>
            <label className="label">Category</label>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>Utilities</option>
              <option>Repairs</option>
              <option>Cleaning</option>
              <option>Marketing</option>
              <option>Staff</option>
              <option>Misc</option>
            </select>
          </div>
          <div>
            <label className="label">Amount (₹)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Vendor</label>
            <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="sm:col-span-4">
            <button type="submit" className="btn btn-primary">Add expense</button>
          </div>
        </form>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900">Today’s expenses</h2>
          {todaysExpenses.length === 0 ? (
            <div className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No expenses logged today.</div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="table-th">Category</th>
                    <th className="table-th">Vendor</th>
                    <th className="table-th">Notes</th>
                    <th className="table-th text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todaysExpenses.map((e) => (
                    <tr key={e.id}>
                      <td className="table-td">{e.category}</td>
                      <td className="table-td">{e.vendor || '—'}</td>
                      <td className="table-td text-xs text-slate-500">{e.notes || '—'}</td>
                      <td className="table-td text-right font-semibold">{formatINR(e.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50">
                    <td className="table-td font-semibold" colSpan={3}>
                      Total
                    </td>
                    <td className="table-td text-right font-semibold">{formatINR(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900">Staff attendance — {formatDate(new Date().toISOString())}</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {staff.map((s) => {
              const present = !!s.attendance[today];
              return (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.role}</div>
                  </div>
                  <button
                    onClick={() => toggleAttendance(s.id, today)}
                    className={
                      'btn text-xs ' + (present ? 'btn-primary' : 'btn-secondary')
                    }
                  >
                    {present ? 'Present' : 'Absent'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
