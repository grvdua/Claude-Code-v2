export type Role = 'owner' | 'manager' | 'chef' | 'store-manager';

export type Location = 'restaurant' | 'store-1' | 'store-2';

export type RequestStatus =
  | 'pending'
  | 'inventory-checked'
  | 'rfq-sent'
  | 'quotes-received'
  | 'po-raised'
  | 'po-approved'
  | 'ordered'
  | 'delivered';

export type POStatus =
  | 'pending-approval'
  | 'approved'
  | 'rejected'
  | 'ordered'
  | 'grn-logged';

export type Urgency = 'low' | 'medium' | 'high';

export type DocumentCategory =
  | 'License'
  | 'Agreement'
  | 'Invoice'
  | 'Salary Slip'
  | 'Bill'
  | 'Other';

export type JournalType = 'prep' | 'batch' | 'marination' | 'wastage';

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  location: Location;
  quantity: number;
  reorderLevel: number;
  /** Current per-unit cost in INR. Used for inventory value + price-aware reorders. */
  unitPrice?: number;
}

export interface StockAdjustment {
  id: string;
  itemId: string;
  /** positive = stock added; negative = stock removed */
  delta: number;
  /** Free text reason e.g. "GRN PO-123", "wastage", "manual count". */
  reason: string;
  /** Quantity after the adjustment. */
  resultingQuantity: number;
  /** Role/user who triggered the adjustment. */
  adjustedBy: string;
  adjustedAt: string;
  source?: 'grn' | 'wastage' | 'manual' | 'invoice-upload';
  sourceId?: string;
}

export interface Vendor {
  id: string;
  name: string;
  category: string;
  contact: string;
  rating: number;
}

export interface MaterialRequest {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  urgency: Urgency;
  notes: string;
  raisedBy: string;
  raisedAt: string;
  status: RequestStatus;
}

export interface Quote {
  id: string;
  requestId: string;
  vendorId: string;
  pricePerUnit: number;
  totalPrice: number;
  deliveryDate: string;
  notes: string;
  submittedAt: string;
  /** Cached AI scoring for this quote (populated when comparison is run). */
  aiAnalysis?: QuoteAIAnalysis;
}

export interface QuoteAIAnalysis {
  pros: string[];
  cons: string[];
  /** 0-100 vendor reliability used in the analysis. */
  reliabilityScore: number;
  /** 0-100 value score (price competitiveness vs avg). */
  valueScore: number;
  recommended: boolean;
  reasoning: string;
}

export interface QuoteAnalysisResult {
  recommendedQuoteId: string;
  estimatedSavingsINR: number;
  savingsBaseline: 'vs-worst' | 'vs-avg';
  perQuote: Record<string, QuoteAIAnalysis>;
  summary: string;
}

export interface POLineItem {
  itemName: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
}

export interface PurchaseOrder {
  id: string;
  requestId: string;
  vendorId: string;
  items: POLineItem[];
  totalValue: number;
  status: POStatus;
  raisedBy: string;
  raisedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  grnLoggedAt?: string;
  invoiceDocumentId?: string;
  /** Carrier/shipment tracking number. Added after PO approval. */
  trackingNumber?: string;
  /** Free-form shipment notes (carrier, ETA, contact). */
  shipmentNotes?: string;
  /** Quote this PO was raised from, when applicable. */
  quoteId?: string;
}

export interface VendorReliabilityEntry {
  vendorId: string;
  /** Month bucket in YYYY-MM form. */
  month: string;
  /** 0-100: orders delivered on or before promised date. */
  onTimeRate: number;
  /** 0-100: delivered qty/price vs original quote. */
  quoteAccuracy: number;
  /** 0-100: delivered qty / ordered qty. */
  fulfillmentRate: number;
  orderCount: number;
  /** Weighted average of the three rates. */
  compositeScore: number;
}

export interface JournalEntry {
  id: string;
  type: JournalType;
  description: string;
  quantity?: number;
  itemName?: string;
  timestamp: string;
  loggedBy: string;
}

export interface Expense {
  id: string;
  category: string;
  amount: number;
  vendor: string;
  notes: string;
  date: string;
  loggedBy: string;
  billDocumentId?: string;
}

export interface DocumentRecord {
  id: string;
  name: string;
  category: DocumentCategory;
  expiryDate?: string;
  uploadedAt: string;
  fileId?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  notes?: string;
  linkedTo?: { type: 'expense' | 'po' | 'grn' | 'staff'; id: string };
  /** Legacy field for seed entries that have no IndexedDB-backed file. */
  fileUrl?: string;
  /** Specific document type — finer-grained than category (e.g. "FSSAI License", "Electricity Bill"). */
  documentType?: string;
  /** License/document/invoice number printed on the document. */
  licenseNumber?: string;
  /** Government body, regulator, company or person that issued the document. */
  issuingAuthority?: string;
  /** ISO date of issue/registration/grant. */
  dateOfIssue?: string;
  /** Name of the business or person the document is issued to. */
  registeredEntity?: string;
  /** True if any field was AI-populated during upload. */
  aiExtracted?: boolean;
  /** ISO timestamp the document was last marked as renewed via bulk action. */
  renewedAt?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  attendance: Record<string, boolean>;
}

export type InvoiceType =
  | 'raw-material'
  | 'utility'
  | 'rent'
  | 'packaging'
  | 'marketing'
  | 'housekeeping'
  | 'other';

export interface InvoiceLineItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

export interface ExtractedInvoiceData {
  invoiceType: InvoiceType;
  vendorName: string;
  vendorGstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  currency: string;
  lineItems: InvoiceLineItem[];
  notes: string;
}

export interface VendorLedgerEntry {
  id: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber?: string;
  invoiceDate: string;
  itemName?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  totalAmount: number;
  invoiceType?: InvoiceType;
  documentId?: string;
  poId?: string;
  recordedAt: string;
  recordedBy: string;
}

export interface PriceHistoryEntry {
  id: string;
  itemId?: string;
  itemName: string;
  vendorId?: string;
  vendorName?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  date: string;
  invoiceDocumentId?: string;
}

export interface ExtractedQuoteLineItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

export interface ExtractedQuoteData {
  vendorName: string;
  items: ExtractedQuoteLineItem[];
  totalAmount: number;
  /** ISO date the vendor proposes to deliver. */
  deliveryDate: string;
  /** ISO date the quote is valid until. */
  validUntil: string;
  notes: string;
}

export interface ProcessInvoiceResult {
  inventoryUpdates: string[];
  ledgerId: string;
  priceEntries: number;
  matchedVendorId?: string;
  createdVendor?: boolean;
}

export interface ProcessInvoiceOptions {
  documentId?: string;
  poId?: string;
  recordedBy: string;
  location?: Location;
}

export type VoiceFormType =
  | 'expense'
  | 'wastage'
  | 'material-request'
  | 'journal'
  | 'inventory-adjust'
  | 'attendance'
  | 'document-meta';

export type ReorderUrgency = 'critical' | 'high' | 'medium' | 'low';

export type ReorderPriceTrend = 'rising' | 'stable' | 'falling';

export interface ReorderPredictionItem {
  itemId: string;
  recommendedQuantity: number;
  urgency: ReorderUrgency;
  estimatedDaysUntilStockout: number;
  projectedSpendINR: number;
  reasoning: string;
  priceTrend: ReorderPriceTrend;
}

export interface ReorderPredictionResult {
  items: ReorderPredictionItem[];
  summary: string;
}

export interface ReorderPredictionBundleItem {
  id: string;
  name: string;
  unit: string;
  category: string;
  currentQuantity: number;
  reorderLevel: number;
  unitPrice?: number;
  location: Location;
}

export interface ReorderStockHistoryEntry {
  itemId: string;
  delta: number;
  adjustedAt: string;
  source?: StockAdjustment['source'];
}

export interface ReorderVendorLedgerEntry {
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  date: string;
}

export interface ReorderPriceHistoryEntry {
  itemName: string;
  unitPrice: number;
  date: string;
}

export interface ReorderPredictionBundle {
  items: ReorderPredictionBundleItem[];
  stockHistory: ReorderStockHistoryEntry[];
  vendorLedger: ReorderVendorLedgerEntry[];
  priceHistory: ReorderPriceHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Phase 3 — Recipes + cost variance intelligence
// ---------------------------------------------------------------------------

export interface RecipeIngredient {
  /** Reference to InventoryItem.id */
  itemId: string;
  /** Quantity per portion / per batch (consistent with the recipe). */
  quantity: number;
  /** Display unit; usually inherited from the inventory item. */
  unit: string;
}

export interface Recipe {
  id: string;
  /** Recipe name e.g. "Butter Chicken", "Paneer Tikka". */
  name: string;
  /** "Main Course", "Starter", "Beverage" etc. */
  category: string;
  /** How many portions one batch yields. */
  yieldPortions: number;
  /** Selling price per portion in INR. */
  sellingPricePerPortion: number;
  ingredients: RecipeIngredient[];
  createdAt: string;
}

export type CostVarianceFlag = 'ok' | 'warning' | 'critical';

export interface CostVarianceInsight {
  recipeId: string;
  theoreticalCostPerPortion: number;
  actualCostPerPortion: number;
  /** (actual - theoretical) / theoretical * 100 */
  variancePct: number;
  /** actual / sellingPrice * 100 */
  foodCostPct: number;
  flag: CostVarianceFlag;
  /** AI-identified factors driving the variance. */
  drivers: string[];
  recommendation: string;
}

export interface CostVarianceReport {
  generatedAt: string;
  perRecipe: CostVarianceInsight[];
  overallSummary: string;
}

// ---------------------------------------------------------------------------
// Phase 3 — Expense category corrections (learn from manager edits)
// ---------------------------------------------------------------------------

export interface ExpenseCategoryCorrection {
  id: string;
  /** Vendor name at the time of correction (optional). */
  vendorName?: string;
  /** Tokens extracted from the expense notes — used for fuzzy match. */
  descriptionKeywords: string[];
  originalCategory: string;
  correctedCategory: string;
  correctedAt: string;
}

// ---------------------------------------------------------------------------
// Phase 3 — Revenue tracking for the Owner dashboard
// ---------------------------------------------------------------------------

export interface RevenueEntry {
  id: string;
  /** YYYY-MM-DD date the revenue was earned. */
  date: string;
  /** INR amount. */
  amount: number;
  notes?: string;
  source: 'manual' | 'pos';
}

// ---------------------------------------------------------------------------
// Phase 3 — Theme preference
// ---------------------------------------------------------------------------

export type ThemePreference = 'light' | 'dark' | 'system';
