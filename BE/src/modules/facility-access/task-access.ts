import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { assertFacility, taskFacilityId, type AssignmentReference } from './facility-access.service.js';
export { taskFacilityId };

export function facilityScope(actor: Pick<PublicUser, 'id' | 'role' | 'selectedFacilityId'>): Prisma.FacilityWhereInput {
  if (!['FACILITY_STAFF', 'FACILITY_MANAGER'].includes(actor.role)) throw new ForbiddenException('Chức năng dành cho nhân sự tại cơ sở.');
  return { ...(actor.role === 'FACILITY_MANAGER' && actor.selectedFacilityId ? { id: actor.selectedFacilityId } : {}), facilityAccess: { some: { userId: actor.id, revokedAt: null, user: { role: actor.role, accountStatus: 'ACTIVE' } } } };
}
export function reservationScope(actor: Pick<PublicUser, 'id' | 'role' | 'selectedFacilityId'>): Prisma.ReservationWhereInput { return { facility: facilityScope(actor) }; }
export function currentContractScope(actor: Pick<PublicUser, 'id' | 'role' | 'selectedFacilityId'>): Prisma.RentalContractWhereInput {
  return { reservationUnit: { storageUnit: { storageType: { facility: facilityScope(actor) } } } };
}
export function currentRentalScope(actor: PublicUser): Prisma.ReservationWhereInput {
  return { contracts: { some: { AND: [currentContractScope(actor), {status:'ACTIVE',reservationUnit:{releasedAt:null}}] } } };
}
export function returnTaskScope(actor: PublicUser): Prisma.ReturnRequestWhereInput {
  const unit = { storageType: { facility: facilityScope(actor) } };
  return { OR: [
    { inspections: { some: {}, every: { storageUnit: unit } } },
    { inspections: { none: {} }, reservation: reservationScope(actor) },
  ] };
}
export function supportTaskScope(actor: PublicUser): Prisma.SupportRequestWhereInput {
  return { OR: [
    { storageUnit: { storageType: { facility: facilityScope(actor) } } },
    { storageUnitId: null, rentalContract: currentContractScope(actor) },
    { storageUnitId: null, rentalContractId: null, reservation: reservationScope(actor) },
  ] };
}
export function renewalTaskScope(actor: PublicUser): Prisma.RenewalRequestWhereInput {
  return { OR: [{ rentalContract: currentContractScope(actor) }, { rentalContractId: null, reservation: reservationScope(actor) }] };
}
export function transferTaskScope(actor: PublicUser): Prisma.TransferRequestWhereInput {
  return { fromStorageUnit: { storageType: { facility: facilityScope(actor) } } };
}
export function invoiceFacilityScope(actor: PublicUser): Prisma.InvoiceWhereInput {
  if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý cơ sở được tra cứu tài chính.');
  return { OR: [{ financialFacility: facilityScope(actor) }, { facilityIdSnapshot: null, reservation: reservationScope(actor) }] };
}
export function supportTaskReference(record: { storageUnitId?: string | null; rentalContractId?: string | null; reservationId: string }): AssignmentReference {
  return record.storageUnitId ? { storageUnitId: record.storageUnitId } : record.rentalContractId ? { rentalContractId: record.rentalContractId } : { reservationId: record.reservationId };
}
export function staffReservationScope(actor: Pick<PublicUser, 'id' | 'role'>): Prisma.ReservationWhereInput {
  if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ nhân viên được truy cập nhiệm vụ của mình.');
  const assigned = { assignedStaffUserId: actor.id };
  return { ...reservationScope(actor), OR: [
    { appointments: { some: assigned } }, { returns: { some: assigned } },
    { supportRequests: { some: assigned } }, { transferRequests: { some: assigned } },
    { contracts: { some: { damageClaims: { some: { assignedStaffId: actor.id } } } } },
  ] };
}
export function staffContractScope(actor: Pick<PublicUser, 'id' | 'role'>): Prisma.RentalContractWhereInput {
  if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ nhân viên được dùng lookup nhiệm vụ.');
  const assigned = { assignedStaffUserId: actor.id };
  const noCrossFacilityMove = { transferRequests: { none: { status:'COMPLETED' as const, closurePlanId:{not:null} } } };
  return { ...currentContractScope(actor), OR: [
    { damageClaims: { some: { assignedStaffId: actor.id } } },
    { supportRequests: { some: { ...assigned, closurePlanId:null, status:{not:'RESOLVED'} } } },
    { transferRequests: { some: { ...assigned, status:{in:['REQUESTED','APPROVED']} } } },
    { ...noCrossFacilityMove, reservation: { appointments: { some: assigned } } },
    { ...noCrossFacilityMove, supportRequests: { some: { ...assigned, closurePlanId:null } } },
    { ...noCrossFacilityMove, reservation: { returns: { some: { ...assigned, inspections:{none:{}} } } } },
    { ...noCrossFacilityMove, transferRequests: { ...noCrossFacilityMove.transferRequests, some:{...assigned,closurePlanId:null} } },
    { returnInspections: { some: { returnRequest: assigned } } },
    { reservationUnit: { incomingTransfer: { receivingStaffId: actor.id, status:'COMPLETED', closurePlanId:{not:null} } } },
  ] };
}
export function staffUnitScope(actor: Pick<PublicUser, 'id' | 'role'>): Prisma.StorageUnitWhereInput {
  return { storageType: { facility: facilityScope(actor) }, OR: [
    { maintenanceRequests: { some: { assignedStaffUserId: actor.id } } },
    { reservationUnits: { some: { reservation: staffReservationScope(actor) } } },
  ] };
}
export async function assertTaskFacility(db: Prisma.TransactionClient, actor: PublicUser, ref: AssignmentReference) {
  await db.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',actor.id);
  const facilityId = await taskFacilityId(db, ref);
  await assertFacility(db, actor, facilityId);
  return facilityId;
}
export async function assertTaskExecution(db: Prisma.TransactionClient, actor: PublicUser, assignee: string | null | undefined, ref: AssignmentReference) {
  if (actor.role !== 'FACILITY_STAFF' || assignee !== actor.id) throw new ForbiddenException('Chỉ nhân viên được giao mới được thực hiện nhiệm vụ.');
  await assertTaskFacility(db, actor, ref);
}
