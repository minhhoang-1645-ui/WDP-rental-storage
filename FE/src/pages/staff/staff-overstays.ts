import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import type { Page } from '../../components/manager/portal-data';
import { staffRentalTarget } from './staff-rentals';

export type Overstay = {
  id: string;
  reservationId: string;
  endDate: string;
  overdueDays: number;
  customer: { fullName: string };
  storageUnit: { unitNumber: string; floor: string | null; zone: string | null };
  returnRequest: { id: string; status: string } | null;
};

export const staffOverstayPath = '/staff/overstays';

export function useStaffOverstays(page = 1) {
  const { user } = useAuth();
  return useApiResource<Page<Overstay>>(`/staff/management/overstays?assigned=true&page=${page}`, user?.id, true);
}

export function staffOverstayTarget(row: Overstay) {
  return row.returnRequest ? `/staff/returns/${encodeURIComponent(row.returnRequest.id)}`
    : staffRentalTarget(row.reservationId, { contract: row.id });
}
