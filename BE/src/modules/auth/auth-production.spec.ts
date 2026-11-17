import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { AdminUsersController } from './admin-users.controller.js';
import { MemoryUserRepository, UserRepository, PrismaUserRepository } from '../users/user.repository.js';
import { AuditInterceptor, auditTarget } from '../audit/audit.interceptor.js';

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
  const recordAudit = vi.fn().mockResolvedValue(undefined);
  beforeAll(async () => {
    service = new AuthService(users);
    const source = await service.register(registration); sessions.set('CUSTOMER', source);
    const original = (await users.findById(source.user.id))!;
    for (const role of ['STAFF', 'MANAGER', 'ADMIN'] as const) {
      await users.create({ fullName: role, email: `${role.toLowerCase()}@example.test`, phone: registration.phone, passwordHash: original.passwordHash, role });
      sessions.set(role, await service.login({ email: `${role.toLowerCase()}@example.test`, password: registration.password }));
    }
    const module = await Test.createTestingModule({ controllers: [AuthController, AdminUsersController], providers: [{ provide: UserRepository, useValue: users }, { provide: AuthService, useValue: service }, AuthGuard, RolesGuard] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new AuditInterceptor({ record: recordAudit } as never));
    await app.init();
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
    await request(app.getHttpServer()).patch('/api/auth/me').set('Authorization', `Bearer ${session.token}`).send({ fullName: 'Disabled' }).expect(401)
      .expect(({ body }) => expect(body).toMatchObject({ code: 'ACCOUNT_DISABLED', message: 'Tài khoản đã bị vô hiệu hóa.' }));
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${session.token}`).expect(401)
      .expect(({ body }) => expect(body.code).toBe('ACCOUNT_DISABLED'));
    await users.updateStatus(session.user.id, 'ACTIVE');
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${session.token}`).expect(401)
      .expect(({ body }) => expect(body.code).toBe('ACCOUNT_DISABLED'));
    const fresh = await service.login({ ...registration, email: 'staff@example.test' });
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${fresh.token}`).expect(200);
    sessions.set('STAFF', fresh);
    expect(auditTarget({ method: 'PATCH', route: { path: '/api/auth/me' } })).toMatchObject({ action: 'AUTH_PROFILE_UPDATE', category: 'ACTIVITY' });
  });
  it('conditions the persistent update on the active actor ID even if account status changes after auth', async () => {
    const db = { user: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findUnique: vi.fn() } };
    expect(await new PrismaUserRepository(db as never).updateProfile('owner-id', { phone: registration.phone })).toBeNull();
    expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: 'owner-id', accountStatus: 'ACTIVE' }, data: { phone: registration.phone } });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it('distinguishes a known expired session from an unrecognized bearer', async () => {
    const session = sessions.get('MANAGER')!;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 60 * 60 * 1000);
    try {
      await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${session.token}`).expect(401)
        .expect(({ body }) => expect(body.code).toBe('SESSION_EXPIRED'));
      await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', 'Bearer unknown-session').expect(401)
        .expect(({ body }) => expect(body.code).toBe('SESSION_INVALID'));
    } finally { clock.mockRestore(); }
  });
  it('records one real account creation event through the Admin endpoint', async () => {
    const admin = sessions.get('ADMIN')!;
    recordAudit.mockClear();
    const created = await request(app.getHttpServer()).post('/api/admin/users').set('Authorization', 'Bearer ' + admin.token)
      .send({ ...registration, email: 'notify-staff@example.test', role: 'STAFF' }).expect(201);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      category: 'ACTIVITY', action: 'CREATE', resource: 'users', resourceId: created.body.id, httpStatus: 201,
    }));
    expect(JSON.stringify(recordAudit.mock.calls)).not.toContain(registration.password);
  });
  it('lets Admin edit a disabled account contact profile and records only account audit metadata', async () => {
    const admin = sessions.get('ADMIN')!, target = sessions.get('CUSTOMER')!;
    const path = '/api/admin/users/' + target.user.id;
    const original = (await users.findById(target.user.id))!;
    const bearer = 'Bearer ' + admin.token;
    await request(app.getHttpServer()).patch(path + '/status').set('Authorization', bearer).send({ accountStatus: 'DISABLED' }).expect(200);
    expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ resourceId: target.user.id, action: 'DISABLE_ACCOUNT', httpStatus: 200 }));
    await request(app.getHttpServer()).patch(path + '/status').set('Authorization', bearer).send({ accountStatus: 'DISABLED' })
      .expect(200).expect(({ body }) => expect(body.statusChanged).toBe(false));
    expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ resourceId: target.user.id, action: 'ACCOUNT_STATUS_UNCHANGED', httpStatus: 200 }));
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', 'Bearer ' + target.token).expect(401)
      .expect(({ body }) => expect(body.code).toBe('ACCOUNT_DISABLED'));
    recordAudit.mockClear();
    const response = await request(app.getHttpServer()).patch(path).set('Authorization', bearer)
      .send({ fullName: '  Tên cập nhật  ', phone: '+84 909 123 456' }).expect(200);
    expect(response.body).toMatchObject({ id: original.id, fullName: 'Tên cập nhật', phone: '+84 909 123 456', email: original.email, role: 'CUSTOMER', accountStatus: 'DISABLED' });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect((await users.findById(target.user.id))?.passwordHash).toBe(original.passwordHash);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ id: admin.user.id }), resourceId: target.user.id, action: 'UPDATE', httpStatus: 200 }));
    expect(JSON.stringify(recordAudit.mock.calls)).not.toMatch(/Tên cập nhật|909 123 456|passwordHash/);
    await request(app.getHttpServer()).patch(path + '/status').set('Authorization', bearer).send({ accountStatus: 'ACTIVE' }).expect(200);
    expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ resourceId: target.user.id, action: 'REACTIVATE_ACCOUNT', httpStatus: 200 }));
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', 'Bearer ' + target.token).expect(401)
      .expect(({ body }) => expect(body.code).toBe('ACCOUNT_DISABLED'));
    const freshCustomer = await service.login(registration);
    sessions.set('CUSTOMER', freshCustomer);
  });
  it.each(['STAFF', 'MANAGER', 'CUSTOMER'])('denies account edits from %s', async role => {
    await request(app.getHttpServer()).patch('/api/admin/users/' + sessions.get('ADMIN')!.user.id)
      .set('Authorization', 'Bearer ' + sessions.get(role)!.token).send({ fullName: 'Tên ngoài quyền' }).expect(403);
  });
  it.each([{ email: 'new@example.test' }, { passwordHash: 'changed' }, { role: 'ADMIN' }, { accountStatus: 'DISABLED' }, { id: 'another-id' }])('rejects sensitive keys even with a valid profile field %j', async fields => {
    const admin = sessions.get('ADMIN')!, target = sessions.get('CUSTOMER')!;
    const path = '/api/admin/users/' + target.user.id;
    const original = { ...(await users.findById(target.user.id)) };
    await request(app.getHttpServer()).patch(path).set('Authorization', 'Bearer ' + admin.token)
      .send({ fullName: 'Không được lưu', ...fields }).expect(400);
    expect(await users.findById(target.user.id)).toEqual(original);
  });
  it.each(['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'])('lets %s change their own password and keeps only the current session', async role => {
    const session = sessions.get(role)!;
    const original = (await users.findById(session.user.id))!;
    const credentials = { email: original.email, password: registration.password };
    const other = await service.login(credentials);
    const server = app.getHttpServer();
    const path = '/api/auth/change-password';
    const body = { currentPassword: credentials.password, newPassword: 'new-fixture-password' };
    const change = (fields: object) => request(server).patch(path).set('Authorization', `Bearer ${session.token}`).send(fields);
    await request(server).patch(path).send(body).expect(401);
    await change({ ...body, currentPassword: 'wrong-password' }).expect(400);
    await change({ ...body, newPassword: 'short' }).expect(400);
    await change({ ...body, newPassword: body.currentPassword }).expect(400);
    await change({ ...body, userId: 'another-user' }).expect(400);
    await change(body).expect(204, '');
    expect((await users.findById(session.user.id))?.passwordHash).not.toBe(original.passwordHash);
    await request(server).get('/api/auth/me').set('Authorization', `Bearer ${session.token}`).expect(200);
    await request(server).get('/api/auth/me').set('Authorization', `Bearer ${other.token}`).expect(401);
    await request(server).post('/api/auth/login').send(credentials).expect(401);
    await request(server).post('/api/auth/login').send({ ...credentials, password: body.newPassword }).expect(200)
      .expect(({ body }) => expect(body.user).toMatchObject({ id: session.user.id, role }));
  });
  it('rate-limits incorrect attempts per authenticated account across sessions', async () => {
    const session = await service.register({ ...registration, email: 'rate-limit@example.test' });
    const second = await service.login({ ...registration, email: 'rate-limit@example.test' });
    const attempt = (token: string) => request(app.getHttpServer()).patch('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`).send({ currentPassword: 'wrong-password', newPassword: 'new-fixture-password' });
    for (let attemptNumber = 0; attemptNumber < 5; attemptNumber++) await attempt(session.token).expect(400);
    await attempt(second.token).expect(429);
  });
});
