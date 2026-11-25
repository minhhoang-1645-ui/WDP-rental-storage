import { roleNamespace } from '../../role-names.js';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { AdminUsersController } from './admin-users.controller.js';
import { MemoryUserRepository } from '../users/user.repository.js';

it('keeps all five API workspaces bound to the authenticated role even with broad legacy metadata', () => {
  const reflector = { getAllAndOverride: (name: string) => name === 'allowedRoles' ? ['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'] : undefined };
  const guard = new RolesGuard(reflector as unknown as Reflector);
  for (const scope of ['customer', 'staff', 'manager', 'operations', 'admin']) for (const role of ['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR']) {
    const context = { getHandler: () => function handler() {}, getClass: () => AdminUsersController, switchToHttp: () => ({ getRequest: () => ({ originalUrl: `/api/${scope}/records`, method: 'GET', user: { role } }) }) } as unknown as ExecutionContext;
    if (roleNamespace(role) === scope) expect(guard.canActivate(context)).toBe(true); else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  }
});

it('permits only an admin on the user directory', () => {
  const guard = new RolesGuard(new Reflector());
  for (const role of [undefined, 'STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR']) {
    const context = {
      getHandler: () => function handler() {},
      getClass: () => AdminUsersController,
      switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
    } as unknown as ExecutionContext;
    if (role === 'SYSTEM_ADMINISTRATOR') expect(guard.canActivate(context)).toBe(true);
    else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  }
});

it('paginates users and strips password hashes', async () => {
  const repository = new MemoryUserRepository();
  const admin = await repository.create({ email: 'admin@example.com', fullName:'Admin',phone:'',passwordHash:'local-test',role:'SYSTEM_ADMINISTRATOR' });
  const req={user:admin} as never;
  await repository.create({ email: 'a@example.com', fullName: 'A', phone: '', passwordHash: 'secret', role: 'STORAGE_CUSTOMER' });
  await repository.create({ email: 'staff@example.com', fullName: 'Demo Staff', phone: '0900000001', passwordHash: 'secret', role: 'FACILITY_STAFF', accountStatus: 'DISABLED' });
  const controller = new AdminUsersController(repository, {} as never);
  expect((await controller.list(undefined,undefined,undefined,undefined,undefined,undefined,req)).items[0]).not.toHaveProperty('passwordHash');
  expect((await controller.list('4', '1',undefined,undefined,undefined,undefined,req)).items).toHaveLength(0);
  expect((await controller.list('1', '20', 'staff@example.com', 'FACILITY_STAFF', 'DISABLED',undefined,req)).items).toEqual([
    expect.objectContaining({ email: 'staff@example.com', role: 'FACILITY_STAFF', accountStatus: 'DISABLED' }),
  ]);
  await expect(controller.list('0',undefined,undefined,undefined,undefined,undefined,req)).rejects.toThrow();
});
