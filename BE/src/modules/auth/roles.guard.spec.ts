import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { AdminUsersController } from './admin-users.controller.js';
import { MemoryUserRepository } from '../users/user.repository.js';

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
  const controller = new AdminUsersController(repository);
  expect((await controller.list()).items[0]).not.toHaveProperty('passwordHash');
  expect((await controller.list('2', '1')).items).toHaveLength(0);
  await expect(controller.list('0')).rejects.toThrow();
});
