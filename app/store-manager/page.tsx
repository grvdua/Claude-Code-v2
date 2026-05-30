'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Send,
  FileCheck2,
  Warehouse,
  PackageCheck,
  Paperclip,
  Loader2,
  X,
  Sparkles,
  Receipt,
  Upload,
  ChevronUp,
  ChevronDown,
  Truck,
  CheckCircle2,
} from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { PipelineTimeline } from '@/components/PipelineTimeline';
import { ReliabilitySparkline } from '@/components/ReliabilitySparkline';
import { BarChart } from '@/components/charts/BarChart';
import {
  useStore,
  formatINR,
  formatDate,
  formatDateTime,
} from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import type {
  ExtractedInvoiceData,
  ExtractedQuoteData,
  MaterialRequest,
  Quote,
  QuoteAnalysisResult,
  Vendor,
} from '@/lib/types';
import {
  saveFile,
  getFileUrl,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/fileStorage';
import clsx from 'clsx';

type ExtractInvoiceResponse =
  | { ok: true; data: ExtractedInvoiceData }
  | { ok: false; error: string };

type ExtractQuoteResponse =
  | { ok: true; data: ExtractedQuoteData }
  | { ok: false; error: string };

type AnalyzeQuotesResponse =
  | { ok: true; data: QuoteAnalysisResult }
  | { ok: false; error: string };

const STORE = 'Store Manager';

type Tab = 'pipeline' | 'quotes' | 'pos';

type RequestSortKey = 'urgency' | 'date' | 'status';
type SortDir = 'asc' | 'desc';

const URGENCY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

export default function StoreManagerPage() {
  const mounted = useMounted();
  const requests = useStore((s) => s.requests);
  const inventory = useStore((s) => s.inventory);
  const vendors = useStore((s) => s.vendors);
  const quotes = useStore((s) => s.quotes);
  const pos = useStore((s) => s.pos);
  const documents = useStore((s) => s.documents);
  const updateRequestStatus = useStore((s) => s.updateRequestStatus);
  const addQuote = useStore((s) => s.addQuote);
  const raisePOFromQuote = useStore((s) => s.raisePOFromQuote);
  const setItemUnitPrice = useStore((s) => s.setItemUnitPrice);
  const setPOTracking = useStore((s) => s.setPOTracking);
  const attachQuoteAnalysis = useStore((s) => s.attachQuoteAnalysis);
  const logGRN = useStore((s) => s.logGRN);
  const addDocument = useStore((s) => s.addDocument);
  const attachInvoiceToPO = useStore((s) => s.attachInvoiceToPO);
  const processInvoiceExtraction = useStore((s) => s.processInvoiceExtraction);
  const recomputeVendorReliability = useStore(
    (s) => s.recomputeVendorReliability
  );
  const getVendorReliabilityTrend = useStore(
    (s) => s.getVendorReliabilityTrend
  );

  const [tab, setTab] = useState<Tab>('pipeline');
  const [inventoryFor, setInventoryFor] = useState<MaterialRequest | null>(null);
  const [rfqFor, setRfqFor] = useState<MaterialRequest | null>(null);
  const [rfqVendors, setRfqVendors] = useState<string[]>([]);

  // Sort state for procurement requests
  const [reqSort, setReqSort] = useState<{ key: RequestSortKey; dir: SortDir }>({
    key: 'date',
    dir: 'desc',
  });

  // Quote analysis cache & busy state
  const [analyses, setAnalyses] = useState<Record<string, QuoteAnalysisResult>>(
    {}
  );
  const [analyzingFor, setAnalyzingFor] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);

  // Per-quote-table sort
  const [quoteSort, setQuoteSort] = useState<{
    key: 'price' | 'reliability' | 'delivery';
    dir: SortDir;
  }>({ key: 'price', dir: 'asc' });

  // Quote upload modal
  const [quoteUploadFor, setQuoteUploadFor] = useState<MaterialRequest | null>(
    null
  );

  // GRN modal state
  const [grnForPO, setGrnForPO] = useState<string | null>(null);
  const [grnInvoice, setGrnInvoice] = useState<File | null>(null);
  const [grnBusy, setGrnBusy] = useState(false);
  const [grnError, setGrnError] = useState<string | null>(null);
  const [grnExtracting, setGrnExtracting] = useState(false);
  const [grnExtracted, setGrnExtracted] = useState<ExtractedInvoiceData | null>(
    null
  );
  const [grnApplyInventory, setGrnApplyInventory] = useState(true);
  const grnInputRef = useRef<HTMLInputElement>(null);

  // Inline tracking-number input state per PO
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>(
    {}
  );

  // Object URL cleanup
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, []);

  // Ensure synthesized vendor reliability is up-to-date on mount.
  useEffect(() => {
    recomputeVendorReliability();
  }, [recomputeVendorReliability]);

  if (!mounted) return null;

  const inbox = requests.filter(
    (r) => r.status === 'pending' || r.status === 'inventory-checked'
  );

  const openRequests = requests.filter(
    (r) =>
      r.status !== 'delivered' &&
      r.status !== 'ordered'
  );

  const stockFor = (name: string) =>
    inventory.filter((i) => i.name.toLowerCase() === name.toLowerCase());

  const openRfq = (req: MaterialRequest) => {
    setRfqFor(req);
    setRfqVendors([]);
  };

  const sendRfq = () => {
    if (!rfqFor || rfqVendors.length === 0) return;
    rfqVendors.forEach((vid) => {
      const price = Math.round(100 + Math.random() * 300);
      addQuote({
        requestId: rfqFor.id,
        vendorId: vid,
        pricePerUnit: price,
        totalPrice: price * rfqFor.quantity,
        deliveryDate: new Date(Date.now() + 2 * 86400000).toISOString(),
        notes: 'Auto-generated demo quote',
      });
    });
    updateRequestStatus(rfqFor.id, 'quotes-received');
    setRfqFor(null);
    setRfqVendors([]);
  };

  const quotesForRequest = (rid: string) =>
    quotes.filter((q) => q.requestId === rid);

  // Sort helpers
  const sortedOpenRequests = useMemo(() => {
    const arr = [...openRequests];
    arr.sort((a, b) => {
      let cmp = 0;
      if (reqSort.key === 'urgency') {
        cmp = (URGENCY_RANK[a.urgency] ?? 0) - (URGENCY_RANK[b.urgency] ?? 0);
      } else if (reqSort.key === 'date') {
        cmp = a.raisedAt < b.raisedAt ? -1 : 1;
      } else if (reqSort.key === 'status') {
        cmp = a.status.localeCompare(b.status);
      }
      return reqSort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [openRequests, reqSort]);

  const toggleReqSort = (key: RequestSortKey) => {
    setReqSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const requestsAwaitingPO = useMemo(
    () => requests.filter((r) => r.status === 'quotes-received'),
    [requests]
  );

  const vendorById = (vid: string) => vendors.find((v) => v.id === vid);

  // Latest composite for a vendor (most recent month).
  const latestReliability = (vendorId: string): number | undefined => {
    const trend = getVendorReliabilityTrend(vendorId, 6);
    return trend.length > 0 ? trend[trend.length - 1].compositeScore : undefined;
  };

  const reliabilityTrendValues = (vendorId: string): number[] =>
    getVendorReliabilityTrend(vendorId, 6).map((e) => e.compositeScore);

  const reliabilityTrendLabels = (vendorId: string): string[] =>
    getVendorReliabilityTrend(vendorId, 6).map((e) => e.month);

  const lastKnownPriceFor = (itemName: string): number | undefined => {
    const inv = inventory.find(
      (i) => i.name.toLowerCase() === itemName.toLowerCase()
    );
    return inv?.unitPrice;
  };

  const runAnalysis = async (req: MaterialRequest) => {
    setAnalyzeError(null);
    const qs = quotesForRequest(req.id);
    if (qs.length === 0) {
      setAnalyzeError('No quotes to analyze.');
      return;
    }
    setAnalyzingFor(req.id);
    try {
      const vendorReliability: Record<string, number> = {};
      for (const q of qs) {
        const score = latestReliability(q.vendorId);
        if (typeof score === 'number') vendorReliability[q.vendorId] = score;
      }
      const res = await fetch('/api/analyze-quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: req.id,
          quotes: qs.map((q) => ({
            id: q.id,
            vendorName: vendorById(q.vendorId)?.name ?? q.vendorId,
            vendorId: q.vendorId,
            pricePerUnit: q.pricePerUnit,
            totalPrice: q.totalPrice,
            deliveryDate: q.deliveryDate,
            notes: q.notes,
          })),
          item: {
            name: req.itemName,
            unit: req.unit,
            lastKnownPrice: lastKnownPriceFor(req.itemName),
          },
          vendorReliability,
        }),
      });
      const json = (await res.json()) as AnalyzeQuotesResponse;
      if (!json.ok) {
        setAnalyzeError(`AI analysis failed: ${json.error}`);
        return;
      }
      setAnalyses((prev) => ({ ...prev, [req.id]: json.data }));
      attachQuoteAnalysis(req.id, json.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setAnalyzeError(`AI analysis failed: ${msg}`);
    } finally {
      setAnalyzingFor(null);
    }
  };

  const raisePoForQuote = (req: MaterialRequest, q: Quote) => {
    const newPoId = raisePOFromQuote(q.id, STORE);
    if (!newPoId) return;
    // Auto-update inventory unit price if it would change by >1%.
    const inv = inventory.find(
      (i) => i.name.toLowerCase() === req.itemName.toLowerCase()
    );
    if (inv) {
      const prev = inv.unitPrice ?? 0;
      const delta = prev === 0 ? Infinity : Math.abs(q.pricePerUnit - prev) / prev;
      if (delta > 0.01) {
        setItemUnitPrice(inv.id, q.pricePerUnit);
      }
    }
  };

  const openGrn = (poId: string) => {
    setGrnForPO(poId);
    setGrnInvoice(null);
    setGrnError(null);
    setGrnExtracted(null);
    setGrnApplyInventory(true);
    if (grnInputRef.current) grnInputRef.current.value = '';
  };

  const handleGrnInvoicePick = async (file: File | null) => {
    setGrnInvoice(file);
    setGrnExtracted(null);
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      return;
    }
    setGrnExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/extract-invoice', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as ExtractInvoiceResponse;
      if (json.ok) setGrnExtracted(json.data);
    } catch {
      // non-fatal
    } finally {
      setGrnExtracting(false);
    }
  };

  const submitGrn = async () => {
    if (!grnForPO) return;
    setGrnError(null);
    if (grnInvoice && grnInvoice.size > MAX_FILE_SIZE_BYTES) {
      setGrnError(
        `Invoice is ${formatFileSize(grnInvoice.size)} — must be under 25 MB.`
      );
      return;
    }
    setGrnBusy(true);
    try {
      const poId = grnForPO;
      let docId: string | undefined;
      if (grnInvoice) {
        const fileId = await saveFile(grnInvoice);
        const po = pos.find((p) => p.id === poId);
        const vendorName =
          vendors.find((v) => v.id === po?.vendorId)?.name ?? po?.vendorId ?? '';
        docId = addDocument({
          name: `Invoice — ${poId}${vendorName ? ` — ${vendorName}` : ''}`,
          category: 'Invoice',
          fileId,
          fileName: grnInvoice.name,
          fileType: grnInvoice.type || 'application/octet-stream',
          fileSize: grnInvoice.size,
          linkedTo: { type: 'po', id: poId },
        });
        attachInvoiceToPO(poId, docId);
      }
      if (grnExtracted && grnApplyInventory) {
        processInvoiceExtraction(grnExtracted, {
          documentId: docId,
          poId,
          recordedBy: STORE,
        });
      }
      logGRN(poId);
      setGrnForPO(null);
      setGrnInvoice(null);
      setGrnExtracted(null);
    } catch (err) {
      setGrnError(err instanceof Error ? err.message : 'Failed to log GRN.');
    } finally {
      setGrnBusy(false);
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

  // ---------- Tab content ----------

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white">
          <Warehouse className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Store Dashboard</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Process chef requests, issue RFQs, raise POs, and log deliveries.
          </p>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {(
          [
            ['pipeline', 'Procurement pipeline'],
            ['quotes', 'Vendors & Quotes'],
            ['pos', 'Purchase orders'],
          ] as Array<[Tab, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition',
              tab === k
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'pipeline' ? (
        <>
          <section className="card p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Inbox — chef requests
            </h2>
            {inbox.length === 0 ? (
              <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-500 dark:text-slate-400">
                No new requests.
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {inbox.map((r) => (
                  <li key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {r.quantity} {r.unit} · {r.itemName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Raised by {r.raisedBy} · {formatDateTime(r.raisedAt)}
                        </div>
                        {r.notes ? (
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{r.notes}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.urgency} />
                        <StatusBadge status={r.status} />
                        <button
                          className="btn btn-secondary text-xs"
                          onClick={() => {
                            setInventoryFor(r);
                            if (r.status === 'pending')
                              updateRequestStatus(r.id, 'inventory-checked');
                          }}
                        >
                          <Search className="h-4 w-4" /> Check inventory
                        </button>
                        <button
                          className="btn btn-primary text-xs"
                          onClick={() => openRfq(r)}
                        >
                          <Send className="h-4 w-4" /> Raise RFQ
                        </button>
                      </div>
                    </div>

                    {inventoryFor?.id === r.id ? (
                      <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 text-sm">
                        <div className="mb-1 font-medium text-slate-800 dark:text-slate-100">
                          Stock for "{r.itemName}"
                        </div>
                        {stockFor(r.itemName).length === 0 ? (
                          <div className="text-rose-600 dark:text-rose-400">
                            No stock found — procurement needed.
                          </div>
                        ) : (
                          <ul className="space-y-1">
                            {stockFor(r.itemName).map((s) => {
                              const deficit = r.quantity - s.quantity;
                              return (
                                <li
                                  key={s.id}
                                  className="flex items-center justify-between"
                                >
                                  <span className="capitalize text-slate-700 dark:text-slate-200">
                                    {s.location.replace('-', ' ')}
                                  </span>
                                  <span className="text-slate-900 dark:text-slate-100">
                                    {s.quantity} {s.unit}{' '}
                                    {deficit > 0 ? (
                                      <span className="ml-2 text-xs text-rose-600 dark:text-rose-400">
                                        deficit {deficit}
                                      </span>
                                    ) : (
                                      <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                                        sufficient
                                      </span>
                                    )}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        <button
                          className="mt-2 text-xs text-slate-500 dark:text-slate-400 underline"
                          onClick={() => setInventoryFor(null)}
                        >
                          Close
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {rfqFor ? (
            <section className="card border border-brand-300 dark:border-brand-800 p-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Raise RFQ — {rfqFor.quantity} {rfqFor.unit} {rfqFor.itemName}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pick vendors to request quotes from.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {vendors.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 text-sm text-slate-500 dark:text-slate-400 sm:col-span-2">
                    No vendors yet. Add some from the owner page, or upload an
                    invoice to auto-create one.
                  </div>
                ) : (
                  vendors.map((v) => (
                    <label
                      key={v.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={rfqVendors.includes(v.id)}
                        onChange={(e) => {
                          setRfqVendors((prev) =>
                            e.target.checked
                              ? [...prev, v.id]
                              : prev.filter((x) => x !== v.id)
                          );
                        }}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{v.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {v.category} · rating {v.rating}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="btn btn-primary"
                  onClick={sendRfq}
                  disabled={rfqVendors.length === 0}
                >
                  <Send className="h-4 w-4" /> Send RFQ ({rfqVendors.length})
                </button>
                <button className="btn btn-secondary" onClick={() => setRfqFor(null)}>
                  Cancel
                </button>
              </div>
            </section>
          ) : null}

          {/* Procurement pipeline */}
          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Procurement pipeline
              </h2>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Sort by:{' '}
                <SortButton
                  active={reqSort.key === 'urgency'}
                  dir={reqSort.dir}
                  onClick={() => toggleReqSort('urgency')}
                >
                  Urgency
                </SortButton>{' '}
                <SortButton
                  active={reqSort.key === 'date'}
                  dir={reqSort.dir}
                  onClick={() => toggleReqSort('date')}
                >
                  Date
                </SortButton>{' '}
                <SortButton
                  active={reqSort.key === 'status'}
                  dir={reqSort.dir}
                  onClick={() => toggleReqSort('status')}
                >
                  Status
                </SortButton>
              </div>
            </div>
            {sortedOpenRequests.length === 0 ? (
              <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-500 dark:text-slate-400">
                Pipeline is clear — no open procurement requests.
              </div>
            ) : (
              <ul className="mt-3 space-y-4">
                {sortedOpenRequests.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {r.quantity} {r.unit} · {r.itemName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Raised by {r.raisedBy} · {formatDateTime(r.raisedAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.urgency} />
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                    <PipelineTimeline
                      request={r}
                      quotes={quotes}
                      pos={pos}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {tab === 'quotes' ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Vendors & Quotes
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Compare incoming quotes, run AI analysis, and raise POs.
              </p>
            </div>
          </div>

          {analyzeError ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
              {analyzeError}
            </div>
          ) : null}

          {requestsAwaitingPO.length === 0 ? (
            <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-500 dark:text-slate-400">
              No quotes pending review.
            </div>
          ) : (
            <div className="mt-3 space-y-6">
              {requestsAwaitingPO.map((r) => {
                const qs = quotesForRequest(r.id);
                const analysis = analyses[r.id];
                // Sort quotes
                const sortedQs = [...qs].sort((a, b) => {
                  let cmp = 0;
                  if (quoteSort.key === 'price') {
                    cmp = a.pricePerUnit - b.pricePerUnit;
                  } else if (quoteSort.key === 'reliability') {
                    const ra = latestReliability(a.vendorId) ?? 0;
                    const rb = latestReliability(b.vendorId) ?? 0;
                    cmp = ra - rb;
                  } else {
                    cmp = a.deliveryDate < b.deliveryDate ? -1 : 1;
                  }
                  return quoteSort.dir === 'asc' ? cmp : -cmp;
                });
                return (
                  <div
                    key={r.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {r.quantity} {r.unit} · {r.itemName}
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary text-xs"
                          onClick={() => setQuoteUploadFor(r)}
                        >
                          <Upload className="h-4 w-4" /> Upload vendor quote
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary text-xs"
                          onClick={() => runAnalysis(r)}
                          disabled={analyzingFor === r.id || qs.length === 0}
                        >
                          {analyzingFor === r.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Analyzing…
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              Analyze quotes with AI
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {analysis ? (
                      <RecommendationBanner
                        analysis={analysis}
                        vendors={vendors}
                        quotes={qs}
                        onApprove={(q) => raisePoForQuote(r, q)}
                      />
                    ) : null}

                    {qs.length === 0 ? (
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 text-sm text-slate-500 dark:text-slate-400">
                        No quotes yet. Upload a vendor quote to begin.
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-slate-100 dark:border-slate-800">
                                <th className="table-th">Vendor</th>
                                <th className="table-th">Reliability</th>
                                <th className="table-th">
                                  <SortHeader
                                    label="Price/unit"
                                    active={quoteSort.key === 'price'}
                                    dir={quoteSort.dir}
                                    onClick={() =>
                                      setQuoteSort((p) =>
                                        p.key === 'price'
                                          ? {
                                              key: 'price',
                                              dir: p.dir === 'asc' ? 'desc' : 'asc',
                                            }
                                          : { key: 'price', dir: 'asc' }
                                      )
                                    }
                                  />
                                </th>
                                <th className="table-th">Total</th>
                                <th className="table-th">
                                  <SortHeader
                                    label="Delivery"
                                    active={quoteSort.key === 'delivery'}
                                    dir={quoteSort.dir}
                                    onClick={() =>
                                      setQuoteSort((p) =>
                                        p.key === 'delivery'
                                          ? {
                                              key: 'delivery',
                                              dir: p.dir === 'asc' ? 'desc' : 'asc',
                                            }
                                          : { key: 'delivery', dir: 'asc' }
                                      )
                                    }
                                  />
                                </th>
                                <th className="table-th">Notes</th>
                                <th className="table-th text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {sortedQs.map((q) => {
                                const v = vendorById(q.vendorId);
                                const trend = reliabilityTrendValues(q.vendorId);
                                const labels = reliabilityTrendLabels(q.vendorId);
                                const rel = latestReliability(q.vendorId);
                                const ai = analysis?.perQuote[q.id] ?? q.aiAnalysis;
                                const recommended =
                                  analysis?.recommendedQuoteId === q.id;
                                return (
                                  <Fragment key={q.id}>
                                    <tr
                                      className={clsx(
                                        recommended && 'bg-emerald-50/40 dark:bg-emerald-900/20'
                                      )}
                                    >
                                      <td className="table-td">
                                        <div className="font-medium text-slate-900 dark:text-slate-100">
                                          {v?.name ?? q.vendorId}
                                        </div>
                                        {recommended ? (
                                          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Recommended
                                          </span>
                                        ) : null}
                                      </td>
                                      <td className="table-td">
                                        <div className="flex items-center gap-2">
                                          <span className="tabular-nums">
                                            {rel ?? '—'}
                                          </span>
                                          <ReliabilitySparkline
                                            data={trend}
                                            labels={labels}
                                          />
                                        </div>
                                      </td>
                                      <td className="table-td tabular-nums">
                                        {formatINR(q.pricePerUnit)}
                                      </td>
                                      <td className="table-td font-semibold tabular-nums">
                                        {formatINR(q.totalPrice)}
                                      </td>
                                      <td className="table-td text-xs">
                                        {formatDate(q.deliveryDate)}
                                      </td>
                                      <td className="table-td text-xs text-slate-600 dark:text-slate-300">
                                        {q.notes || '—'}
                                      </td>
                                      <td className="table-td text-right">
                                        <div className="inline-flex gap-1">
                                          {ai ? (
                                            <button
                                              type="button"
                                              className="btn btn-secondary text-xs"
                                              onClick={() =>
                                                setExpandedQuote((cur) =>
                                                  cur === q.id ? null : q.id
                                                )
                                              }
                                            >
                                              {expandedQuote === q.id ? (
                                                <ChevronUp className="h-3 w-3" />
                                              ) : (
                                                <ChevronDown className="h-3 w-3" />
                                              )}
                                              AI
                                            </button>
                                          ) : null}
                                          <button
                                            className="btn btn-primary text-xs"
                                            onClick={() => raisePoForQuote(r, q)}
                                          >
                                            <FileCheck2 className="h-4 w-4" /> Raise PO
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                    {expandedQuote === q.id && ai ? (
                                      <tr key={`${q.id}-ai`}>
                                        <td
                                          colSpan={7}
                                          className="bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-xs"
                                        >
                                          <div className="grid gap-3 sm:grid-cols-2">
                                            <div>
                                              <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                                                Pros
                                              </div>
                                              <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-700 dark:text-slate-200">
                                                {ai.pros.length === 0 ? (
                                                  <li className="text-slate-400 dark:text-slate-500">—</li>
                                                ) : (
                                                  ai.pros.map((p, idx) => (
                                                    <li key={idx}>{p}</li>
                                                  ))
                                                )}
                                              </ul>
                                            </div>
                                            <div>
                                              <div className="font-semibold text-rose-700 dark:text-rose-400">
                                                Cons
                                              </div>
                                              <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-700 dark:text-slate-200">
                                                {ai.cons.length === 0 ? (
                                                  <li className="text-slate-400 dark:text-slate-500">—</li>
                                                ) : (
                                                  ai.cons.map((c, idx) => (
                                                    <li key={idx}>{c}</li>
                                                  ))
                                                )}
                                              </ul>
                                            </div>
                                            <div className="sm:col-span-2">
                                              <div className="flex flex-wrap items-center gap-3">
                                                <span className="rounded bg-white dark:bg-slate-900 px-2 py-0.5 ring-1 ring-slate-200 dark:ring-slate-800">
                                                  Value: <b>{ai.valueScore}</b>
                                                </span>
                                                <span className="rounded bg-white dark:bg-slate-900 px-2 py-0.5 ring-1 ring-slate-200 dark:ring-slate-800">
                                                  Reliability:{' '}
                                                  <b>{ai.reliabilityScore}</b>
                                                </span>
                                              </div>
                                              <p className="mt-1 text-slate-700 dark:text-slate-200">
                                                {ai.reasoning}
                                              </p>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    ) : null}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Side-by-side comparison charts */}
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                            <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                              Price per unit (lower is better)
                            </div>
                            <BarChart
                              data={qs.map((q) => ({
                                label:
                                  (vendorById(q.vendorId)?.name ?? q.vendorId).slice(
                                    0,
                                    10
                                  ),
                                value: q.pricePerUnit,
                              }))}
                              color="#0ea5e9"
                              formatValue={(v) => `₹${Math.round(v)}`}
                              height={200}
                            />
                          </div>
                          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                            <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                              Vendor reliability (higher is better)
                            </div>
                            <BarChart
                              data={qs.map((q) => ({
                                label:
                                  (vendorById(q.vendorId)?.name ?? q.vendorId).slice(
                                    0,
                                    10
                                  ),
                                value: latestReliability(q.vendorId) ?? 0,
                              }))}
                              color="#059669"
                              height={200}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'pos' ? (
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Purchase orders</h2>
          {pos.length === 0 ? (
            <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-500 dark:text-slate-400">
              No purchase orders yet.
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="table-th">PO</th>
                    <th className="table-th">Vendor</th>
                    <th className="table-th">Items</th>
                    <th className="table-th">Value</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Tracking</th>
                    <th className="table-th text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[...pos]
                    .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1))
                    .map((p) => {
                      const v = vendors.find((vv) => vv.id === p.vendorId);
                      const canTrack =
                        p.status === 'approved' || p.status === 'ordered';
                      return (
                        <tr key={p.id}>
                          <td className="table-td font-mono text-xs">
                            <div className="flex items-center gap-2">
                              <span>{p.id}</span>
                              {p.invoiceDocumentId ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    viewDocument(p.invoiceDocumentId as string)
                                  }
                                  className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-300 hover:underline"
                                  title="View attached invoice"
                                >
                                  <Paperclip className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td className="table-td">{v?.name ?? p.vendorId}</td>
                          <td className="table-td">
                            {p.items
                              .map(
                                (it) => `${it.quantity} ${it.unit} ${it.itemName}`
                              )
                              .join(', ')}
                          </td>
                          <td className="table-td font-semibold">
                            {formatINR(p.totalValue)}
                          </td>
                          <td className="table-td">
                            <StatusBadge status={p.status} />
                          </td>
                          <td className="table-td text-xs">
                            {canTrack ? (
                              p.trackingNumber ? (
                                <span
                                  className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200"
                                  title={p.shipmentNotes ?? ''}
                                >
                                  <Truck className="h-3 w-3" />
                                  {p.trackingNumber}
                                </span>
                              ) : (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const val = (trackingDrafts[p.id] ?? '').trim();
                                    if (val) {
                                      setPOTracking(p.id, val);
                                      setTrackingDrafts((d) => {
                                        const next = { ...d };
                                        delete next[p.id];
                                        return next;
                                      });
                                    }
                                  }}
                                  className="flex items-center gap-1"
                                >
                                  <input
                                    type="text"
                                    placeholder="Add tracking #"
                                    value={trackingDrafts[p.id] ?? ''}
                                    onChange={(e) =>
                                      setTrackingDrafts((d) => ({
                                        ...d,
                                        [p.id]: e.target.value,
                                      }))
                                    }
                                    className="input px-2 py-1 text-xs"
                                  />
                                  <button
                                    type="submit"
                                    className="btn btn-secondary text-[11px]"
                                  >
                                    Save
                                  </button>
                                </form>
                              )
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>
                          <td className="table-td text-right">
                            {p.status === 'approved' || p.status === 'ordered' ? (
                              <button
                                className="btn btn-primary text-xs"
                                onClick={() => openGrn(p.id)}
                              >
                                <PackageCheck className="h-4 w-4" /> Log GRN
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* Quote upload modal */}
      {quoteUploadFor ? (
        <QuoteUploadModal
          request={quoteUploadFor}
          vendors={vendors}
          onClose={() => setQuoteUploadFor(null)}
          onAdd={(payload) => {
            // resolve vendor by name (case-insensitive) — fall back to first vendor.
            let vendorId =
              vendors.find(
                (v) => v.name.toLowerCase() === payload.vendorName.toLowerCase()
              )?.id ?? '';
            if (!vendorId && vendors.length > 0) vendorId = vendors[0].id;
            if (!vendorId) {
              return 'No vendors available — add a vendor first.';
            }
            addQuote({
              requestId: quoteUploadFor.id,
              vendorId,
              pricePerUnit: payload.pricePerUnit,
              totalPrice: payload.totalPrice,
              deliveryDate: payload.deliveryDate,
              notes: payload.notes,
            });
            setQuoteUploadFor(null);
            return null;
          }}
        />
      ) : null}

      {/* GRN modal */}
      {grnForPO ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Log GRN</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Confirm receipt for{' '}
                  <span className="font-mono">{grnForPO}</span>. Attach the
                  supplier invoice (optional).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGrnForPO(null)}
                className="rounded p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {grnError ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                {grnError}
              </div>
            ) : null}
            <div className="mt-3">
              <label className="label">Attach invoice (optional)</label>
              <input
                ref={grnInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) =>
                  handleGrnInvoicePick(e.target.files?.[0] ?? null)
                }
                className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 dark:hover:file:bg-brand-900/50"
              />
              {grnInvoice ? (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {grnInvoice.name} · {formatFileSize(grnInvoice.size)}
                </div>
              ) : null}
              {grnExtracting ? (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-700 dark:text-brand-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting line
                  items...
                </div>
              ) : null}
              {grnExtracted ? (
                <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2 text-xs dark:border-violet-800 dark:bg-violet-900/20">
                  <div className="flex items-center gap-1 font-medium text-violet-900 dark:text-violet-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    {grnExtracted.invoiceType} invoice from{' '}
                    {grnExtracted.vendorName || '—'} ·{' '}
                    {grnExtracted.lineItems.length} item
                    {grnExtracted.lineItems.length === 1 ? '' : 's'}
                  </div>
                  {grnForPO ? (
                    <GrnComparison poId={grnForPO} extracted={grnExtracted} />
                  ) : null}
                  <label className="mt-2 inline-flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={grnApplyInventory}
                      onChange={(e) => setGrnApplyInventory(e.target.checked)}
                    />
                    Apply to inventory + vendor ledger
                  </label>
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setGrnForPO(null)}
                disabled={grnBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitGrn}
                disabled={grnBusy}
              >
                {grnBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Logging...
                  </>
                ) : (
                  <>
                    <PackageCheck className="h-4 w-4" /> Confirm GRN
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// --------- Helpers ---------

function SortButton({
  active,
  dir,
  onClick,
  children,
}: {
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5',
        active
          ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-900/30 dark:text-brand-300 dark:ring-brand-800'
          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
      )}
    >
      {children}
      {active ? (
        dir === 'asc' ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : null}
    </button>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-0.5',
        active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'
      )}
    >
      {label}
      {active ? (
        dir === 'asc' ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : null}
    </button>
  );
}

function RecommendationBanner({
  analysis,
  vendors,
  quotes,
  onApprove,
}: {
  analysis: QuoteAnalysisResult;
  vendors: Vendor[];
  quotes: Quote[];
  onApprove: (q: Quote) => void;
}) {
  const recQuote = quotes.find((q) => q.id === analysis.recommendedQuoteId);
  const vendorName =
    vendors.find((v) => v.id === recQuote?.vendorId)?.name ??
    recQuote?.vendorId ??
    '—';
  return (
    <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            <Sparkles className="h-4 w-4" />
            Recommended: {vendorName}
            {analysis.estimatedSavingsINR > 0 ? (
              <span className="text-emerald-800 dark:text-emerald-200">
                — Est. savings {formatINR(analysis.estimatedSavingsINR)}{' '}
                <span className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  {analysis.savingsBaseline}
                </span>
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-3xl text-xs text-emerald-900/80 dark:text-emerald-200/80">
            {analysis.summary}
          </p>
        </div>
        {recQuote ? (
          <button
            type="button"
            className="btn btn-primary text-xs"
            onClick={() => onApprove(recQuote)}
          >
            <CheckCircle2 className="h-4 w-4" /> Approve &amp; raise PO
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------- Quote upload modal ----------

interface QuoteFormDraft {
  vendorName: string;
  pricePerUnit: string;
  totalPrice: string;
  deliveryDate: string;
  notes: string;
}

function QuoteUploadModal({
  request,
  vendors,
  onClose,
  onAdd,
}: {
  request: MaterialRequest;
  vendors: Vendor[];
  onClose: () => void;
  onAdd: (q: {
    vendorName: string;
    pricePerUnit: number;
    totalPrice: number;
    deliveryDate: string;
    notes: string;
  }) => string | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedQuoteData | null>(null);
  const [draft, setDraft] = useState<QuoteFormDraft>({
    vendorName: '',
    pricePerUnit: '',
    totalPrice: '',
    deliveryDate: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | null) => {
    setExtracted(null);
    setFile(f);
    if (!f) return;
    if (f.size > MAX_FILE_SIZE_BYTES) {
      setError(
        `"${f.name}" is ${formatFileSize(f.size)} — files must be under 25 MB.`
      );
      return;
    }
    void run(f);
  };

  const run = async (f: File) => {
    setAnalyzing(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/extract-quote', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as ExtractQuoteResponse;
      if (!json.ok) {
        setError(
          `AI extraction failed: ${json.error}. Enter details manually.`
        );
        return;
      }
      setExtracted(json.data);
      // Try to pre-fill the form using the line item matching this request.
      const li =
        json.data.items.find(
          (it) =>
            it.name.toLowerCase() === request.itemName.toLowerCase() ||
            it.name.toLowerCase().includes(request.itemName.toLowerCase()) ||
            request.itemName.toLowerCase().includes(it.name.toLowerCase())
        ) ?? json.data.items[0];
      setDraft({
        vendorName: json.data.vendorName,
        pricePerUnit: li ? String(li.unitPrice) : '',
        totalPrice: li
          ? String(li.totalPrice || li.unitPrice * request.quantity)
          : String(json.data.totalAmount),
        deliveryDate: json.data.deliveryDate,
        notes: json.data.notes,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setError(`AI extraction failed: ${msg}. Enter details manually.`);
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.vendorName.trim()) {
      setError('Vendor name is required.');
      return;
    }
    const ppu = Number(draft.pricePerUnit);
    const total = Number(draft.totalPrice) || ppu * request.quantity;
    if (!ppu || ppu <= 0) {
      setError('Price per unit must be greater than zero.');
      return;
    }
    const msg = onAdd({
      vendorName: draft.vendorName.trim(),
      pricePerUnit: ppu,
      totalPrice: total,
      deliveryDate: draft.deliveryDate,
      notes: draft.notes,
    });
    if (msg) {
      setError(msg);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-12 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <Upload className="h-5 w-5 text-brand-600" /> Upload vendor quote
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            For: {request.quantity} {request.unit} · {request.itemName}
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          <div>
            <label className="label">Quote file (PDF/image)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 dark:hover:file:bg-brand-900/50"
            />
            {file ? (
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {file.name} · {formatFileSize(file.size)}
              </div>
            ) : null}
            {analyzing ? (
              <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-brand-700 dark:text-brand-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting…
              </div>
            ) : null}
            {extracted ? (
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800">
                <Sparkles className="h-3 w-3" /> Pre-filled — review before saving
              </div>
            ) : null}
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Vendor name</label>
                <input
                  className="input"
                  value={draft.vendorName}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, vendorName: e.target.value }))
                  }
                  list="known-vendors"
                  placeholder="Supplier"
                />
                <datalist id="known-vendors">
                  {vendors.map((v) => (
                    <option key={v.id} value={v.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="label">Delivery date</label>
                <input
                  className="input"
                  type="date"
                  value={draft.deliveryDate || ''}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, deliveryDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="label">Price / unit (INR)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={draft.pricePerUnit}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, pricePerUnit: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="label">Total (INR)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={draft.totalPrice}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, totalPrice: e.target.value }))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Notes</label>
                <input
                  className="input"
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, notes: e.target.value }))
                  }
                  placeholder="Payment terms, MOQ, freebies…"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                <FileCheck2 className="h-4 w-4" /> Add quote
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function GrnComparison({
  poId,
  extracted,
}: {
  poId: string;
  extracted: ExtractedInvoiceData;
}) {
  const pos = useStore((s) => s.pos);
  const po = pos.find((p) => p.id === poId);
  if (!po || extracted.lineItems.length === 0) return null;

  // Build a comparison: PO expected vs invoice extracted (matched by name).
  const rows = po.items.map((it) => {
    const match = extracted.lineItems.find(
      (li) =>
        li.name.toLowerCase() === it.itemName.toLowerCase() ||
        li.name.toLowerCase().includes(it.itemName.toLowerCase()) ||
        it.itemName.toLowerCase().includes(li.name.toLowerCase())
    );
    return {
      name: it.itemName,
      expectedQty: it.quantity,
      actualQty: match?.quantity ?? 0,
      unit: it.unit,
    };
  });
  // Extra invoice items not on the PO
  const extras = extracted.lineItems.filter(
    (li) =>
      !po.items.some(
        (it) =>
          it.itemName.toLowerCase() === li.name.toLowerCase() ||
          it.itemName.toLowerCase().includes(li.name.toLowerCase()) ||
          li.name.toLowerCase().includes(it.itemName.toLowerCase())
      )
  );

  return (
    <div className="mt-2 rounded bg-white dark:bg-slate-900 p-2 ring-1 ring-violet-100 dark:ring-violet-800">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        PO vs invoice
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-slate-500 dark:text-slate-400">
            <th className="py-0.5 text-left">Item</th>
            <th className="py-0.5 text-right">Expected</th>
            <th className="py-0.5 text-right">Invoice</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const diff = r.actualQty - r.expectedQty;
            return (
              <tr key={i}>
                <td className="py-0.5">{r.name}</td>
                <td className="py-0.5 text-right tabular-nums">
                  {r.expectedQty} {r.unit}
                </td>
                <td
                  className={
                    'py-0.5 text-right tabular-nums ' +
                    (diff === 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : diff > 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-rose-700 dark:text-rose-400')
                  }
                >
                  {r.actualQty} {r.unit}
                </td>
              </tr>
            );
          })}
          {extras.map((li, i) => (
            <tr key={`x-${i}`} className="text-slate-600 dark:text-slate-300">
              <td className="py-0.5">
                <span className="inline-flex items-center gap-1">
                  <Receipt className="h-3 w-3 text-violet-500" />
                  {li.name}
                </span>
              </td>
              <td className="py-0.5 text-right tabular-nums">—</td>
              <td className="py-0.5 text-right tabular-nums">
                {li.quantity} {li.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
