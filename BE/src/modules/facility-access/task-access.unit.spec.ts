import { ReturnsService } from '../returns/returns.service.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { PublicUser } from '../auth/auth.types.js';
import { assertAssignmentAccess } from './facility-access.service.js';
import { assertTaskExecution, assertTaskFacility, taskFacilityId, staffContractScope, facilityScope } from './task-access.js';
import { StaffDirectoryController } from '../auth/staff-directory.controller.js';

const actor = (id: string, role: PublicUser['role']) => ({ id, role, fullName:id, email:id+'@example.test', phone:'' });
const manager = actor('manager-a','FACILITY_MANAGER'), staff = actor('staff-a','FACILITY_STAFF');
function repository() {
  const users = [manager, staff, actor('staff-b','FACILITY_STAFF')].map(u=>({...u,accountStatus:'ACTIVE'}));
  const grants = [{userId:'manager-a',facilityId:'A',revokedAt:null},{userId:'staff-a',facilityId:'A',revokedAt:null},{userId:'staff-b',facilityId:'B',revokedAt:null}];
  const db = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    user: {
      findFirst: vi.fn(async ({where}:any)=>users.find(u=>u.id===where.id&&u.role===where.role&&u.accountStatus===where.accountStatus)??null),
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([staff]),
    },
    facilityAccess: {
      findMany: vi.fn(async ({where}:any)=>grants.filter(g=>g.userId===where.userId&&g.revokedAt===where.revokedAt&&(!where.facilityId||g.facilityId===where.facilityId))),
      findFirst: vi.fn(async ({where}:any)=>grants.find(g=>g.userId===where.userId&&g.facilityId===where.facilityId&&g.revokedAt===where.revokedAt)??null),
    },
    reservation: {findUnique:vi.fn(async ({where}:any)=>({facilityId:where.id==='reservation-b'?'B':'A'}))},
    rentalContract: {findUnique:vi.fn(async ({where}:any)=>({reservation:{facilityId:where.id==='contract-b'?'B':'A'}}))},
    storageUnit: {findUnique:vi.fn(async ({where}:any)=>({storageType:{facilityId:where.id==='unit-b'?'B':'A'}}))},
    maintenanceRequest:{findFirst:vi.fn(async()=>({storageUnitId:'unit-b'}))},
  };
  return {db, users, grants};
}
describe('Facility task authorization (offline, no database connection)',()=>{
  it.each([{reservationId:'reservation-b'},{rentalContractId:'contract-b'},{storageUnitId:'unit-b'}])('rejects assigned Staff outside facility through every reference: %j',async(ref)=>{
    const {db}=repository();
    await expect(assertTaskExecution(db as never,staff,staff.id,ref)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows an assigned task only while the Staff account and facility grant remain active',async()=>{
    const {db,grants,users}=repository();
    await expect(assertTaskExecution(db as never,staff,staff.id,{reservationId:'reservation-a'})).resolves.toBeUndefined();
    grants.splice(1,1);
    await expect(assertTaskExecution(db as never,staff,staff.id,{reservationId:'reservation-a'})).rejects.toBeInstanceOf(ForbiddenException);
    users[1].accountStatus='DISABLED';
    await expect(assertTaskExecution(db as never,staff,staff.id,{storageUnitId:'unit-a'})).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each([null,undefined,'staff-b'])('rejects unassigned or another Staff task (%s) before any data access',async(assignee)=>{
    const {db}=repository();
    await expect(assertTaskExecution(db as never,staff,assignee,{storageUnitId:'unit-a'})).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
  });
  it.each(['STORAGE_CUSTOMER','FACILITY_MANAGER','BUSINESS_OPERATIONS_MANAGER','SYSTEM_ADMINISTRATOR'] as const)('does not grant Staff execution to %s',async(role)=>{
    const {db}=repository(), user=actor('staff-a',role);
    await expect(assertTaskExecution(db as never,user,user.id,{storageUnitId:'unit-a'})).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('permits reporting a physical incident in the authorized facility without any old unit assignment',async()=>{
    const {db}=repository();
    await expect(assertTaskFacility(db as never,staff,{storageUnitId:'unit-a'})).resolves.toBe('A');
    await expect(assertTaskFacility(db as never,staff,{storageUnitId:'unit-b'})).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('requires grants for both assigning Manager and selected Staff in the actual task facility',async()=>{
    const {db}=repository();
    await expect(assertAssignmentAccess(db as never,manager,staff.id,{rentalContractId:'contract-a'})).resolves.toMatchObject({id:staff.id});
    await expect(assertAssignmentAccess(db as never,manager,'staff-b',{rentalContractId:'contract-a'})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(assertAssignmentAccess(db as never,manager,'staff-b',{rentalContractId:'contract-b'})).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('narrows reads and writes to the selected authorized facility', async()=>{
    const {db,grants}=repository();
    grants.push({userId:manager.id,facilityId:'B',revokedAt:null});
    const selected={...manager,selectedFacilityId:'A'};
    expect(facilityScope(selected)).toMatchObject({id:'A',facilityAccess:{some:{userId:manager.id,revokedAt:null}}});
    await expect(assertTaskFacility(db as never,selected,{reservationId:'reservation-a'})).resolves.toBe('A');
    await expect(assertTaskFacility(db as never,selected,{reservationId:'reservation-b'})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(assertTaskFacility(db as never,{...selected,selectedFacilityId:'ungranted'},{reservationId:'reservation-a'})).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('fails closed for a stale role or inactive selected Staff',async()=>{
    const {db,users}=repository();
    users[1].accountStatus='DISABLED';
    await expect(assertAssignmentAccess(db as never,manager,staff.id,{storageUnitId:'unit-a'})).rejects.toThrow('đang hoạt động');
    users[0].role='STORAGE_CUSTOMER';
    await expect(assertTaskFacility(db as never,manager,{storageUnitId:'unit-a'})).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('never broadens contract lookup to physical facility reporting or previous unit responsibility',()=>{
    const scope=staffContractScope(staff), raw=JSON.stringify(scope);
    expect(raw).not.toContain('stockMovements');
    expect(raw).toContain('damageClaims');
    expect(raw).toContain('facilityAccess');
    expect(raw).not.toContain('staffAssignments');
    expect(raw).not.toContain('maintenanceRequests');
  });
  it('does not fall back to a guessed facility when a task reference is missing',async()=>{
    await expect(taskFacilityId(repository().db as never,{})).rejects.toThrow('Không tìm thấy cơ sở');
  });
  it('lists only eligible Staff inside Manager grants and rejects a foreign task picker',async()=>{
    const {db}=repository(), controller=new StaffDirectoryController(db as never);
    const req={user:manager} as never;
    await controller.list(req);
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{role:'FACILITY_STAFF',accountStatus:'ACTIVE',facilityAccess:{some:{facilityId:{in:['A']},revokedAt:null}}}}));
    await expect(controller.list(req,'1','100','maintenance','maintenance-b')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('Maintenance reporting creates work without selecting Staff',()=>{
 function reportingRepository() {
  const {db}=repository();
  const stamp=new Date(), unit={id:'unit-a',status:'AVAILABLE',storageType:{id:'type',code:'A',name:'Kho'},reservationUnits:[]};
  const create=vi.fn(async({data}:any)=>({...data,id:'report',status:'OPEN',storageUnit:unit,assignedStaff:null,photos:[],incidentBlocks:[],createdAt:stamp,updatedAt:stamp}));
  const tx={...db,$queryRaw:vi.fn(),storageUnit:{findUnique:vi.fn(async({where,select}:any)=>select?{storageType:{facilityId:where.id==='unit-b'?'B':'A'}}:{...unit,id:where.id}),updateMany:vi.fn().mockResolvedValue({count:1})},maintenanceRequest:{findUnique:vi.fn().mockResolvedValue(null),create}};
  const client={...tx,$transaction:vi.fn(async(fn:any)=>fn(tx))};
  return {service:new MaintenanceService(client as never),tx};
 }
 it('rejects a report for another facility before changing the physical unit',async()=>{
  const {service,tx}=reportingRepository();
  await expect(service.createManual({storageUnitId:'unit-b',category:'UNIT_DAMAGE',description:'Khóa bị hỏng'},'report-b',staff)).rejects.toBeInstanceOf(ForbiddenException);
  expect(tx.storageUnit.updateMany).not.toHaveBeenCalled();
  expect(tx.maintenanceRequest.create).not.toHaveBeenCalled();
 });
 it('places a valid report in OPEN with no assignee and does not grant execution to its reporter',async()=>{
  const {service,tx}=reportingRepository();
  const result=await service.createManual({storageUnitId:'unit-a',category:'UNIT_DAMAGE',rentalImpact:'NO_IMPACT',description:'Báo lỗi biển tên trên ô'},'report-a',staff);
  expect(result).toMatchObject({status:'OPEN',assignedStaff:null,blocksUnit:false});
  expect(tx.storageUnit.updateMany).not.toHaveBeenCalled();
  const input=tx.maintenanceRequest.create.mock.calls[0][0].data;
  expect(input).toMatchObject({reportedByUserId:staff.id});
  expect(input).not.toHaveProperty('assignedStaffUserId');
  await expect(assertTaskExecution(tx as never,staff,null,{storageUnitId:'unit-a'})).rejects.toBeInstanceOf(ForbiddenException);
 });
});

it('blocks early-return decisions and finance confirmation across facilities without monetary writes',async()=>{
 const {db}=repository();
 const update=vi.fn(),tx={...db,$queryRaw:vi.fn(),returnRequest:{findUnique:vi.fn().mockResolvedValue({id:'return-b',reservationId:'reservation-b'}),update},supportRequest:{findFirst:vi.fn().mockResolvedValue({id:'proposal-b',reservationId:'reservation-b'}),update}};
 const service=new ReturnsService({...tx,$transaction:vi.fn(async(fn:any)=>fn(tx))} as never);
 await expect(service.decideEarlyReturn('proposal-b',{decision:'REJECTED',note:'Cần xác minh lại'},manager)).rejects.toBeInstanceOf(ForbiddenException);
 await expect(service.reviewEarlyReturnFault('return-b',{approved:true,reference:'fault-report'},manager)).rejects.toBeInstanceOf(ForbiddenException);
 await expect(service.settleEarlyReturn('return-b',{amount:0},manager)).rejects.toBeInstanceOf(ForbiddenException);
 expect(update).not.toHaveBeenCalled();
});
