'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  Receipt,
} from 'lucide-react';
import { useStore, formatDate, daysUntil, formatINR } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import type {
  DocumentCategory,
  DocumentRecord,
  ExtractedInvoiceData,
} from '@/lib/types';
import {
  saveFile,
  getFileUrl,
  triggerDownload,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/fileStorage';
import { VoiceInputButton } from '@/components/VoiceInputButton';
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

type ExtractInvoiceResponse =
  | { ok: true; data: ExtractedInvoiceData }
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
  const processInvoiceExtraction = useStore((s) => s.processInvoiceExtraction);
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

  // Invoice extraction state — only used when the category is Invoice.
  const [pendingInvoice, setPendingInvoice] = useState<ExtractedInvoiceData | null>(
    null
  );
  const [invoiceProcessing, setInvoiceProcessing] = useState(false);
  const [lastSavedInvoiceDocId, setLastSavedInvoiceDocId] = useState<string | null>(
    null
  );

  // Newest-first / month grouping toggle (default newest first).
  const [sortDir, setSortDir] = useState<'newest' | 'oldest'>('newest');

  // Top-level tab filter. 'All' shows everything; the rest filter by category.
  type TabKey = 'All' | DocumentCategory;
  const [tab, setTab] = useState<TabKey>('All');

  // For the Licenses tab — sort by expiry urgency (soonest first) or upload.
  const [licenseSort, setLicenseSort] = useState<'expiry' | 'uploaded'>(
    'expiry'
  );

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
    setPendingInvoice(null);
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
        setAiNotice(`AI extraction unavailable: ${json.error}`);
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

      // Cascade: if AI thinks this is an Invoice, extract line items too.
      if (d.category === 'Invoice') {
        try {
          const fd2 = new FormData();
          fd2.append('file', file);
          const res2 = await fetch('/api/extract-invoice', {
            method: 'POST',
            body: fd2,
          });
          const inv = (await res2.json()) as ExtractInvoiceResponse;
          if (inv.ok) setPendingInvoice(inv.data);
        } catch {
          // Non-fatal — user can still save the document metadata.
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'network error';
      setAiNotice(`AI extraction unavailable: ${msg}`);
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
      const docId = addDocument({
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
      // Remember docId in case the user later wants to apply invoice
      // extraction — but we keep the panel visible until they decide.
      if (pendingInvoice) {
        setLastSavedInvoiceDocId(docId);
      } else {
        resetForm();
        setShowForm(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const applyInvoice = () => {
    if (!pendingInvoice) return;
    setInvoiceProcessing(true);
    try {
      const result = processInvoiceExtraction(pendingInvoice, {
        documentId: lastSavedInvoiceDocId ?? undefined,
        recordedBy: role ?? 'user',
      });
      const lines =
        result.inventoryUpdates.length > 0
          ? result.inventoryUpdates.join('; ')
          : 'no inventory changes';
      setSuccess(
        `Applied invoice — ${lines}. Logged ${formatINR(
          pendingInvoice.totalAmount
        )} to ${pendingInvoice.vendorName || 'vendor'} ledger.`
      );
    } finally {
      setInvoiceProcessing(false);
      setPendingInvoice(null);
      setLastSavedInvoiceDocId(null);
      resetForm();
      setShowForm(false);
    }
  };

  const skipInvoice = () => {
    setPendingInvoice(null);
    setLastSavedInvoiceDocId(null);
    setSuccess('Document saved — invoice not applied.');
    resetForm();
    setShowForm(false);
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

  // Documents filtered by the current tab.
  const tabbedDocs = useMemo(() => {
    if (tab === 'All') return documents;
    return documents.filter((d) => d.category === tab);
  }, [documents, tab]);

  // Counts per tab — used for header badges.
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {
      All: documents.length,
      License: 0,
      Agreement: 0,
      Invoice: 0,
      Bill: 0,
      'Salary Slip': 0,
      Other: 0,
    };
    for (const d of documents) {
      counts[d.category] = (counts[d.category] ?? 0) + 1;
    }
    return counts;
  }, [documents]);

  // For Invoices tab: group by month (newest first). For Licenses tab: sort
  // by expiry urgency (soonest first) or upload date. All other tabs: flat
  // list sorted by uploadedAt.
  const groupedDocs = useMemo(() => {
    if (tab === 'Invoice') {
      // Month grouping, newest month first.
      const sorted = [...tabbedDocs].sort((a, b) => {
        const ta = new Date(a.uploadedAt).getTime();
        const tb = new Date(b.uploadedAt).getTime();
        return sortDir === 'newest' ? tb - ta : ta - tb;
      });
      const map = new Map<string, DocumentRecord[]>();
      const order: string[] = [];
      for (const d of sorted) {
        const dt = new Date(d.uploadedAt);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        if (!map.has(key)) {
          map.set(key, []);
          order.push(key);
        }
        map.get(key)!.push(d);
      }
      return order.map((key) => {
        const [y, m] = key.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
          month: 'long',
          year: 'numeric',
        });
        return { key, label, docs: map.get(key)! };
      });
    }

    // Non-invoice tabs: single flat group, no sticky header.
    let sorted: DocumentRecord[];
    if (tab === 'License' && licenseSort === 'expiry') {
      sorted = [...tabbedDocs].sort((a, b) => {
        // Items without an expiry sink to the bottom.
        const ea = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
        const eb = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
        return ea - eb;
      });
    } else {
      sorted = [...tabbedDocs].sort((a, b) => {
        const ta = new Date(a.uploadedAt).getTime();
        const tb = new Date(b.uploadedAt).getTime();
        return sortDir === 'newest' ? tb - ta : ta - tb;
      });
    }
    return [{ key: 'all', label: '', docs: sorted }];
  }, [tabbedDocs, tab, sortDir, licenseSort]);

  const TABS: TabKey[] = [
    'All',
    'License',
    'Agreement',
    'Invoice',
    'Bill',
    'Salary Slip',
    'Other',
  ];

  const tabLabel = (k: TabKey): string => {
    if (k === 'All') return 'All';
    if (k === 'License') return 'Licenses';
    if (k === 'Agreement') return 'Agreements';
    if (k === 'Invoice') return 'Invoices';
    if (k === 'Bill') return 'Bills';
    if (k === 'Salary Slip') return 'Salary Slips';
    return 'Other';
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

              {pendingInvoice ? (
                <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-violet-900">
                    <Receipt className="h-4 w-4" />
                    AI detected a {pendingInvoice.invoiceType} invoice from{' '}
                    {pendingInvoice.vendorName || 'unknown vendor'} ·{' '}
                    {pendingInvoice.lineItems.length} line item
                    {pendingInvoice.lineItems.length === 1 ? '' : 's'}
                  </div>
                  {pendingInvoice.lineItems.length > 0 ? (
                    <ul className="mt-2 max-h-32 overflow-y-auto rounded bg-white p-2 text-xs ring-1 ring-violet-100">
                      {pendingInvoice.lineItems.map((li, i) => (
                        <li key={i} className="flex justify-between py-0.5">
                          <span>
                            {li.quantity} {li.unit} · {li.name}
                          </span>
                          <span className="tabular-nums text-slate-500">
                            {formatINR(li.totalPrice)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-2 text-xs text-violet-700">
                    Total: {formatINR(pendingInvoice.totalAmount)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={applyInvoice}
                      disabled={invoiceProcessing || !lastSavedInvoiceDocId}
                      className="btn btn-primary text-xs"
                      title={
                        lastSavedInvoiceDocId
                          ? 'Apply to inventory + vendor ledger'
                          : 'Save the document first, then apply'
                      }
                    >
                      {invoiceProcessing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      Yes, apply
                    </button>
                    <button
                      type="button"
                      onClick={skipInvoice}
                      disabled={invoiceProcessing}
                      className="btn btn-secondary text-xs"
                    >
                      No, just save document
                    </button>
                  </div>
                </div>
              ) : null}

              <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label">Document name</label>
                  <div className="flex items-center gap-2">
                    <input
                      className="input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. FSSAI License"
                    />
                    <VoiceInputButton
                      onTranscript={(t) => setName(t)}
                      mode="replace"
                    />
                  </div>
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
                  <div className="flex items-center gap-2">
                    <input
                      className="input"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Anything worth remembering"
                    />
                    <VoiceInputButton onTranscript={(t) => setNotes(t)} />
                  </div>
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
        {/* Top-level category tabs */}
        <div className="mb-4 -mx-5 overflow-x-auto border-b border-slate-200 px-5">
          <div className="flex gap-1">
            {TABS.map((k) => {
              const active = tab === k;
              const count = tabCounts[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={clsx(
                    '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition',
                    active
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  )}
                >
                  {tabLabel(k)}{' '}
                  <span
                    className={clsx(
                      'ml-1 rounded-full px-1.5 py-0.5 text-xs',
                      active
                        ? 'bg-brand-100 text-brand-700'
                        : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            {tabbedDocs.length} {tabLabel(tab).toLowerCase()}
            {tab === 'Invoice' ? ' · grouped by upload month' : ''}
          </div>
          <div className="flex items-center gap-3">
            {tab === 'License' ? (
              <button
                type="button"
                onClick={() =>
                  setLicenseSort((s) => (s === 'expiry' ? 'uploaded' : 'expiry'))
                }
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Sort:{' '}
                {licenseSort === 'expiry'
                  ? 'Expiring soonest'
                  : 'Recently uploaded'}
              </button>
            ) : null}
            {tab !== 'License' || licenseSort === 'uploaded' ? (
              <button
                type="button"
                onClick={() =>
                  setSortDir((d) => (d === 'newest' ? 'oldest' : 'newest'))
                }
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Sort: {sortDir === 'newest' ? 'Newest first' : 'Oldest first'}
              </button>
            ) : null}
          </div>
        </div>
        {tabbedDocs.length === 0 ? (
          <div className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
            {tab === 'All'
              ? 'No documents yet. Click "Upload document" to add one.'
              : `No ${tabLabel(tab).toLowerCase()} yet. Click "Upload document" to add one.`}
          </div>
        ) : null}
        {groupedDocs.map((group) => (
          <div key={group.key} className="mb-4">
            {group.label ? (
              <h3 className="sticky top-16 z-10 -mx-5 mb-2 border-y border-slate-200 bg-slate-50/95 px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 backdrop-blur">
                {group.label}
              </h3>
            ) : null}
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
                  {group.docs.map((d) => {
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
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
