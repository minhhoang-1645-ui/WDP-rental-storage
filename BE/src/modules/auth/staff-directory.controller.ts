import { BadRequestException, ForbiddenException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { AuthGuard } from './auth.guard.js';
import { Roles, RolesGuard } from './roles.guard.js';
import { facilityIds } from '../facility-access/facility-access.service.js';
import { taskFacilityId, supportTaskReference } from '../facility-access/task-access.js';

export async function assignmentReference(db:Prisma.TransactionClient,kind:string,id:string) {
 const match=(code:string)=>({OR:[{id},{[code]:id}]});
 switch(kind){
  case 'appointments': return db.handoverAppointment.findFirst({where:match('appointmentCode'),select:{reservationId:true}});
  case 'returns': { const row = await db.returnRequest.findFirst({where:match('returnCode'),select:{id:true}}); return row ? { returnRequestId: row.id } : null; }
  case 'support-requests': { const row = await db.supportRequest.findFirst({where:match('supportCode'),select:{reservationId:true,rentalContractId:true,storageUnitId:true}}); return row ? supportTaskReference(row) : null; }
  case 'transfers': { const row = await db.transferRequest.findFirst({where:match('transferCode'),select:{fromStorageUnitId:true}}); return row ? { storageUnitId: row.fromStorageUnitId } : null; }
  case 'reservation-recovery': { const row = await db.reservation.findFirst({ where: match('reservationCode'), select: { id: true } }); return row ? { reservationId: row.id } : null; }
  case 'relocation-source': return db.rentalContract.findFirst({ where: { id }, select: { id: true } })
    .then(row => row ? { rentalContractId: row.id } : null);
  case 'relocation-destination': {
    const row = await db.transferRequest.findFirst({ where: { ...match('transferCode'), closurePlanId: { not: null } }, select: { toStorageUnitId: true } });
    return row?.toStorageUnitId ? { storageUnitId: row.toStorageUnitId } : null;
  }
  case 'maintenance': return db.maintenanceRequest.findFirst({where:match('maintenanceCode'),select:{storageUnitId:true,commonAreaFacilityId:true}});
  case 'damage-claims': return db.damageClaim.findFirst({where:match('claimCode'),select:{rentalContractId:true}});
  default: throw new BadRequestException('Loại nhiệm vụ không hợp lệ.');
 }
}
@Controller('manager/staff')
@UseGuards(AuthGuard,RolesGuard)
@Roles('FACILITY_MANAGER')
@ApiBearerAuth('bearerAuth') @ApiTags('Staff Operations')
export class StaffDirectoryController {
 constructor(private readonly prisma:PrismaService){}
 @Get('facilities')
 async facilities(@Req() req:AuthenticatedRequest){
  const ids=await facilityIds(this.prisma,{...req.user!,selectedFacilityId:undefined});
  return this.prisma.facility.findMany({where:{id:{in:ids}},select:{id:true,name:true,code:true},orderBy:{name:'asc'}});
 }
 @Get()
 async list(@Req() req:AuthenticatedRequest,@Query('page') pageInput='1',@Query('limit') limitInput='100',@Query('taskType') type?:string,@Query('taskId') id?:string){
  if(req.user?.role!=='FACILITY_MANAGER')throw new ForbiddenException('Chỉ quản lý cơ sở được tra cứu nhân viên để phân công.');
  const page=Number(pageInput),limit=Number(limitInput);
  if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isInteger(limit)||limit<1||limit>100)throw new BadRequestException('Phân trang không hợp lệ.');
  let ids=await facilityIds(this.prisma,req.user!);
  if(Boolean(type)!==Boolean(id)||type&&type.length>40||id&&id.length>120)throw new BadRequestException('Cần gửi loại và mã nhiệm vụ hợp lệ.');
  if(type&&id){
   const ref=await assignmentReference(this.prisma,type,id);
   if(!ref)throw new BadRequestException('Không tìm thấy nhiệm vụ.');
   const facilityId=await taskFacilityId(this.prisma,ref);
   if(!ids.includes(facilityId))throw new ForbiddenException('Nhiệm vụ không thuộc cơ sở được cấp quyền.');
   ids=[facilityId];
  }
  const where:Prisma.UserWhereInput={role:'FACILITY_STAFF',accountStatus:'ACTIVE',facilityAccess:{some:{facilityId:{in:ids},revokedAt:null}}};
  const [total,items]=await Promise.all([this.prisma.user.count({where}),this.prisma.user.findMany({where,select:{id:true,fullName:true,email:true},skip:(page-1)*limit,take:limit,orderBy:[{fullName:'asc'},{id:'asc'}]})]);
  return {page,limit,total,items};
 }
}
