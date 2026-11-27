import { roleNamespace } from '../../role-names.js';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BadRequestException, Controller, Logger, Post, ServiceUnavailableException, UseGuards, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AuditService } from './audit.service.js';
import { AuditInterceptor, auditTarget } from './audit.interceptor.js';
import { AdminAuditController } from './admin-audit.controller.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { AuthController } from '../auth/auth.controller.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { MemoryUserRepository } from '../users/user.repository.js';
import type { PublicUser } from '../auth/auth.types.js';

const admin = { id: 'admin', fullName: 'Admin', email: 'admin@example.test', role: 'SYSTEM_ADMINISTRATOR', phone: '' } as PublicUser;
function database() {
  return { user:{findFirst:vi.fn().mockResolvedValue({id:'admin'}),findMany:vi.fn().mockResolvedValue([])}, auditEvent: { create: vi.fn().mockResolvedValue({ id: 'event' }), count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([{ id: 'event', action: 'AUTH_LOGIN' }]) } };
}
describe('audit persistence and filters (mock DB)', () => {
  it('limits permission history to account and access changes, including legacy routes', async () => {
    const db = database();
    const service = new AuditService(db as never);
    db.auditEvent.findMany.mockResolvedValue([]);
    const categoryFilter = { category: 'ACTIVITY', action: { notIn: ['AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_LOGIN_ACCOUNT_DISABLED'] } };
    const permissionFilter = { OR: [
      { action: { in: [
        'CHANGE_ROLE', 'GRANT_FACILITY_ACCESS', 'REVOKE_FACILITY_ACCESS', 'REVOKE_SESSION',
        'REVOKE_SESSIONS', 'DISABLE_ACCOUNT', 'REACTIVATE_ACCOUNT', 'RELOCATE_FACILITY_ACCESS',
      ] } },
      { route: { in: [
        '/admin/facility-access', '/admin/facility-access/:id/revoke', '/admin/facility-access/users/:id/role',
        '/admin/facility-access/users/:id/relocate', '/admin/users/:id/status',
      ] } },
    ] };
    await service.list({ category: 'ACTIVITY', scope: 'permissions' }, admin);
    const where = expect.objectContaining({ AND: [categoryFilter, permissionFilter] });
    expect(db.auditEvent.count).toHaveBeenLastCalledWith({ where });
    expect(db.auditEvent.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where }));

    await service.list({ category: 'ACTIVITY', action: 'DISABLE_ACCOUNT' }, admin);
    expect(db.auditEvent.count).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ AND: [categoryFilter, { action: 'DISABLE_ACCOUNT' }] }),
    });
  });

  it('selects only successful account events and resolves only public target fields', async () => {
    const db = database();
    const item = { id: 'notice', resource: 'users', resourceId: 'target', action: 'UPDATE', outcome: 'SUCCESS' };
    db.auditEvent.findMany.mockResolvedValue([item]);
    const findMany = vi.fn().mockResolvedValue([{ id: 'target', fullName: 'Fixture Staff', role: 'FACILITY_STAFF' }]);
    const service = new AuditService({ ...db, user: { ...db.user,findMany } } as never);
    const page = await service.list({ category: 'ACCOUNT_NOTICES' }, admin);
    const where = expect.objectContaining({
      category: 'ACTIVITY', outcome: 'SUCCESS', resourceId: { not: null },
    });
    expect(db.auditEvent.count).toHaveBeenCalledWith({ where });
    expect(db.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where, select: { id: true, action: true, outcome: true, resource: true, resourceId: true, createdAt: true, route: true, metadata: true },
    }));
    expect(findMany).toHaveBeenCalledWith({ where: { id: { in: ['target'] } }, select: { id: true, fullName: true, role: true, email: true } });
    expect(page.items).toEqual([{ ...item, targetUserId: 'target', targetAccount: { fullName: 'Fixture Staff', role: 'FACILITY_STAFF' } }]);
    await service.list({ category: 'ACTIVITY', event: 'notice' }, admin);
    expect(db.auditEvent.count).toHaveBeenLastCalledWith({ where: expect.objectContaining({ id: 'notice' }) });
  });
  it('includes relocation in the permission scope, enriches its two sites, and keeps a separate target identity', async () => {
    const db = database();
    const item = { id: 'move', resource: 'users', resourceId: 'staff', action: 'RELOCATE_FACILITY_ACCESS',
      actorId: admin.id, route: '/admin/facility-access/users/:id/relocate',
      metadata: { previousFacilityId: 'old', facilityId: 'new', targetUserName: 'Nhân viên vào lúc chuyển' } };
    db.auditEvent.findMany.mockResolvedValue([item]);
    const service = new AuditService({ ...db, facility: { findMany: vi.fn().mockResolvedValue([
      { id: 'old', name: 'Cơ sở cũ' }, { id: 'new', name: 'Cơ sở mới' },
    ]) } } as never);
    const result = await service.list({ category: 'ACTIVITY', action: item.action, scope: 'permissions', page: '2', limit: '1' }, admin);
    expect(result.items[0]).toMatchObject({ actorId: admin.id, targetUserId: 'staff',
      targetAccount: { fullName: 'Nhân viên vào lúc chuyển' }, previousFacilityName: 'Cơ sở cũ', facilityName: 'Cơ sở mới' });
    expect(db.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 1, take: 1 }));
    const where = db.auditEvent.count.mock.calls[0][0].where;
    expect(where.AND[1].OR[0].action.in).toContain('RELOCATE_FACILITY_ACCESS');
    expect(where.AND[2].OR[0]).toEqual({ action: 'RELOCATE_FACILITY_ACCESS' });
  });
  it('looks up the account name for old failed login rows without changing their unauthenticated attribution', async () => {
    const db = database();
    const matched = { id: 'matched', action: 'AUTH_LOGIN', outcome: 'FAILURE', actorEmail: 'known@example.test', actorId: null, actorRole: null, actorName: null };
    const unmatched = { ...matched, id: 'unmatched', actorEmail: 'unknown@example.test' };
    db.auditEvent.findMany.mockResolvedValue([matched, unmatched]);
    const findMany = vi.fn().mockResolvedValue([{ email: matched.actorEmail, fullName: 'Known Account' }]);
    const page = await new AuditService({ ...db, user: { ...db.user,findMany } } as never).list({ category: 'LOGIN' }, admin);
    expect(page.items).toEqual([{ ...matched, attemptAccountName: 'Known Account' }, unmatched]);
    expect(findMany).toHaveBeenCalledWith({ where: { email: { in: [matched.actorEmail, unmatched.actorEmail] } }, select: { email: true, fullName: true } });
    expect(db.auditEvent.create).not.toHaveBeenCalled();
  });
  it('stores an explicit minimal snapshot, never arbitrary credential/body fields', async () => {
    const db = database(), service = new AuditService(db as never);
    await service.record({ category: 'ACTIVITY', action: 'CREATE', resource: 'users', resourceId: 'new-user', method: 'POST', route: '/admin/users', httpStatus: 201, actor: admin, ipAddress: '127.0.0.1', password: 'NEVER_STORE', token: 'NEVER_STORE', otp: 'NEVER_STORE', body: { signature: 'NEVER_STORE' } } as never);
    const data = db.auditEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ actorId: 'admin', actorRole: 'SYSTEM_ADMINISTRATOR', resourceId: 'new-user', outcome: 'SUCCESS' });
    expect(JSON.stringify(data)).not.toContain('NEVER_STORE');
  });
  it('records failed attempts with an email, without inventing an authenticated identity', async () => {
    const db = database(), service = new AuditService(db as never);
    await service.record({ category: 'LOGIN', action: 'AUTH_LOGIN', resource: 'auth', method: 'POST', route: '/auth/login', httpStatus: 401, attemptedEmail: ' USER@EXAMPLE.TEST ', ipAddress: 'untrusted, X-Forwarded-For' });
    expect(db.auditEvent.create.mock.calls[0][0].data).toMatchObject({ actorId: null, actorRole: null, actorEmail: 'user@example.test', outcome: 'FAILURE', ipAddress: null });
  });
  it('does not undo completed business operations when audit storage fails, and logs no database secrets', async () => {
    const db = database(); db.auditEvent.create.mockRejectedValue(new Error('secret-db-url'));
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await expect(new AuditService(db as never).record({ category: 'LOGIN', action: 'AUTH_LOGIN', resource: 'auth', method: 'POST', route: '/auth/login', httpStatus: 201, actor: admin })).resolves.toBeUndefined();
      expect(log).toHaveBeenCalled(); expect(JSON.stringify(log.mock.calls)).not.toContain('secret-db-url');
    } finally { log.mockRestore(); }
  });
  it('applies validated date boundaries in UTC+7 with stable ordering and pagination', async () => {
    const db = database();
    await new AuditService(db as never).list({ category: 'LOGIN', outcome: 'FAILURE', role: 'SYSTEM_ADMINISTRATOR', search: 'manager', from: '2026-11-03', to: '2026-11-03', page: '2', limit: '20' }, admin);
    const args = db.auditEvent.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 20, take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], where: { outcome: 'FAILURE', actorRole: { in: expect.arrayContaining(['SYSTEM_ADMINISTRATOR']) } } });
    expect(args.where.createdAt.gte.toISOString()).toBe('2026-11-02T17:00:00.000Z');
    expect(args.where.createdAt.lt.toISOString()).toBe('2026-11-03T17:00:00.000Z');
    expect(db.auditEvent.count.mock.calls[0][0].where).toEqual(args.where);
  });
  it('includes historical logouts in session history and excludes session events from activity before counting and paging', async () => {
    const db = database(), service = new AuditService(db as never);

    await service.list({ category: 'LOGIN', search: 'staff', page: '2', limit: '5' }, admin);
    const history = db.auditEvent.findMany.mock.calls[0][0];
    expect(history).toMatchObject({ skip: 5, take: 5, where: { AND: [{ AND: [{ OR: [
      { category: 'LOGIN', action: { in: ['AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_LOGIN_ACCOUNT_DISABLED'] } },
      { category: 'ACTIVITY', action: 'AUTH_LOGOUT' },
    ] }] }] } });
    expect(history.where.OR).toContainEqual({ actorEmail: { contains: 'staff', mode: 'insensitive' } });
    expect(db.auditEvent.count.mock.calls[0][0].where).toEqual(history.where);

    await service.list({ category: 'ACTIVITY' }, admin);
    const activity = db.auditEvent.findMany.mock.calls[1][0];
    expect(activity.where).toEqual({ AND: [{ category: 'ACTIVITY', action: { notIn: ['AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_LOGIN_ACCOUNT_DISABLED'] } }] });
    expect(db.auditEvent.count.mock.calls[1][0].where).toEqual(activity.where);
  });
  it.each([{ page: '0' }, { limit: '101' }, { page: '1.5' }, { from: '2026-02-30' }, { from: '2026-11-04', to: '2026-11-03' }, { category: 'OTHER' }, { outcome: 'OTHER' }, { role: 'OTHER' }, { search: ['a', 'b'] }])('rejects invalid query %j', async query => {
    const db = database(); await expect(new AuditService(db as never).list(query, admin)).rejects.toBeInstanceOf(BadRequestException); expect(db.auditEvent.findMany).not.toHaveBeenCalled();
  });
  it('returns a clear 503 when the migration/storage is unavailable, not fake empty history', async () => {
    const db = database(); db.auditEvent.count.mockRejectedValue(new Error('P2021'));
    await expect(new AuditService(db as never).list({}, admin)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('safe audit interception', () => {
  it.each(['/api/admin/audit-events', '/api/customer/contracts/:id', '/api/booking/catalog'])('does not log polling/reads: %s', path => {
    expect(auditTarget({ method: 'GET', route: { path }, user: admin })).toBeUndefined();
  });
  it('does not log anonymous callbacks, OTP routes, or complete raw URLs', () => {
    for (const path of ['/api/payments/vnpay/ipn', '/api/signing/:token/verify', '/api/auth/password-reset']) expect(auditTarget({ method: 'POST', route: { path } })).toBeUndefined();
    expect(auditTarget({ method: 'PATCH', route: { path: '/api/staff/management/support-requests/:id/resolve' }, user: { ...admin, role: 'FACILITY_STAFF' } })).toMatchObject({ action: 'RESOLVE', resource: 'support-requests', route: '/staff/management/support-requests/:id/resolve' });
  });
  it.each([
    ['login', 'LOGIN', 'AUTH_LOGIN'],
    ['logout', 'LOGIN', 'AUTH_LOGOUT'],
    ['register', 'ACTIVITY', 'AUTH_REGISTER'],
  ])('classifies %s by its purpose', (path, category, action) => {
    expect(auditTarget({ method: 'POST', route: { path: '/api/auth/' + path }, user: admin }))
      .toMatchObject({ category, action, resource: 'auth' });
  });
  it('preserves the result/error and records only once', async () => {
    const record = vi.fn().mockResolvedValue(undefined), interceptor = new AuditInterceptor({ record } as never);
    const req = { method: 'POST', route: { path: '/api/auth/login' }, body: { email: 'user@example.test', password: 'secret' } };
    const context = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode: 201 }) }) } as unknown as ExecutionContext;
    const session = { token: 'secret-token', user: admin };
    expect(await lastValueFrom(interceptor.intercept(context, { handle: () => of(session) }))).toBe(session);
    expect(record).toHaveBeenCalledOnce(); expect(JSON.stringify(record.mock.calls)).not.toContain('secret');
    record.mockClear(); const error = new BadRequestException('invalid');
    await expect(lastValueFrom(interceptor.intercept(context, { handle: () => throwError(() => error) }))).rejects.toBe(error);
    expect(record).toHaveBeenCalledOnce(); expect(record.mock.calls[0][0].httpStatus).toBe(400);
  });
  it('records the invoice ID when opening a VNPay session, without storing the signed URL', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const req = { method: 'POST', route: { path: '/api/customer/invoices/:invoiceId/online-payment' }, params: { invoiceId: 'invoice-1' }, user: { ...admin, role: 'STORAGE_CUSTOMER' }, body: { token: 'DO_NOT_LOG' } };
    const context = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode: 201 }) }) } as unknown as ExecutionContext;
    await lastValueFrom(new AuditInterceptor({ record } as never).intercept(context, { handle: () => of({ transactionId: 'transaction-1', paymentUrl: 'https://provider.test/?vnp_SecureHash=DO_NOT_LOG' }) }));
    expect(record.mock.calls[0][0]).toMatchObject({ action: 'ONLINE_PAYMENT', resource: 'invoices', resourceId: 'invoice-1' });
    expect(JSON.stringify(record.mock.calls)).not.toContain('DO_NOT_LOG');
  });
  it.each([
    ['/api/customer/booking-requests/:bookingCode/claim', { bookingCode: 'WDPG-fixture' }, 'CLAIM', 'booking-requests', 'WDPG-fixture'],
    ['/api/customer/transfer-orders/:id/accept', { id: 'transfer-1' }, 'ACCEPT', 'transfer-orders', 'transfer-1'],
  ])('records the authenticated business action and safe resource identifier for %s', async (path, params, action, resource, resourceId) => {
    const record = vi.fn().mockResolvedValue(undefined);
    const actor: PublicUser = { ...admin, role: 'STORAGE_CUSTOMER' };
    const req = { method: 'POST', route: { path }, params, user: actor, body: { otp: 'DO_NOT_LOG' } };
    const context = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode: 201 }) }) } as unknown as ExecutionContext;
    const result = { status: 'SUCCESS', signatureImage: 'DO_NOT_LOG' };
    expect(await lastValueFrom(new AuditInterceptor({ record } as never).intercept(context, { handle: () => of(result) }))).toBe(result);
    expect(record).toHaveBeenCalledOnce();
    expect(record.mock.calls[0][0]).toMatchObject({ category: 'ACTIVITY', action, resource, resourceId, actor, httpStatus: 201 });
    expect(JSON.stringify(record.mock.calls)).not.toContain('DO_NOT_LOG');
    expect(auditTarget({ method: 'POST', route: { path } })).toBeUndefined();
  });
});

// Real HTTP/guards/auth sessions with isolated in-memory users and a mock audit DB only.
@Controller('admin/users') @UseGuards(AuthGuard, RolesGuard) @Roles('SYSTEM_ADMINISTRATOR')
class MutationFixtureController {
  @Post() create() { return { id: 'new-user', passwordHash: 'DO_NOT_LOG_HASH', token: 'DO_NOT_LOG_TOKEN' }; }
}
describe('audit HTTP registration, authenticated actor and four-role access', () => {
  let app: INestApplication;
  const db = database(), users = new MemoryUserRepository(), auth = new AuthService(users), tokens: Record<string, string> = {};
  beforeAll(async () => {
    const customer = await auth.register({ fullName: 'Fixture customer', email: 'customer@example.test', phone: '0900000000', password: 'fixture-password' });
    tokens.STORAGE_CUSTOMER = customer.token;
    const source = (await users.findById(customer.user.id))!;
    for (const role of ['FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'] as const) {
      await users.create({ fullName: `Fixture ${role}`, email: `${roleNamespace(role)}@example.test`, phone: '', passwordHash: source.passwordHash, role });
      tokens[role] = (await auth.login({ email: `${roleNamespace(role)}@example.test`, password: 'fixture-password' })).token;
    }
    const module = await Test.createTestingModule({ controllers: [AdminAuditController, AuthController, MutationFixtureController], providers: [AuditService, { provide: PrismaService, useValue: db }, { provide: AuthService, useValue: auth }] })
      .overrideGuard(AuthGuard).useValue(new AuthGuard(auth)).overrideGuard(RolesGuard).useValue(new RolesGuard(new Reflector())).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api'); app.useGlobalInterceptors(new AuditInterceptor(module.get(AuditService))); await app.init();
  });
  afterAll(async () => { await app?.close(); });
  it('records real successful and failed HTTP logins without storing passwords or session tokens', async () => {
    db.auditEvent.create.mockClear();
    const success = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'admin@example.test', password: 'fixture-password' }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'admin@example.test', password: 'wrong-password' }).expect(401);
    expect(db.auditEvent.create.mock.calls).toHaveLength(2);
    expect(db.auditEvent.create.mock.calls[0][0].data).toMatchObject({ category: 'LOGIN', actorRole: 'SYSTEM_ADMINISTRATOR', outcome: 'SUCCESS' });
    expect(db.auditEvent.create.mock.calls[1][0].data).toMatchObject({ category: 'LOGIN', actorRole: null, outcome: 'FAILURE', httpStatus: 401 });
    const serialized = JSON.stringify(db.auditEvent.create.mock.calls);
    expect(serialized).not.toContain(success.body.token); expect(serialized).not.toContain('fixture-password'); expect(serialized).not.toContain('wrong-password');
  });
  it('records the verified account on disabled-login failures without revealing it in the public response', async () => {
    const source = (await users.findByEmail('customer@example.test'))!;
    const target = await users.create({ fullName: 'Fixture disabled', role: 'STORAGE_CUSTOMER', email: 'disabled@example.test', phone: source.phone, passwordHash: source.passwordHash, accountStatus: 'DISABLED' });
    db.auditEvent.create.mockClear();
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: target.email, password: 'fixture-password' })
      .expect(401, { statusCode: 401, code: 'ACCOUNT_DISABLED', message: 'Tài khoản đã bị vô hiệu hóa.' });
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: target.email, password: 'wrong-password' })
      .expect(401).expect(({ body }) => expect(body.message).toBe('Email hoặc mật khẩu không đúng.'));
    expect(db.auditEvent.create.mock.calls).toHaveLength(2);
    const [blocked, unverified] = db.auditEvent.create.mock.calls.map(([entry]) => entry.data);
    expect(blocked).toMatchObject({ category: 'LOGIN', action: 'AUTH_LOGIN_ACCOUNT_DISABLED', actorId: target.id, actorName: target.fullName, actorRole: target.role, actorEmail: target.email, outcome: 'FAILURE' });
    expect(unverified).toMatchObject({ category: 'LOGIN', action: 'AUTH_LOGIN', actorId: null, actorName: null, actorRole: null, actorEmail: target.email, outcome: 'FAILURE' });
    expect(JSON.stringify(blocked)).not.toMatch(/passwordHash|fixture-password|token/);
  });
  it('records the authenticated Admin on mutations instead of user-supplied actor/body secrets', async () => {
    db.auditEvent.create.mockClear();
    await request(app.getHttpServer()).post('/api/admin/users').set('Authorization', `Bearer ${tokens.SYSTEM_ADMINISTRATOR}`).send({ actorId: 'spoofed', password: 'secret', role: 'SYSTEM_ADMINISTRATOR' }).expect(201);
    const data = db.auditEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ category: 'ACTIVITY', actorRole: 'SYSTEM_ADMINISTRATOR', resource: 'users', resourceId: 'new-user' });
    expect(JSON.stringify(data)).not.toMatch(/spoofed|secret|DO_NOT_LOG/);
  });
  it.each(['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'])('enforces %s read access', async role => {
    await request(app.getHttpServer()).get('/api/admin/audit-events?category=LOGIN').set('Authorization', `Bearer ${tokens[role]}`).expect(role === 'SYSTEM_ADMINISTRATOR' ? 200 : 403);
    await request(app.getHttpServer()).get('/api/admin/audit-events?category=ACCOUNT_NOTICES').set('Authorization', `Bearer ${tokens[role]}`).expect(role === 'SYSTEM_ADMINISTRATOR' ? 200 : 403);
  });
  it('requires authentication and exposes no edit/delete audit endpoint', async () => {
    await request(app.getHttpServer()).get('/api/admin/audit-events').expect(401);
    await request(app.getHttpServer()).delete('/api/admin/audit-events/event').set('Authorization', `Bearer ${tokens.SYSTEM_ADMINISTRATOR}`).expect(404);
  });
});
