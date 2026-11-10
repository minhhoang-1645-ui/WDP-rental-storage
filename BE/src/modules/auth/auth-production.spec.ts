import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { MemoryUserRepository, UserRepository, PrismaUserRepository } from '../users/user.repository.js';
import { auditTarget } from '../audit/audit.interceptor.js';

const registration = { fullName: 'Khách hàng', email: 'owner@example.test', phone: '0901234567', password: 'fixture-password' };
describe('Bounded auth resources', () => {
  it('limits socket IP attempts independently of account names, expires the window, and leaves other clients usable', async () => {
    const db = new MemoryUserRepository(), service = new AuthService(db);
    const hash = vi.spyOn(service as unknown as { hashPassword: () => Promise<Buffer> }, 'hashPassword').mockResolvedValue(Buffer.alloc(64));
    const find = vi.spyOn(db, 'findByEmail'); const clock = vi.spyOn(Date, 'now').mockReturnValue(100000);
    try {
      for (let index = 0; index < 30; index++) await expect(service.login({ email: `unknown-${index}@example.test`, password: 'wrong' }, '192.0.2.1')).rejects.toThrow('Email hoặc mật khẩu không đúng.');
      const blocked = await service.login(registration, '192.0.2.1').catch(error => error);
      expect(blocked.getStatus()).toBe(429); expect(find).toHaveBeenCalledTimes(30);
      await expect(service.login(registration, '192.0.2.2')).rejects.toThrow('Email hoặc mật khẩu không đúng.');
      clock.mockReturnValue(160001); await expect(service.login(registration, '192.0.2.1')).rejects.toThrow('Email hoặc mật khẩu không đúng.');
    } finally { hash.mockRestore(); clock.mockRestore(); }
  });
  it('bounds concurrent expensive password hashing and releases capacity afterwards', async () => {
    const service = new AuthService(new MemoryUserRepository());
    const results = await Promise.allSettled(Array.from({ length: 9 }, (_, index) => service.register({ ...registration, email: `worker-${index}@example.test` })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(8);
    const rejected = results.find(result => result.status === 'rejected'); expect(rejected?.reason.getStatus()).toBe(429);
    await expect(service.register(registration)).resolves.toHaveProperty('token');
  });
});

describe('Own-profile HTTP updates, in-memory users only', () => {
  let app: INestApplication, service: AuthService;
  const users = new MemoryUserRepository(), sessions = new Map<string, { token: string; user: { id: string } }>();
  beforeAll(async () => {
    service = new AuthService(users);
    const source = await service.register(registration); sessions.set('CUSTOMER', source);
    const original = (await users.findById(source.user.id))!;
    for (const role of ['STAFF', 'MANAGER', 'ADMIN'] as const) {
      await users.create({ fullName: role, email: `${role.toLowerCase()}@example.test`, phone: registration.phone, passwordHash: original.passwordHash, role });
      sessions.set(role, await service.login({ email: `${role.toLowerCase()}@example.test`, password: registration.password }));
    }
    const module = await Test.createTestingModule({ controllers: [AuthController], providers: [{ provide: UserRepository, useValue: users }, { provide: AuthService, useValue: service }, AuthGuard] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api'); await app.init();
  });
  afterAll(async () => { await app?.close(); });
  it.each(['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'])('allows %s to edit only its own contact fields and keeps its session valid', async role => {
    const session = sessions.get(role)!;
    const response = await request(app.getHttpServer()).patch('/api/auth/me').set('Authorization', `Bearer ${session.token}`).send({ fullName: `  Tên ${role}  `, phone: '+84 901 234 567' }).expect(200);
    expect(response.body).toMatchObject({ id: session.user.id, role, fullName: `Tên ${role}`, phone: '+84 901 234 567' });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect((await service.getUserByToken(session.token)).fullName).toBe(`Tên ${role}`);
  });
  it.each([{}, { role: 'ADMIN' }, { email: 'other@example.test' }, { accountStatus: 'ACTIVE' }, { password: 'new-password' }, { id: 'foreign' }, { phone: '((((((((' }, { phone: '' }, { fullName: 'x' }])('rejects invalid/disallowed profile input %j', async body => {
    await request(app.getHttpServer()).patch('/api/auth/me').set('Authorization', `Bearer ${sessions.get('CUSTOMER')!.token}`).send(body).expect(400);
  });
  it('requires authentication, rejects disabled users, and audits only the profile action', async () => {
    await request(app.getHttpServer()).patch('/api/auth/me').send({ fullName: 'Anonymous' }).expect(401);
    const session = sessions.get('STAFF')!; await users.updateStatus(session.user.id, 'DISABLED');
    await request(app.getHttpServer()).patch('/api/auth/me').set('Authorization', `Bearer ${session.token}`).send({ fullName: 'Disabled' }).expect(401);
    expect(auditTarget({ method: 'PATCH', route: { path: '/api/auth/me' } })).toMatchObject({ action: 'AUTH_PROFILE_UPDATE', category: 'ACTIVITY' });
  });
  it('conditions the persistent update on the active actor ID even if account status changes after auth', async () => {
    const db = { user: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findUnique: vi.fn() } };
    expect(await new PrismaUserRepository(db as never).updateProfile('owner-id', { phone: registration.phone })).toBeNull();
    expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: 'owner-id', accountStatus: 'ACTIVE' }, data: { phone: registration.phone } });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
