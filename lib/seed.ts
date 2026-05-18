import type {
  InventoryItem,
  Vendor,
  MaterialRequest,
  Quote,
  PurchaseOrder,
  JournalEntry,
  Expense,
  DocumentRecord,
  StaffMember,
  VendorLedgerEntry,
  PriceHistoryEntry,
} from './types';

// The app boots empty so users only see their own data.
// These named exports are kept so existing imports do not break.

export const seedInventory: InventoryItem[] = [];
export const seedVendors: Vendor[] = [];
export const seedRequests: MaterialRequest[] = [];
export const seedQuotes: Quote[] = [];
export const seedPOs: PurchaseOrder[] = [];
export const seedJournal: JournalEntry[] = [];
export const seedExpenses: Expense[] = [];
export const seedDocuments: DocumentRecord[] = [];
export const seedStaff: StaffMember[] = [];
export const seedVendorLedger: VendorLedgerEntry[] = [];
export const seedPriceHistory: PriceHistoryEntry[] = [];
