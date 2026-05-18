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

  setRole: (r: Role | null) => void;

  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => void;
  adjustStock: (id: string, delta: number) => void;

  addRequest: (
    req: Omit<MaterialRequest, 'id' | 'raisedAt' | 'status'>
  ) => void;
  updateRequestStatus: (id: string, status: RequestStatus) => void;

  addQuote: (q: Omit<Quote, 'id' | 'submittedAt'>) => void;

  raisePO: (po: Omit<PurchaseOrder, 'id' | 'raisedAt' | 'status'>) => void;
  approvePO: (id: string, approver: string) => void;
  rejectPO: (id: string) => void;
  logGRN: (id: string) => void;
  setPOStatus: (id: string, status: POStatus) => void;

  addJournalEntry: (e: Omit<JournalEntry, 'id' | 'timestamp'>) => void;

  addExpense: (e: Omit<Expense, 'id' | 'date'>) => void;

  addDocument: (d: Omit<DocumentRecord, 'id' | 'uploadedAt'>) => string;
  deleteDocument: (id: string) => Promise<void>;
  attachBillToExpense: (expenseId: string, documentId: string) => void;
  attachInvoiceToPO: (poId: string, documentId: string) => void;

  toggleAttendance: (staffId: string, date: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
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

      setRole: (role) => set({ role }),

      addInventoryItem: (item) =>
        set((s) => ({
          inventory: [...s.inventory, { ...item, id: id('inv') }],
        })),

      adjustStock: (itemId, delta) =>
        set((s) => ({
          inventory: s.inventory.map((it) =>
            it.id === itemId
              ? { ...it, quantity: Math.max(0, it.quantity + delta) }
              : it
          ),
        })),

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

      addQuote: (q) =>
        set((s) => ({
          quotes: [
            ...s.quotes,
            { ...q, id: id('q'), submittedAt: new Date().toISOString() },
          ],
        })),

      raisePO: (po) =>
        set((s) => {
          const status: POStatus =
            po.totalValue > PO_APPROVAL_THRESHOLD
              ? 'pending-approval'
              : 'approved';
          return {
            pos: [
              ...s.pos,
              {
                ...po,
                id: id('po'),
                raisedAt: new Date().toISOString(),
                status,
              },
            ],
          };
        }),

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
    }),
    {
      name: 'restaurant-os-store',
      version: 2,
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

