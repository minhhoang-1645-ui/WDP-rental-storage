import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { serviceWindow } from '../dispatch/service-schedule.js';
import { allowsCustomerAccess, hourSpans, type ServiceWindow } from './facility-hours.js';

const day = 86_400_000;
const utcOffset = 7 * 3_600_000;

export async function facilityScheduleImpact(tx: Prisma.TransactionClient, facilityId: string,
  { officeHours, accessHours, schedule }: {
    officeHours: string; accessHours: string; schedule: ServiceWindow[];
  }, now = new Date()) {
  const localDayStart = new Date(Math.floor((+now + utcOffset) / day) * day - utcOffset);
  const span = { gte: localDayStart };
  const unit = { storageType: { facilityId } };
  const [handovers, returns] = await Promise.all([
    tx.handoverAppointment.findMany({ where: { reservation: { facilityId },
      status: { in: ['CONFIRMED', 'COMPLETED'] }, scheduledAt: span },
      select: { id: true, scheduledAt: true, status: true } }),
    tx.returnRequest.findMany({ where: { inspectionScheduledAt: span, OR: [
      { inspections: { some: {}, every: { storageUnit: unit } } }, { inspections: { none: {} }, reservation: { facilityId } },
    ] }, select: { id: true, inspectionScheduledAt: true, status: true } }),
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
  if (!affectedAppointments.length) return null;
  const token = createHash('sha256').update(JSON.stringify([facilityId, officeHours, accessHours, schedule, affectedAppointments])).digest('hex');
  return { token, appointments: affectedAppointments.length };
}
