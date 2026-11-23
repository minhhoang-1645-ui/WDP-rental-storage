import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { assertTaskFacility, reservationScope, type taskFacilityId } from './task-access.js';
type Reference = Parameters<typeof taskFacilityId>[1] & { invoiceId?: string; returnRequestId?: string };
export function managerReservationScope(actor: PublicUser): Prisma.ReservationWhereInput {
 if(actor.role!=='FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý cơ sở được thực hiện chức năng này.');
 return reservationScope(actor);
}
export async function assertManagerRecordAccess(db:Prisma.TransactionClient,actor:PublicUser,reference:Reference) {
 managerReservationScope(actor);
 let ref:Parameters<typeof taskFacilityId>[1]=reference;
 if(reference.invoiceId) {
  const record=await db.invoice.findUnique({where:{id:reference.invoiceId},select:{reservationId:true}});
  if(!record)throw new NotFoundException('Không tìm thấy hóa đơn.');
  ref={reservationId:record.reservationId};
 } else if(reference.returnRequestId) {
  const record=await db.returnRequest.findUnique({where:{id:reference.returnRequestId},select:{reservationId:true}});
  if(!record)throw new NotFoundException('Không tìm thấy hồ sơ trả kho.');
  ref={reservationId:record.reservationId};
 }
 await assertTaskFacility(db,actor,ref);
}

export async function assertActiveRole(db:Prisma.TransactionClient,actor:PublicUser,role:PublicUser['role']) {
 if(actor.role!==role || !await db.user.findFirst({where:{id:actor.id,role,accountStatus:'ACTIVE'},select:{id:true}}))throw new ForbiddenException('Vai trò hoặc trạng thái tài khoản không cho phép thao tác này.');
}
