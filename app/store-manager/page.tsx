'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import {
  useStore,
  formatINR,
  formatDate,
  formatDateTime,
} from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import type {
  ExtractedInvoiceData,
  MaterialRequest,
  Quote,
} from '@/lib/types';
import {
  saveFile,
  getFileUrl,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/fileStorage';

type ExtractInvoiceResponse =
  | { ok: true; data: ExtractedInvoiceData }
  | { ok: false; error: string };

const STORE = 'Store Manager';

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
  const raisePO = useStore((s) => s.raisePO);
  const logGRN = useStore((s) => s.logGRN);
  const addDocument = useStore((s) => s.addDocument);
  const attachInvoiceToPO = useStore((s) => s.attachInvoiceToPO);
  const processInvoiceExtraction = useStore((s) => s.processInvoiceExtraction);

  const [inventoryFor, setInventoryFor] = useState<MaterialRequest | null>(null);
  const [rfqFor, setRfqFor] = useState<MaterialRequest | null>(null);
  const [rfqVendors, setRfqVendors] = useState<string[]>([]);

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

  // Object URL cleanup
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, []);

  if (!mounted) return null;

  const inbox = requests.filter((r) => r.status === 'pending' || r.status === 'inventory-checked');

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

  const quotesForRequest = (rid: string) => quotes.filter((q) => q.requestId === rid);

  const raisePOFromQuote = (req: MaterialRequest, q: Quote) => {
    raisePO({
      requestId: req.id,
      vendorId: q.vendorId,
      items: [
        {
          itemName: req.itemName,
          quantity: req.quantity,
          unit: req.unit,
          pricePerUnit: q.pricePerUnit,
        },
      ],
      totalValue: q.totalPrice,
      raisedBy: STORE,
    });
    updateRequestStatus(req.id, 'po-raised');
  };

  const requestsAwaitingPO = useMemo(
    () => requests.filter((r) => r.status === 'quotes-received'),
    [requests]
  );

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
      // Too big for AI; user can still attach without extraction.
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

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white">
          <Warehouse className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Store Dashboard</h1>
          <p className="text-sm text-slate-600">Process chef requests, issue RFQs, raise POs, and log deliveries.</p>
        </div>
      </header>

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-slate-900">Inbox — chef requests</h2>
        {inbox.length === 0 ? (
          <div className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No new requests.</div>
        ) : (
          <ul className="mt-3 space-y-2">
            {inbox.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900">
                      {r.quantity} {r.unit} · {r.itemName}
                    </div>
                    <div className="text-xs text-slate-500">
                      Raised by {r.raisedBy} · {formatDateTime(r.raisedAt)}
                    </div>
                    {r.notes ? <div className="mt-1 text-xs text-slate-600">{r.notes}</div> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.urgency} />
                    <StatusBadge status={r.status} />
                    <button
                      className="btn btn-secondary text-xs"
                      onClick={() => {
                        setInventoryFor(r);
                        if (r.status === 'pending') updateRequestStatus(r.id, 'inventory-checked');
                      }}
                    >
                      <Search className="h-4 w-4" /> Check inventory
                    </button>
                    <button className="btn btn-primary text-xs" onClick={() => openRfq(r)}>
                      <Send className="h-4 w-4" /> Raise RFQ
                    </button>
                  </div>
                </div>

                {inventoryFor?.id === r.id ? (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="mb-1 font-medium text-slate-800">Stock for "{r.itemName}"</div>
                    {stockFor(r.itemName).length === 0 ? (
                      <div className="text-rose-600">No stock found — procurement needed.</div>
                    ) : (
                      <ul className="space-y-1">
                        {stockFor(r.itemName).map((s) => {
                          const deficit = r.quantity - s.quantity;
                          return (
                            <li key={s.id} className="flex items-center justify-between">
                              <span className="capitalize text-slate-700">{s.location.replace('-', ' ')}</span>
                              <span className="text-slate-900">
                                {s.quantity} {s.unit}{' '}
                                {deficit > 0 ? (
                                  <span className="ml-2 text-xs text-rose-600">deficit {deficit}</span>
                                ) : (
                                  <span className="ml-2 text-xs text-emerald-600">sufficient</span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <button className="mt-2 text-xs text-slate-500 underline" onClick={() => setInventoryFor(null)}>
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
        <section className="card border border-brand-300 p-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Raise RFQ — {rfqFor.quantity} {rfqFor.unit} {rfqFor.itemName}
          </h2>
          <p className="text-xs text-slate-500">Pick vendors to request quotes from.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {vendors.map((v) => (
              <label key={v.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                <input
                  type="checkbox"
                  checked={rfqVendors.includes(v.id)}
                  onChange={(e) => {
                    setRfqVendors((prev) =>
                      e.target.checked ? [...prev, v.id] : prev.filter((x) => x !== v.id)
                    );
                  }}
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-900">{v.name}</div>
                  <div className="text-xs text-slate-500">{v.category} · rating {v.rating}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" onClick={sendRfq} disabled={rfqVendors.length === 0}>
              <Send className="h-4 w-4" /> Send RFQ ({rfqVendors.length})
            </button>
            <button className="btn btn-secondary" onClick={() => setRfqFor(null)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-slate-900">Quotes received</h2>
        {requestsAwaitingPO.length === 0 ? (
          <div className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No quotes pending review.</div>
        ) : (
          <div className="mt-3 space-y-4">
            {requestsAwaitingPO.map((r) => {
              const qs = quotesForRequest(r.id);
              return (
                <div key={r.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-medium text-slate-900">
                      {r.quantity} {r.unit} · {r.itemName}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="table-th">Vendor</th>
                          <th className="table-th">Price/unit</th>
                          <th className="table-th">Total</th>
                          <th className="table-th">Delivery</th>
                          <th className="table-th text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {qs.map((q) => {
                          const v = vendors.find((vv) => vv.id === q.vendorId);
                          return (
                            <tr key={q.id}>
                              <td className="table-td">{v?.name ?? q.vendorId}</td>
                              <td className="table-td">{formatINR(q.pricePerUnit)}</td>
                              <td className="table-td font-semibold">{formatINR(q.totalPrice)}</td>
                              <td className="table-td text-xs">{formatDate(q.deliveryDate)}</td>
                              <td className="table-td text-right">
                                <button className="btn btn-primary text-xs" onClick={() => raisePOFromQuote(r, q)}>
                                  <FileCheck2 className="h-4 w-4" /> Raise PO
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-slate-900">Purchase orders</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-th">PO</th>
                <th className="table-th">Vendor</th>
                <th className="table-th">Items</th>
                <th className="table-th">Value</th>
                <th className="table-th">Status</th>
                <th className="table-th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...pos]
                .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1))
                .map((p) => {
                const v = vendors.find((vv) => vv.id === p.vendorId);
                return (
                  <tr key={p.id}>
                    <td className="table-td font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span>{p.id}</span>
                        {p.invoiceDocumentId ? (
                          <button
                            type="button"
                            onClick={() => viewDocument(p.invoiceDocumentId as string)}
                            className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                            title="View attached invoice"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="table-td">{v?.name ?? p.vendorId}</td>
                    <td className="table-td">
                      {p.items.map((it) => `${it.quantity} ${it.unit} ${it.itemName}`).join(', ')}
                    </td>
                    <td className="table-td font-semibold">{formatINR(p.totalValue)}</td>
                    <td className="table-td"><StatusBadge status={p.status} /></td>
                    <td className="table-td text-right">
                      {p.status === 'approved' || p.status === 'ordered' ? (
                        <button className="btn btn-primary text-xs" onClick={() => openGrn(p.id)}>
                          <PackageCheck className="h-4 w-4" /> Log GRN
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {grnForPO ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Log GRN</h3>
                <p className="text-xs text-slate-500">
                  Confirm receipt for <span className="font-mono">{grnForPO}</span>.
                  Attach the supplier invoice (optional).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGrnForPO(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {grnError ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700">
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
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
              />
              {grnInvoice ? (
                <div className="mt-1 text-xs text-slate-500">
                  {grnInvoice.name} · {formatFileSize(grnInvoice.size)}
                </div>
              ) : null}
              {grnExtracting ? (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting line items...
                </div>
              ) : null}
              {grnExtracted ? (
                <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2 text-xs">
                  <div className="flex items-center gap-1 font-medium text-violet-900">
                    <Sparkles className="h-3.5 w-3.5" />
                    {grnExtracted.invoiceType} invoice from{' '}
                    {grnExtracted.vendorName || '—'} ·{' '}
                    {grnExtracted.lineItems.length} item
                    {grnExtracted.lineItems.length === 1 ? '' : 's'}
                  </div>
                  {grnForPO ? <GrnComparison
                    poId={grnForPO}
                    extracted={grnExtracted}
                  /> : null}
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
    <div className="mt-2 rounded bg-white p-2 ring-1 ring-violet-100">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
        PO vs invoice
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-slate-500">
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
                      ? 'text-emerald-700'
                      : diff > 0
                      ? 'text-amber-700'
                      : 'text-rose-700')
                  }
                >
                  {r.actualQty} {r.unit}
                </td>
              </tr>
            );
          })}
          {extras.map((li, i) => (
            <tr key={`x-${i}`} className="text-slate-600">
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
