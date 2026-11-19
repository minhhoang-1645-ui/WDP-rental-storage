export interface StockStorageUnit { id: string; unitNumber: string; floor?: string | null; zone?: string | null }
export type StockRole = 'CUSTOMER' | 'MANAGER' | 'STAFF';
export interface StoredItem {
  id: string; itemCode: string; name: string; unit: string; balance: number;
  storageUnit?: StockStorageUnit | null; note?: string | null; customer?: { id: string; fullName: string }; currentStorageUnit?: StockStorageUnit | null; rentalContract?: { id: string; contractCode: string; reservationUnit?: { storageUnit: StockStorageUnit } };
}
export interface StockLine { id: string; storedItem: Omit<StoredItem, 'balance'> & { balance: number | null }; requestedQty: number; actualQty: number | null; note: string | null }
export interface StoredItemMovement {
  id: string; type: 'IN' | 'OUT'; actualQty: number; unit: string; completedAt: string;
  movementCode: string; movementId: string | null;
}
export interface StockHistoryEvent { id: string; label: string; at: string; actor?: string | null }
export interface StockMovement {
  currentStorageUnit?: StockStorageUnit | null; storageUnitAtCompletion?: StockStorageUnit | null;
  id: string; movementCode: string; type: 'IN' | 'OUT'; status: 'REQUESTED' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED';
  customer: { id: string; fullName: string; email: string; phone?: string };
  rentalContract: { id: string; contractCode: string; status: string; reservation?: { id: string; reservationCode: string } };
  storageUnit?: StockStorageUnit | null;
  assignedStaff: { id: string; fullName: string } | null;
  assignedBy?: { fullName: string } | null; completedBy?: { fullName: string } | null;
  scheduledAt: string | null; assignedAt?: string | null; completedAt: string | null;
  createdAt: string; updatedAt: string; note: string | null; completionNote: string | null; lines: StockLine[];
  history?: StockHistoryEvent[];
}
export interface StockDraftLine { key: string; storedItemId: string; name: string; unit: string; quantity: string; note: string }
