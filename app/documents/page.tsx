'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FilePlus,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  AlertTriangle,
  Download,
  Trash2,
  Eye,
  Loader2,
} from 'lucide-react';
import { useStore, formatDate, daysUntil } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import type { DocumentCategory, DocumentRecord } from '@/lib/types';
import {
  saveFile,
  getFileUrl,
  triggerDownload,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/fileStorage';
import clsx from 'clsx';

const CATEGORIES: DocumentCategory[] = [
  'License',
  'Agreement',
  'Invoice',
  'Bill',
  'Salary Slip',
  'Other',
];

const EXPIRY_REQUIRED: DocumentCategory[] = ['License', 'Agreement'];

function fileIconFor(type: string | undefined) {
  if (!type) return FileIcon;
  if (type.startsWith('image/')) return ImageIcon;
  if (type === 'application/pdf') return FileText;
  return FileIcon;
}

export default function DocumentsPage() {
  const mounted = useMounted();
  const documents = useStore((s) => s.documents);
  const addDocument = useStore((s) => s.addDocument);
  const deleteDocument = useStore((s) => s.deleteDocument);
  const role = useStore((s) => s.role);

  const canUpload =
    role === 'owner' || role === 'store-manager' || role === 'manager';

  const [name, setName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('License');
  const [expiry, setExpiry] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tracks object URLs we've handed out so we can revoke on unmount.
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, []);

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const oversized = arr.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      setError(
        `"${oversized.name}" is ${formatFileSize(oversized.size)} — files must be under 25 MB.`
      );
      return;
    }
    setError(null);
    setFiles(arr);
    // Default the document name to the first file's name (without extension) if blank
    if (!name && arr[0]) {
      const base = arr[0].name.replace(/\.[^.]+$/, '');
      setName(base);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    pickFiles(e.dataTransfer.files);
  };

  const resetForm = () => {
    setName('');
    setExpiry('');
    setNotes('');
    setFiles([]);
    setCategory('License');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!name.trim()) {
      setError('Please enter a name for the document.');
      return;
    }
    if (EXPIRY_REQUIRED.includes(category) && !expiry) {
      setError(`Expiry date is required for category "${category}".`);
      return;
    }
    if (files.length === 0) {
      setError('Please select at least one file to upload.');
      return;
    }
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const fileId = await saveFile(f);
        const docName =
          files.length === 1
            ? name.trim()
            : `${name.trim()} (${i + 1}/${files.length})`;
        addDocument({
          name: docName,
          category,
          expiryDate: expiry ? new Date(expiry).toISOString() : undefined,
          fileId,
          fileName: f.name,
          fileType: f.type || 'application/octet-stream',
          fileSize: f.size,
          notes: notes.trim() || undefined,
        });
      }
      setSuccess(
        files.length === 1
          ? 'Document uploaded successfully.'
          : `${files.length} documents uploaded successfully.`
      );
      resetForm();
      setShowForm(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (doc: DocumentRecord) => {
    if (!doc.fileId) return;
    const url = await getFileUrl(doc.fileId);
    if (!url) {
      setError('File not found in local storage.');
      return;
    }
    objectUrlsRef.current.push(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = async (doc: DocumentRecord) => {
    if (!doc.fileId) return;
    try {
      await triggerDownload(doc.fileId, doc.fileName ?? doc.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    }
  };

  const handleDelete = async (doc: DocumentRecord) => {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    try {
      await deleteDocument(doc.id);
      setSuccess(`Deleted "${doc.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Document vault</h1>
          <p className="text-sm text-slate-600">
            Licenses, agreements, bills, invoices and salary slips — stored
            locally in your browser.
          </p>
        </div>
        {canUpload ? (
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowForm((v) => !v);
              setError(null);
              setSuccess(null);
            }}
          >
            <FilePlus className="h-4 w-4" /> {showForm ? 'Close' : 'Upload document'}
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {showForm && canUpload ? (
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900">Upload document</h2>
          <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. GST Certificate"
              />
            </div>
            <div>
              <label className="label">Category</label>
              <select
                className="select"
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                Expiry date{' '}
                {EXPIRY_REQUIRED.includes(category) ? (
                  <span className="text-rose-600">*</span>
                ) : (
                  <span className="text-slate-400">(optional)</span>
                )}
              </label>
              <input
                className="input"
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes (optional)</label>
              <input
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything worth remembering"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">File(s)</label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={clsx(
                  'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-6 text-center text-sm transition',
                  dragOver
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-300 bg-slate-50 text-slate-600 hover:border-brand-400'
                )}
              >
                <FilePlus className="h-6 w-6 text-slate-400" />
                <div>
                  <span className="font-medium text-brand-700">Click to browse</span>{' '}
                  or drag and drop files here
                </div>
                <div className="text-xs text-slate-500">
                  PDF or images, up to 25 MB each
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => pickFiles(e.target.files)}
                />
              </div>
              {files.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                      <span className="truncate">{f.name}</span>
                      <span className="ml-2 text-slate-500">{formatFileSize(f.size)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                  </>
                ) : (
                  'Save'
                )}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                disabled={uploading}
              >
                Cancel
              </button>
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
                <th className="table-th">Size</th>
                <th className="table-th">Expiry</th>
                <th className="table-th">Status</th>
                <th className="table-th text-right">File</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((d) => {
                const days = daysUntil(d.expiryDate);
                const hasExpiry = !!d.expiryDate;
                const expired = hasExpiry && days < 0;
                const soon = hasExpiry && !expired && days <= 30;
                const Icon = fileIconFor(d.fileType);
                return (
                  <tr
                    key={d.id}
                    className={clsx(expired && 'bg-rose-50/60', soon && 'bg-amber-50/60')}
                  >
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-slate-400" />
                        <div>
                          <div className="font-medium">{d.name}</div>
                          {d.fileName ? (
                            <div className="text-xs text-slate-500">{d.fileName}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="table-td">{d.category}</td>
                    <td className="table-td text-xs text-slate-500">
                      {d.fileSize ? formatFileSize(d.fileSize) : '—'}
                    </td>
                    <td className="table-td">
                      {hasExpiry ? formatDate(d.expiryDate as string) : '—'}
                    </td>
                    <td className="table-td">
                      {!hasExpiry ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : expired ? (
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
                    <td className="table-td">
                      <div className="flex items-center justify-end gap-2">
                        {d.fileId ? (
                          <>
                            <button
                              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                              onClick={() => handleView(d)}
                              title="View"
                            >
                              <Eye className="h-3.5 w-3.5" /> View
                            </button>
                            <button
                              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                              onClick={() => handleDownload(d)}
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5" /> Download
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400" title="Legacy entry — no file attached">
                            metadata only
                          </span>
                        )}
                        {canUpload ? (
                          <button
                            className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline"
                            onClick={() => handleDelete(d)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-td text-center text-sm text-slate-500">
                    No documents yet. Click "Upload document" to add one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
