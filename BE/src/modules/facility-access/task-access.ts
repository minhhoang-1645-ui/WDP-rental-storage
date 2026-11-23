import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { assertFacility, type AssignmentReference } from './facility-access.service.js';

export function facilityScope(actor: Pick<PublicUser, 'id' | 'role'>): Prisma.FacilityWhereInput {
  if (!['FACILITY_STAFF', 'FACILITY_MANAGER'].includes(actor.role)) throw new ForbiddenException('Chức năng dành cho nhân sự tại cơ sở.');
  return { facilityAccess: { some: { userId: actor.id, revokedAt: null, user: { role: actor.role, accountStatus: 'ACTIVE' } } } };
}
export function reservationScope(actor: Pick<PublicUser, 'id' | 'role'>): Prisma.ReservationWhereInput { return { facility: facilityScope(actor) }; }
export function staffReservationScope(actor: Pick<PublicUser, 'id' | 'role'>): Prisma.ReservationWhereInput {
  if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ nhân viên được truy cập nhiệm vụ của mình.');
  const assigned = { assignedStaffUserId: actor.id };
  return { ...reservationScope(actor), OR: [
    { appointments: { some: assigned } }, { returns: { some: assigned } },
    { supportRequests: { some: assigned } }, { transferRequests: { some: assigned } },
    { contracts: { some: { OR: [{ stockMovements: { some: assigned } }, { damageClaims: { some: { assignedStaffId: actor.id } } }] } } },
  ] };
}
export function staffContractScope(actor: Pick<PublicUser, 'id' | 'role'>): Prisma.RentalContractWhereInput {
 if(actor.role!=='FACILITY_STAFF')throw new ForbiddenException('Chỉ nhân viên được dùng lookup nhiệm vụ.');
 const assigned={assignedStaffUserId:actor.id};
 return {reservation:reservationScope(actor),OR:[
  {stockMovements:{some:assigned}},{damageClaims:{some:{assignedStaffId:actor.id}}},
  {supportRequests:{some:assigned}},{transferRequests:{some:assigned}},
  {reservation:{appointments:{some:assigned}}},{reservation:{returns:{some:assigned}}},
 ]};
}
export function staffUnitScope(actor: Pick<PublicUser, 'id' | 'role'>): Prisma.StorageUnitWhereInput {
  return { storageType: { facility: facilityScope(actor) }, OR: [
    { maintenanceRequests: { some: { assignedStaffUserId: actor.id } } },
    { reservationUnits: { some: { reservation: staffReservationScope(actor) } } },
  ] };
}
export async function taskFacilityId(db: Prisma.TransactionClient, ref: AssignmentReference) {
  let id: string | undefined;
  if (ref.reservationId) id = (await db.reservation.findUnique({ where: { id: ref.reservationId }, select: { facilityId: true } }))?.facilityId;
  else if (ref.rentalContractId) id = (await db.rentalContract.findUnique({ where: { id: ref.rentalContractId }, select: { reservation: { select: { facilityId: true } } } }))?.reservation.facilityId;
  else if (ref.storageUnitId) id = (await db.storageUnit.findUnique({ where: { id: ref.storageUnitId }, select: { storageType: { select: { facilityId: true } } } }))?.storageType.facilityId;
  if (!id) throw new NotFoundException('Không tìm thấy cơ sở của nhiệm vụ.');
  return id;
}
export async function assertTaskFacility(db: Prisma.TransactionClient, actor: PublicUser, ref: AssignmentReference) {
  await db.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',actor.id);
  await assertFacility(db, actor, await taskFacilityId(db, ref));
}
export async function assertTaskExecution(db: Prisma.TransactionClient, actor: PublicUser, assignee: string | null | undefined, ref: AssignmentReference) {
  if (actor.role !== 'FACILITY_STAFF' || assignee !== actor.id) throw new ForbiddenException('Chỉ nhân viên được giao mới được thực hiện nhiệm vụ.');
  await assertTaskFacility(db, actor, ref);
}
