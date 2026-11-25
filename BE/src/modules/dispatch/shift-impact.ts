import type { Prisma, StaffShift } from '../../generated/prisma/client.js';

export async function affectedWork(tx: Prisma.TransactionClient, previous: StaffShift, replacement?: StaffShift) {
  const { staffUserId, facilityId } = previous;
  const assigned = { assignedStaffUserId: staffUserId };
  const reservation = { facilityId };
  const [appointments, transfers, returns, support, maintenance, claims] = await Promise.all([
    tx.handoverAppointment.findMany({ where: { ...assigned, reservation, status: { in: ['REQUESTED', 'CONFIRMED'] }, scheduledAt: { gte: previous.startsAt, lt: previous.endsAt } }, select: { id: true, appointmentCode: true, scheduledAt: true } }),
    tx.transferRequest.findMany({ where: { ...assigned, reservation, status: { in: ['REQUESTED', 'APPROVED'] } }, select: { id: true, transferCode: true, supportRequest: { select: { transferRequestedStartAt: true } } } }),
    tx.returnRequest.findMany({ where: { ...assigned, reservation, physicallyReturnedAt: null, status: { in: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'] } }, select: { id: true, returnCode: true, inspectionScheduledAt: true } }),
    tx.supportRequest.findMany({ where: { ...assigned, reservation, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED'] } }, select: { id: true, supportCode: true } }),
    tx.maintenanceRequest.findMany({ where: { ...assigned, status: { in: ['OPEN', 'IN_PROGRESS'] }, OR: [{ commonAreaFacilityId: facilityId }, { storageUnit: { storageType: { facilityId } } }] }, select: { id: true, maintenanceCode: true } }),
    tx.damageClaim.findMany({ where: { assignedStaffId: staffUserId, rentalContract: { reservation }, status: { in: ['REPORTED', 'INVESTIGATING'] }, staffFacts: null }, select: { id: true, claimCode: true } }),
  ]);
  const relevant = (date?: Date | null) => {
    if (!date) return true;
    if (date < previous.startsAt || date >= previous.endsAt) return false;
    return !replacement || replacement.staffUserId !== staffUserId || date < replacement.startsAt || date >= replacement.endsAt;
  };
  return [
    ...appointments.filter(row => relevant(row.scheduledAt)).map(row => ({ id: row.id, code: row.appointmentCode, type: 'appointments' })),
    ...transfers.filter(row => relevant(row.supportRequest?.transferRequestedStartAt)).map(row => ({ id: row.id, code: row.transferCode, type: 'transfers' })),
    ...returns.filter(row => relevant(row.inspectionScheduledAt)).map(row => ({ id: row.id, code: row.returnCode, type: 'returns' })),
    ...support.map(row => ({ id: row.id, code: row.supportCode, type: 'support-requests' })),
    ...maintenance.map(row => ({ id: row.id, code: row.maintenanceCode, type: 'maintenance' })),
    ...claims.map(row => ({ id: row.id, code: row.claimCode, type: 'damage-claims' })),
  ];
}
