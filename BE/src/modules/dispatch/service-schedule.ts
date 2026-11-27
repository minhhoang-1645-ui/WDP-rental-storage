import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { allowsCustomerAccess, hourSpans, vietnamLocalTime, type ServiceWindow } from '../operations/facility-hours.js';

type ScheduleDecision = 'CONFIRMED' | 'MANAGER_CONFIRMATION_REQUIRED' | 'NO_SERVICE_WINDOW' | 'CAPACITY_REACHED';
const clock = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

export function readServiceSchedule(raw: unknown): ServiceWindow[] {
  if (!Array.isArray(raw)) throw new BadRequestException('Lịch phục vụ phải là danh sách khung giờ.');
  const windows: ServiceWindow[] = raw.map(row => {
    if (!row || typeof row !== 'object' || !Number.isInteger(row.weekday) || row.weekday < 1 || row.weekday > 7
      || typeof row.starts !== 'string' || typeof row.ends !== 'string' || !clock.test(row.starts)
      || !(clock.test(row.ends) || row.ends === '24:00') || row.starts >= row.ends
      || !Number.isSafeInteger(row.capacity) || row.capacity < 1) throw new BadRequestException('Chọn ngày, giờ phục vụ hợp lệ và số lịch hẹn tối đa là số nguyên dương.');
    return { weekday: row.weekday, starts: row.starts, ends: row.ends, capacity: row.capacity };
  });
  windows.sort((a, b) => a.weekday - b.weekday || a.starts.localeCompare(b.starts));
  if (windows.some((window, index) => index > 0 && windows[index - 1].weekday === window.weekday && windows[index - 1].ends > window.starts)) {
    throw new BadRequestException('Các khung giờ phục vụ trong cùng ngày không được trùng.');
  }
  return windows;
}

export function serviceWindow(windows: ServiceWindow[], appointmentAt: Date) {
  const { weekday, date: day, time } = vietnamLocalTime(appointmentAt);
  const window = windows.find(row => row.weekday === weekday && row.starts <= time && time < row.ends);
  if (!window) return null;
  const start = new Date(day + 'T' + window.starts + ':00+07:00');
  const end = window.ends === '24:00'
    ? new Date(Date.parse(day + 'T00:00:00+07:00') + 86400000)
    : new Date(day + 'T' + window.ends + ':00+07:00');
  return { start, end, capacity: window.capacity };
}

export async function assessHandoverWindow(tx: Prisma.TransactionClient, facilityId: string, appointmentAt: Date,
  exclude: { appointmentId?: string; returnId?: string } = {}): Promise<ScheduleDecision> {
  // BOM edits this same row. All requests competing for capacity within this facility serialize here.
  await tx.$queryRawUnsafe('SELECT id FROM "Facility" WHERE id=$1 FOR UPDATE', facilityId);
  const facility = await tx.facility.findUniqueOrThrow({ where: { id: facilityId }, select: { serviceSchedule: true, accessHours: true } });
  const windows = readServiceSchedule(facility.serviceSchedule);
  if (!windows.length) {
    const access = hourSpans(facility.accessHours);
    if (!access?.some(spans => spans.length)) throw new ConflictException('Cơ sở cần thiết lập giờ khách truy cập kho trước khi đặt lịch hẹn.');
    if (!allowsCustomerAccess(access, appointmentAt)) throw new ConflictException('Chọn thời điểm nằm trong giờ khách truy cập kho của cơ sở.');
    return 'MANAGER_CONFIRMATION_REQUIRED';
  }
  const window = serviceWindow(windows, appointmentAt);
  if (!window) return 'NO_SERVICE_WINDOW';
  const span = { gte: window.start, lt: window.end };
  const unit = { storageType: { facilityId } };
  const [handovers, returns] = await Promise.all([
    tx.handoverAppointment.count({ where: {
      ...(exclude.appointmentId && { id: { not: exclude.appointmentId } }),
      reservation: { facilityId }, status: { in: ['CONFIRMED', 'COMPLETED'] }, scheduledAt: span,
    } }),
    tx.returnRequest.count({ where: {
      ...(exclude.returnId && { id: { not: exclude.returnId } }), inspectionScheduledAt: span,
      OR: [{ inspections: { some: {}, every: { storageUnit: unit } } }, { inspections: { none: {} }, reservation: { facilityId } }],
    } }),
  ]);
  return handovers + returns >= window.capacity ? 'CAPACITY_REACHED' : 'CONFIRMED';
}
