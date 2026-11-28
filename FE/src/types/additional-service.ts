export interface ServiceDefinition {
  kind: 'PURCHASE' | 'RENTAL';
  billingUnit: 'ONE_TIME' | 'DAY' | 'MONTH';
  physicalUnit: string | null;
}

export interface AdditionalService {
  minimumRentalMonths?: number | null;
  updatedAt?: string;
  configurationReview?: { revision: string; before: ServiceDefinition; after: ServiceDefinition } | null;
  stockOnHand?: number | null;
  rentalCapacity?: number | null;
  facilityId?: string | null;
  facilityName?: string;
  id: string;
  code: string;
  name: string;
  description: string | null;
  kind: 'PURCHASE' | 'RENTAL';
  billingUnit: 'ONE_TIME' | 'DAY' | 'MONTH';
  unitPrice: number | null;
  physicalUnit?: string | null;
  isActive?: boolean;
  localIsActive?: boolean;
  globalIsActive?: boolean;
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
  facilityId?:string;
  serviceId: string;
  kind: 'PURCHASE' | 'RENTAL';
  stockOnHand?: number | null;
  reservedQuantity?: number;
  availableQuantity?: number | null;
  rentalCapacity?: number | null;
  peakCommittedQuantity?: number;
  soldByUnit?: { unit: string | null; quantity: number }[];
  completedRentalCount?: number;
  available?: boolean;
}
