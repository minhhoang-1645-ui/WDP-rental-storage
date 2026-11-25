import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

type ServiceWindow = { weekday: number; starts: string; ends: string; capacity: number };
type ScheduleDecision = 'CONFIRMED' | 'NO_SERVICE_WINDOW' | 'NO_PLANNED_STAFF' | 'CAPACITY_REACHED';
const clock = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

export function readServiceSchedule(raw: unknown): ServiceWindow[] {
  if (!Array.isArray(raw)) throw new BadRequestException('Lịch phục vụ phải là danh sách khung giờ.');
  const windows: ServiceWindow[] = raw.map(row => {
    if (!row || typeof row !== 'object' || !Number.isInteger(row.weekday) || row.weekday < 1 || row.weekday > 7
      || typeof row.starts !== 'string' || typeof row.ends !== 'string' || !clock.test(row.starts)
      || !(clock.test(row.ends) || row.ends === '24:00') || row.starts >= row.ends
      || !Number.isSafeInteger(row.capacity) || row.capacity < 1) throw new BadRequestException('Kiểm tra thứ, giờ phục vụ và sức chứa khung giờ.');
    return { weekday: row.weekday, starts: row.starts, ends: row.ends, capacity: row.capacity };
  });
  windows.sort((a, b) => a.weekday - b.weekday || a.starts.localeCompare(b.starts));
  if (windows.some((window, index) => index > 0 && windows[index - 1].weekday === window.weekday && windows[index - 1].ends > window.starts)) {
    throw new BadRequestException('Các khung giờ phục vụ trong cùng ngày không được trùng.');
  }
  return windows;
}

export async function assessHandoverWindow(tx: Prisma.TransactionClient, facilityId: string, appointmentAt: Date): Promise<ScheduleDecision> {
  // BOM edits this same row. All requests competing for capacity within this facility serialize here.
  await tx.$queryRawUnsafe('SELECT id FROM "Facility" WHERE id=$1 FOR UPDATE', facilityId);
  const facility = await tx.facility.findUniqueOrThrow({ where: { id: facilityId }, select: { serviceSchedule: true } });
  const local = new Date(+appointmentAt + 7 * 60 * 60 * 1000);
  const localStamp = local.toISOString();
  const time = localStamp.slice(11, 16);
  const window = readServiceSchedule(facility.serviceSchedule).find(row =>
    row.weekday === (local.getUTCDay() || 7) && row.starts <= time && time < row.ends);
  if (!window) return 'NO_SERVICE_WINDOW';
  const planned = await tx.staffShift.count({ where: {
    facilityId, status: 'SCHEDULED', startsAt: { lte: appointmentAt }, endsAt: { gt: appointmentAt },
    OR: [{ checkedOutAt: null }, { checkedOutAt: { gt: appointmentAt } }],
    staff: { role: 'FACILITY_STAFF', accountStatus: 'ACTIVE', facilityAccess: { some: { facilityId, revokedAt: null } } },
  } });
  if (!planned) return 'NO_PLANNED_STAFF';

  const day = localStamp.slice(0, 10);
  const start = new Date(day + 'T' + window.starts + ':00+07:00');
  const end = window.ends === '24:00'
    ? new Date(Date.parse(day + 'T00:00:00+07:00') + 86400000)
    : new Date(day + 'T' + window.ends + ':00+07:00');
  const reserved = await tx.handoverAppointment.count({ where: {
    reservation: { facilityId }, status: { in: ['CONFIRMED', 'COMPLETED'] }, scheduledAt: { gte: start, lt: end },
  } });
  return reserved < window.capacity ? 'CONFIRMED' : 'CAPACITY_REACHED';
}
