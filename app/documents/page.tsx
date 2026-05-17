'use client';

import { useState } from 'react';
import { FilePlus, FileText, AlertTriangle } from 'lucide-react';
import { useStore, formatDate, daysUntil } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import type { DocumentCategory } from '@/lib/types';
import clsx from 'clsx';

export default function DocumentsPage() {
  const mounted = useMounted();
  const documents = useStore((s) => s.documents);
  const addDocument = useStore((s) => s.addDocument);
  const role = useStore((s) => s.role);

  const canUpload = role === 'owner' || role === 'store-manager' || role === 'manager';

  const [name, setName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('License');
  const [expiry, setExpiry] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [showForm, setShowForm] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !expiry) return;
    addDocument({
      name: name.trim(),
      category,
      expiryDate: new Date(expiry).toISOString(),
      fileUrl: fileUrl.trim() || '#mock-file.pdf',
    });
    setName('');
    setExpiry('');
    setFileUrl('');
    setShowForm(false);
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Document vault</h1>
          <p className="text-sm text-slate-600">Licenses, agreements, invoices and salary slips — with expiry alerts.</p>
        </div>
        {canUpload ? (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            <FilePlus className="h-4 w-4" /> {showForm ? 'Close' : 'Upload document'}
          </button>
        ) : null}
      </header>

      {showForm && canUpload ? (
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900">Upload document</h2>
          <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GST Certificate" />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
                <option value="License">License</option>
                <option value="Agreement">Agreement</option>
                <option value="Invoice">Invoice</option>
                <option value="Salary Slip">Salary Slip</option>
              </select>
            </div>
            <div>
              <label className="label">Expiry date</label>
              <input className="input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">File URL (mock)</label>
              <input className="input" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="#mock-file.pdf" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card p-5">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-th">Name</th>
                <th className="table-th">Category</th>
                <th className="table-th">Expiry</th>
                <th className="table-th">Status</th>
                <th className="table-th text-right">File</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((d) => {
                const days = daysUntil(d.expiryDate);
                const expired = days < 0;
                const soon = !expired && days <= 30;
                return (
                  <tr key={d.id} className={clsx(expired && 'bg-rose-50/60', soon && 'bg-amber-50/60')}>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <span className="font-medium">{d.name}</span>
                      </div>
                    </td>
                    <td className="table-td">{d.category}</td>
                    <td className="table-td">{formatDate(d.expiryDate)}</td>
                    <td className="table-td">
                      {expired ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                          <AlertTriangle className="h-3 w-3" /> Expired {Math.abs(days)}d ago
                        </span>
                      ) : soon ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                          <AlertTriangle className="h-3 w-3" /> In {days}d
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                          OK · {days}d
                        </span>
                      )}
                    </td>
                    <td className="table-td text-right">
                      <a className="text-xs font-medium text-brand-700 hover:underline" href={d.fileUrl}>
                        View
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
