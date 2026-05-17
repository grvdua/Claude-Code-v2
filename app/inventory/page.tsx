'use client';

import { useMemo, useState } from 'react';
import { Plus, Minus, PackagePlus } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import type { Location } from '@/lib/types';
import clsx from 'clsx';

const locationLabel: Record<Location, string> = {
  restaurant: 'Restaurant',
  'store-1': 'Store 1',
  'store-2': 'Store 2',
};

export default function InventoryPage() {
  const mounted = useMounted();
  const inventory = useStore((s) => s.inventory);
  const role = useStore((s) => s.role);
  const adjustStock = useStore((s) => s.adjustStock);
  const addInventoryItem = useStore((s) => s.addInventoryItem);

  const [loc, setLoc] = useState<'all' | Location>('all');
  const [cat, setCat] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Vegetables');
  const [unit, setUnit] = useState('kg');
  const [newLoc, setNewLoc] = useState<Location>('store-1');
  const [qty, setQty] = useState('');
  const [reorder, setReorder] = useState('');

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
        {canEdit ? (
          <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
            <PackagePlus className="h-4 w-4" /> {showAdd ? 'Close' : 'Add item'}
          </button>
        ) : null}
      </header>

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
        </div>
      </section>
    </div>
  );
}
