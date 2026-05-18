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
  Sparkles,
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

// Vercel serverless body limit is 4 MB — clamp AI extraction at the same value.
// Larger files still get stored in IndexedDB; AI extraction is just skipped.
const AI_EXTRACTION_MAX_BYTES = 4 * 1024 * 1024;

const AI_SUPPORTED_TYPES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

interface ExtractedDocumentData {
  documentName: string;
  documentType: string;
  category: DocumentCategory;
  licenseNumber: string;
  issuingAuthority: string;
  dateOfIssue: string;
  dateOfExpiry: string;
  registeredEntity: string;
  notes: string;
}

type ExtractResponse =
  | { ok: true; data: ExtractedDocumentData }
  | { ok: false; error: string };

function fileIconFor(type: string | undefined) {
  if (!type) return FileIcon;
  if (type.startsWith('image/')) return ImageIcon;
  if (type === 'application/pdf') return FileText;
  return FileIcon;
}

function isDocumentCategory(value: string): value is DocumentCategory {
  return (CATEGORIES as string[]).includes(value);
}

export default function DocumentsPage() {
  const mounted = useMounted();
  const documents = useStore((s) => s.documents);
  const addDocument = useStore((s) => s.addDocument);
  const deleteDocument = useStore((s) => s.deleteDocument);
  const role = useStore((s) => s.role);

  const canUpload =
    role === 'owner' || role === 'store-manager' || role === 'manager';

  // Step A — file selection / AI extraction
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiBadge, setAiBadge] = useState(false);

  // Step B — form fields (editable)
  const [name, setName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('License');
  const [documentType, setDocumentType] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [registeredEntity, setRegisteredEntity] = useState('');
  const [dateOfIssue, setDateOfIssue] = useState('');
  const [expiry, setExpiry] = useState('');
  const [notes, setNotes] = useState('');

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

  const resetForm = () => {
    setPendingFile(null);
    setAnalyzing(false);
    setAiNotice(null);
    setAiBadge(false);
    setName('');
    setCategory('License');
    setDocumentType('');
    setLicenseNumber('');
    setIssuingAuthority('');
    setRegisteredEntity('');
    setDateOfIssue('');
    setExpiry('');
    setNotes('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const runAiExtraction = async (file: File) => {
    if (!AI_SUPPORTED_TYPES.has(file.type)) {
      setAiNotice('AI extraction unavailable — please fill fields manually.');
      return;
    }
    if (file.size > AI_EXTRACTION_MAX_BYTES) {
      setAiNotice(
        'File too large for AI extraction — please fill fields manually.'
      );
      return;
    }
    setAnalyzing(true);
    setAiNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/extract-document', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as ExtractResponse;
      if (!json.ok) {
        setAiNotice('AI extraction unavailable — please fill fields manually.');
        return;
      }
      const d = json.data;
      if (d.documentName) setName(d.documentName);
      if (d.category && isDocumentCategory(d.category)) setCategory(d.category);
      if (d.documentType) setDocumentType(d.documentType);
      if (d.licenseNumber) setLicenseNumber(d.licenseNumber);
      if (d.issuingAuthority) setIssuingAuthority(d.issuingAuthority);
      if (d.registeredEntity) setRegisteredEntity(d.registeredEntity);
      if (d.dateOfIssue) setDateOfIssue(d.dateOfIssue);
      if (d.dateOfExpiry) setExpiry(d.dateOfExpiry);
      if (d.notes) setNotes(d.notes);
      setAiBadge(true);
    } catch {
      setAiNotice('AI extraction unavailable — please fill fields manually.');
    } finally {
      setAnalyzing(false);
    }
  };

  const pickFile = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    // One file at a time — keeps the AI extraction flow simple.
    const f = list[0];
    if (f.size > MAX_FILE_SIZE_BYTES) {
      setError(
        `"${f.name}" is ${formatFileSize(f.size)} — files must be under 25 MB.`
      );
      return;
    }
    setError(null);
    setSuccess(null);
    // Sensible default in case AI yields nothing.
    const base = f.name.replace(/\.[^.]+$/, '');
    setName(base);
    setPendingFile(f);
    void runAiExtraction(f);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!pendingFile) {
      setError('Please select a file to upload.');
      return;
    }
    if (!name.trim()) {
      setError('Please enter a name for the document.');
      return;
    }
    if (EXPIRY_REQUIRED.includes(category) && !expiry) {
      setError(`Expiry date is required for category "${category}".`);
      return;
    }
    setUploading(true);
    try {
      const fileId = await saveFile(pendingFile);
      addDocument({
        name: name.trim(),
        category,
        expiryDate: expiry ? new Date(expiry).toISOString() : undefined,
        fileId,
        fileName: pendingFile.name,
        fileType: pendingFile.type || 'application/octet-stream',
        fileSize: pendingFile.size,
        notes: notes.trim() || undefined,
        documentType: documentType.trim() || undefined,
        licenseNumber: licenseNumber.trim() || undefined,
        issuingAuthority: issuingAuthority.trim() || undefined,
        registeredEntity: registeredEntity.trim() || undefined,
        dateOfIssue: dateOfIssue
          ? new Date(dateOfIssue).toISOString()
          : undefined,
        aiExtracted: aiBadge || undefined,
      });
      setSuccess('Document uploaded successfully.');
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

  const PendingIcon = fileIconFor(pendingFile?.type);

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
              setShowForm((v) => {
                const next = !v;
                if (!next) resetForm();
                return next;
              });
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

          {/* Step A — file picker. Hidden once a file has been chosen. */}
          {!pendingFile ? (
            <div className="mt-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={clsx(
                  'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-8 text-center text-sm transition',
                  dragOver
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-300 bg-slate-50 text-slate-600 hover:border-brand-400'
                )}
              >
                <FilePlus className="h-6 w-6 text-slate-400" />
                <div>
                  <span className="font-medium text-brand-700">Click to browse</span>{' '}
                  or drag and drop a file here
                </div>
                <div className="text-xs text-slate-500">
                  PDF or images, up to 25 MB. Files under 4 MB are auto-analyzed with AI.
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files)}
                />
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {/* File preview */}
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <PendingIcon className="h-5 w-5 text-slate-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {pendingFile.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatFileSize(pendingFile.size)} ·{' '}
                      {pendingFile.type || 'unknown type'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-slate-600 hover:text-rose-600"
                  onClick={() => resetForm()}
                  disabled={analyzing || uploading}
                >
                  Choose different file
                </button>
              </div>

              {analyzing ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing with AI...
                </div>
              ) : aiBadge ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                  <Sparkles className="h-3.5 w-3.5" /> AI-extracted — review and edit if needed
                </div>
              ) : aiNotice ? (
                <div className="text-xs text-slate-500">{aiNotice}</div>
              ) : null}

              <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label">Document name</label>
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. FSSAI License"
                  />
                </div>
                <div>
                  <label className="label">Category</label>
                  <select
                    className="select"
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as DocumentCategory)
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Document type</label>
                  <input
                    className="input"
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    placeholder="e.g. FSSAI License, Fire NOC"
                  />
                </div>
                <div>
                  <label className="label">License / document number</label>
                  <input
                    className="input"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="e.g. 10012345001234"
                  />
                </div>
                <div>
                  <label className="label">Issuing authority</label>
                  <input
                    className="input"
                    value={issuingAuthority}
                    onChange={(e) => setIssuingAuthority(e.target.value)}
                    placeholder="e.g. FSSAI"
                  />
                </div>
                <div>
                  <label className="label">Registered entity</label>
                  <input
                    className="input"
                    value={registeredEntity}
                    onChange={(e) => setRegisteredEntity(e.target.value)}
                    placeholder="Business or person the document is issued to"
                  />
                </div>
                <div>
                  <label className="label">
                    Date of issue{' '}
                    <span className="text-slate-400">(optional)</span>
                  </label>
                  <input
                    className="input"
                    type="date"
                    value={dateOfIssue}
                    onChange={(e) => setDateOfIssue(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">
                    Date of expiry{' '}
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
                <div className="sm:col-span-2 flex gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={uploading || analyzing}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving...
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
            </div>
          )}
        </section>
      ) : null}

      <section className="card p-5">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-th">Name</th>
                <th className="table-th">Category</th>
                <th className="table-th">Issuer</th>
                <th className="table-th">Issued</th>
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
                        <div className="min-w-0">
                          <div className="font-medium flex items-center gap-1">
                            <span className="truncate">{d.name}</span>
                            {d.aiExtracted ? (
                              <Sparkles
                                className="h-3 w-3 text-violet-500 shrink-0"
                                aria-label="AI-extracted"
                              />
                            ) : null}
                          </div>
                          {d.documentType ? (
                            <div className="text-xs text-slate-500">
                              {d.documentType}
                            </div>
                          ) : null}
                          {d.licenseNumber ? (
                            <div className="text-xs text-slate-500">
                              No. {d.licenseNumber}
                            </div>
                          ) : null}
                          {d.fileName ? (
                            <div className="text-xs text-slate-400">{d.fileName}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="table-td">{d.category}</td>
                    <td className="table-td text-xs text-slate-600">
                      {d.issuingAuthority ? (
                        <div>{d.issuingAuthority}</div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {d.registeredEntity ? (
                        <div className="text-slate-400">to {d.registeredEntity}</div>
                      ) : null}
                    </td>
                    <td className="table-td text-xs text-slate-600">
                      {d.dateOfIssue ? formatDate(d.dateOfIssue) : '—'}
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
                  <td colSpan={7} className="table-td text-center text-sm text-slate-500">
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
