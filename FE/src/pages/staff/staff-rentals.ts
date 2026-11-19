import { useEffect, useState } from 'react';
import { staffDay, staffDayAfter } from './staff-resources';

export const staffRentalsPath = '/staff/rentals';
const expiryWarningDays = 7;

export type StaffRentalContract = {
  id: string;
  contractCode: string;
  status: string;
  startDate: string;
  endDate: string;
  unit: {
    id: string;
    unitCode: string;
    status: string;
    floor: string | null;
    zone: string | null;
    storageType: { id: string; name: string };
  };
};

export type StaffRental = {
  reservationId: string;
  reservationReference: string;
  customer: { fullName: string };
  contracts: StaffRentalContract[];
};

export const staffRentalPeriods = {
  ACTIVE: { badge: 'ACTIVE', label: 'Đang thuê' },
  EXPIRING: { badge: 'OPEN', label: 'Sắp hết hạn' },
  OVERDUE: { badge: 'OVERDUE', label: 'Quá hạn' },
} as const;

export function staffRentalPeriod(endDate: string, today: string): keyof typeof staffRentalPeriods {
  if (endDate <= today) return 'OVERDUE';
  return endDate <= staffDayAfter(today, expiryWarningDays) ? 'EXPIRING' : 'ACTIVE';
}

export function useStaffRentalToday() {
  const [today, setToday] = useState(() => staffDay(Date.now()));
  useEffect(() => {
    const update = () => setToday(staffDay(Date.now()));
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);
  return today;
}

export function staffRentalTarget(reservationId: string, selector: { contract: string } | { unit: string }) {
  return `${staffRentalsPath}/${encodeURIComponent(reservationId)}?${new URLSearchParams(selector)}`;
}
