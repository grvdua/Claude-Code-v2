'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Minus,
  PackagePlus,
  Receipt,
  Loader2,
  Sparkles,
  Upload,
  X,
  History,
  Search,
  Trash2,
  Download,
  Brain,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  useStore,
  formatINR,
  formatDate,
  formatDateTime,
} from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import type {
  Location,
  ExtractedInvoiceData,
  InvoiceLineItem,
  InventoryItem,
  ReorderPredictionResult,
  ReorderPredictionItem,
  ReorderUrgency,
  ReorderPriceTrend,
  StockAdjustment,
  PriceHistoryEntry,
} from '@/lib/types';
import {
  saveFile,
  MAX_FILE_SIZE_BYTES,
  formatFileSize,
} from '@/lib/fileStorage';
import { LineChart } from '@/components/charts/LineChart';
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

type PredictReordersResponse =
  | { ok: true; data: ReorderPredictionResult }
  | { ok: false; error: string };

// Unit-price bracket filter options. Items without unitPrice are shown only
// when bracket === 'all' (to avoid hiding unpriced items in a price view).
type PriceBracket = 'all' | 'lt100' | '100-500' | '500-1000' | 'gt1000';

const PRICE_BRACKETS: { value: PriceBracket; label: string }[] = [
  { value: 'all', label: 'All unit prices' },
  { value: 'lt100', label: 'Under ₹100' },
  { value: '100-500', label: '₹100 – ₹500' },
  { value: '500-1000', label: '₹500 – ₹1000' },
  { value: 'gt1000', label: 'Over ₹1000' },
];

function matchesBracket(item: InventoryItem, bracket: PriceBracket): boolean {
  if (bracket === 'all') return true;
  if (item.unitPrice === undefined || item.unitPrice <= 0) return false;
  const p = item.unitPrice;
  switch (bracket) {
    case 'lt100':
      return p < 100;
    case '100-500':
      return p >= 100 && p <= 500;
    case '500-1000':
      return p > 500 && p <= 1000;
    case 'gt1000':
      return p > 1000;
    default:
      return true;
  }
}

const URGENCY_RANK: Record<ReorderUrgency, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const URGENCY_STYLES: Record<ReorderUrgency, string> = {
  critical: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800',
  high: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800',
  medium: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800',
  low: 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700',
};

function PriceTrendIcon({ trend }: { trend: ReorderPriceTrend }) {
  if (trend === 'rising')
    return <ArrowUpRight className="h-4 w-4 text-rose-600" aria-label="Rising" />;
  if (trend === 'falling')
    return (
      <ArrowDownRight className="h-4 w-4 text-emerald-600" aria-label="Falling" />
    );
  return <ArrowRight className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-label="Stable" />;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

export default function InventoryPage() {
  const mounted = useMounted();
  const inventory = useStore((s) => s.inventory);
  const role = useStore((s) => s.role);
  const adjustStock = useStore((s) => s.adjustStock);
  const addInventoryItem = useStore((s) => s.addInventoryItem);
  const deleteInventoryItem = useStore((s) => s.deleteInventoryItem);
  const addDocument = useStore((s) => s.addDocument);
  const processInvoiceExtraction = useStore((s) => s.processInvoiceExtraction);
  const getStockHistory = useStore((s) => s.getStockHistory);
  const stockAdjustments = useStore((s) => s.stockAdjustments);
  const priceHistory = useStore((s) => s.priceHistory);
  const getReorderInputBundle = useStore((s) => s.getReorderInputBundle);
  const setReorderPrediction = useStore((s) => s.setReorderPrediction);
  const lastReorderPrediction = useStore((s) => s.lastReorderPrediction);

  const [loc, setLoc] = useState<'all' | Location>('all');
  const [cat, setCat] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [bracket, setBracket] = useState<PriceBracket>('all');
  const [showAdd, setShowAdd] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Vegetables');
  const [unit, setUnit] = useState('kg');
  const [newLoc, setNewLoc] = useState<Location>('store-1');
  const [qty, setQty] = useState('');
  const [reorder, setReorder] = useState('');
  const [reorderTouched, setReorderTouched] = useState(false);
  const [unitPriceInput, setUnitPriceInput] = useState('');
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  // Bulk selection of items currently shown after filtering.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Invoice upload modal state.
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  // AI reorder predictions UI state.
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(inventory.map((i) => i.category))).sort(),
    [inventory]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory.filter((i) => {
      if (loc !== 'all' && i.location !== loc) return false;
      if (cat !== 'all' && i.category !== cat) return false;
      if (!matchesBracket(i, bracket)) return false;
      if (q) {
        if (
          !i.name.toLowerCase().includes(q) &&
          !i.category.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [inventory, loc, cat, bracket, query]);

  // Drop selection IDs that no longer belong to the filtered list (e.g.
  // after filter changes or items get deleted) to keep state honest.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(filtered.map((i) => i.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (allowed.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [filtered]);

  const canEdit = role === 'store-manager' || role === 'owner';
  const canUploadInvoice = role === 'store-manager' || role === 'owner';
  const canSeeReorderPanel = role === 'store-manager' || role === 'owner';

  // Suggested reorder level for the typed category. Rounded average of
  // existing items in that category. Falls back to undefined if no match.
  const suggestedReorder = useMemo(() => {
    const c = category.trim().toLowerCase();
    if (!c) return undefined;
    const peers = inventory.filter(
      (i) => i.category.toLowerCase() === c && i.reorderLevel > 0
    );
    if (peers.length === 0) return undefined;
    const avg =
      peers.reduce((sum, i) => sum + i.reorderLevel, 0) / peers.length;
    return Math.round(avg);
  }, [category, inventory]);

  // Auto-apply the suggestion while the user hasn't manually edited the field.
  useEffect(() => {
    if (reorderTouched) return;
    if (suggestedReorder === undefined) return;
    setReorder(String(suggestedReorder));
  }, [suggestedReorder, reorderTouched]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !qty || !reorder) return;
    const upNum = Number(unitPriceInput);
    addInventoryItem({
      name: name.trim(),
      category: category.trim() || 'Uncategorised',
      unit,
      location: newLoc,
      quantity: Number(qty),
      reorderLevel: Number(reorder),
      unitPrice: upNum > 0 ? upNum : undefined,
    });
    setName('');
    setQty('');
    setReorder('');
    setReorderTouched(false);
    setUnitPriceInput('');
    setShowAdd(false);
  };

  // Total inventory value (qty * unitPrice). Items without unitPrice are skipped.
  const totalInventoryValue = useMemo(
    () =>
      inventory.reduce(
        (sum, i) => sum + (i.unitPrice ? i.quantity * i.unitPrice : 0),
        0
      ),
    [inventory]
  );

  const pricedItemsCount = useMemo(
    () => inventory.filter((i) => i.unitPrice && i.unitPrice > 0).length,
    [inventory]
  );

  // Format INR in lakh/crore where helpful.
  const formatLakhCrore = (n: number): string => {
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    return formatINR(n);
  };

  // ---------------- Inventory value over time ----------------
  // For each of the last 30 days, replay backwards from the current
  // inventory state by un-applying stock adjustments that happened AFTER
  // the end of that day. Total value = Σ qty × unitPrice for items with a
  // known unitPrice.
  const valueTrend = useMemo(() => {
    if (stockAdjustments.length === 0) return [];
    const points: { label: string; value: number; iso: string }[] = [];
    // Quantity-by-itemId reconstructed for each snapshot day.
    // Start from current quantities, walk backwards.
    const quantities = new Map<string, number>();
    inventory.forEach((it) => quantities.set(it.id, it.quantity));
    // Adjustments sorted newest-first so we can un-apply moving backwards.
    const sortedDesc = [...stockAdjustments].sort((a, b) =>
      a.adjustedAt < b.adjustedAt ? 1 : -1
    );

    const priceById = new Map<string, number>();
    inventory.forEach((it) => {
      if (it.unitPrice && it.unitPrice > 0) priceById.set(it.id, it.unitPrice);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build end-of-day timestamps for the last 30 days (most recent first).
    const endOfDays: { iso: string; label: string; endMs: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      endOfDays.push({
        iso: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
        }),
        endMs: end.getTime(),
      });
    }

    let adjCursor = 0; // index into sortedDesc — newest unprocessed.
    for (const day of endOfDays) {
      // Roll back any adjustment that happened AFTER end-of-day (i.e. its
      // adjustedAt > day.endMs) — those haven't happened yet from the
      // snapshot's perspective.
      while (adjCursor < sortedDesc.length) {
        const a = sortedDesc[adjCursor];
        const at = new Date(a.adjustedAt).getTime();
        if (at <= day.endMs) break;
        const prev = quantities.get(a.itemId);
        if (prev !== undefined) {
          quantities.set(a.itemId, Math.max(0, prev - a.delta));
        }
        adjCursor += 1;
      }
      // Snapshot value at end of this day.
      let total = 0;
      quantities.forEach((q, id) => {
        const p = priceById.get(id);
        if (p) total += q * p;
      });
      points.push({ label: day.label, value: Math.round(total), iso: day.iso });
    }

    // Chronological order for the chart (oldest -> newest).
    return points.reverse();
  }, [inventory, stockAdjustments]);

  // ---------------- Bulk selection helpers ----------------
  const allSelectedOnPage =
    filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const someSelectedOnPage =
    !allSelectedOnPage && filtered.some((i) => selected.has(i.id));

  const togglePageAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectedOnPage) {
        filtered.forEach((i) => next.delete(i.id));
      } else {
        filtered.forEach((i) => next.add(i.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onBulkDelete = () => {
    if (selected.size === 0) return;
    if (
      !window.confirm(
        `Delete ${selected.size} inventory item${selected.size === 1 ? '' : 's'}? This cannot be undone.`
      )
    ) {
      return;
    }
    const ids = Array.from(selected);
    ids.forEach((id) => deleteInventoryItem(id));
    setSelected(new Set());
    setToast(`Deleted ${ids.length} item${ids.length === 1 ? '' : 's'}.`);
    setToastError(null);
  };

  // ---------------- CSV export ----------------
  const csvEscape = (val: string): string => {
    if (val.includes('"') || val.includes(',') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const onExportCsv = () => {
    const headers = [
      'Name',
      'Category',
      'Location',
      'Quantity',
      'Unit',
      'Unit Price',
      'Reorder Level',
    ];
    const rows = filtered.map((i) => [
      i.name,
      i.category,
      locationLabel[i.location],
      String(i.quantity),
      i.unit,
      i.unitPrice !== undefined ? String(i.unitPrice) : '',
      String(i.reorderLevel),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `inventory-${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ---------------- AI reorder predictions ----------------
  const runPrediction = async () => {
    setPredicting(true);
    setPredictError(null);
    try {
      const bundle = getReorderInputBundle();
      if (bundle.items.length === 0) {
        setPredictError(
          'No items qualify for reorder analysis — all stock is comfortably above reorder level.'
        );
        return;
      }
      const res = await fetch('/api/predict-reorders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundle),
      });
      const json = (await res.json()) as PredictReordersResponse;
      if (!json.ok) {
        setPredictError(json.error);
        return;
      }
      setReorderPrediction(json.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setPredictError(msg);
    } finally {
      setPredicting(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Inventory</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
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
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          {toast}
        </div>
      ) : null}
      {toastError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
          {toastError}
        </div>
      ) : null}

      {showAdd && canEdit ? (
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Add inventory item</h2>
          <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Category</label>
              <input
                className="input"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  // Re-allow suggestion when user changes category.
                  setReorderTouched(false);
                }}
                list="inv-category-suggestions"
              />
              <datalist id="inv-category-suggestions">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
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
                onChange={(e) => {
                  setReorder(e.target.value);
                  setReorderTouched(true);
                }}
              />
              {suggestedReorder !== undefined && !reorderTouched ? (
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Suggested based on {category.trim()} category avg.
                </div>
              ) : null}
            </div>
            <div>
              <label className="label">Unit price (INR, optional)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={unitPriceInput}
                onChange={(e) => setUnitPriceInput(e.target.value)}
                placeholder="e.g. 120"
              />
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="btn btn-primary">Save item</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Total inventory value
          </div>
          <div className="mt-0.5 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {totalInventoryValue > 0 ? formatLakhCrore(totalInventoryValue) : '—'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {pricedItemsCount} of {inventory.length} items priced
            {inventory.length > 0 && pricedItemsCount < inventory.length
              ? ' (add unit prices on remaining items to refine)'
              : ''}
          </div>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Inventory value — last 30 days
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              End-of-day snapshots derived from stock movements.
            </p>
          </div>
        </div>
        <div className="mt-3">
          {valueTrend.length === 0 ? (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4 text-center text-sm text-slate-500 dark:text-slate-400">
              Track stock movements to see value trend here.
            </div>
          ) : (
            <LineChart
              data={valueTrend.map((p) => ({ label: p.label, value: p.value }))}
              height={200}
              yLabel="INR"
              color="#6366f1"
            />
          )}
        </div>
      </section>

      {canSeeReorderPanel ? (
        <section id="reorder-suggestions" className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                <Brain className="h-5 w-5 text-violet-600" />
                AI reorder suggestions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consumption velocity, days-of-supply and price trend for items
                near or below reorder level.
              </p>
              {lastReorderPrediction ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Last analyzed:{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {relativeTime(lastReorderPrediction.generatedAt)}
                  </span>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={runPrediction}
                disabled={predicting}
              >
                {predicting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {lastReorderPrediction
                  ? 'Re-analyze stock'
                  : 'Analyze stock & suggest reorders'}
              </button>
              {lastReorderPrediction ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDetailsOpen(true)}
                >
                  View detailed analysis
                </button>
              ) : null}
            </div>
          </div>

          {predictError ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
              {predictError}
            </div>
          ) : null}

          {!lastReorderPrediction && !predicting && !predictError ? (
            <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-500 dark:text-slate-400">
              No analysis yet. Click &ldquo;Analyze stock&rdquo; to ask Claude for
              prioritised reorder recommendations.
            </div>
          ) : null}

          {lastReorderPrediction ? (
            <ReorderPredictionsTable
              prediction={lastReorderPrediction.result}
              inventory={inventory}
            />
          ) : null}
        </section>
      ) : null}

      <section className="card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <label className="label">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                className="input pl-8"
                placeholder="Search by name or category…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
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
          <div>
            <label className="label">Unit price</label>
            <select
              className="select"
              value={bracket}
              onChange={(e) => setBracket(e.target.value as PriceBracket)}
            >
              {PRICE_BRACKETS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onExportCsv}
            disabled={filtered.length === 0}
            title="Export filtered items to CSV"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <div className="ml-auto text-sm text-slate-500 dark:text-slate-400">
            {filtered.length} items{' '}
            <span className="ml-2 inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500" /> low stock
            </span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                {canEdit ? (
                  <th className="table-th w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all on page"
                      checked={allSelectedOnPage}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelectedOnPage;
                      }}
                      onChange={togglePageAll}
                    />
                  </th>
                ) : null}
                <th className="table-th">Item</th>
                <th className="table-th">Category</th>
                <th className="table-th">Location</th>
                <th className="table-th text-right">Quantity</th>
                <th className="table-th text-right">Unit price</th>
                <th className="table-th text-right">Reorder level</th>
                <th className="table-th text-right">History</th>
                {canEdit ? <th className="table-th text-right">Adjust</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((i) => {
                const low = i.quantity <= i.reorderLevel;
                const isSelected = selected.has(i.id);
                return (
                  <tr
                    key={i.id}
                    className={clsx(
                      low && 'bg-rose-50/40 dark:bg-rose-900/20',
                      isSelected && 'bg-brand-50/60 dark:bg-brand-900/20'
                    )}
                  >
                    {canEdit ? (
                      <td className="table-td">
                        <input
                          type="checkbox"
                          aria-label={`Select ${i.name}`}
                          checked={isSelected}
                          onChange={() => toggleOne(i.id)}
                        />
                      </td>
                    ) : null}
                    <td className="table-td font-medium">{i.name}</td>
                    <td className="table-td">{i.category}</td>
                    <td className="table-td">{locationLabel[i.location]}</td>
                    <td
                      className={clsx(
                        'table-td text-right tabular-nums font-semibold',
                        low && 'text-rose-700 dark:text-rose-400'
                      )}
                    >
                      {i.quantity} {i.unit}
                    </td>
                    <td className="table-td text-right tabular-nums">
                      {i.unitPrice ? formatINR(i.unitPrice) : <span className="text-slate-400 dark:text-slate-500">—</span>}
                    </td>
                    <td className="table-td text-right tabular-nums">{i.reorderLevel}</td>
                    <td className="table-td text-right">
                      <button
                        type="button"
                        className="btn btn-secondary px-2 py-1 text-xs"
                        onClick={() => setHistoryFor(i.id)}
                        title="Stock history"
                      >
                        <History className="h-3 w-3" />
                      </button>
                    </td>
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
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4 text-center text-sm text-slate-500 dark:text-slate-400">
              {inventory.length === 0
                ? 'No inventory items yet. Click "Add item" or "Upload invoice" to start.'
                : 'No items match the current filters.'}
            </div>
          ) : null}
        </div>
      </section>

      {/* Floating action bar for bulk selection */}
      {canEdit && selected.size > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 shadow-lg">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {selected.size} selected
            </span>
            <button
              type="button"
              className="btn btn-danger text-xs"
              onClick={onBulkDelete}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button
              type="button"
              className="btn btn-secondary text-xs"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {historyFor ? (
        <StockHistoryModal
          itemId={historyFor}
          onClose={() => setHistoryFor(null)}
          itemName={inventory.find((i) => i.id === historyFor)?.name ?? ''}
          history={getStockHistory(historyFor)}
        />
      ) : null}

      {detailsOpen && lastReorderPrediction ? (
        <ReorderDetailsModal
          prediction={lastReorderPrediction.result}
          generatedAt={lastReorderPrediction.generatedAt}
          inventory={inventory}
          stockAdjustments={stockAdjustments}
          priceHistory={priceHistory}
          onClose={() => setDetailsOpen(false)}
        />
      ) : null}

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

// -------------------- Reorder predictions table --------------------

function ReorderPredictionsTable({
  prediction,
  inventory,
}: {
  prediction: ReorderPredictionResult;
  inventory: InventoryItem[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sorted = useMemo(
    () =>
      [...prediction.items].sort(
        (a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]
      ),
    [prediction]
  );

  if (sorted.length === 0) {
    return (
      <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-500 dark:text-slate-400">
        The AI returned no reorder recommendations.
        {prediction.summary ? (
          <div className="mt-1 italic">{prediction.summary}</div>
        ) : null}
      </div>
    );
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mt-4 space-y-3">
      {prediction.summary ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-200">
          {prediction.summary}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="py-2 pr-2">Item</th>
              <th className="py-2 pr-2">Urgency</th>
              <th className="py-2 pr-2 text-right">Recommended qty</th>
              <th className="py-2 pr-2 text-right">Days left</th>
              <th className="py-2 pr-2 text-right">Projected spend</th>
              <th className="py-2 pr-2 text-center">Price</th>
              <th className="py-2 pr-2">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sorted.map((rec) => {
              const item = inventory.find((i) => i.id === rec.itemId);
              const isOpen = expanded.has(rec.itemId);
              const reasoning = rec.reasoning || '';
              const truncated =
                reasoning.length > 110
                  ? reasoning.slice(0, 110).trimEnd() + '…'
                  : reasoning;
              return (
                <tr key={rec.itemId} className="align-top">
                  <td className="py-2 pr-2">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {item?.name ?? rec.itemId}
                    </div>
                    {item ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {item.quantity} {item.unit} on hand · reorder at{' '}
                        {item.reorderLevel}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2">
                    <span
                      className={clsx(
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1',
                        URGENCY_STYLES[rec.urgency]
                      )}
                    >
                      {rec.urgency}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {rec.recommendedQuantity} {item?.unit ?? ''}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {rec.estimatedDaysUntilStockout >= 999
                      ? '—'
                      : `${rec.estimatedDaysUntilStockout}d`}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {rec.projectedSpendINR > 0
                      ? formatINR(rec.projectedSpendINR)
                      : '—'}
                  </td>
                  <td className="py-2 pr-2 text-center">
                    <PriceTrendIcon trend={rec.priceTrend} />
                  </td>
                  <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">
                    <div>{isOpen ? reasoning : truncated}</div>
                    {reasoning.length > 110 ? (
                      <button
                        type="button"
                        className="mt-0.5 inline-flex items-center gap-0.5 text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
                        onClick={() => toggle(rec.itemId)}
                      >
                        {isOpen ? (
                          <>
                            <ChevronDown className="h-3 w-3" /> Show less
                          </>
                        ) : (
                          <>
                            <ChevronRight className="h-3 w-3" /> Show more
                          </>
                        )}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -------------------- Reorder details modal --------------------

function ReorderDetailsModal({
  prediction,
  generatedAt,
  inventory,
  stockAdjustments,
  priceHistory,
  onClose,
}: {
  prediction: ReorderPredictionResult;
  generatedAt: string;
  inventory: InventoryItem[];
  stockAdjustments: StockAdjustment[];
  priceHistory: PriceHistoryEntry[];
  onClose: () => void;
}) {
  const sorted = useMemo(
    () =>
      [...prediction.items].sort(
        (a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]
      ),
    [prediction]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-xl bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              <Brain className="h-5 w-5 text-violet-600" /> Reorder analysis —
              detailed view
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Generated {formatDateTime(generatedAt)} ·{' '}
              {relativeTime(generatedAt)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {prediction.summary ? (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-200">
              {prediction.summary}
            </div>
          ) : null}
          {sorted.length === 0 ? (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-500 dark:text-slate-400">
              No per-item recommendations to show.
            </div>
          ) : (
            sorted.map((rec) => (
              <ReorderDetailCard
                key={rec.itemId}
                rec={rec}
                item={inventory.find((i) => i.id === rec.itemId)}
                stockAdjustments={stockAdjustments}
                priceHistory={priceHistory}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ReorderDetailCard({
  rec,
  item,
  stockAdjustments,
  priceHistory,
}: {
  rec: ReorderPredictionItem;
  item: InventoryItem | undefined;
  stockAdjustments: StockAdjustment[];
  priceHistory: PriceHistoryEntry[];
}) {
  const itemAdjustments = useMemo(
    () =>
      stockAdjustments
        .filter((a) => a.itemId === rec.itemId)
        .sort((a, b) => (a.adjustedAt < b.adjustedAt ? 1 : -1))
        .slice(0, 8),
    [stockAdjustments, rec.itemId]
  );

  const lastPrices = useMemo(() => {
    if (!item) return [];
    const lower = item.name.toLowerCase();
    return priceHistory
      .filter((p) => p.itemName.toLowerCase() === lower)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 5);
  }, [priceHistory, item]);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {item?.name ?? rec.itemId}
            </div>
            <span
              className={clsx(
                'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1',
                URGENCY_STYLES[rec.urgency]
              )}
            >
              {rec.urgency}
            </span>
            <PriceTrendIcon trend={rec.priceTrend} />
          </div>
          {item ? (
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {item.quantity} {item.unit} on hand · reorder at{' '}
              {item.reorderLevel} · {locationLabel[item.location]}
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-3 text-right text-xs">
          <div>
            <div className="uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Recommend
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {rec.recommendedQuantity} {item?.unit ?? ''}
            </div>
          </div>
          <div>
            <div className="uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Days left
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {rec.estimatedDaysUntilStockout >= 999
                ? '—'
                : `${rec.estimatedDaysUntilStockout}d`}
            </div>
          </div>
          <div>
            <div className="uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Spend
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {rec.projectedSpendINR > 0
                ? formatINR(rec.projectedSpendINR)
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {rec.reasoning ? (
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">{rec.reasoning}</p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Recent stock adjustments
          </div>
          {itemAdjustments.length === 0 ? (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-2 text-xs text-slate-500 dark:text-slate-400">
              No stock movements recorded yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
              {itemAdjustments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between px-2 py-1 text-xs"
                >
                  <span className="text-slate-500 dark:text-slate-400">
                    {formatDateTime(a.adjustedAt)}
                  </span>
                  <span
                    className={clsx(
                      'tabular-nums font-semibold',
                      a.delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                    )}
                  >
                    {a.delta >= 0 ? '+' : ''}
                    {a.delta}
                  </span>
                  <span className="ml-2 truncate text-slate-600 dark:text-slate-300">
                    {a.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Last 5 prices paid
          </div>
          {lastPrices.length === 0 ? (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-2 text-xs text-slate-500 dark:text-slate-400">
              No recorded purchases yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
              {lastPrices.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-2 py-1 text-xs"
                >
                  <span className="text-slate-500 dark:text-slate-400">{formatDate(p.date)}</span>
                  <span className="tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                    {formatINR(p.unitPrice)}
                  </span>
                  <span className="ml-2 truncate text-slate-600 dark:text-slate-300">
                    {p.vendorName ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
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
          `AI extraction failed: ${json.error}. You can still enter the line items manually.`
        );
        setLines([{ name: '', quantity: '', unit: 'kg', unitPrice: '' }]);
        return;
      }
      setExtracted(json.data);
      setVendorName(json.data.vendorName);
      setLines(lineItemsFromExtracted(json.data.lineItems));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'network error';
      setLocalError(
        `AI extraction failed: ${msg}. You can still enter items manually.`
      );
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
        className="w-full max-w-3xl rounded-xl bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <Receipt className="h-5 w-5 text-brand-600" /> Upload invoice
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {localError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
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
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 hover:border-brand-400'
              )}
            >
              <Upload className="h-6 w-6 text-slate-400 dark:text-slate-500" />
              <div>
                <span className="font-medium text-brand-700 dark:text-brand-300">Click to browse</span>{' '}
                or drag a PDF or image of the invoice here
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
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
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800 dark:text-slate-100">
                    {file.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
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
                  className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-rose-600"
                  disabled={analyzing || applying}
                >
                  Choose different file
                </button>
              </div>

              {analyzing ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 dark:bg-brand-900/30 dark:text-brand-300 dark:ring-brand-800">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing
                  invoice with AI...
                </div>
              ) : extracted ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800">
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
                    className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
                  >
                    + Add line
                  </button>
                </div>
                {lines.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 text-center text-xs text-slate-500 dark:text-slate-400">
                    No line items yet. Add one to apply to inventory.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <th className="py-1 pr-2">Item</th>
                          <th className="py-1 pr-2 w-20">Qty</th>
                          <th className="py-1 pr-2 w-24">Unit</th>
                          <th className="py-1 pr-2 w-28">Unit price</th>
                          <th className="py-1 w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
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
                                className="text-slate-400 dark:text-slate-500 hover:text-rose-600"
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

              <div className="flex flex-wrap gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
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

// -------------------- Stock history modal --------------------

function StockHistoryModal({
  itemId,
  itemName,
  history,
  onClose,
}: {
  itemId: string;
  itemName: string;
  history: import('@/lib/types').StockAdjustment[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-12 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3">
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Stock history
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{itemName || itemId}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">
          {history.length === 0 ? (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-500 dark:text-slate-400">
              No adjustments yet. Stock changes from invoices, GRNs and manual
              edits will show up here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2 text-right">Delta</th>
                    <th className="py-1 pr-2">Reason</th>
                    <th className="py-1 pr-2 text-right">New qty</th>
                    <th className="py-1">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="py-1 pr-2 text-xs text-slate-600 dark:text-slate-300">
                        {formatDateTime(h.adjustedAt)}
                      </td>
                      <td
                        className={
                          'py-1 pr-2 text-right tabular-nums font-semibold ' +
                          (h.delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')
                        }
                      >
                        {h.delta >= 0 ? '+' : ''}
                        {h.delta}
                      </td>
                      <td className="py-1 pr-2 text-slate-700 dark:text-slate-200">{h.reason}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {h.resultingQuantity}
                      </td>
                      <td className="py-1 text-xs">
                        <span className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300">
                          {h.source ?? 'manual'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
