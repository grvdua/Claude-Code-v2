'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Plus,
  Minus,
  PackagePlus,
  Receipt,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useStore, formatINR } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import type {
  Location,
  ExtractedInvoiceData,
  InvoiceLineItem,
} from '@/lib/types';
import {
  saveFile,
  MAX_FILE_SIZE_BYTES,
  formatFileSize,
} from '@/lib/fileStorage';
import clsx from 'clsx';

const locationLabel: Record<Location, string> = {
  restaurant: 'Restaurant',
  'store-1': 'Store 1',
  'store-2': 'Store 2',
};

// Vercel serverless body limit is 4 MB — clamp AI extraction at the same value.
const AI_EXTRACTION_MAX_BYTES = 4 * 1024 * 1024;
const AI_SUPPORTED_TYPES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

type ExtractInvoiceResponse =
  | { ok: true; data: ExtractedInvoiceData }
  | { ok: false; error: string };

export default function InventoryPage() {
  const mounted = useMounted();
  const inventory = useStore((s) => s.inventory);
  const role = useStore((s) => s.role);
  const adjustStock = useStore((s) => s.adjustStock);
  const addInventoryItem = useStore((s) => s.addInventoryItem);
  const addDocument = useStore((s) => s.addDocument);
  const processInvoiceExtraction = useStore((s) => s.processInvoiceExtraction);

  const [loc, setLoc] = useState<'all' | Location>('all');
  const [cat, setCat] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Vegetables');
  const [unit, setUnit] = useState('kg');
  const [newLoc, setNewLoc] = useState<Location>('store-1');
  const [qty, setQty] = useState('');
  const [reorder, setReorder] = useState('');

  // Invoice upload modal state.
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(inventory.map((i) => i.category))).sort(),
    [inventory]
  );

  const filtered = useMemo(
    () =>
      inventory.filter(
        (i) =>
          (loc === 'all' || i.location === loc) && (cat === 'all' || i.category === cat)
      ),
    [inventory, loc, cat]
  );

  const canEdit = role === 'store-manager' || role === 'owner';
  const canUploadInvoice = role === 'store-manager' || role === 'owner';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !qty || !reorder) return;
    addInventoryItem({
      name: name.trim(),
      category,
      unit,
      location: newLoc,
      quantity: Number(qty),
      reorderLevel: Number(reorder),
    });
    setName('');
    setQty('');
    setReorder('');
    setShowAdd(false);
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-600">
            Live stock across Restaurant, Store 1 and Store 2. Items at or below reorder level are highlighted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUploadInvoice ? (
            <button
              className="btn btn-secondary"
              onClick={() => setInvoiceOpen(true)}
            >
              <Receipt className="h-4 w-4" /> Upload invoice
            </button>
          ) : null}
          {canEdit ? (
            <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
              <PackagePlus className="h-4 w-4" /> {showAdd ? 'Close' : 'Add item'}
            </button>
          ) : null}
        </div>
      </header>

      {toast ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {toast}
        </div>
      ) : null}
      {toastError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {toastError}
        </div>
      ) : null}

      {showAdd && canEdit ? (
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900">Add inventory item</h2>
          <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="select" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="kg">kg</option>
                <option value="litre">litre</option>
                <option value="unit">unit</option>
                <option value="dozen">dozen</option>
              </select>
            </div>
            <div>
              <label className="label">Location</label>
              <select className="select" value={newLoc} onChange={(e) => setNewLoc(e.target.value as Location)}>
                <option value="restaurant">Restaurant</option>
                <option value="store-1">Store 1</option>
                <option value="store-2">Store 2</option>
              </select>
            </div>
            <div>
              <label className="label">Quantity</label>
              <input
                className="input"
                type="number"
                step="0.1"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Reorder level</label>
              <input
                className="input"
                type="number"
                step="0.1"
                min="0"
                value={reorder}
                onChange={(e) => setReorder(e.target.value)}
              />
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="btn btn-primary">Save item</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="label">Location</label>
            <select className="select" value={loc} onChange={(e) => setLoc(e.target.value as 'all' | Location)}>
              <option value="all">All locations</option>
              <option value="restaurant">Restaurant</option>
              <option value="store-1">Store 1</option>
              <option value="store-2">Store 2</option>
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto text-sm text-slate-500">
            {filtered.length} items{' '}
            <span className="ml-2 inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500" /> low stock
            </span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-th">Item</th>
                <th className="table-th">Category</th>
                <th className="table-th">Location</th>
                <th className="table-th text-right">Quantity</th>
                <th className="table-th text-right">Reorder level</th>
                {canEdit ? <th className="table-th text-right">Adjust</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((i) => {
                const low = i.quantity <= i.reorderLevel;
                return (
                  <tr key={i.id} className={clsx(low && 'bg-rose-50/40')}>
                    <td className="table-td font-medium">{i.name}</td>
                    <td className="table-td">{i.category}</td>
                    <td className="table-td">{locationLabel[i.location]}</td>
                    <td
                      className={clsx(
                        'table-td text-right tabular-nums font-semibold',
                        low && 'text-rose-700'
                      )}
                    >
                      {i.quantity} {i.unit}
                    </td>
                    <td className="table-td text-right tabular-nums">{i.reorderLevel}</td>
                    {canEdit ? (
                      <td className="table-td text-right">
                        <div className="inline-flex gap-1">
                          <button
                            className="btn btn-secondary px-2 py-1 text-xs"
                            onClick={() => adjustStock(i.id, -1)}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <button
                            className="btn btn-secondary px-2 py-1 text-xs"
                            onClick={() => adjustStock(i.id, 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <div className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
              {inventory.length === 0
                ? 'No inventory items yet. Click "Add item" or "Upload invoice" to start.'
                : 'No items match the current filters.'}
            </div>
          ) : null}
        </div>
      </section>

      {invoiceOpen ? (
        <InvoiceUploadModal
          onClose={() => setInvoiceOpen(false)}
          onApplied={(message) => {
            setToast(message);
            setToastError(null);
            setInvoiceOpen(false);
          }}
          onError={(message) => {
            setToastError(message);
            setToast(null);
          }}
          processInvoiceExtraction={processInvoiceExtraction}
          addDocument={addDocument}
          recordedBy={role ?? 'user'}
        />
      ) : null}
    </div>
  );
}

// -------------------- Invoice upload modal --------------------

interface InvoiceUploadModalProps {
  onClose: () => void;
  onApplied: (message: string) => void;
  onError: (message: string) => void;
  processInvoiceExtraction: ReturnType<
    typeof useStore.getState
  >['processInvoiceExtraction'];
  addDocument: ReturnType<typeof useStore.getState>['addDocument'];
  recordedBy: string;
}

// Editable line item used inside the modal — keeps qty/price as strings so
// the inputs stay controlled even while the user is typing.
interface EditableLineItem {
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

function lineItemsFromExtracted(items: InvoiceLineItem[]): EditableLineItem[] {
  return items.map((li) => ({
    name: li.name,
    quantity: li.quantity ? String(li.quantity) : '',
    unit: li.unit || 'unit',
    unitPrice: li.unitPrice ? String(li.unitPrice) : '',
  }));
}

function InvoiceUploadModal({
  onClose,
  onApplied,
  onError,
  processInvoiceExtraction,
  addDocument,
  recordedBy,
}: InvoiceUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedInvoiceData | null>(null);
  const [lines, setLines] = useState<EditableLineItem[]>([]);
  const [vendorName, setVendorName] = useState('');
  const [applying, setApplying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pick = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const f = list[0];
    if (f.size > MAX_FILE_SIZE_BYTES) {
      setLocalError(
        `"${f.name}" is ${formatFileSize(f.size)} — files must be under 25 MB.`
      );
      return;
    }
    setLocalError(null);
    setFile(f);
    void runExtraction(f);
  };

  const runExtraction = async (f: File) => {
    if (!AI_SUPPORTED_TYPES.has(f.type)) {
      setLocalError(
        'AI extraction unsupported for this file type — you can still add line items manually.'
      );
      return;
    }
    if (f.size > AI_EXTRACTION_MAX_BYTES) {
      setLocalError(
        'File too large for AI extraction — you can still add line items manually.'
      );
      return;
    }
    setAnalyzing(true);
    setLocalError(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/extract-invoice', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as ExtractInvoiceResponse;
      if (!json.ok) {
        setLocalError(
          'AI extraction failed — you can still enter the line items manually.'
        );
        // Provide a single blank line so the user can type immediately.
        setLines([{ name: '', quantity: '', unit: 'kg', unitPrice: '' }]);
        return;
      }
      setExtracted(json.data);
      setVendorName(json.data.vendorName);
      setLines(lineItemsFromExtracted(json.data.lineItems));
    } catch {
      setLocalError('AI extraction failed — you can still enter items manually.');
      setLines([{ name: '', quantity: '', unit: 'kg', unitPrice: '' }]);
    } finally {
      setAnalyzing(false);
    }
  };

  const updateLine = (i: number, patch: Partial<EditableLineItem>) => {
    setLines((prev) =>
      prev.map((line, idx) => (idx === i ? { ...line, ...patch } : line))
    );
  };

  const removeLine = (i: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { name: '', quantity: '', unit: 'kg', unitPrice: '' },
    ]);
  };

  const buildPayload = (): ExtractedInvoiceData => {
    const validLines: InvoiceLineItem[] = lines
      .filter((l) => l.name.trim())
      .map((l) => {
        const q = Number(l.quantity) || 0;
        const up = Number(l.unitPrice) || 0;
        return {
          name: l.name.trim(),
          quantity: q,
          unit: l.unit.trim() || 'unit',
          unitPrice: up,
          totalPrice: q * up,
        };
      });
    const total = validLines.reduce((sum, l) => sum + l.totalPrice, 0);
    return {
      invoiceType: extracted?.invoiceType ?? 'raw-material',
      vendorName: vendorName.trim() || extracted?.vendorName || '',
      vendorGstin: extracted?.vendorGstin ?? '',
      invoiceNumber: extracted?.invoiceNumber ?? '',
      invoiceDate: extracted?.invoiceDate ?? '',
      totalAmount: extracted?.totalAmount ? extracted.totalAmount : total,
      currency: extracted?.currency || 'INR',
      lineItems: validLines,
      notes: extracted?.notes ?? '',
    };
  };

  const apply = async (saveToVault: boolean) => {
    if (!vendorName.trim() && !extracted?.vendorName) {
      setLocalError('Please enter a vendor name before applying.');
      return;
    }
    if (lines.filter((l) => l.name.trim()).length === 0) {
      setLocalError('Add at least one line item before applying.');
      return;
    }
    setApplying(true);
    setLocalError(null);
    try {
      let documentId: string | undefined;
      if (saveToVault && file) {
        const fileId = await saveFile(file);
        const payload = buildPayload();
        documentId = addDocument({
          name:
            payload.vendorName
              ? `${payload.vendorName} invoice${
                  payload.invoiceNumber ? ` #${payload.invoiceNumber}` : ''
                }`
              : 'Invoice',
          category: 'Invoice',
          fileId,
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          documentType: 'Vendor Invoice',
          licenseNumber: payload.invoiceNumber || undefined,
          issuingAuthority: payload.vendorName || undefined,
          dateOfIssue: payload.invoiceDate
            ? new Date(payload.invoiceDate).toISOString()
            : undefined,
          aiExtracted: extracted ? true : undefined,
        });
      }
      const payload = buildPayload();
      const result = processInvoiceExtraction(payload, {
        documentId,
        recordedBy,
      });
      const summary =
        result.inventoryUpdates.length > 0
          ? `Updated inventory: ${result.inventoryUpdates.join(', ')}.`
          : 'No inventory changes.';
      const ledger = `Logged ${formatINR(payload.totalAmount)} to ${
        payload.vendorName || 'vendor'
      }.`;
      onApplied(`${summary} ${ledger}${saveToVault ? ' Saved invoice to vault.' : ''}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Apply failed.';
      setLocalError(msg);
      onError(msg);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-12 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Receipt className="h-5 w-5 text-brand-600" /> Upload invoice
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {localError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {localError}
            </div>
          ) : null}

          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pick(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-8 text-center text-sm transition',
                dragOver
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-300 bg-slate-50 text-slate-600 hover:border-brand-400'
              )}
            >
              <Upload className="h-6 w-6 text-slate-400" />
              <div>
                <span className="font-medium text-brand-700">Click to browse</span>{' '}
                or drag a PDF or image of the invoice here
              </div>
              <div className="text-xs text-slate-500">
                Files under 4 MB are auto-analyzed with AI.
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => pick(e.target.files)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">
                    {file.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatFileSize(file.size)} · {file.type || 'unknown'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setExtracted(null);
                    setLines([]);
                    setVendorName('');
                  }}
                  className="text-xs font-medium text-slate-600 hover:text-rose-600"
                  disabled={analyzing || applying}
                >
                  Choose different file
                </button>
              </div>

              {analyzing ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing
                  invoice with AI...
                </div>
              ) : extracted ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI classified: {extracted.invoiceType} invoice — review and
                  edit before applying
                </div>
              ) : null}

              <div>
                <label className="label">Vendor name</label>
                <input
                  className="input"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="Supplier name as printed on invoice"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="label mb-0">Line items</label>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    + Add line
                  </button>
                </div>
                {lines.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-500">
                    No line items yet. Add one to apply to inventory.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-1 pr-2">Item</th>
                          <th className="py-1 pr-2 w-20">Qty</th>
                          <th className="py-1 pr-2 w-24">Unit</th>
                          <th className="py-1 pr-2 w-28">Unit price</th>
                          <th className="py-1 w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lines.map((line, i) => (
                          <tr key={i}>
                            <td className="py-1 pr-2">
                              <input
                                className="input"
                                value={line.name}
                                onChange={(e) =>
                                  updateLine(i, { name: e.target.value })
                                }
                                placeholder="e.g. Paneer"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                className="input"
                                inputMode="decimal"
                                value={line.quantity}
                                onChange={(e) =>
                                  updateLine(i, { quantity: e.target.value })
                                }
                                placeholder="0"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                className="input"
                                value={line.unit}
                                onChange={(e) =>
                                  updateLine(i, { unit: e.target.value })
                                }
                                placeholder="kg"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                className="input"
                                inputMode="decimal"
                                value={line.unitPrice}
                                onChange={(e) =>
                                  updateLine(i, { unitPrice: e.target.value })
                                }
                                placeholder="0"
                              />
                            </td>
                            <td className="py-1 text-right">
                              <button
                                type="button"
                                onClick={() => removeLine(i)}
                                className="text-slate-400 hover:text-rose-600"
                                aria-label="Remove line"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => apply(false)}
                  disabled={applying || analyzing}
                  className="btn btn-secondary"
                >
                  {applying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Apply to inventory
                </button>
                <button
                  type="button"
                  onClick={() => apply(true)}
                  disabled={applying || analyzing}
                  className="btn btn-primary"
                >
                  {applying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Apply + save invoice to vault
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  disabled={applying}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
