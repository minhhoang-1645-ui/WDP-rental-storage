import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { AdminUsersController } from './admin-users.controller.js';
import { MemoryUserRepository } from '../users/user.repository.js';

it('keeps all four API workspaces bound to the authenticated role even with broad legacy metadata', () => {
  const reflector = { getAllAndOverride: (name: string) => name === 'allowedRoles' ? ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'] : undefined };
  const guard = new RolesGuard(reflector as unknown as Reflector);
  for (const scope of ['customer', 'staff', 'manager', 'admin']) for (const role of ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN']) {
    const context = { getHandler: () => function handler() {}, getClass: () => AdminUsersController, switchToHttp: () => ({ getRequest: () => ({ originalUrl: `/api/${scope}/records`, method: 'GET', user: { role } }) }) } as unknown as ExecutionContext;
    if (role === scope.toUpperCase()) expect(guard.canActivate(context)).toBe(true); else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  }
});

it('permits only an admin on the user directory', () => {
  const guard = new RolesGuard(new Reflector());
  for (const role of [undefined, 'CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN']) {
    const context = {
      getHandler: () => function handler() {},
      getClass: () => AdminUsersController,
      switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
    } as unknown as ExecutionContext;
    if (role === 'ADMIN') expect(guard.canActivate(context)).toBe(true);
    else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  }
});

it('paginates users and strips password hashes', async () => {
  const repository = new MemoryUserRepository();
  await repository.create({ email: 'a@example.com', fullName: 'A', phone: '', passwordHash: 'secret', role: 'CUSTOMER' });
  await repository.create({ email: 'staff@example.com', fullName: 'Demo Staff', phone: '0900000001', passwordHash: 'secret', role: 'STAFF', accountStatus: 'DISABLED' });
  const controller = new AdminUsersController(repository);
  expect((await controller.list()).items[0]).not.toHaveProperty('passwordHash');
  expect((await controller.list('3', '1')).items).toHaveLength(0);
  expect((await controller.list('1', '20', 'staff@example.com', 'STAFF', 'DISABLED')).items).toEqual([
    expect.objectContaining({ email: 'staff@example.com', role: 'STAFF', accountStatus: 'DISABLED' }),
  ]);
  await expect(controller.list('0')).rejects.toThrow();
});
