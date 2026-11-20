import { first, rows, type Row } from '../../components/manager/portal-data';
import { handoverReportView } from '../../utils/handover-report';

const appointmentTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function handoverTime(value: unknown) {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? appointmentTime.format(timestamp) : '';
}

export function handoverCustomer(row: Row) {
  return first(row, 'reservation.customer.fullName', 'customer.fullName');
}

export function handoverUnits(row: Row) {
  return rows(row.allocatedUnits).flatMap(unit => {
    const code = first(unit, 'unitCode', 'unitNumber');
    return code ? [{ id: first(unit, 'unitId'), code, location: [first(unit, 'floor'), first(unit, 'zone')].filter(Boolean).join(' · ') }] : [];
  });
}

export function handoverRecipient(row: Row, report = handoverReportView(row)) {
  return {
    name: (report ? first(report, 'recipientName') : '') || first(row, 'recipientName'),
    authorized: report?.recipientType === 'AUTHORIZED' || row.recipientType === 'AUTHORIZED',
  };
}

export function handoverCondition(value: string) {
  return value.trim().toLowerCase() === 'new' ? 'Mới' : value.trim();
}
