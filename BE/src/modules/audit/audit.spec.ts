import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BadRequestException, Body, Controller, Inject, Logger, Post, ServiceUnavailableException, UseGuards, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AuditService } from './audit.service.js';
import { AuditInterceptor, auditTarget } from './audit.interceptor.js';
import { AdminAuditController } from './admin-audit.controller.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { MemoryUserRepository } from '../users/user.repository.js';
import type { PublicUser } from '../auth/auth.types.js';

const admin = { id: 'admin', fullName: 'Admin', email: 'admin@example.test', role: 'ADMIN', phone: '' } as PublicUser;
function database() {
  return { auditEvent: { create: vi.fn().mockResolvedValue({ id: 'event' }), count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([{ id: 'event', action: 'AUTH_LOGIN' }]) } };
}
describe('audit persistence and filters (mock DB)', () => {
  it('stores an explicit minimal snapshot, never arbitrary credential/body fields', async () => {
    const db = database(), service = new AuditService(db as never);
    await service.record({ category: 'ACTIVITY', action: 'CREATE', resource: 'users', resourceId: 'new-user', method: 'POST', route: '/admin/users', httpStatus: 201, actor: admin, ipAddress: '127.0.0.1', password: 'NEVER_STORE', token: 'NEVER_STORE', otp: 'NEVER_STORE', body: { signature: 'NEVER_STORE' } } as never);
    const data = db.auditEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ actorId: 'admin', actorRole: 'ADMIN', resourceId: 'new-user', outcome: 'SUCCESS' });
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
    await new AuditService(db as never).list({ category: 'LOGIN', outcome: 'FAILURE', role: 'ADMIN', search: 'manager', from: '2026-11-03', to: '2026-11-03', page: '2', limit: '20' });
    const args = db.auditEvent.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 20, take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], where: { category: 'LOGIN', outcome: 'FAILURE', actorRole: 'ADMIN' } });
    expect(args.where.createdAt.gte.toISOString()).toBe('2026-11-02T17:00:00.000Z');
    expect(args.where.createdAt.lt.toISOString()).toBe('2026-11-03T17:00:00.000Z');
    expect(db.auditEvent.count.mock.calls[0][0].where).toEqual(args.where);
  });
  it.each([{ page: '0' }, { limit: '101' }, { page: '1.5' }, { from: '2026-02-30' }, { from: '2026-11-04', to: '2026-11-03' }, { category: 'OTHER' }, { outcome: 'OTHER' }, { role: 'OTHER' }, { search: ['a', 'b'] }])('rejects invalid query %j', async query => {
    const db = database(); await expect(new AuditService(db as never).list(query)).rejects.toBeInstanceOf(BadRequestException); expect(db.auditEvent.findMany).not.toHaveBeenCalled();
  });
  it('returns a clear 503 when the migration/storage is unavailable, not fake empty history', async () => {
    const db = database(); db.auditEvent.count.mockRejectedValue(new Error('P2021'));
    await expect(new AuditService(db as never).list({})).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('safe audit interception', () => {
  it.each(['/api/admin/audit-events', '/api/customer/contracts/:id', '/api/booking/catalog'])('does not log polling/reads: %s', path => {
    expect(auditTarget({ method: 'GET', route: { path }, user: admin })).toBeUndefined();
  });
  it('does not log anonymous callbacks, OTP routes, or complete raw URLs', () => {
    for (const path of ['/api/payments/vnpay/ipn', '/api/signing/:token/verify', '/api/auth/password-reset']) expect(auditTarget({ method: 'POST', route: { path } })).toBeUndefined();
    expect(auditTarget({ method: 'PATCH', route: { path: '/api/staff/management/support-requests/:id/resolve' }, user: { ...admin, role: 'STAFF' } })).toMatchObject({ action: 'RESOLVE', resource: 'support-requests', route: '/staff/management/support-requests/:id/resolve' });
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
    const req = { method: 'POST', route: { path: '/api/customer/invoices/:invoiceId/online-payment' }, params: { invoiceId: 'invoice-1' }, user: { ...admin, role: 'CUSTOMER' }, body: { token: 'DO_NOT_LOG' } };
    const context = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode: 201 }) }) } as unknown as ExecutionContext;
    await lastValueFrom(new AuditInterceptor({ record } as never).intercept(context, { handle: () => of({ transactionId: 'transaction-1', paymentUrl: 'https://provider.test/?vnp_SecureHash=DO_NOT_LOG' }) }));
    expect(record.mock.calls[0][0]).toMatchObject({ action: 'ONLINE_PAYMENT', resource: 'invoices', resourceId: 'invoice-1' });
    expect(JSON.stringify(record.mock.calls)).not.toContain('DO_NOT_LOG');
  });
});

// Real HTTP/guards/auth sessions with isolated in-memory users and a mock audit DB only.
@Controller('auth')
class LoginFixtureController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post('login') login(@Body() input: Record<string, unknown>) { return this.auth.login(input); }
}
@Controller('admin/users') @UseGuards(AuthGuard, RolesGuard) @Roles('ADMIN')
class MutationFixtureController {
  @Post() create() { return { id: 'new-user', passwordHash: 'DO_NOT_LOG_HASH', token: 'DO_NOT_LOG_TOKEN' }; }
}
describe('audit HTTP registration, authenticated actor and four-role access', () => {
  let app: INestApplication;
  const db = database(), users = new MemoryUserRepository(), auth = new AuthService(users), tokens: Record<string, string> = {};
  beforeAll(async () => {
    const customer = await auth.register({ fullName: 'Fixture customer', email: 'customer@example.test', phone: '0900000000', password: 'fixture-password' });
    tokens.CUSTOMER = customer.token;
    const source = (await users.findById(customer.user.id))!;
    for (const role of ['STAFF', 'MANAGER', 'ADMIN'] as const) {
      await users.create({ fullName: `Fixture ${role}`, email: `${role.toLowerCase()}@example.test`, phone: '', passwordHash: source.passwordHash, role });
      tokens[role] = (await auth.login({ email: `${role.toLowerCase()}@example.test`, password: 'fixture-password' })).token;
    }
    const module = await Test.createTestingModule({ controllers: [AdminAuditController, LoginFixtureController, MutationFixtureController], providers: [AuditService, { provide: PrismaService, useValue: db }, { provide: AuthService, useValue: auth }] })
      .overrideGuard(AuthGuard).useValue(new AuthGuard(auth)).overrideGuard(RolesGuard).useValue(new RolesGuard(new Reflector())).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api'); app.useGlobalInterceptors(new AuditInterceptor(module.get(AuditService))); await app.init();
  });
  afterAll(async () => { await app?.close(); });
  it('records real successful and failed HTTP logins without storing passwords or session tokens', async () => {
    db.auditEvent.create.mockClear();
    const success = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'admin@example.test', password: 'fixture-password' }).expect(201);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'admin@example.test', password: 'wrong-password' }).expect(401);
    expect(db.auditEvent.create.mock.calls).toHaveLength(2);
    expect(db.auditEvent.create.mock.calls[0][0].data).toMatchObject({ category: 'LOGIN', actorRole: 'ADMIN', outcome: 'SUCCESS' });
    expect(db.auditEvent.create.mock.calls[1][0].data).toMatchObject({ category: 'LOGIN', actorRole: null, outcome: 'FAILURE', httpStatus: 401 });
    const serialized = JSON.stringify(db.auditEvent.create.mock.calls);
    expect(serialized).not.toContain(success.body.token); expect(serialized).not.toContain('fixture-password'); expect(serialized).not.toContain('wrong-password');
  });
  it('records the authenticated Admin on mutations instead of user-supplied actor/body secrets', async () => {
    db.auditEvent.create.mockClear();
    await request(app.getHttpServer()).post('/api/admin/users').set('Authorization', `Bearer ${tokens.ADMIN}`).send({ actorId: 'spoofed', password: 'secret', role: 'ADMIN' }).expect(201);
    const data = db.auditEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ category: 'ACTIVITY', actorRole: 'ADMIN', resource: 'users', resourceId: 'new-user' });
    expect(JSON.stringify(data)).not.toMatch(/spoofed|secret|DO_NOT_LOG/);
  });
  it.each(['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'])('enforces %s read access', async role => {
    await request(app.getHttpServer()).get('/api/admin/audit-events?category=LOGIN').set('Authorization', `Bearer ${tokens[role]}`).expect(role === 'ADMIN' ? 200 : 403);
  });
  it('requires authentication and exposes no edit/delete audit endpoint', async () => {
    await request(app.getHttpServer()).get('/api/admin/audit-events').expect(401);
    await request(app.getHttpServer()).delete('/api/admin/audit-events/event').set('Authorization', `Bearer ${tokens.ADMIN}`).expect(404);
  });
});
