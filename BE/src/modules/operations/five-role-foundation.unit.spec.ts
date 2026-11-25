import { describe,it,expect,vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { roleNamespace,userRoles } from '../../role-names.js';
import { assertFacility, assertNoOpenAssignments } from '../facility-access/facility-access.service.js';
import { assertAcceptingBookings, assertFacilityAllowsRenewal } from '../facilities/facility-booking.js';
import { assertMonthlyRange, OperationsService } from './operations.service.js';
import { BusinessPolicyService } from '../policies/business-policy.service.js';
const actor=(role:PublicUser['role']):PublicUser=>({id:'u',fullName:'User',email:'u@example.test',phone:'',role});
describe('five role namespaces',()=>{
 for(const role of userRoles)for(const scope of ['customer','staff','manager','operations','admin']){
  it(role+' cannot cross '+scope,()=>{
   const reflector={getAllAndOverride:(key:string)=>key==='allowedRoles'?[...userRoles]:undefined};
   const guard=new RolesGuard(reflector as unknown as Reflector);
   const context={getHandler:()=>()=>{},getClass:()=>class C{},switchToHttp:()=>({getRequest:()=>({user:actor(role),originalUrl:'/api/'+scope+'/records',method:'POST'})})} as unknown as ExecutionContext;
   if(roleNamespace(role)===scope)expect(guard.canActivate(context)).toBe(true);else expect(()=>guard.canActivate(context)).toThrow(ForbiddenException);
  });
 }
});
it('facility access fails closed after role/status changes and scope revocation',async()=>{
 const db={user:{findFirst:vi.fn().mockResolvedValue({id:'u'})},facilityAccess:{findMany:vi.fn().mockResolvedValue([{facilityId:'A'}])}};
 await expect(assertFacility(db as never,actor('FACILITY_MANAGER'),'B')).rejects.toThrow(ForbiddenException);
 await expect(assertFacility(db as never,actor('FACILITY_MANAGER'),'A')).resolves.toBeUndefined();
 db.facilityAccess.findMany.mockResolvedValue([]);
 await expect(assertFacility(db as never,actor('FACILITY_MANAGER'),'A')).rejects.toThrow(ForbiddenException);
 db.user.findFirst.mockResolvedValue(null as never);
 await expect(assertFacility(db as never,actor('FACILITY_MANAGER'),'A')).rejects.toThrow(ForbiddenException);
 await expect(assertFacility(db as never,actor('SYSTEM_ADMINISTRATOR'),'A')).rejects.toThrow(ForbiddenException);
});
it('cannot revoke access with unfinished staff tasks',async()=>{
 const db=Object.fromEntries(['handoverAppointment','stockMovement','returnRequest','maintenanceRequest','supportRequest','transferRequest','damageClaim'].map(k=>[k,{count:vi.fn().mockResolvedValue(k==='maintenanceRequest'?1:0)}]));
 await expect(assertNoOpenAssignments(db as never,'u')).rejects.toThrow('phân công lại');
});
it('booking checks facility state without changing existing contracts',async()=>{
 const db={storageType:{findUnique:vi.fn().mockResolvedValue({facilityId:'A'})},facility:{findUnique:vi.fn().mockResolvedValue({bookingEnabled:false,operationalStatus:'OPEN'})}};
 await expect(assertAcceptingBookings(db as never,'type')).rejects.toThrow('tạm dừng');
 expect(db.facility.findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{id:'A'}}));
 await expect(assertFacilityAllowsRenewal(db as never,'A')).resolves.toBeUndefined();
 db.facility.findUnique.mockResolvedValue({bookingEnabled:false,operationalStatus:'CLOSING'});
 await expect(assertFacilityAllowsRenewal(db as never,'A')).rejects.toThrow('không nhận yêu cầu gia hạn');
});
it('type range takes precedence over facility range and cannot change historic amounts',async()=>{
 const db={businessRule:{findMany:vi.fn().mockResolvedValue([{storageTypeId:null,value:{min:10,max:100},version:9},{storageTypeId:'T',value:{min:20,max:30},version:1}])}};
 await expect(assertMonthlyRange(db as never,'A','T',40)).rejects.toThrow('khung');
 await expect(assertMonthlyRange(db as never,'A','T',25)).resolves.toBeUndefined();
});
it('policy version conflicts do not mutate history',async()=>{
 const tx={user:{findFirst:vi.fn().mockResolvedValue({id:'u'})},$queryRawUnsafe:vi.fn(),businessPolicy:{findUnique:vi.fn().mockResolvedValue(null)},businessRule:{findFirst:vi.fn().mockResolvedValue({createdAt:new Date('2026-01-01'),version:1}),create:vi.fn(),update:vi.fn()}};
 const db={$transaction:async(fn:(t:unknown)=>unknown)=>fn(tx)};
 const policy=new BusinessPolicyService(db as unknown as PrismaService);
 await expect(policy.save('reservationHoldMinutes',{value:60,expectedUpdatedAt:null},actor('BUSINESS_OPERATIONS_MANAGER'))).rejects.toThrow('vừa thay đổi');
 expect(tx.businessRule.create).not.toHaveBeenCalled();expect(tx.businessRule.update).not.toHaveBeenCalled();
});
it('only approved policy keys can be saved',async()=>{
 const policy=new BusinessPolicyService({} as PrismaService);
 await expect(policy.save('vnpaySecret',{value:123,expectedUpdatedAt:null},{id:"bom",role:'BUSINESS_OPERATIONS_MANAGER',fullName:'Isolated test',email:'test@example.test',phone:''})).rejects.toThrow('chưa được phê duyệt');
});
it('refuses physically closing a facility with live contracts',async()=>{
 const old={id:'A',code:'A',name:'Facility',address:'Address',officeHours:'8–17',accessHours:'8–20',bookingEnabled:true,operationalStatus:'OPEN',updatedAt:new Date('2026-01-01')};
 const emptyCounts = Object.fromEntries(['invoice','depositSettlement','supportRequest','maintenanceRequest','reservationUnit','transferRequest','handoverAppointment','returnRequest','storageUnit','reservationService'].map(key=>[key,{count:vi.fn().mockResolvedValue(0)}]));
 const tx={...emptyCounts,user:{findFirst:vi.fn().mockResolvedValue({id:'u'})},$queryRawUnsafe:vi.fn(),facility:{findUnique:vi.fn().mockResolvedValue(old),update:vi.fn()},rentalContract:{count:vi.fn().mockResolvedValue(1)},reservation:{count:vi.fn().mockResolvedValue(0)}};
 const service=new OperationsService({$transaction:async(fn:(t:unknown)=>unknown)=>fn(tx)} as unknown as PrismaService);
 await expect(service.save('A',{bookingEnabled:false,operationalStatus:'CLOSED',expectedUpdatedAt:old.updatedAt.toISOString()},actor('BUSINESS_OPERATIONS_MANAGER'))).rejects.toThrow('1 hợp đồng cần xử lý');
 expect(tx.facility.update).not.toHaveBeenCalled();
});
it('starts a contract-expiry closure without ending existing contracts, and reopens without enabling bookings',async()=>{
 const old={id:'A',code:'A',name:'Facility',address:'Address',officeHours:'8–17',accessHours:'8–20',bookingEnabled:true,operationalStatus:'OPEN',updatedAt:new Date('2026-01-01')};
 const tx={user:{findFirst:vi.fn().mockResolvedValue({id:'u'})},$queryRawUnsafe:vi.fn(),
  facility:{findUnique:vi.fn().mockResolvedValue(old),update:vi.fn(async ({data})=>({...old,...data}))},
  rentalContract:{count:vi.fn().mockResolvedValue(1)},reservation:{findMany:vi.fn().mockResolvedValue([{customerId:'affected'}])},supportRequest:{updateMany:vi.fn()},auditEvent:{create:vi.fn()}};
 const service=new OperationsService({$transaction:async(fn:(t:unknown)=>unknown)=>fn(tx)} as unknown as PrismaService);
 const expectedUpdatedAt=old.updatedAt.toISOString(), bom=actor('BUSINESS_OPERATIONS_MANAGER');
 const closing=await service.save('A',{operationalStatus:'CLOSING',closureReason:'Hết hợp đồng mặt bằng',expectedUpdatedAt},bom);
 expect(closing).toMatchObject({operationalStatus:'CLOSING',bookingEnabled:false});
 expect(tx.rentalContract.count).not.toHaveBeenCalled();
 expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({metadata:expect.objectContaining({closureMode:'CONTRACT_EXPIRY',customerRecipientIds:['affected']})})}));
 tx.facility.findUnique.mockResolvedValue(closing);
 await expect(service.save('A',{bookingEnabled:true,expectedUpdatedAt},bom)).rejects.toThrow('không thể nhận đặt kho');
 await expect(service.save('A',{operationalStatus:'OPEN',bookingEnabled:true,expectedUpdatedAt},bom)).resolves.toMatchObject({operationalStatus:'OPEN',bookingEnabled:false});
});
it('keeps a newly created facility closed to new bookings until local configuration is ready',async()=>{
 const tx={user:{findFirst:vi.fn().mockResolvedValue({id:'u'})},$queryRawUnsafe:vi.fn(),facility:{findUnique:vi.fn().mockResolvedValue(null),create:vi.fn()}};
 const service=new OperationsService({$transaction:async(fn:(t:unknown)=>unknown)=>fn(tx)} as unknown as PrismaService);
 const body={code:'NEW',name:'New',address:'Address',officeHours:'8–17',accessHours:'8–20',bookingEnabled:true,operationalStatus:'OPEN'};
 await expect(service.save(undefined,body,actor('BUSINESS_OPERATIONS_MANAGER'))).rejects.toThrow('cấu hình kho');
 expect(tx.facility.create).not.toHaveBeenCalled();
});
it('resolves a policy at the supplied historical time without modifying the published version',async()=>{
 const asOf=new Date('2026-11-24T00:00:00Z');
 const db={businessRule:{findFirst:vi.fn().mockResolvedValue({value:90})},businessPolicy:{findUnique:vi.fn()}};
 const service=new BusinessPolicyService(db as never);
 await expect(service.value('reservationHoldMinutes',db as never,asOf)).resolves.toBe(90);
 expect(db.businessRule.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({effectiveFrom:{lte:asOf},OR:[{effectiveTo:null},{effectiveTo:{gt:asOf}}]})}));
 expect(db.businessPolicy.findUnique).not.toHaveBeenCalled();
});

it('assignment requires access for both manager and selected staff at the task facility',async()=>{
 const {assertAssignmentAccess}=await import('../facility-access/facility-access.service.js');
 const tx={$queryRawUnsafe:vi.fn(),user:{findFirst:vi.fn().mockResolvedValue({id:'s',role:'FACILITY_STAFF',accountStatus:'ACTIVE'})},reservation:{findUnique:vi.fn().mockResolvedValue({facilityId:'A'})},facilityAccess:{findMany:vi.fn().mockResolvedValue([{facilityId:'A'}]),findFirst:vi.fn().mockResolvedValue(null)}};
 await expect(assertAssignmentAccess(tx as never,actor('FACILITY_MANAGER'),'s',{reservationId:'R'})).rejects.toThrow('Nhân viên chưa được cấp quyền');
 tx.facilityAccess.findFirst.mockResolvedValue({id:'grant'} as never);
 tx.facilityAccess.findMany.mockResolvedValue([{facilityId:'B'}]);
 await expect(assertAssignmentAccess(tx as never,actor('FACILITY_MANAGER'),'s',{reservationId:'R'})).rejects.toThrow('Bạn chưa được cấp quyền');
 await expect(assertAssignmentAccess(tx as never,actor('SYSTEM_ADMINISTRATOR'),'s',{reservationId:'R'})).rejects.toThrow('Chỉ quản lý');
});
it('staff cannot complete another staff member task',async()=>{
 const {assertTaskAssignee}=await import('../facility-access/operational-assignment.js');
 expect(()=>assertTaskAssignee(actor('FACILITY_STAFF'),'other')).toThrow(ForbiddenException);
 expect(()=>assertTaskAssignee(actor('FACILITY_MANAGER'),'u')).toThrow(ForbiddenException);
 expect(()=>assertTaskAssignee(actor('FACILITY_STAFF'),'u')).not.toThrow();
});
it('reporting SQL ignores caller-supplied scope and binds database-backed facility IDs',async()=>{
 const {ReportingService}=await import('../manager/reporting.service.js');
 const query=vi.fn().mockResolvedValue([]);
 const db={user:{findFirst:vi.fn().mockResolvedValue({id:'u'})},facilityAccess:{findMany:vi.fn().mockResolvedValue([{facilityId:'REAL-A'}])},$queryRaw:query};
 const service=new ReportingService(db as never);
 await service.csv({facilityId:'FORGED-B'},actor('FACILITY_MANAGER'));
 const sql=query.mock.calls[0][0];
 expect(sql.values).toContain('REAL-A');expect(sql.values).not.toContain('FORGED-B');
 expect(sql.sql).toContain('COALESCE(i."facilityIdSnapshot",r."facilityId") IN');
});
