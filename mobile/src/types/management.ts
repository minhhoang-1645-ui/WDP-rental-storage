import type { PublicUser } from '@/types/api';

export interface DashboardSummary {
  pendingReservations: number;
  activeRentals: number;
  overdueRentals: number;
  upcomingAppointments: number;
  pendingRenewals: number;
  openSupportRequests: number;
  maintenanceUnits: number;
  pendingDepositSettlements: number;
  availableUnits: number;
  occupiedUnits: number;
}

export interface AdminUser extends PublicUser {
  accountStatus: 'ACTIVE' | 'DISABLED';
}

// The resource catalog selects only approved public fields from each BE read model.
export type OperationRecord = Record<string, unknown>;

