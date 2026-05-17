'use client';

import { useMemo, useState } from 'react';
import { Search, Send, FileCheck2, Warehouse, PackageCheck } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import {
  useStore,
  formatINR,
  formatDate,
  formatDateTime,
} from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import type { MaterialRequest, Quote } from '@/lib/types';

const STORE = 'Store Manager';

export default function StoreManagerPage() {
  const mounted = useMounted();
  const requests = useStore((s) => s.requests);
  const inventory = useStore((s) => s.inventory);
  const vendors = useStore((s) => s.vendors);
  const quotes = useStore((s) => s.quotes);
  const pos = useStore((s) => s.pos);
  const updateRequestStatus = useStore((s) => s.updateRequestStatus);
  const addQuote = useStore((s) => s.addQuote);
  const raisePO = useStore((s) => s.raisePO);
  const logGRN = useStore((s) => s.logGRN);

  const [inventoryFor, setInventoryFor] = useState<MaterialRequest | null>(null);
  const [rfqFor, setRfqFor] = useState<MaterialRequest | null>(null);
  const [rfqVendors, setRfqVendors] = useState<string[]>([]);

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
              {pos.map((p) => {
                const v = vendors.find((vv) => vv.id === p.vendorId);
                return (
                  <tr key={p.id}>
                    <td className="table-td font-mono text-xs">{p.id}</td>
                    <td className="table-td">{v?.name ?? p.vendorId}</td>
                    <td className="table-td">
                      {p.items.map((it) => `${it.quantity} ${it.unit} ${it.itemName}`).join(', ')}
                    </td>
                    <td className="table-td font-semibold">{formatINR(p.totalValue)}</td>
                    <td className="table-td"><StatusBadge status={p.status} /></td>
                    <td className="table-td text-right">
                      {p.status === 'approved' || p.status === 'ordered' ? (
                        <button className="btn btn-primary text-xs" onClick={() => logGRN(p.id)}>
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
    </div>
  );
}
