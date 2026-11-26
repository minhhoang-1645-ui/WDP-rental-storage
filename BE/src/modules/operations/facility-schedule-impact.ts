import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { serviceWindow } from '../dispatch/service-schedule.js';
import { allowsCustomerAccess, covers, hourSpans, type ServiceWindow, type Week } from './facility-hours.js';

const day = 86_400_000;
const utcOffset = 7 * 3_600_000;

function shiftFits(week: Week | null, starts: Date, ends: Date) {
  const end = +ends + utcOffset;
  for (let cursor = +starts + utcOffset; cursor < end;) {
    const local = new Date(cursor);
    const midnight = local.setUTCHours(0, 0, 0, 0) + day;
    const stop = Math.min(end, midnight);
    const from = new Date(cursor).toISOString().slice(11, 16);
    const to = stop === midnight ? '24:00' : new Date(Math.ceil(stop / 60_000) * 60_000).toISOString().slice(11, 16);
    if (!covers(week?.[(local.getUTCDay() + 6) % 7], from, to === '00:00' ? '24:00' : to)) return false;
    cursor = stop;
  }
  return true;
}

export async function facilityScheduleImpact(tx: Prisma.TransactionClient, facilityId: string,
  { officeHours, accessHours, schedule, officeChanged }: {
    officeHours: string; accessHours: string; schedule: ServiceWindow[]; officeChanged: boolean;
  }, now = new Date()) {
  const localDayStart = new Date(Math.floor((+now + utcOffset) / day) * day - utcOffset);
  const span = { gte: localDayStart };
  const unit = { storageType: { facilityId } };
  const [handovers, returns, shifts] = await Promise.all([
    tx.handoverAppointment.findMany({ where: { reservation: { facilityId },
      status: { in: ['CONFIRMED', 'COMPLETED'] }, scheduledAt: span },
      select: { id: true, scheduledAt: true, status: true } }),
    tx.returnRequest.findMany({ where: { inspectionScheduledAt: span, OR: [
      { inspections: { some: {}, every: { storageUnit: unit } } }, { inspections: { none: {} }, reservation: { facilityId } },
    ] }, select: { id: true, inspectionScheduledAt: true, status: true } }),
    officeChanged ? tx.staffShift.findMany({ where: { facilityId, status: 'SCHEDULED',
      endsAt: { gt: now }, checkedOutAt: null }, select: { id: true, startsAt: true, endsAt: true } }) : [],
  ]);
  const appointments = [
    ...handovers.map(row => ({ id: 'handover:' + row.id, time: row.scheduledAt, active: row.status === 'CONFIRMED' })),
    ...returns.map(row => ({ id: 'return:' + row.id, time: row.inspectionScheduledAt!, active: row.status === 'REQUESTED' })),
  ].map(row => ({ ...row, window: serviceWindow(schedule, row.time) }));
  const counts = new Map<number, number>();
  for (const { window } of appointments) if (window) counts.set(+window.start, (counts.get(+window.start) ?? 0) + 1);
  const access = hourSpans(accessHours);
  const affectedAppointments = appointments.filter(({ window, time, active }) => active && time >= now
    && (schedule.length ? !window || (counts.get(+window.start) ?? 0) > window.capacity : !allowsCustomerAccess(access, time)))
    .map(({ id, time }) => id + ':' + time.toISOString()).sort();
  const week = hourSpans(officeHours);
  const affectedShifts = shifts.filter(row => !shiftFits(week, row.startsAt, row.endsAt))
    .map(row => [row.id, row.startsAt.toISOString(), row.endsAt.toISOString()].join(':')).sort();
  if (!affectedAppointments.length && !affectedShifts.length) return null;
  const token = createHash('sha256').update(JSON.stringify([facilityId, officeHours, accessHours, schedule, affectedAppointments, affectedShifts])).digest('hex');
  return { token, appointments: affectedAppointments.length, shifts: affectedShifts.length };
}
