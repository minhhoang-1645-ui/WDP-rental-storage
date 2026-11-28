import 'reflect-metadata';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ReportingService } from '../manager/reporting.service.js';
import { buildNotices } from '../notifications/notification-content.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OperationsController } from './operations.module.js';
import { OperationsService } from './operations.service.js';

const base = '/api/operations/facilities';
const identity = { code: 'A', name: 'Cơ sở A', address: 'Địa chỉ A' };
const bom = { id: 'bom', role: 'BUSINESS_OPERATIONS_MANAGER' as const, fullName: 'BOM', email: 'bom@example.test', phone: '' };
const serviceSchedule = [
  { weekday: 1, starts: '09:00', ends: '12:00', capacity: 2 },
  { weekday: 1, starts: '12:00', ends: '16:00', capacity: 1 },
];
const hours = { officeHours: '07:00–17:30, Hằng ngày', accessHours: '09:00–16:00, Thứ Hai' };
const facility = { ...identity, ...hours, serviceSchedule, id: 'a', updatedAt: new Date('2026-11-01'), operationalStatus: 'OPEN', bookingEnabled: false };

describe('BOM facility schedule HTTP', () => {
  let app: INestApplication;
  const tx = {
    $queryRawUnsafe: vi.fn(), user: { findFirst: vi.fn() },
    facility: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    handoverAppointment: { findMany: vi.fn() },
    returnRequest: { findMany: vi.fn() },
    storageType: { count: vi.fn() }, facilityAccess: { findMany: vi.fn() }, auditEvent: { create: vi.fn() },
  };
  const input = { ...identity, ...hours, serviceSchedule, operationalStatus: 'OPEN', bookingEnabled: false };
  const create = (body: object) => request(app.getHttpServer()).post(base).send(body);
  const patch = (body: object) => request(app.getHttpServer()).patch(base + '/a')
    .send({ expectedUpdatedAt: facility.updatedAt.toISOString(), ...body });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OperationsController],
      providers: [OperationsService, { provide: ReportingService, useValue: {} }, {
        provide: PrismaService, useValue: { $transaction: (run: (client: typeof tx) => unknown) => run(tx) },
      }],
    }).overrideGuard(AuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        context.switchToHttp().getRequest<AuthenticatedRequest>().user = bom;
        return true;
      },
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    vi.clearAllMocks();
    tx.user.findFirst.mockResolvedValue({ id: bom.id });
    tx.facility.findUnique.mockImplementation(async ({ where }) => where.id ? facility : null);
    tx.facility.create.mockImplementation(async ({ data }) => data);
    tx.facility.update.mockImplementation(async ({ data }) => ({ ...facility, ...data }));
    tx.handoverAppointment.findMany.mockResolvedValue([]);
    tx.returnRequest.findMany.mockResolvedValue([]);
    tx.storageType.count.mockResolvedValue(1);
    tx.facilityAccess.findMany.mockResolvedValue(['FACILITY_MANAGER', 'FACILITY_STAFF'].map(role => ({ user: { role } })));
  });

  it('accepts incomplete inactive creation, adjacent windows and valid 24:00', async () => {
    const incomplete = await create(identity).expect(201);
    expect(incomplete.body).toMatchObject({ operationalStatus: 'OPEN', bookingEnabled: false, officeHours: '', accessHours: '' });
    await create(input).expect(201);
    await create({ ...input, officeHours: '24/7', accessHours: '22:00–24:00, Thứ Hai',
      serviceSchedule: [{ weekday: 1, starts: '22:00', ends: '24:00', capacity: 1 }] }).expect(201);
    await create({ ...input, officeHours: '22:00–06:00 (qua nửa đêm), Chủ nhật',
      accessHours: '01:00–06:00, Thứ Hai', serviceSchedule: [{ weekday: 1, starts: '03:00', ends: '06:00', capacity: 1 }] }).expect(201);
  });

  it('accepts a facility photo on create and edit, and allows removal', async () => {
    const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWioAAAAASUVORK5CYII=';
    expect((await create({ ...identity, photo }).expect(201)).body.photo).toBe(photo);
    expect((await patch({ photo }).expect(200)).body.photo).toBe(photo);
    expect((await patch({ photo: null }).expect(200)).body.photo).toBeNull();
    await patch({ photo: 'data:image/png;base64,ZmFrZQ==' }).expect(400);
    expect(tx.facility.update).toHaveBeenCalledTimes(2);
  });

  it.each([
    { accessHours: '06:59–16:00, Thứ Hai' },
    { accessHours: '09:00–17:31, Thứ Hai' },
    { accessHours: '24/7' },
    { officeHours: '07:00–17:30, Thứ Ba' },
    { serviceSchedule: [{ ...serviceSchedule[0], weekday: 2 }] },
    { serviceSchedule: [{ ...serviceSchedule[0], starts: '08:59' }] },
    { serviceSchedule: [{ ...serviceSchedule[0], ends: '24:00' }] },
    { serviceSchedule: [{ ...serviceSchedule[0], starts: '24:00' }] },
    { serviceSchedule: [{ ...serviceSchedule[0], ends: '00:00' }] },
    { serviceSchedule: [serviceSchedule[0], { ...serviceSchedule[1], starts: '11:59' }] },
    { serviceSchedule: [serviceSchedule[0], serviceSchedule[0]] },
    ...[0, -1, 1.5, '2', undefined].map(capacity => ({ serviceSchedule: [{ ...serviceSchedule[0], capacity }] })),
    { serviceSchedule: [{ ...serviceSchedule[0], weekday: undefined }] },
    { serviceSchedule: [{ ...serviceSchedule[0], starts: undefined }] },
    { serviceSchedule: [{ ...serviceSchedule[0], ends: undefined }] },
  ])('rejects invalid direct POST and merged PATCH %#', async change => {
    await create({ ...input, ...change }).expect(400);
    await patch(change).expect(400);
    expect(tx.facility.update).not.toHaveBeenCalled();
  });

  it('preserves unreadable legacy hours for unrelated edits and gates enabling', async () => {
    tx.facility.findUnique.mockResolvedValue({ ...facility, officeHours: 'Theo ca', serviceSchedule: [] });
    const result = await patch({ name: 'Tên mới' }).expect(200);
    expect(result.body.officeHours).toBe('Theo ca');
    await patch({ bookingEnabled: true }).expect(400);
    expect(tx.storageType.count).not.toHaveBeenCalled();
    tx.facility.findUnique.mockResolvedValue(facility);
    await patch({ bookingEnabled: true }).expect(200);
    expect(tx.storageType.count).toHaveBeenCalledOnce();
  });

  it('enables booking without service windows when work and access hours are valid', async () => {
    tx.facility.findUnique.mockResolvedValue({ ...facility, serviceSchedule: [], officeHours: ' ', accessHours: ' ' });
    await patch({ bookingEnabled: true }).expect(400)
      .expect(({ body }) => expect(body.fields).toEqual({ officeHours: expect.any(String), accessHours: expect.any(String) }));
    tx.facility.findUnique.mockResolvedValue({ ...facility, serviceSchedule: [], accessHours: '' });
    const invalid = await patch({ bookingEnabled: true }).expect(400);
    expect(invalid.body.fields).toEqual({ accessHours: expect.any(String) });
    tx.facility.findUnique.mockResolvedValue({ ...facility, serviceSchedule: [] });
    await patch({ bookingEnabled: true }).expect(200);
    expect(tx.storageType.count).toHaveBeenCalledOnce();
    expect(tx.facility.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ bookingEnabled: true }) }));
  });

  it('removes the last service window without invalidating confirmed appointments inside access hours', async () => {
    tx.facility.findUnique.mockResolvedValue({ ...facility, bookingEnabled: true });
    tx.handoverAppointment.findMany.mockResolvedValue([
      { id: 'h', scheduledAt: new Date('2099-01-05T10:00:00+07:00'), status: 'CONFIRMED' },
    ]);
    const response = await patch({ serviceSchedule: [] }).expect(200);
    expect(response.body).toMatchObject({ serviceSchedule: [], bookingEnabled: true });
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    await patch({ accessHours: '11:00–16:00, Thứ Hai', serviceSchedule: [] }).expect(409)
      .expect(({ body }) => expect(body).toMatchObject({ code: 'FACILITY_SCHEDULE_IMPACT', appointments: 1 }));
  });

  it('requires acknowledgement for affected records and creates a scoped Manager notice without changing schedules', async () => {
    const monday = (time: string) => new Date('2099-01-05T' + time + ':00+07:00');
    tx.handoverAppointment.findMany.mockResolvedValue([{ id: 'h', scheduledAt: monday('10:00'), status: 'CONFIRMED' }]);
    tx.returnRequest.findMany.mockResolvedValue([{ id: 'r', inspectionScheduledAt: monday('12:00'), status: 'REQUESTED' }]);
    const change = { officeHours: '11:00–17:30, Thứ Hai', accessHours: '11:00–16:00, Thứ Hai',
      serviceSchedule: [{ weekday: 1, starts: '11:00', ends: '16:00', capacity: 1 }] };
    const preview = await patch(change).expect(409);
    expect(preview.body).toMatchObject({ code: 'FACILITY_SCHEDULE_IMPACT', appointments: 1 });
    expect(tx.facility.update).not.toHaveBeenCalled();
    await patch({ ...change, scheduleImpactToken: 'stale' }).expect(409);
    await patch({ ...change, scheduleImpactToken: preview.body.token }).expect(200);
    expect(tx.facility.update).toHaveBeenCalledOnce();
    const event = tx.auditEvent.create.mock.calls[0][0].data;
    const notices = { 'facility-lifecycle': [{ ...event, id: 'notice', createdAt: facility.updatedAt }] };
    expect(buildNotices({ ...bom, role: 'FACILITY_MANAGER' }, notices)[0]).toMatchObject({
      important: true, summary: expect.stringContaining('1 lịch hẹn'),
    });
    expect(buildNotices({ ...bom, role: 'STORAGE_CUSTOMER' }, notices)).toEqual([]);
  });
});
