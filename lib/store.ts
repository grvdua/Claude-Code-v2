import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Role,
  InventoryItem,
  Vendor,
  MaterialRequest,
  Quote,
  PurchaseOrder,
  POLineItem,
  POStatus,
  JournalEntry,
  Expense,
  DocumentRecord,
  StaffMember,
  RequestStatus,
  VendorLedgerEntry,
  PriceHistoryEntry,
  ExtractedInvoiceData,
  ProcessInvoiceOptions,
  ProcessInvoiceResult,
  Location,
  StockAdjustment,
  VendorReliabilityEntry,
  QuoteAnalysisResult,
  ReorderPredictionResult,
  ReorderPredictionBundle,
} from './types';
import {
  seedInventory,
  seedVendors,
  seedRequests,
  seedQuotes,
  seedPOs,
  seedJournal,
  seedExpenses,
  seedDocuments,
  seedStaff,
} from './seed';
import { deleteFile } from './fileStorage';

export const PO_APPROVAL_THRESHOLD = 10000;

const id = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Deterministic 32-bit hash (FNV-1a). Used for synthesizing stable but
 * vendor-specific reliability scores until we have real GRN history.
 */
function stableHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned 32-bit
  return h >>> 0;
}

interface AppState {
  role: Role | null;
  inventory: InventoryItem[];
  vendors: Vendor[];
  requests: MaterialRequest[];
  quotes: Quote[];
  pos: PurchaseOrder[];
  journal: JournalEntry[];
  expenses: Expense[];
  documents: DocumentRecord[];
  staff: StaffMember[];
  vendorLedger: VendorLedgerEntry[];
  priceHistory: PriceHistoryEntry[];
  stockAdjustments: StockAdjustment[];
  vendorReliability: VendorReliabilityEntry[];
  lastReorderPrediction?: {
    generatedAt: string;
    result: ReorderPredictionResult;
  };

  setRole: (r: Role | null) => void;

  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => void;
  deleteInventoryItem: (id: string) => void;
  adjustStock: (
    id: string,
    delta: number,
    reason?: string,
    source?: StockAdjustment['source'],
    sourceId?: string,
    adjustedBy?: string
  ) => void;
  setItemUnitPrice: (itemId: string, unitPrice: number) => void;
  recordStockAdjustment: (
    adj: Omit<StockAdjustment, 'id' | 'adjustedAt'>
  ) => string;
  getStockHistory: (itemId: string) => StockAdjustment[];

  addRequest: (
    req: Omit<MaterialRequest, 'id' | 'raisedAt' | 'status'>
  ) => void;
  updateRequestStatus: (id: string, status: RequestStatus) => void;

  addQuote: (q: Omit<Quote, 'id' | 'submittedAt'>) => string;
  attachQuoteAnalysis: (
    requestId: string,
    analysis: QuoteAnalysisResult
  ) => void;
  raisePOFromQuote: (quoteId: string, raisedBy?: string) => string | null;

  raisePO: (po: Omit<PurchaseOrder, 'id' | 'raisedAt' | 'status'>) => string;
  approvePO: (id: string, approver: string) => void;
  rejectPO: (id: string) => void;
  logGRN: (id: string) => void;
  setPOStatus: (id: string, status: POStatus) => void;
  setPOTracking: (
    poId: string,
    trackingNumber: string,
    notes?: string
  ) => void;

  getVendorReliabilityTrend: (
    vendorId: string,
    months?: number
  ) => VendorReliabilityEntry[];
  recomputeVendorReliability: () => void;

  addJournalEntry: (e: Omit<JournalEntry, 'id' | 'timestamp'>) => void;

  addExpense: (e: Omit<Expense, 'id' | 'date'>) => void;

  addDocument: (d: Omit<DocumentRecord, 'id' | 'uploadedAt'>) => string;
  deleteDocument: (id: string) => Promise<void>;
  attachBillToExpense: (expenseId: string, documentId: string) => void;
  attachInvoiceToPO: (poId: string, documentId: string) => void;

  toggleAttendance: (staffId: string, date: string) => void;

  addVendorLedgerEntry: (
    entry: Omit<VendorLedgerEntry, 'id' | 'recordedAt'>
  ) => string;
  addPriceHistoryEntry: (entry: Omit<PriceHistoryEntry, 'id'>) => string;
  processInvoiceExtraction: (
    extracted: ExtractedInvoiceData,
    opts: ProcessInvoiceOptions
  ) => ProcessInvoiceResult;

  getReorderInputBundle: () => ReorderPredictionBundle;
  setReorderPrediction: (result: ReorderPredictionResult) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      role: null,
      inventory: seedInventory,
      vendors: seedVendors,
      requests: seedRequests,
      quotes: seedQuotes,
      pos: seedPOs,
      journal: seedJournal,
      expenses: seedExpenses,
      documents: seedDocuments,
      staff: seedStaff,
      vendorLedger: [],
      priceHistory: [],
      stockAdjustments: [],
      vendorReliability: [],
      lastReorderPrediction: undefined,

      setRole: (role) => set({ role }),

      addInventoryItem: (item) =>
        set((s) => ({
          inventory: [...s.inventory, { ...item, id: id('inv') }],
        })),

      deleteInventoryItem: (itemId) =>
        set((s) => ({
          inventory: s.inventory.filter((it) => it.id !== itemId),
        })),

      adjustStock: (itemId, delta, reason, source, sourceId, adjustedBy) => {
        let resultingQuantity = 0;
        set((s) => {
          const inventory = s.inventory.map((it) => {
            if (it.id !== itemId) return it;
            resultingQuantity = Math.max(0, it.quantity + delta);
            return { ...it, quantity: resultingQuantity };
          });
          return { inventory };
        });
        // Append a stock adjustment record so the history is auditable.
        const adj: StockAdjustment = {
          id: id('sa'),
          itemId,
          delta,
          reason: reason || (delta >= 0 ? 'manual add' : 'manual remove'),
          resultingQuantity,
          adjustedBy: adjustedBy || get().role || 'user',
          adjustedAt: new Date().toISOString(),
          source: source ?? 'manual',
          sourceId,
        };
        set((s) => ({ stockAdjustments: [adj, ...s.stockAdjustments] }));
      },

      setItemUnitPrice: (itemId, unitPrice) =>
        set((s) => ({
          inventory: s.inventory.map((it) =>
            it.id === itemId ? { ...it, unitPrice } : it
          ),
        })),

      recordStockAdjustment: (adj) => {
        const newId = id('sa');
        set((s) => ({
          stockAdjustments: [
            {
              ...adj,
              id: newId,
              adjustedAt: new Date().toISOString(),
            },
            ...s.stockAdjustments,
          ],
        }));
        return newId;
      },

      getStockHistory: (itemId) =>
        get()
          .stockAdjustments.filter((a) => a.itemId === itemId)
          .sort((a, b) => (a.adjustedAt < b.adjustedAt ? 1 : -1)),

      addRequest: (req) =>
        set((s) => ({
          requests: [
            {
              ...req,
              id: id('req'),
              raisedAt: new Date().toISOString(),
              status: 'pending',
            },
            ...s.requests,
          ],
        })),

      updateRequestStatus: (rid, status) =>
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === rid ? { ...r, status } : r
          ),
        })),

      addQuote: (q) => {
        const newId = id('q');
        set((s) => ({
          quotes: [
            ...s.quotes,
            { ...q, id: newId, submittedAt: new Date().toISOString() },
          ],
        }));
        return newId;
      },

      attachQuoteAnalysis: (requestId, analysis) =>
        set((s) => ({
          quotes: s.quotes.map((q) =>
            q.requestId === requestId
              ? {
                  ...q,
                  aiAnalysis: analysis.perQuote[q.id] ?? q.aiAnalysis,
                }
              : q
          ),
        })),

      raisePOFromQuote: (quoteId, raisedBy) => {
        const state = get();
        const quote = state.quotes.find((q) => q.id === quoteId);
        if (!quote) return null;
        const request = state.requests.find((r) => r.id === quote.requestId);
        if (!request) return null;
        const newId = id('po');
        const status: POStatus =
          quote.totalPrice > PO_APPROVAL_THRESHOLD
            ? 'pending-approval'
            : 'approved';
        const po: PurchaseOrder = {
          id: newId,
          requestId: request.id,
          vendorId: quote.vendorId,
          quoteId: quote.id,
          items: [
            {
              itemName: request.itemName,
              quantity: request.quantity,
              unit: request.unit,
              pricePerUnit: quote.pricePerUnit,
            },
          ],
          totalValue: quote.totalPrice,
          status,
          raisedBy: raisedBy || state.role || 'store-manager',
          raisedAt: new Date().toISOString(),
        };
        set((s) => ({
          pos: [...s.pos, po],
          requests: s.requests.map((r) =>
            r.id === request.id ? { ...r, status: 'po-raised' } : r
          ),
        }));
        return newId;
      },

      raisePO: (po) => {
        const newId = id('po');
        const status: POStatus =
          po.totalValue > PO_APPROVAL_THRESHOLD
            ? 'pending-approval'
            : 'approved';
        set((s) => ({
          pos: [
            ...s.pos,
            {
              ...po,
              id: newId,
              raisedAt: new Date().toISOString(),
              status,
            },
          ],
        }));
        return newId;
      },

      approvePO: (pid, approver) =>
        set((s) => ({
          pos: s.pos.map((p) =>
            p.id === pid
              ? {
                  ...p,
                  status: 'approved',
                  approvedBy: approver,
                  approvedAt: new Date().toISOString(),
                }
              : p
          ),
        })),

      rejectPO: (pid) =>
        set((s) => ({
          pos: s.pos.map((p) =>
            p.id === pid ? { ...p, status: 'rejected' } : p
          ),
        })),

      logGRN: (pid) =>
        set((s) => ({
          pos: s.pos.map((p) =>
            p.id === pid
              ? {
                  ...p,
                  status: 'grn-logged',
                  grnLoggedAt: new Date().toISOString(),
                }
              : p
          ),
        })),

      setPOStatus: (pid, status) =>
        set((s) => ({
          pos: s.pos.map((p) => (p.id === pid ? { ...p, status } : p)),
        })),

      setPOTracking: (poId, trackingNumber, notes) =>
        set((s) => ({
          pos: s.pos.map((p) =>
            p.id === poId
              ? {
                  ...p,
                  trackingNumber,
                  shipmentNotes: notes ?? p.shipmentNotes,
                }
              : p
          ),
        })),

      getVendorReliabilityTrend: (vendorId, months = 6) => {
        const entries = get()
          .vendorReliability.filter((e) => e.vendorId === vendorId)
          .sort((a, b) => (a.month < b.month ? -1 : 1));
        return entries.slice(-months);
      },

      /**
       * Synthesise a per-vendor monthly reliability score from the existing
       * vendor ledger. For each month a vendor has activity we emit one
       * entry. Numbers are deterministic (same vendor + month always yields
       * the same score) so the UI is stable across refreshes.
       *
       * Formula (until real GRN history exists):
       *   onTimeRate     = 70 + (hash(vendorId+month) % 26)            // 70-95
       *   quoteAccuracy  = 75 + ((hash(vendorId+month) >> 4) % 21)     // 75-95
       *   fulfillmentRate= 80 + ((hash(vendorId+month) >> 8) % 16)     // 80-95
       *   compositeScore = 0.4*onTime + 0.3*quoteAcc + 0.3*fulfillment
       * Vendors with more orders in the month nudge composite up to 5pts.
       */
      recomputeVendorReliability: () => {
        const state = get();
        const buckets = new Map<string, Map<string, number>>(); // vendorId -> month -> count
        for (const entry of state.vendorLedger) {
          if (!entry.vendorId || entry.vendorId === 'unknown') continue;
          const month = entry.invoiceDate
            ? entry.invoiceDate.slice(0, 7)
            : entry.recordedAt.slice(0, 7);
          let monthMap = buckets.get(entry.vendorId);
          if (!monthMap) {
            monthMap = new Map();
            buckets.set(entry.vendorId, monthMap);
          }
          monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
        }

        const entries: VendorReliabilityEntry[] = [];
        for (const [vendorId, monthMap] of buckets.entries()) {
          for (const [month, count] of monthMap.entries()) {
            const seed = stableHash(`${vendorId}-${month}`);
            const onTimeRate = 70 + (seed % 26);
            const quoteAccuracy = 75 + ((seed >> 4) % 21);
            const fulfillmentRate = 80 + ((seed >> 8) % 16);
            const volumeBoost = Math.min(5, count);
            const composite = Math.round(
              0.4 * onTimeRate +
                0.3 * quoteAccuracy +
                0.3 * fulfillmentRate +
                volumeBoost
            );
            entries.push({
              vendorId,
              month,
              onTimeRate,
              quoteAccuracy,
              fulfillmentRate,
              orderCount: count,
              compositeScore: Math.min(100, composite),
            });
          }
        }
        set({ vendorReliability: entries });
      },

      addJournalEntry: (e) =>
        set((s) => ({
          journal: [
            { ...e, id: id('j'), timestamp: new Date().toISOString() },
            ...s.journal,
          ],
        })),

      addExpense: (e) =>
        set((s) => ({
          expenses: [
            { ...e, id: id('exp'), date: new Date().toISOString() },
            ...s.expenses,
          ],
        })),

      addDocument: (d) => {
        const newId = id('doc');
        set((s) => ({
          documents: [
            { ...d, id: newId, uploadedAt: new Date().toISOString() },
            ...s.documents,
          ],
        }));
        return newId;
      },

      deleteDocument: async (docId) => {
        const target = useStore
          .getState()
          .documents.find((d) => d.id === docId);
        set((s) => ({
          documents: s.documents.filter((d) => d.id !== docId),
          expenses: s.expenses.map((e) =>
            e.billDocumentId === docId ? { ...e, billDocumentId: undefined } : e
          ),
          pos: s.pos.map((p) =>
            p.invoiceDocumentId === docId
              ? { ...p, invoiceDocumentId: undefined }
              : p
          ),
        }));
        if (target?.fileId) {
          try {
            await deleteFile(target.fileId);
          } catch {
            // swallow — UI will refresh and metadata is already gone
          }
        }
      },

      attachBillToExpense: (expenseId, documentId) =>
        set((s) => ({
          expenses: s.expenses.map((e) =>
            e.id === expenseId ? { ...e, billDocumentId: documentId } : e
          ),
        })),

      attachInvoiceToPO: (poId, documentId) =>
        set((s) => ({
          pos: s.pos.map((p) =>
            p.id === poId ? { ...p, invoiceDocumentId: documentId } : p
          ),
        })),

      toggleAttendance: (staffId, date) =>
        set((s) => ({
          staff: s.staff.map((m) =>
            m.id === staffId
              ? {
                  ...m,
                  attendance: {
                    ...m.attendance,
                    [date]: !m.attendance[date],
                  },
                }
              : m
          ),
        })),

      addVendorLedgerEntry: (entry) => {
        const newId = id('vl');
        set((s) => ({
          vendorLedger: [
            {
              ...entry,
              id: newId,
              recordedAt: new Date().toISOString(),
            },
            ...s.vendorLedger,
          ],
        }));
        return newId;
      },

      addPriceHistoryEntry: (entry) => {
        const newId = id('ph');
        set((s) => ({
          priceHistory: [{ ...entry, id: newId }, ...s.priceHistory],
        }));
        return newId;
      },

      processInvoiceExtraction: (extracted, opts) => {
        const state = get();
        const recordedBy = opts.recordedBy;
        const targetLocation: Location = opts.location ?? 'store-1';

        // 1. Find or create vendor (case-insensitive match by name).
        let createdVendor = false;
        let matchedVendorId: string | undefined;
        const vendorName = (extracted.vendorName || '').trim();
        if (vendorName) {
          const existing = state.vendors.find(
            (v) => v.name.toLowerCase() === vendorName.toLowerCase()
          );
          if (existing) {
            matchedVendorId = existing.id;
          } else {
            const newVendor: Vendor = {
              id: id('v'),
              name: vendorName,
              category:
                extracted.invoiceType === 'raw-material'
                  ? 'Raw Material'
                  : extracted.invoiceType,
              contact: '',
              rating: 0,
            };
            matchedVendorId = newVendor.id;
            createdVendor = true;
            set((s) => ({ vendors: [...s.vendors, newVendor] }));
          }
        }

        // 2. Process line items: inventory + price history.
        const inventoryUpdates: string[] = [];
        let priceEntries = 0;
        const invoiceIso = extracted.invoiceDate
          ? new Date(extracted.invoiceDate).toISOString()
          : new Date().toISOString();

        const onlyRawMaterial = extracted.invoiceType === 'raw-material';

        if (onlyRawMaterial) {
          for (const li of extracted.lineItems) {
            const liName = (li.name || '').trim();
            if (!liName) continue;
            const lower = liName.toLowerCase();
            const currentInv = get().inventory;
            // Try exact-case-insensitive first, then fuzzy contains.
            let match = currentInv.find(
              (i) => i.name.toLowerCase() === lower
            );
            if (!match) {
              match = currentInv.find(
                (i) =>
                  i.name.toLowerCase().includes(lower) ||
                  lower.includes(i.name.toLowerCase())
              );
            }
            let itemId: string;
            let resultingQuantity = 0;
            if (match) {
              itemId = match.id;
              resultingQuantity = Math.max(0, match.quantity + (li.quantity || 0));
              set((s) => ({
                inventory: s.inventory.map((it) =>
                  it.id === match!.id
                    ? {
                        ...it,
                        quantity: resultingQuantity,
                      }
                    : it
                ),
              }));
              inventoryUpdates.push(
                `+${li.quantity} ${li.unit || match.unit} ${match.name}`
              );
              // Auto-update unitPrice if it has changed meaningfully (>1%).
              if (li.unitPrice && li.unitPrice > 0) {
                const prev = match.unitPrice ?? 0;
                const delta = prev === 0 ? Infinity : Math.abs(li.unitPrice - prev) / prev;
                if (delta > 0.01) {
                  set((s) => ({
                    inventory: s.inventory.map((it) =>
                      it.id === match!.id ? { ...it, unitPrice: li.unitPrice } : it
                    ),
                  }));
                }
              }
            } else {
              // Create a new inventory item with unit price seeded from the invoice.
              const newItem: InventoryItem = {
                id: id('inv'),
                name: liName,
                category: 'Raw Material',
                unit: li.unit || 'unit',
                location: targetLocation,
                quantity: li.quantity || 0,
                reorderLevel: 0,
                unitPrice: li.unitPrice > 0 ? li.unitPrice : undefined,
              };
              itemId = newItem.id;
              resultingQuantity = newItem.quantity;
              set((s) => ({ inventory: [...s.inventory, newItem] }));
              inventoryUpdates.push(
                `new item ${li.quantity} ${li.unit || 'unit'} ${liName}`
              );
            }

            // Stock adjustment audit entry — GRN-style.
            if ((li.quantity || 0) !== 0) {
              const saId = id('sa');
              const adjEntry: StockAdjustment = {
                id: saId,
                itemId,
                delta: li.quantity || 0,
                reason: opts.poId
                  ? `GRN ${opts.poId}${
                      extracted.invoiceNumber ? ` · invoice ${extracted.invoiceNumber}` : ''
                    }`
                  : `Invoice upload${
                      extracted.invoiceNumber ? ` · ${extracted.invoiceNumber}` : ''
                    }`,
                resultingQuantity,
                adjustedBy: recordedBy,
                adjustedAt: new Date().toISOString(),
                source: opts.poId ? 'grn' : 'invoice-upload',
                sourceId: opts.poId ?? opts.documentId,
              };
              set((s) => ({
                stockAdjustments: [adjEntry, ...s.stockAdjustments],
              }));
            }

            // Price history
            const phId = id('ph');
            const phEntry: PriceHistoryEntry = {
              id: phId,
              itemId,
              itemName: liName,
              vendorId: matchedVendorId,
              vendorName: vendorName || undefined,
              quantity: li.quantity || 0,
              unit: li.unit || '',
              unitPrice: li.unitPrice || 0,
              totalPrice:
                li.totalPrice ?? (li.quantity || 0) * (li.unitPrice || 0),
              date: invoiceIso,
              invoiceDocumentId: opts.documentId,
            };
            set((s) => ({ priceHistory: [phEntry, ...s.priceHistory] }));
            priceEntries += 1;
          }
        }

        // 3. Vendor ledger entry summarising the invoice.
        const ledgerId = id('vl');
        const lineItemSummary =
          extracted.lineItems.length === 1
            ? extracted.lineItems[0].name
            : extracted.lineItems.length > 1
            ? `Multiple items (${extracted.lineItems.length})`
            : undefined;

        const ledgerEntry: VendorLedgerEntry = {
          id: ledgerId,
          vendorId: matchedVendorId ?? 'unknown',
          vendorName: vendorName || 'Unknown vendor',
          invoiceNumber: extracted.invoiceNumber || undefined,
          invoiceDate: invoiceIso,
          itemName: lineItemSummary,
          quantity:
            extracted.lineItems.length === 1
              ? extracted.lineItems[0].quantity
              : undefined,
          unit:
            extracted.lineItems.length === 1
              ? extracted.lineItems[0].unit
              : undefined,
          unitPrice:
            extracted.lineItems.length === 1
              ? extracted.lineItems[0].unitPrice
              : undefined,
          totalAmount: extracted.totalAmount || 0,
          invoiceType: extracted.invoiceType,
          documentId: opts.documentId,
          poId: opts.poId,
          recordedAt: new Date().toISOString(),
          recordedBy,
        };
        set((s) => ({ vendorLedger: [ledgerEntry, ...s.vendorLedger] }));

        return {
          inventoryUpdates,
          ledgerId,
          priceEntries,
          matchedVendorId,
          createdVendor,
        };
      },

      getReorderInputBundle: () => {
        const state = get();
        // Only items at or near reorder level (≤ 1.5× reorderLevel) are
        // candidates for the AI. This keeps the payload focused and small.
        const candidates = state.inventory.filter((it) => {
          const threshold = it.reorderLevel * 1.5;
          return it.quantity <= threshold;
        });
        const candidateIds = new Set(candidates.map((c) => c.id));
        const candidateNamesLower = new Set(
          candidates.map((c) => c.name.toLowerCase())
        );

        return {
          items: candidates.map((it) => ({
            id: it.id,
            name: it.name,
            unit: it.unit,
            category: it.category,
            currentQuantity: it.quantity,
            reorderLevel: it.reorderLevel,
            unitPrice: it.unitPrice,
            location: it.location,
          })),
          stockHistory: state.stockAdjustments
            .filter((a) => candidateIds.has(a.itemId))
            .map((a) => ({
              itemId: a.itemId,
              delta: a.delta,
              adjustedAt: a.adjustedAt,
              source: a.source,
            })),
          vendorLedger: state.vendorLedger
            .filter(
              (v) =>
                v.itemName &&
                candidateNamesLower.has(v.itemName.toLowerCase()) &&
                typeof v.unitPrice === 'number' &&
                typeof v.quantity === 'number'
            )
            .map((v) => ({
              itemName: v.itemName as string,
              quantity: (v.quantity as number) ?? 0,
              unit: v.unit ?? '',
              unitPrice: (v.unitPrice as number) ?? 0,
              date: v.invoiceDate,
            })),
          priceHistory: state.priceHistory
            .filter((p) =>
              candidateNamesLower.has(p.itemName.toLowerCase())
            )
            .map((p) => ({
              itemName: p.itemName,
              unitPrice: p.unitPrice,
              date: p.date,
            })),
        };
      },

      setReorderPrediction: (result) =>
        set({
          lastReorderPrediction: {
            generatedAt: new Date().toISOString(),
            result,
          },
        }),
    }),
    {
      name: 'restaurant-os-store',
      version: 6,
      migrate: (persisted, version) => {
        const state =
          persisted && typeof persisted === 'object'
            ? (persisted as Record<string, unknown>)
            : {};
        // v4: clear all demo/seed collections so existing users get a
        // fresh empty workspace. Role is preserved.
        if (version < 4) {
          state.inventory = [];
          state.vendors = [];
          state.requests = [];
          state.quotes = [];
          state.pos = [];
          state.journal = [];
          state.expenses = [];
          state.documents = [];
          state.staff = [];
          state.vendorLedger = [];
          state.priceHistory = [];
        }
        // v5: NON-destructive — backfill new collections + add new fields
        // with sensible defaults. Existing user data is preserved.
        if (version < 5) {
          if (!Array.isArray(state.stockAdjustments)) {
            state.stockAdjustments = [];
          }
          if (!Array.isArray(state.vendorReliability)) {
            state.vendorReliability = [];
          }
          // No unitPrice backfill needed — it's optional and `undefined`
          // is the correct default for items without a known cost.
        }
        // v6: NON-destructive — add lastReorderPrediction slot.
        if (version < 6) {
          if (!('lastReorderPrediction' in state)) {
            state.lastReorderPrediction = undefined;
          }
        }
        return state as unknown as AppState;
      },
    }
  )
);

export type POLineItemForm = POLineItem;

export const todayKey = () => new Date().toISOString().slice(0, 10);

export const formatINR = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);

export const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const daysUntil = (iso: string | undefined) => {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

