import 'reflect-metadata';
import { vi } from 'vitest';
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
import type { AuthenticatedRequest } from './auth.types.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import { SupportService } from '../support/support.service.js';

const workflows = [
  ['reservations', ManagerReservationsController], ['inquiries', ManagerInquiriesController],
  ['appointments', ManagerAppointmentsController],
  ['transfers', ManagerTransfersController], ['stock-movements', ManagerStockMovementsController],
  ['support-requests', ManagerSupportController], ['maintenance', ManagerMaintenanceController],
  ['returns', ManagerReturnsController],
] as const;

describe.each(['maintenance', 'support-requests'] as const)('%s assigned-work filter on shared Staff routes', resource => {
  function setup() {
    const user = { id: 'staff-current', role: 'STAFF' as const, fullName: 'Current Staff', email: 'staff@example.test', phone: '' };
    const request: AuthenticatedRequest = { headers: {}, user };
    const records = [
      { id: 'mine-open', assignedStaffUserId: user.id, status: 'OPEN', priority: 'HIGH' },
      { id: 'mine-finished', assignedStaffUserId: user.id, status: resource === 'maintenance' ? 'COMPLETED' : 'RESOLVED', priority: 'LOW' },
      { id: 'other-open', assignedStaffUserId: 'staff-other', status: 'OPEN', priority: 'HIGH' },
      { id: 'unassigned', assignedStaffUserId: null, status: 'OPEN', priority: 'HIGH' },
    ].map(record => ({
      ...record, maintenanceCode: record.id, supportCode: record.id,
      assignedStaff: record.assignedStaffUserId ? { id: record.assignedStaffUserId, fullName: record.assignedStaffUserId } : null,
      storageUnit: { id: 'unit', unitNumber: 'UNIT-01', storageType: { id: 'type' }, reservationUnits: [], maintenanceRequests: [] },
      reservation: { id: 'reservation', reservationCode: 'RES-01' },
      createdAt: new Date('2026-11-17T00:00:00Z'), updatedAt: new Date('2026-11-17T00:00:00Z'),
    }));
    type Filter = { assignedStaffUserId?: string; status?: string; priority?: string };
    const matching = (where: Filter) => records.filter(row =>
      (!where.assignedStaffUserId || row.assignedStaffUserId === where.assignedStaffUserId) &&
      (!where.status || row.status === where.status) && (!where.priority || row.priority === where.priority));
    const model = {
      count: vi.fn(async ({ where }: { where: Filter }) => matching(where).length),
      findMany: vi.fn(async ({ where, skip, take }: { where: Filter; skip: number; take: number }) => matching(where).slice(skip, skip + take)),
    };
    const db = { maintenanceRequest: model, supportRequest: model, $transaction: (queries: Promise<unknown>[]) => Promise.all(queries) };
    const controller = resource === 'maintenance'
      ? new ManagerMaintenanceController(new MaintenanceService(db as never))
      : new ManagerSupportController(new SupportService(db as never));
    return { controller, request, model };
  }

  it('excludes other staff and unassigned work, and filters before pagination and counting', async () => {
    const { controller, request } = setup();
    const first = await controller.list({ assignedToMe: 'true', limit: '1' }, request);
    const second = await controller.list({ assignedToMe: 'true', limit: '1', page: '2' }, request);
    expect(first).toMatchObject({ total: 2, page: 1, limit: 1, items: [{ id: 'mine-open' }] });
    expect(second).toMatchObject({ total: 2, page: 2, limit: 1, items: [{ id: 'mine-finished' }] });
  });

  it('combines assignment with status and priority', async () => {
    const { controller, request } = setup();
    const result = await controller.list({ assignedToMe: 'true', status: 'OPEN', priority: 'HIGH' }, request);
    expect(result).toMatchObject({ total: 1, items: [{ id: 'mine-open' }] });
    expect(result.items).toHaveLength(1);
  });

  it('preserves Staff scope regardless of the checkbox', async () => {
    const { controller, request } = setup();
    for (const query of [{}, { assignedToMe: 'false' }]) {
      const result = await controller.list(query, request);
      expect(result.total).toBe(2);
      expect(result.items.map(item => item.id)).toEqual(['mine-open', 'mine-finished']);
    }
  });

  it('lists all work for Manager when the checkbox is cleared', async () => {
    const { controller, request } = setup();
    request.user = { ...request.user!, role: 'MANAGER', id: 'manager' };
    const filtered = await controller.list({ assignedToMe: 'true' }, request);
    expect(filtered.total).toBe(0);
    const all = await controller.list({ assignedToMe: 'false' }, request);
    expect(all.total).toBe(4);
  });

  it('uses the signed-in account instead of a supplied assignee ID', async () => {
    const { controller, request } = setup();
    request.user = { ...request.user!, id: 'staff-other' };
    const result = await controller.list({ assignedToMe: 'true', assignedStaffUserId: 'staff-current' }, request);
    expect(result).toMatchObject({ total: 1, items: [{ id: 'other-open' }] });
    expect(result.items).toHaveLength(1);
  });

  it('rejects an invalid checkbox value before querying the database', () => {
    const { controller, request, model } = setup();
    expect(() => controller.list({ assignedToMe: 'invalid' }, request)).toThrow();
    expect(model.count).not.toHaveBeenCalled();
    expect(model.findMany).not.toHaveBeenCalled();
  });
});
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

  it('reserves pending renewal reviews for Manager', () => {
    expect(Reflect.getMetadata('path', ManagerRenewalsController)).toBe('manager/renewals');
    for (const [name, method] of [['get', 'GET'], ['approve', 'POST']] as const) {
      const handler = Object.getOwnPropertyDescriptor(ManagerRenewalsController.prototype, name)!.value as object;
      expect(guard.canActivate(context(ManagerRenewalsController, handler, 'MANAGER', '/api/manager/renewals/record', method))).toBe(true);
      expect(() => guard.canActivate(context(ManagerRenewalsController, handler, 'STAFF', '/api/staff/management/renewals/record', method))).toThrow(ForbiddenException);
    }
  });

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
