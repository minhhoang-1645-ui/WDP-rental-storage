export interface AdditionalService {
  id: string;
  code: string;
  name: string;
  description: string | null;
  kind: 'PURCHASE' | 'RENTAL';
  billingUnit: 'ONE_TIME' | 'DAY' | 'MONTH';
  unitPrice: number | null;
  isActive?: boolean;
  imageUrl?: string | null;
  imageAlt?: string | null;
}

export interface ServiceSelection {
  serviceId: string;
  quantity: number;
  serviceStartDate?: string;
  serviceEndDate?: string;
}

export interface ServiceInventory {
  serviceId: string;
  kind: 'PURCHASE' | 'RENTAL';
  stockOnHand?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  rentalCapacity?: number;
  available?: boolean;
}
