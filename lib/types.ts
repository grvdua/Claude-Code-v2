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
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  attendance: Record<string, boolean>;
}
