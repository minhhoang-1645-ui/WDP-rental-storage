import { describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '../auth/auth.types.js';
import { StockMovementsService } from '../stock-movements/stock-movements.service.js';
const manager={id:'manager',role:'FACILITY_MANAGER'} as PublicUser;
describe('Manager stock assignment',()=>{
 it('assigns and reassigns unfinished tasks only to eligible Staff in the same facility',async()=>{
  const row={id:'movement',rentalContractId:'contract',status:'REQUESTED',lines:[],createdAt:new Date(),updatedAt:new Date()};
  const update=vi.fn(async({data})=>Object.assign(row,data));
  const user={findFirst:vi.fn(async({where})=>where.id==='disabled'?null:{id:where.id,role:where.role,accountStatus:'ACTIVE'})};
  const tx={auditEvent:{create:vi.fn()},$queryRaw:vi.fn(),$queryRawUnsafe:vi.fn(),user,
   facilityAccess:{findMany:vi.fn().mockResolvedValue([{facilityId:'A'}]),findFirst:vi.fn(async({where})=>where.userId==='foreign'?null:{id:'grant'})},
   rentalContract:{findUnique:vi.fn().mockResolvedValue({reservation:{facilityId:'A'}})},
   stockMovement:{findFirst:vi.fn().mockResolvedValue(row),findUniqueOrThrow:vi.fn().mockResolvedValue(row),update}};
  const service=new StockMovementsService({...tx,$transaction:vi.fn(operation=>operation(tx))} as never);
  expect((await service.assign('movement','staff-a',manager)).status).toBe('ASSIGNED');
  await service.assign('movement','staff-b',manager);
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({assignedStaffUserId:'staff-b',assignedByUserId:manager.id})}));
  await expect(service.assign('movement','foreign',manager)).rejects.toThrow('chưa được cấp quyền');
  await expect(service.assign('movement','disabled',manager)).rejects.toThrow('đang hoạt động');
  await expect(service.complete('movement',{},manager)).rejects.toThrow('nhân viên được giao');
  row.status='COMPLETED';
  await expect(service.assign('movement','staff-a',manager)).rejects.toThrow('đang chờ');
  expect(update).toHaveBeenCalledTimes(2);
 });
});
