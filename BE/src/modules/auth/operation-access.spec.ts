import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { ManagerReservationsController } from '../booking/manager-reservations.controller.js';
import { ManagerInquiriesController } from '../booking/manager-inquiries.controller.js';
import { ManagerAppointmentsController } from '../appointments/manager-appointments.controller.js';
import { ManagerRenewalsController } from '../renewals/manager-renewals.controller.js';
import { ManagerTransfersController } from '../transfers/manager-transfers.controller.js';
import { ManagerStockMovementsController } from '../stock-movements/manager-stock-movements.controller.js';
import { ManagerSupportController } from '../support/manager-support.controller.js';
import { ManagerMaintenanceController } from '../maintenance/manager-maintenance.controller.js';
import { ManagerReturnsController } from '../returns/manager-returns.controller.js';
import { ManagerUnitsController } from '../manager/manager-units.controller.js';
import { StaffDirectoryController } from './staff-directory.controller.js';
import { MemoryUserRepository } from '../users/user.repository.js';

const workflows = [
  ['reservations', ManagerReservationsController], ['inquiries', ManagerInquiriesController],
  ['appointments', ManagerAppointmentsController], ['renewals', ManagerRenewalsController],
  ['transfers', ManagerTransfersController], ['stock-movements', ManagerStockMovementsController],
  ['support-requests', ManagerSupportController], ['maintenance', ManagerMaintenanceController],
  ['returns', ManagerReturnsController],
] as const;
const guard = new RolesGuard(new Reflector());
function context(controller: object, handler: object, role: string | undefined, path: string, method: string) {
  return {
    getClass: () => controller, getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ originalUrl: path, method, user: role ? { role } : undefined }) }),
  } as unknown as ExecutionContext;
}

describe('Staff workflow ownership after role transfer', () => {
  for (const [resource, controller] of workflows) {
    it(`${resource}: has a Staff API alias and retains Manager assignment and transfers only workflow mutations`, () => {
      expect(Reflect.getMetadata('path', controller)).toContain(`staff/management/${resource}`);
      const methods = Object.getOwnPropertyNames(controller.prototype).filter(name => name !== 'constructor');
      for (const name of methods) {
        const handler = controller.prototype[name as keyof typeof controller.prototype];
        if (typeof handler !== 'function' || Reflect.getMetadata('method', handler) === undefined) continue;
        for (const role of [undefined, 'CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN']) {
          for (const method of ['GET', 'POST', 'PATCH']) {
            const staff = context(controller, handler, role, `/api/staff/management/${resource}/record`, method);
            const assignment = Reflect.getMetadata('managerAssignment', handler) === true;
            if (role === 'STAFF' && !assignment) expect(guard.canActivate(staff)).toBe(true);
            else expect(() => guard.canActivate(staff)).toThrow(ForbiddenException);
            const legacy = context(controller, handler, role, `/api/manager/${resource}/record`, method);
            if (role === 'MANAGER' && (assignment ? ['PATCH', 'POST'].includes(method) : method === 'GET')) expect(guard.canActivate(legacy)).toBe(true);
            else expect(() => guard.canActivate(legacy)).toThrow(ForbiddenException);
          }
        }
      }
    });
  }

  it('permits Staff context reads without granting Manager configuration mutations', () => {
    const handler = Object.getOwnPropertyDescriptor(ManagerUnitsController.prototype, 'list')!.value as object;
    expect(guard.canActivate(context(ManagerUnitsController, handler, 'STAFF', '/api/staff/management/units', 'GET'))).toBe(true);
    expect(() => guard.canActivate(context(ManagerUnitsController, handler, 'STAFF', '/api/staff/management/units', 'PATCH'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context(ManagerUnitsController, handler, 'CUSTOMER', '/api/staff/management/units', 'GET'))).toThrow(ForbiddenException);
  });

  it('lists only active Staff and exposes no passwords or account-management fields', async () => {
    const users = new MemoryUserRepository();
    for (const [role, accountStatus] of [['STAFF', 'ACTIVE'], ['STAFF', 'DISABLED'], ['MANAGER', 'ACTIVE']] as const) await users.create({ email: `${role}-${accountStatus}@example.test`, fullName: role, phone: '', role, accountStatus, passwordHash: 'private' });
    const result = await new StaffDirectoryController(users).list();
    expect(result.total).toBe(1);
    expect(Object.keys(result.items[0]).sort()).toEqual(['email', 'fullName', 'id']);
  });
});
