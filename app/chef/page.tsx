'use client';

import { useMemo, useState } from 'react';
import { ChefHat, Trash2, PackagePlus, NotebookPen } from 'lucide-react';
import { useStore, formatDateTime } from '@/lib/store';
import { StatusBadge } from '@/components/StatusBadge';
import { useMounted } from '@/lib/useMounted';
import type { JournalType, Urgency } from '@/lib/types';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { VoiceFormDictation } from '@/components/VoiceFormDictation';

interface ParsedJournal {
  type?: JournalType;
  description?: string;
  itemName?: string;
  quantity?: number;
  notes?: string;
}
interface ParsedWastage {
  itemName?: string;
  quantity?: number;
  unit?: string;
  reason?: string;
  notes?: string;
}
interface ParsedRequest {
  itemName?: string;
  quantity?: number;
  unit?: string;
  urgency?: Urgency;
  notes?: string;
}

const CHEF = 'Chef Ramesh';

export default function ChefPage() {
  const mounted = useMounted();
  const journal = useStore((s) => s.journal);
  const requests = useStore((s) => s.requests);
  const addJournalEntry = useStore((s) => s.addJournalEntry);
  const addRequest = useStore((s) => s.addRequest);

  const [type, setType] = useState<JournalType>('prep');
  const [description, setDescription] = useState('');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');

  const [wItem, setWItem] = useState('');
  const [wQty, setWQty] = useState('');
  const [wReason, setWReason] = useState('');

  const [rItem, setRItem] = useState('');
  const [rQty, setRQty] = useState('');
  const [rUnit, setRUnit] = useState('kg');
  const [rUrgency, setRUrgency] = useState<Urgency>('medium');
  const [rNotes, setRNotes] = useState('');

  const submitJournal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    addJournalEntry({
      type,
      description: description.trim(),
      itemName: itemName.trim() || undefined,
      quantity: quantity ? Number(quantity) : undefined,
      loggedBy: CHEF,
    });
    setDescription('');
    setItemName('');
    setQuantity('');
  };

  const submitWastage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wItem.trim() || !wQty) return;
    addJournalEntry({
      type: 'wastage',
      description: wReason.trim() || 'Wastage recorded',
      itemName: wItem.trim(),
      quantity: Number(wQty),
      loggedBy: CHEF,
    });
    setWItem('');
    setWQty('');
    setWReason('');
  };

  const submitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rItem.trim() || !rQty) return;
    addRequest({
      itemName: rItem.trim(),
      quantity: Number(rQty),
      unit: rUnit,
      urgency: rUrgency,
      notes: rNotes.trim(),
      raisedBy: CHEF,
    });
    setRItem('');
    setRQty('');
    setRUrgency('medium');
    setRNotes('');
  };

  const myRequests = useMemo(
    () =>
      [...requests]
        .filter((r) => r.raisedBy === CHEF)
        .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1)),
    [requests]
  );

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white">
          <ChefHat className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Kitchen Dashboard</h1>
          <p className="text-sm text-slate-600">Log prep work, wastage, and request raw material.</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-brand-700" />
            <h2 className="text-lg font-semibold text-slate-900">Daily journal</h2>
          </div>
          <VoiceFormDictation<ParsedJournal>
            formType="journal"
            onParsed={(d) => {
              if (d.type && (['prep','batch','marination','wastage'] as const).includes(d.type as JournalType)) setType(d.type as JournalType);
              if (d.description) setDescription(d.description);
              if (d.itemName) setItemName(d.itemName);
              if (d.quantity != null) setQuantity(String(d.quantity));
            }}
            className="mb-3"
          />
          <form onSubmit={submitJournal} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Type</label>
                <select
                  className="select"
                  value={type}
                  onChange={(e) => setType(e.target.value as JournalType)}
                >
                  <option value="prep">Prep work</option>
                  <option value="batch">Batch cooking</option>
                  <option value="marination">Marination</option>
                </select>
              </div>
              <div>
                <label className="label">Item (optional)</label>
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g. Dal Makhani"
                  />
                  <VoiceInputButton onTranscript={(t) => setItemName(t)} mode="replace" />
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Quantity (optional)</label>
                <input
                  className="input"
                  type="number"
                  step="0.1"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 5"
                />
              </div>
              <div className="flex items-end">
                <span className="text-xs text-slate-500">Logged by {CHEF}</span>
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <div className="flex items-start gap-2">
                <textarea
                  className="textarea"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What was done?"
                />
                <VoiceInputButton onTranscript={(t) => setDescription(t)} mode="replace" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">
              Log entry
            </button>
          </form>
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-rose-600" />
            <h2 className="text-lg font-semibold text-slate-900">Wastage log</h2>
          </div>
          <VoiceFormDictation<ParsedWastage>
            formType="wastage"
            onParsed={(d) => {
              if (d.itemName) setWItem(d.itemName);
              if (d.quantity != null) setWQty(String(d.quantity));
              if (d.reason) setWReason(d.reason);
            }}
            className="mb-3"
          />
          <form onSubmit={submitWastage} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Item</label>
                <div className="flex items-center gap-2">
                  <input className="input" value={wItem} onChange={(e) => setWItem(e.target.value)} placeholder="e.g. Tomatoes" />
                  <VoiceInputButton onTranscript={(t) => setWItem(t)} mode="replace" />
                </div>
              </div>
              <div>
                <label className="label">Quantity</label>
                <input
                  className="input"
                  type="number"
                  step="0.1"
                  min="0"
                  value={wQty}
                  onChange={(e) => setWQty(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="label">Reason</label>
              <div className="flex items-start gap-2">
                <textarea
                  className="textarea"
                  rows={2}
                  value={wReason}
                  onChange={(e) => setWReason(e.target.value)}
                  placeholder="e.g. Spoiled, dropped, over-cooked"
                />
                <VoiceInputButton onTranscript={(t) => setWReason(t)} mode="replace" />
              </div>
            </div>
            <button type="submit" className="btn btn-danger">
              Record wastage
            </button>
          </form>
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <PackagePlus className="h-4 w-4 text-brand-700" />
          <h2 className="text-lg font-semibold text-slate-900">Raw material request</h2>
          <span className="text-xs text-slate-500">— goes to Store Manager</span>
        </div>
        <VoiceFormDictation<ParsedRequest>
          formType="material-request"
          onParsed={(d) => {
            if (d.itemName) setRItem(d.itemName);
            if (d.quantity != null) setRQty(String(d.quantity));
            if (d.unit) setRUnit(d.unit);
            if (d.urgency && (['low','medium','high'] as const).includes(d.urgency)) setRUrgency(d.urgency);
            if (d.notes) setRNotes(d.notes);
          }}
          className="mb-3"
        />
        <form onSubmit={submitRequest} className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label">Item</label>
            <div className="flex items-center gap-2">
              <input className="input" value={rItem} onChange={(e) => setRItem(e.target.value)} placeholder="e.g. Paneer" />
              <VoiceInputButton onTranscript={(t) => setRItem(t)} mode="replace" />
            </div>
          </div>
          <div>
            <label className="label">Quantity</label>
            <input
              className="input"
              type="number"
              step="0.1"
              min="0"
              value={rQty}
              onChange={(e) => setRQty(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Unit</label>
            <select className="select" value={rUnit} onChange={(e) => setRUnit(e.target.value)}>
              <option value="kg">kg</option>
              <option value="litre">litre</option>
              <option value="unit">unit</option>
              <option value="dozen">dozen</option>
            </select>
          </div>
          <div>
            <label className="label">Urgency</label>
            <select className="select" value={rUrgency} onChange={(e) => setRUrgency(e.target.value as Urgency)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="label">Notes</label>
            <div className="flex items-center gap-2">
              <input className="input" value={rNotes} onChange={(e) => setRNotes(e.target.value)} placeholder="Why is this needed?" />
              <VoiceInputButton onTranscript={(t) => setRNotes(t)} mode="replace" />
            </div>
          </div>
          <div className="flex items-end sm:col-span-4">
            <button type="submit" className="btn btn-primary">Submit request</button>
          </div>
        </form>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900">Recent journal entries</h2>
          <ul className="mt-3 space-y-2">
            {journal.slice(0, 8).map((j) => (
              <li key={j.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <StatusBadge status={j.type} />
                  <span className="text-xs text-slate-500">{formatDateTime(j.timestamp)}</span>
                </div>
                <div className="mt-1 text-slate-700">{j.description}</div>
                {j.itemName ? (
                  <div className="mt-0.5 text-xs text-slate-500">
                    {j.itemName} {j.quantity ? `· ${j.quantity}` : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900">My open requests</h2>
          <ul className="mt-3 space-y-2">
            {myRequests.length === 0 ? (
              <li className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No requests raised yet.</li>
            ) : (
              myRequests.map((r) => (
                <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">
                      {r.quantity} {r.unit} · {r.itemName}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>Urgency: <StatusBadge status={r.urgency} /></span>
                    <span>{formatDateTime(r.raisedAt)}</span>
                  </div>
                  {r.notes ? <div className="mt-1 text-xs text-slate-600">{r.notes}</div> : null}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
