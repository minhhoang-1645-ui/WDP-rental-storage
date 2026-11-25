import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
export async function assertAcceptingBookings(db:Prisma.TransactionClient,storageTypeId:string,lock=false){
 const type=await db.storageType.findUnique({where:{id:storageTypeId},select:{facilityId:true}});
 if(!type)throw new ConflictException('Loại kho không còn khả dụng.');
 if(lock)await db.$queryRawUnsafe('SELECT id FROM "Facility" WHERE id=$1 FOR SHARE',type.facilityId);
 const facility=await db.facility.findUnique({where:{id:type.facilityId},select:{bookingEnabled:true,operationalStatus:true}});
 if(!facility?.bookingEnabled||facility.operationalStatus!=='OPEN')throw new ConflictException('Cơ sở đang tạm dừng nhận đặt kho mới. Vui lòng chọn cơ sở khác.');
}

export async function assertFacilityAllowsRenewal(db: Prisma.TransactionClient, facilityId: string, lock = false) {
  if (lock) await db.$queryRawUnsafe('SELECT id FROM "Facility" WHERE id=$1 FOR SHARE', facilityId);
  const facility = await db.facility.findUnique({ where: { id: facilityId }, select: { operationalStatus: true } });
  if (facility?.operationalStatus !== 'OPEN')
    throw new ConflictException('Cơ sở đang ngừng kinh doanh và không nhận yêu cầu gia hạn mới.');
}
