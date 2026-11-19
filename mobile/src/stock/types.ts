export type StockRole = 'CUSTOMER' | 'MANAGER' | 'STAFF';
export interface StoredItem {
  photos?: string[];
  photoSource?: 'CUSTOMER_PROVIDED';
  id: string; itemCode: string; name: string; unit: string; balance: number;
  note?: string | null; updatedAt?: string; rentalContract?: { id: string; contractCode: string }; storageUnit?: StockLocation;
}
interface StockLocation { id: string; unitNumber: string; floor: string | null; zone: string | null }
export interface StockLine { id: string; storedItem: StoredItem; requestedQty: number; actualQty: number | null; note: string | null; photos?:string[]; photoSource?:'CUSTOMER_PROVIDED' }
export interface StockMovement {
  id: string; movementCode: string; type: 'IN' | 'OUT'; status: 'REQUESTED' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED';
  customer: { id: string; fullName: string; email: string; phone?: string };
  rentalContract: { id: string; contractCode: string; status: string }; storageUnit?: StockLocation | null;
  currentStorageUnit?: StockLocation | null;
  storageUnitAtCompletion?: Pick<StockLocation, 'unitNumber' | 'floor' | 'zone'> | null;
  assignedStaff: { id: string; fullName: string } | null;
  assignedBy?: { fullName: string } | null; completedBy?: { fullName: string } | null;
  scheduledAt: string | null; assignedAt?: string | null; completedAt: string | null;
  createdAt: string; updatedAt: string; note: string | null; completionNote: string | null; lines: StockLine[];
}
export interface StockDraftLine { key: string; storedItemId: string; name: string; unit: string; quantity: string; note: string; photos?: string[] }
