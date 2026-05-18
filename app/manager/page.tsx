'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Receipt,
  Users,
  ClipboardList,
  Paperclip,
  Upload,
  Loader2,
} from 'lucide-react';
import { KpiCard } from '@/components/KpiCard';
import { useStore, formatINR, formatDate, todayKey } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import {
  saveFile,
  getFileUrl,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/fileStorage';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { VoiceFormDictation } from '@/components/VoiceFormDictation';

interface ParsedExpense {
  category?: string;
  amount?: number;
  vendor?: string;
  notes?: string;
  date?: string;
}
interface ParsedAttendance {
  staffName?: string;
  present?: boolean;
}

const MANAGER = 'Restaurant Manager';

export default function ManagerPage() {
  const mounted = useMounted();
  const expenses = useStore((s) => s.expenses);
  const staff = useStore((s) => s.staff);
  const documents = useStore((s) => s.documents);
  const addExpense = useStore((s) => s.addExpense);
  const addDocument = useStore((s) => s.addDocument);
  const attachBillToExpense = useStore((s) => s.attachBillToExpense);
  const toggleAttendance = useStore((s) => s.toggleAttendance);

  const [category, setCategory] = useState('Utilities');
  const [amount, setAmount] = useState('');
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [bill, setBill] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const billInputRef = useRef<HTMLInputElement>(null);

  // Salary slip upload state — keyed by staffId
  const [slipBusy, setSlipBusy] = useState<string | null>(null);
  const [slipError, setSlipError] = useState<string | null>(null);
  const slipInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  // Track object URLs so we can revoke on unmount
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, []);

  const today = todayKey();
  const todaysExpenses = useMemo(
    () => expenses.filter((e) => e.date.slice(0, 10) === today),
    [expenses, today]
  );
  const total = todaysExpenses.reduce((s, e) => s + e.amount, 0);
  const presentCount = staff.filter((s) => s.attendance[today]).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const a = Number(amount);
    if (!a || a <= 0) return;
    if (bill && bill.size > MAX_FILE_SIZE_BYTES) {
      setError(`Bill is ${formatFileSize(bill.size)} — must be under 25 MB.`);
      return;
    }
    setBusy(true);
    try {
      // addExpense prepends to the list with its own generated id; grab it
      // back from the store so we can link the bill document to it.
      addExpense({
        category,
        amount: a,
        vendor: vendor.trim(),
        notes: notes.trim(),
        loggedBy: MANAGER,
      });
      const created = useStore.getState().expenses[0];
      if (bill && created) {
        const fileId = await saveFile(bill);
        const docId = addDocument({
          name: `Bill — ${created.vendor || created.category}`,
          category: 'Bill',
          fileId,
          fileName: bill.name,
          fileType: bill.type || 'application/octet-stream',
          fileSize: bill.size,
          linkedTo: { type: 'expense', id: created.id },
        });
        attachBillToExpense(created.id, docId);
      }
      setAmount('');
      setVendor('');
      setNotes('');
      setBill(null);
      if (billInputRef.current) billInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense.');
    } finally {
      setBusy(false);
    }
  };

  const viewDocument = async (documentId: string) => {
    const doc = documents.find((d) => d.id === documentId);
    if (!doc?.fileId) return;
    const url = await getFileUrl(doc.fileId);
    if (!url) return;
    objectUrlsRef.current.push(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const uploadSalarySlip = async (staffId: string, file: File) => {
    setSlipError(null);
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setSlipError(
        `Salary slip is ${formatFileSize(file.size)} — must be under 25 MB.`
      );
      return;
    }
    setSlipBusy(staffId);
    try {
      const fileId = await saveFile(file);
      const member = staff.find((s) => s.id === staffId);
      addDocument({
        name: `Salary Slip — ${member?.name ?? staffId} — ${formatDate(
          new Date().toISOString()
        )}`,
        category: 'Salary Slip',
        fileId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        linkedTo: { type: 'staff', id: staffId },
      });
    } catch (err) {
      setSlipError(
        err instanceof Error ? err.message : 'Failed to upload salary slip.'
      );
    } finally {
      setSlipBusy(null);
      const input = slipInputsRef.current[staffId];
      if (input) input.value = '';
    }
  };

  const latestSlipFor = (staffId: string) =>
    documents
      .filter(
        (d) =>
          d.category === 'Salary Slip' &&
          d.linkedTo?.type === 'staff' &&
          d.linkedTo.id === staffId &&
          !!d.fileId
      )
      .sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      )[0];

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
        {error ? (
          <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <VoiceFormDictation<ParsedExpense>
          formType="expense"
          onParsed={(d) => {
            if (d.category) setCategory(d.category);
            if (d.amount != null) setAmount(String(d.amount));
            if (d.vendor) setVendor(d.vendor);
            if (d.notes) setNotes(d.notes);
          }}
          className="mt-3"
        />
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
            <div className="flex items-center gap-2">
              <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} />
              <VoiceInputButton onTranscript={(t) => setVendor(t)} mode="replace" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <div className="flex items-center gap-2">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <VoiceInputButton onTranscript={(t) => setNotes(t)} mode="replace" />
            </div>
          </div>
          <div className="sm:col-span-4">
            <label className="label">Attach bill (optional)</label>
            <input
              ref={billInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setBill(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            {bill ? (
              <div className="mt-1 text-xs text-slate-500">
                {bill.name} · {formatFileSize(bill.size)}
              </div>
            ) : null}
          </div>
          <div className="sm:col-span-4">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                'Add expense'
              )}
            </button>
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
                      <td className="table-td text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          <span>{e.notes || '—'}</span>
                          {e.billDocumentId ? (
                            <button
                              type="button"
                              onClick={() => viewDocument(e.billDocumentId as string)}
                              className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                              title="View attached bill"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                              bill
                            </button>
                          ) : null}
                        </div>
                      </td>
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
          <VoiceFormDictation<ParsedAttendance>
            formType="attendance"
            label='Dictate (e.g. "mark Rahul present")'
            onParsed={(d) => {
              if (!d.staffName) return;
              const lower = d.staffName.toLowerCase();
              const member = staff.find((m) =>
                m.name.toLowerCase().includes(lower)
              );
              if (!member) {
                setSlipError(`No staff matched "${d.staffName}"`);
                return;
              }
              const current = !!member.attendance[today];
              if (d.present === undefined || current !== d.present) {
                toggleAttendance(member.id, today);
              }
            }}
            className="mt-3"
          />
          {slipError ? (
            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700">
              {slipError}
            </div>
          ) : null}
          <ul className="mt-3 divide-y divide-slate-100">
            {staff.map((s) => {
              const present = !!s.attendance[today];
              const slip = latestSlipFor(s.id);
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <div className="font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.role}</div>
                    {slip ? (
                      <button
                        type="button"
                        onClick={() => viewDocument(slip.id)}
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                      >
                        <Paperclip className="h-3 w-3" /> View latest slip
                      </button>
                    ) : (
                      <div className="text-xs text-slate-400">No slip uploaded</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      className="btn btn-secondary cursor-pointer text-xs"
                      title="Upload salary slip"
                    >
                      {slipBusy === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      Slip
                      <input
                        ref={(el) => {
                          slipInputsRef.current[s.id] = el;
                        }}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadSalarySlip(s.id, f);
                        }}
                      />
                    </label>
                    <button
                      onClick={() => toggleAttendance(s.id, today)}
                      className={
                        'btn text-xs ' + (present ? 'btn-primary' : 'btn-secondary')
                      }
                    >
                      {present ? 'Present' : 'Absent'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
