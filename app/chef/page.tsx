'use client';

import { useMemo, useState } from 'react';
import {
  ChefHat,
  Trash2,
  PackagePlus,
  NotebookPen,
  Utensils,
  Plus,
  X,
  Loader2,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { useStore, formatDateTime, formatINR } from '@/lib/store';
import { StatusBadge } from '@/components/StatusBadge';
import { useMounted } from '@/lib/useMounted';
import type {
  JournalType,
  Urgency,
  Recipe,
  RecipeIngredient,
  CostVarianceReport,
  InventoryItem,
} from '@/lib/types';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { VoiceFormDictation } from '@/components/VoiceFormDictation';
import clsx from 'clsx';

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

type CostAnalyzeResponse =
  | { ok: true; data: CostVarianceReport }
  | { ok: false; error: string };

const CHEF = 'Chef Ramesh';

interface IngredientDraft {
  itemId: string;
  quantity: string;
  unit: string;
}

function emptyIngredient(): IngredientDraft {
  return { itemId: '', quantity: '', unit: '' };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function theoreticalCost(recipe: Recipe, inventory: InventoryItem[]): number {
  const map = new Map(inventory.map((it) => [it.id, it]));
  let sum = 0;
  for (const ing of recipe.ingredients) {
    const inv = map.get(ing.itemId);
    if (!inv?.unitPrice) continue;
    sum += inv.unitPrice * ing.quantity;
  }
  if (!recipe.yieldPortions) return 0;
  return sum / recipe.yieldPortions;
}

export default function ChefPage() {
  const mounted = useMounted();
  const journal = useStore((s) => s.journal);
  const requests = useStore((s) => s.requests);
  const inventory = useStore((s) => s.inventory);
  const recipes = useStore((s) => s.recipes);
  const priceHistory = useStore((s) => s.priceHistory);
  const lastCostVarianceReport = useStore((s) => s.lastCostVarianceReport);

  const addJournalEntry = useStore((s) => s.addJournalEntry);
  const addRequest = useStore((s) => s.addRequest);
  const addRecipe = useStore((s) => s.addRecipe);
  const updateRecipe = useStore((s) => s.updateRecipe);
  const deleteRecipe = useStore((s) => s.deleteRecipe);
  const setCostVarianceReport = useStore((s) => s.setCostVarianceReport);

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

  // Recipe builder state
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [recipeName, setRecipeName] = useState('');
  const [recipeCategory, setRecipeCategory] = useState('Main Course');
  const [recipeYield, setRecipeYield] = useState('4');
  const [recipePrice, setRecipePrice] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([
    emptyIngredient(),
  ]);
  const [recipeError, setRecipeError] = useState<string | null>(null);

  // Cost analysis state
  const [costLoading, setCostLoading] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);

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

  const resetRecipeForm = () => {
    setEditingRecipeId(null);
    setRecipeName('');
    setRecipeCategory('Main Course');
    setRecipeYield('4');
    setRecipePrice('');
    setIngredients([emptyIngredient()]);
    setRecipeError(null);
  };

  const beginEditRecipe = (r: Recipe) => {
    setEditingRecipeId(r.id);
    setRecipeName(r.name);
    setRecipeCategory(r.category);
    setRecipeYield(String(r.yieldPortions));
    setRecipePrice(String(r.sellingPricePerPortion));
    setIngredients(
      r.ingredients.length > 0
        ? r.ingredients.map((ing) => ({
            itemId: ing.itemId,
            quantity: String(ing.quantity),
            unit: ing.unit,
          }))
        : [emptyIngredient()]
    );
    setRecipeError(null);
    setShowRecipeForm(true);
  };

  const updateIngredient = (
    idx: number,
    patch: Partial<IngredientDraft>
  ) => {
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== idx) return ing;
        const next = { ...ing, ...patch };
        // Auto-fill unit from inventory item when itemId changes.
        if (patch.itemId !== undefined) {
          const inv = inventory.find((it) => it.id === patch.itemId);
          if (inv) next.unit = inv.unit;
        }
        return next;
      })
    );
  };

  const submitRecipe = (e: React.FormEvent) => {
    e.preventDefault();
    setRecipeError(null);
    const name = recipeName.trim();
    const yieldP = Number(recipeYield);
    const price = Number(recipePrice);
    if (!name) {
      setRecipeError('Recipe name is required.');
      return;
    }
    if (!yieldP || yieldP <= 0) {
      setRecipeError('Yield must be a positive number of portions.');
      return;
    }
    if (!price || price <= 0) {
      setRecipeError('Selling price must be a positive amount.');
      return;
    }
    const cleanIngredients: RecipeIngredient[] = [];
    for (const ing of ingredients) {
      if (!ing.itemId) continue;
      const q = Number(ing.quantity);
      if (!q || q <= 0) continue;
      cleanIngredients.push({
        itemId: ing.itemId,
        quantity: q,
        unit: ing.unit || 'unit',
      });
    }
    if (cleanIngredients.length === 0) {
      setRecipeError('Add at least one ingredient with a quantity.');
      return;
    }
    if (editingRecipeId) {
      updateRecipe(editingRecipeId, {
        name,
        category: recipeCategory.trim() || 'Main Course',
        yieldPortions: yieldP,
        sellingPricePerPortion: price,
        ingredients: cleanIngredients,
      });
    } else {
      addRecipe({
        name,
        category: recipeCategory.trim() || 'Main Course',
        yieldPortions: yieldP,
        sellingPricePerPortion: price,
        ingredients: cleanIngredients,
      });
    }
    resetRecipeForm();
    setShowRecipeForm(false);
  };

  const removeRecipe = (id: string) => {
    if (!confirm('Delete this recipe? This cannot be undone.')) return;
    deleteRecipe(id);
  };

  const runCostAnalysis = async () => {
    setCostError(null);
    if (recipes.length === 0) {
      setCostError('Add at least one recipe before analyzing costs.');
      return;
    }
    setCostLoading(true);
    try {
      const now = Date.now();
      const journal30d = journal.filter(
        (j) => now - new Date(j.timestamp).getTime() <= 30 * 24 * 60 * 60 * 1000
      );
      const price60d = priceHistory.filter(
        (p) => now - new Date(p.date).getTime() <= 60 * 24 * 60 * 60 * 1000
      );
      const res = await fetch('/api/analyze-recipe-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipes,
          inventory,
          journalEntries: journal30d,
          priceHistory: price60d,
        }),
      });
      const json = (await res.json()) as CostAnalyzeResponse;
      if (!json.ok) {
        setCostError(json.error);
        return;
      }
      setCostVarianceReport(json.data);
    } catch (err) {
      setCostError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCostLoading(false);
    }
  };

  const myRequests = useMemo(
    () =>
      [...requests]
        .filter((r) => r.raisedBy === CHEF)
        .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1)),
    [requests]
  );

  const recipeTheoreticalCosts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of recipes) {
      map.set(r.id, theoreticalCost(r, inventory));
    }
    return map;
  }, [recipes, inventory]);

  const sortedInsights = useMemo(() => {
    if (!lastCostVarianceReport) return [];
    const rank: Record<string, number> = { critical: 0, warning: 1, ok: 2 };
    return [...lastCostVarianceReport.perRecipe].sort(
      (a, b) => (rank[a.flag] ?? 9) - (rank[b.flag] ?? 9)
    );
  }, [lastCostVarianceReport]);

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white">
          <ChefHat className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Kitchen Dashboard</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Log prep work, wastage, and request raw material.</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-brand-700 dark:text-brand-300" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Daily journal</h2>
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
                <span className="text-xs text-slate-500 dark:text-slate-400">Logged by {CHEF}</span>
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
            <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Wastage log</h2>
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
          <PackagePlus className="h-4 w-4 text-brand-700 dark:text-brand-300" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Raw material request</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">— goes to Store Manager</span>
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

      {/* Recipes section ---------------------------------------------------- */}
      <section id="recipes" className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Utensils className="h-4 w-4 text-brand-700 dark:text-brand-300" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recipes</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ({recipes.length})
            </span>
          </div>
          <button
            className="btn btn-primary text-xs"
            onClick={() => {
              if (showRecipeForm) {
                resetRecipeForm();
                setShowRecipeForm(false);
              } else {
                resetRecipeForm();
                setShowRecipeForm(true);
              }
            }}
          >
            {showRecipeForm ? (
              <>
                <X className="h-3.5 w-3.5" /> Close
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Add recipe
              </>
            )}
          </button>
        </div>

        {showRecipeForm ? (
          <form
            onSubmit={submitRecipe}
            className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50"
          >
            {recipeError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
                {recipeError}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="label">Recipe name</label>
                <input
                  className="input"
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  placeholder="e.g. Butter Chicken"
                />
              </div>
              <div>
                <label className="label">Category</label>
                <select
                  className="select"
                  value={recipeCategory}
                  onChange={(e) => setRecipeCategory(e.target.value)}
                >
                  <option>Starter</option>
                  <option>Main Course</option>
                  <option>Bread</option>
                  <option>Rice</option>
                  <option>Beverage</option>
                  <option>Dessert</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="label">Yield (portions)</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  step="1"
                  value={recipeYield}
                  onChange={(e) => setRecipeYield(e.target.value)}
                />
              </div>
              <div className="sm:col-span-4">
                <label className="label">Selling price per portion (₹)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={recipePrice}
                  onChange={(e) => setRecipePrice(e.target.value)}
                  placeholder="e.g. 320"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="label mb-0">Ingredients (per batch)</label>
                <button
                  type="button"
                  className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                  onClick={() => setIngredients((p) => [...p, emptyIngredient()])}
                >
                  + Add ingredient
                </button>
              </div>
              {inventory.length === 0 ? (
                <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  No inventory items yet — add inventory first so you can pick ingredients.
                </div>
              ) : (
                <div className="space-y-2">
                  {ingredients.map((ing, idx) => (
                    <div key={idx} className="grid gap-2 sm:grid-cols-12">
                      <select
                        className="select sm:col-span-6"
                        value={ing.itemId}
                        onChange={(e) =>
                          updateIngredient(idx, { itemId: e.target.value })
                        }
                      >
                        <option value="">Select ingredient...</option>
                        {inventory.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name} ({it.unit})
                          </option>
                        ))}
                      </select>
                      <input
                        className="input sm:col-span-3"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Qty"
                        value={ing.quantity}
                        onChange={(e) =>
                          updateIngredient(idx, { quantity: e.target.value })
                        }
                      />
                      <input
                        className="input sm:col-span-2"
                        value={ing.unit}
                        onChange={(e) =>
                          updateIngredient(idx, { unit: e.target.value })
                        }
                        placeholder="Unit"
                      />
                      <button
                        type="button"
                        className="btn btn-secondary text-xs sm:col-span-1"
                        onClick={() =>
                          setIngredients((p) =>
                            p.length > 1 ? p.filter((_, i) => i !== idx) : p
                          )
                        }
                        title="Remove ingredient"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary">
                {editingRecipeId ? 'Update recipe' : 'Save recipe'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  resetRecipeForm();
                  setShowRecipeForm(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {recipes.length === 0 ? (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
            No recipes yet. Add a recipe to enable food cost analysis.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="table-th">Recipe</th>
                  <th className="table-th">Category</th>
                  <th className="table-th text-right">Yield</th>
                  <th className="table-th text-right">Price / portion</th>
                  <th className="table-th text-right">Theoretical cost</th>
                  <th className="table-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recipes.map((r) => {
                  const tc = recipeTheoreticalCosts.get(r.id) ?? 0;
                  return (
                    <tr key={r.id}>
                      <td className="table-td">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {r.ingredients.length} ingredient
                          {r.ingredients.length === 1 ? '' : 's'}
                        </div>
                      </td>
                      <td className="table-td">{r.category}</td>
                      <td className="table-td text-right tabular-nums">
                        {r.yieldPortions}
                      </td>
                      <td className="table-td text-right tabular-nums">
                        {formatINR(r.sellingPricePerPortion)}
                      </td>
                      <td className="table-td text-right tabular-nums">
                        {tc > 0 ? formatINR(tc) : '—'}
                      </td>
                      <td className="table-td">
                        <div className="flex justify-end gap-2">
                          <button
                            className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                            onClick={() => beginEditRecipe(r)}
                          >
                            Edit
                          </button>
                          <button
                            className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                            onClick={() => removeRecipe(r.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Food cost analysis ------------------------------------------------- */}
      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Food cost analysis
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {lastCostVarianceReport ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Last analyzed {relativeTime(lastCostVarianceReport.generatedAt)}
              </span>
            ) : null}
            <button
              className="btn btn-primary text-xs"
              onClick={runCostAnalysis}
              disabled={costLoading || recipes.length === 0}
            >
              {costLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing...
                </>
              ) : lastCostVarianceReport ? (
                <>
                  <Sparkles className="h-3.5 w-3.5" /> Re-analyze
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" /> Analyze recipe costs with AI
                </>
              )}
            </button>
          </div>
        </div>

        {costError ? (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> {costError}
          </div>
        ) : null}

        {!lastCostVarianceReport && !costLoading && !costError ? (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
            {recipes.length === 0
              ? 'Add recipes above, then run AI cost variance analysis to surface food cost outliers.'
              : 'Click "Analyze recipe costs with AI" to surface variance, food cost %, and drivers per recipe.'}
          </div>
        ) : null}

        {lastCostVarianceReport ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-100">
              <div className="font-medium">Summary</div>
              <div className="mt-1">{lastCostVarianceReport.overallSummary}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="table-th">Recipe</th>
                    <th className="table-th text-right">Theoretical</th>
                    <th className="table-th text-right">Actual</th>
                    <th className="table-th text-right">Variance</th>
                    <th className="table-th text-right">Food cost %</th>
                    <th className="table-th">Flag</th>
                    <th className="table-th">Drivers & action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedInsights.map((ins) => {
                    const recipe = recipes.find((r) => r.id === ins.recipeId);
                    return (
                      <tr key={ins.recipeId}>
                        <td className="table-td font-medium">
                          {recipe?.name ?? ins.recipeId}
                        </td>
                        <td className="table-td text-right tabular-nums">
                          {formatINR(ins.theoreticalCostPerPortion)}
                        </td>
                        <td className="table-td text-right tabular-nums">
                          {formatINR(ins.actualCostPerPortion)}
                        </td>
                        <td
                          className={clsx(
                            'table-td text-right tabular-nums font-medium',
                            ins.variancePct > 5 && 'text-rose-700 dark:text-rose-300',
                            ins.variancePct < -5 && 'text-emerald-700 dark:text-emerald-300'
                          )}
                        >
                          {ins.variancePct > 0 ? '+' : ''}
                          {ins.variancePct.toFixed(1)}%
                        </td>
                        <td className="table-td text-right tabular-nums">
                          {ins.foodCostPct.toFixed(1)}%
                        </td>
                        <td className="table-td">
                          <span
                            className={clsx(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                              ins.flag === 'critical' &&
                                'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/40 dark:text-rose-200 dark:ring-rose-800',
                              ins.flag === 'warning' &&
                                'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-800',
                              ins.flag === 'ok' &&
                                'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800'
                            )}
                          >
                            {ins.flag.toUpperCase()}
                          </span>
                        </td>
                        <td className="table-td">
                          {ins.drivers.length > 0 ? (
                            <ul className="ml-3 list-disc text-xs text-slate-600 dark:text-slate-300">
                              {ins.drivers.map((d, i) => (
                                <li key={i}>{d}</li>
                              ))}
                            </ul>
                          ) : null}
                          {ins.recommendation ? (
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                Recommendation:
                              </span>{' '}
                              {ins.recommendation}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent journal entries</h2>
          <ul className="mt-3 space-y-2">
            {journal.slice(0, 8).map((j) => (
              <li key={j.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <StatusBadge status={j.type} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(j.timestamp)}</span>
                </div>
                <div className="mt-1 text-slate-700 dark:text-slate-200">{j.description}</div>
                {j.itemName ? (
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {j.itemName} {j.quantity ? `· ${j.quantity}` : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">My open requests</h2>
          <ul className="mt-3 space-y-2">
            {myRequests.length === 0 ? (
              <li className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">No requests raised yet.</li>
            ) : (
              myRequests.map((r) => (
                <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {r.quantity} {r.unit} · {r.itemName}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Urgency: <StatusBadge status={r.urgency} /></span>
                    <span>{formatDateTime(r.raisedAt)}</span>
                  </div>
                  {r.notes ? <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{r.notes}</div> : null}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
