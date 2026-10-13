export type UserRole = 'CUSTOMER' | 'STAFF' | 'MANAGER' | 'ADMIN';

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
}

export interface AuthSession {
  token: string;
  user: PublicUser;
}

export interface Paginated<T> {
  page: number;
  limit: number;
  total: number;
  items: T[];
}

export interface CustomerRental {
  reservationId: string;
  reservationReference: string;
  storageType: { id: string; code: string; name: string };
  quantity: number;
  effectiveEndDate: string;
  isOverdue: boolean;
  rentalState: 'ACTIVE' | 'OVERDUE';
  unitCount: number;
  contracts: { id: string; contractCode: string; status: string; unit: { unitCode: string; floor: string | null; zone: string | null } }[];
  billingSummary: { totalOutstanding: number };
}

export interface CustomerInvoice {
  id: string;
  invoiceCode: string;
  type: 'INITIAL' | 'RECURRING' | 'RENEWAL' | 'SETTLEMENT';
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID';
  balanceDue: number;
  totalAmount: number;
  currency: string;
  dueAt: string | null;
  reservation: { reference: string };
}

export interface StaffAppointment {
  id: string;
  appointmentCode: string;
  status: string;
  scheduledAt: string;
  reservation: { reference: string; customer: { fullName: string; phone: string | null } };
  allocatedUnits: { unitCode: string }[];
}

export interface StaffTask {
  id: string;
  status: string;
  priority?: string;
  maintenanceCode?: string;
  supportCode?: string;
  returnCode?: string;
  transferCode?: string;
  description?: string;
  subject?: string;
  unit?: { unitCode?: string };
  fromUnit?: { unitCode?: string };
  toUnit?: { unitCode?: string };
  createdAt?: string;
}
