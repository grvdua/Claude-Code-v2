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
} from './types';

const today = () => new Date().toISOString();
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
const daysAhead = (n: number) =>
  new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

export const seedInventory: InventoryItem[] = [
  { id: 'inv-1', name: 'Basmati Rice', category: 'Grains', unit: 'kg', location: 'store-1', quantity: 120, reorderLevel: 50 },
  { id: 'inv-2', name: 'Paneer', category: 'Dairy', unit: 'kg', location: 'restaurant', quantity: 8, reorderLevel: 15 },
  { id: 'inv-3', name: 'Chicken (whole)', category: 'Meat', unit: 'kg', location: 'restaurant', quantity: 22, reorderLevel: 20 },
  { id: 'inv-4', name: 'Onions', category: 'Vegetables', unit: 'kg', location: 'store-2', quantity: 45, reorderLevel: 30 },
  { id: 'inv-5', name: 'Tomatoes', category: 'Vegetables', unit: 'kg', location: 'store-2', quantity: 12, reorderLevel: 25 },
  { id: 'inv-6', name: 'Sunflower Oil', category: 'Oils', unit: 'litre', location: 'store-1', quantity: 35, reorderLevel: 20 },
  { id: 'inv-7', name: 'Garam Masala', category: 'Spices', unit: 'kg', location: 'restaurant', quantity: 4, reorderLevel: 2 },
  { id: 'inv-8', name: 'Turmeric Powder', category: 'Spices', unit: 'kg', location: 'store-1', quantity: 6, reorderLevel: 3 },
  { id: 'inv-9', name: 'Red Chilli Powder', category: 'Spices', unit: 'kg', location: 'store-1', quantity: 5, reorderLevel: 3 },
  { id: 'inv-10', name: 'Wheat Flour (Atta)', category: 'Grains', unit: 'kg', location: 'store-2', quantity: 80, reorderLevel: 40 },
  { id: 'inv-11', name: 'Ginger', category: 'Vegetables', unit: 'kg', location: 'restaurant', quantity: 3, reorderLevel: 5 },
  { id: 'inv-12', name: 'Garlic', category: 'Vegetables', unit: 'kg', location: 'restaurant', quantity: 4, reorderLevel: 5 },
  { id: 'inv-13', name: 'Yogurt (Curd)', category: 'Dairy', unit: 'kg', location: 'restaurant', quantity: 14, reorderLevel: 10 },
  { id: 'inv-14', name: 'Cashew Nuts', category: 'Dry Fruits', unit: 'kg', location: 'store-1', quantity: 7, reorderLevel: 5 },
  { id: 'inv-15', name: 'LPG Cylinder', category: 'Utilities', unit: 'unit', location: 'restaurant', quantity: 2, reorderLevel: 2 },
];

export const seedVendors: Vendor[] = [
  { id: 'v-1', name: 'Sharma Wholesale Mart', category: 'Grains & Spices', contact: '+91 98100 11122', rating: 4.5 },
  { id: 'v-2', name: 'Fresh Farms Pvt Ltd', category: 'Vegetables', contact: '+91 98765 43210', rating: 4.2 },
  { id: 'v-3', name: 'Amul Distributor (Delhi)', category: 'Dairy', contact: '+91 99887 76655', rating: 4.7 },
  { id: 'v-4', name: 'Royal Meats & Poultry', category: 'Meat', contact: '+91 90909 12345', rating: 4.1 },
];

export const seedRequests: MaterialRequest[] = [
  {
    id: 'req-1',
    itemName: 'Paneer',
    quantity: 20,
    unit: 'kg',
    urgency: 'high',
    notes: 'Below reorder level. Needed by tomorrow lunch service.',
    raisedBy: 'Chef Ramesh',
    raisedAt: daysAgo(1),
    status: 'quotes-received',
  },
  {
    id: 'req-2',
    itemName: 'Tomatoes',
    quantity: 30,
    unit: 'kg',
    urgency: 'medium',
    notes: 'Running low at the kitchen.',
    raisedBy: 'Chef Ramesh',
    raisedAt: today(),
    status: 'pending',
  },
];

export const seedQuotes: Quote[] = [
  {
    id: 'q-1',
    requestId: 'req-1',
    vendorId: 'v-3',
    pricePerUnit: 320,
    totalPrice: 6400,
    deliveryDate: daysAhead(1),
    notes: 'Fresh stock, morning delivery.',
    submittedAt: daysAgo(1),
  },
  {
    id: 'q-2',
    requestId: 'req-1',
    vendorId: 'v-1',
    pricePerUnit: 340,
    totalPrice: 6800,
    deliveryDate: daysAhead(2),
    notes: 'Slightly higher but bulk pricing available.',
    submittedAt: daysAgo(1),
  },
];

export const seedPOs: PurchaseOrder[] = [
  {
    id: 'po-1',
    requestId: 'req-old-1',
    vendorId: 'v-1',
    items: [
      { itemName: 'Basmati Rice', quantity: 50, unit: 'kg', pricePerUnit: 95 },
      { itemName: 'Wheat Flour (Atta)', quantity: 40, unit: 'kg', pricePerUnit: 42 },
    ],
    totalValue: 6430,
    status: 'pending-approval',
    raisedBy: 'Store Manager',
    raisedAt: daysAgo(1),
  },
  {
    id: 'po-2',
    requestId: 'req-old-2',
    vendorId: 'v-4',
    items: [{ itemName: 'Chicken (whole)', quantity: 60, unit: 'kg', pricePerUnit: 240 }],
    totalValue: 14400,
    status: 'pending-approval',
    raisedBy: 'Store Manager',
    raisedAt: daysAgo(2),
  },
  {
    id: 'po-3',
    requestId: 'req-old-3',
    vendorId: 'v-2',
    items: [{ itemName: 'Onions', quantity: 50, unit: 'kg', pricePerUnit: 28 }],
    totalValue: 1400,
    status: 'grn-logged',
    raisedBy: 'Store Manager',
    raisedAt: daysAgo(5),
    approvedBy: 'Owner',
    approvedAt: daysAgo(4),
    grnLoggedAt: daysAgo(3),
  },
];

export const seedJournal: JournalEntry[] = [
  {
    id: 'j-1',
    type: 'prep',
    description: 'Chopped onions, tomatoes, ginger-garlic paste prepared for dinner service.',
    timestamp: daysAgo(0),
    loggedBy: 'Chef Ramesh',
  },
  {
    id: 'j-2',
    type: 'batch',
    description: 'Cooked 8 kg of dal makhani base; stored in chiller.',
    quantity: 8,
    itemName: 'Dal Makhani Base',
    timestamp: daysAgo(0),
    loggedBy: 'Chef Ramesh',
  },
  {
    id: 'j-3',
    type: 'marination',
    description: 'Marinated 5 kg chicken tikka — overnight setting.',
    quantity: 5,
    itemName: 'Chicken Tikka',
    timestamp: daysAgo(1),
    loggedBy: 'Chef Ramesh',
  },
  {
    id: 'j-4',
    type: 'wastage',
    description: 'Spoiled tomatoes — discarded.',
    quantity: 2,
    itemName: 'Tomatoes',
    timestamp: daysAgo(0),
    loggedBy: 'Chef Ramesh',
  },
];

export const seedExpenses: Expense[] = [
  {
    id: 'exp-1',
    category: 'Utilities',
    amount: 4200,
    vendor: 'BSES Rajdhani',
    notes: 'Monthly electricity bill — partial.',
    date: daysAgo(0),
    loggedBy: 'Manager',
  },
  {
    id: 'exp-2',
    category: 'Repairs',
    amount: 1500,
    vendor: 'Cool Tech Services',
    notes: 'AC servicing in dining hall.',
    date: daysAgo(0),
    loggedBy: 'Manager',
  },
];

// Legacy seed entries — these have no `fileId` because they predate the
// IndexedDB-backed upload flow. The vault still tracks them (with expiry
// alerts etc.) but the "View"/"Download" actions are only available for
// documents users upload through the new flow.
export const seedDocuments: DocumentRecord[] = [
  {
    id: 'doc-1',
    name: 'FSSAI License',
    category: 'License',
    expiryDate: daysAhead(20),
    uploadedAt: daysAgo(300),
  },
  {
    id: 'doc-2',
    name: 'Fire Safety NOC',
    category: 'License',
    expiryDate: daysAhead(120),
    uploadedAt: daysAgo(200),
  },
  {
    id: 'doc-3',
    name: 'Rent Agreement',
    category: 'Agreement',
    expiryDate: daysAhead(400),
    uploadedAt: daysAgo(60),
  },
  {
    id: 'doc-4',
    name: 'Sharma Wholesale Invoice — Aug',
    category: 'Invoice',
    expiryDate: daysAhead(700),
    uploadedAt: daysAgo(15),
  },
];

export const seedStaff: StaffMember[] = [
  { id: 's-1', name: 'Ramesh Yadav', role: 'Head Chef', attendance: {} },
  { id: 's-2', name: 'Suresh Kumar', role: 'Sous Chef', attendance: {} },
  { id: 's-3', name: 'Anita Singh', role: 'Server', attendance: {} },
  { id: 's-4', name: 'Vikram Patel', role: 'Server', attendance: {} },
  { id: 's-5', name: 'Manoj Verma', role: 'Dishwasher', attendance: {} },
];
