import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { scryptSync, randomUUID } from 'node:crypto';
import { FoundationHttpModule } from './foundation-http.module.js';
import { signature } from './foundation-fixtures.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { EmailService } from '../dist/modules/guest-booking/email.service.js';
import { BookingService } from '../dist/modules/booking/booking.service.js';
import { AppointmentsService } from '../dist/modules/appointments/appointments.service.js';
import { RenewalsService } from '../dist/modules/renewals/renewals.service.js';
import { businessToday } from '../dist/business-date.js';

const isolatedUrl =
  'postgresql://nestbox_test@127.0.0.1:55439/nestbox_foundation_test';
if (
  process.env.NESTBOX_ISOLATED_TEST !== '1' ||
  process.env.DATABASE_URL !== isolatedUrl ||
  process.env.NESTBOX_TEST_DATABASE_URL !== isolatedUrl ||
  process.env.DIRECT_URL !== isolatedUrl
)
  throw Error('HTTP checks require the disposable foundation database.');
const db = new PrismaService(),
  tokens: Record<string, string> = {},
  otp: Record<string, string> = {},
  guestMail: Record<string, { claimToken: string; bookingCode: string }> = {};
let app: INestApplication;
const password = 'isolated-http-password',
  key = () => randomUUID(),
  today = () => businessToday().toISOString().slice(0, 10);
const identity = (name: string) => 'http-' + name;
type Method = 'get' | 'post' | 'patch' | 'delete';
async function api(
  method: Method,
  path: string,
  who?: string,
  body?: object,
  status = 200,
  headers?: Record<string, string>,
) {
  let operation = request(app.getHttpServer())[method]('/api' + path);
  if (who) operation = operation.set('Authorization', 'Bearer ' + tokens[who]);
  if (headers) operation = operation.set(headers);
  operation = operation.set('Idempotency-Key', key());
  if (body) operation = operation.send(body);
  const response = await operation;
  expect(
    response.status,
    method + ' ' + path + ' as ' + who + ': ' + JSON.stringify(response.body),
  ).toBe(status);
  return response;
}
async function denied(
  method: Method,
  path: string,
  who: string,
  body?: object,
) {
  let operation = request(app.getHttpServer())
    [method]('/api' + path)
    .set('Authorization', 'Bearer ' + tokens[who])
    .set('Idempotency-Key', key());
  if (body) operation = operation.send(body);
  const response = await operation;
  expect(
    [403, 404],
    method + ' ' + path + ' as ' + who + ': ' + JSON.stringify(response.body),
  ).toContain(response.status);
}
async function reserve(facility = 'A', quantity = 1, startDate = today(), services: { serviceId: string; quantity: number }[] = []) {
  const response = await api(
    'post',
    '/reservations',
    'customer',
    {
      productId: identity('type-' + facility),
      startDate,
      periodMode: 'duration',
      durationMonths: 1,
      quantity,
      adjacencyPreference: false,
      addonIds: [],
      services,
      paymentChoice: 'pay-later',
      paymentPlan: 'PAY_MONTHLY',
      note: key(),
    },
    201,
  );
  expect(response.body.status).toBe('CONFIRMED');
  return db.reservation.findUniqueOrThrow({
    where: { reservationCode: response.body.id },
  });
}
async function sign(reservationId: string) {
  for (const contract of await db.rentalContract.findMany({
    where: { reservationId },
  })) {
    const view = await api(
      'get',
      '/customer/contracts/' + contract.id,
      'customer',
    );
    const input = {
      agreed: true,
      accepted: true,
      acceptanceName: 'HTTP customer',
      signatureImage: signature(),
      snapshotHash: view.body.terms.snapshotHash,
    };
    const challenge = await api(
      'post',
      '/customer/contracts/' + contract.id + '/signature-otp',
      'customer',
      input,
      201,
    );
    await api(
      'post',
      '/customer/contracts/' + contract.id + '/accept',
      'customer',
      {
        ...input,
        challengeId: challenge.body.challengeId,
        otp: otp['http-customer@foundation.test'],
      },
      201,
    );
  }
}
beforeAll(async () => {
  await db.$connect();
  const salt = 'a'.repeat(32),
    hashed = [
      'scrypt',
      salt,
      scryptSync(password, salt, 64).toString('hex'),
    ].join('$');
  const roles = {
    customer: 'STORAGE_CUSTOMER',
    other: 'STORAGE_CUSTOMER',
    staffA: 'FACILITY_STAFF',
    staffA2: 'FACILITY_STAFF',
    staffB: 'FACILITY_STAFF',
    incidentReporter: 'FACILITY_STAFF',
    managerA: 'FACILITY_MANAGER',
    managerA2: 'FACILITY_MANAGER',
    managerB: 'FACILITY_MANAGER',
    bom: 'BUSINESS_OPERATIONS_MANAGER',
    admin: 'SYSTEM_ADMINISTRATOR',
  } as const;
  for (const [name, role] of Object.entries(roles))
    await db.user.create({
      data: {
        id: identity(name),
        email: identity(name).toLowerCase() + '@foundation.test',
        fullName: 'HTTP ' + name,
        passwordHash: hashed,
        role,
        phone: '0900000011',
      },
    });
  for (const f of ['A', 'B']) {
    await db.facility.create({
      data: {
        id: identity(f),
        code: identity(f),
        name: 'HTTP Facility ' + f,
        address: 'Địa chỉ kiểm thử ' + f,
        officeHours: f === 'A' ? '08:00–17:00' : '',
        accessHours: f === 'A' ? '07:00–20:00' : '',
      },
    });
    await db.businessRule.create({ data: { key: 'monthlyPriceRange:small', facilityId: identity(f), version: 1,
      value: { min: 1000000, max: 2400000 }, effectiveFrom: new Date('2000-01-01Z'), createdById: identity('bom') } });
    await db.storageType.create({
      data: {
        id: identity('type-' + f),
        facilityId: identity(f),
        code: identity('TYPE-' + f),
        name: 'HTTP Kho ' + f,
        sizeId: 'small',
        sizeName: 'Kho nhỏ',
        kicker: 'Test',
        condition: 'STANDARD',
        widthCm: 150,
        lengthCm: 200,
        heightCm: 240,
        roomEquivalent: 'Test',
        capacity: 'Test',
        boxCount: 'Test',
        suitableItems: [],
        image: 'https://example.test/unit.jpg',
        imageAlt: 'Test',
        floor: 'Ground',
        access: 'Test',
        features: [],
        monthlyRate: 1500000,
        minRentalDays: 1,
        allowDailyRental: true,
      },
    });
    await db.storageUnit.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        id: identity(f + '-' + i),
        storageTypeId: identity('type-' + f),
        unitNumber: identity(f + '-' + i),
        floor: 'Ground',
        zone: f,
        row: 1,
        position: i + 1,
      })),
    });
  }
  const module = await Test.createTestingModule({
    imports: [FoundationHttpModule],
  })
    .overrideProvider(PrismaService)
    .useValue(db)
    .overrideProvider(EmailService)
    .useValue({
      signatureDeliveryConfigured: () => true,
      sendSignatureOtp: async (m: { to: string; code: string }) => {
        otp[m.to] = m.code;
      },
      sendBookingClaim: async (m: {
        to: string;
        claimToken: string;
        bookingCode: string;
      }) => {
        guestMail[m.to] = m;
        return { delivered: true, adapter: 'isolated' };
      },
    })
    .compile();
  // Disable only timer registration; HTTP controllers, guards, services and all writes remain real.
  for (const service of [
    module.get(BookingService),
    module.get(AppointmentsService),
    module.get(RenewalsService),
  ])
    service.onModuleInit = () => {};
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  await app.init();
  for (const name of Object.keys(roles)) {
    const result = await api(
      'post',
      '/auth/login',
      undefined,
      { email: identity(name) + '@foundation.test', password },
      200,
    );
    tokens[name] = result.body.token;
  }
  for (const f of ['A', 'B'])
    for (const who of [
      'manager' + f,
      'staff' + f,
      ...(f === 'A' ? ['staffA2', 'managerA2'] : []),
    ])
      await api(
        'post',
        '/admin/facility-access',
        'admin',
        { userId: identity(who), facilityId: identity(f) },
        201,
      );
});
afterAll(async () => {
  if (app) await app.close();
  await db.$disconnect();
});

it('publishes the facility directory and filters guest storage searches by facility', async () => {
  const catalog = (await api('get', '/booking/catalog')).body;
  expect(catalog.facilities).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: identity('A'), address: 'Địa chỉ kiểm thử A', officeHours: '08:00–17:00', accessHours: '07:00–20:00' }),
    expect.objectContaining({ id: identity('B'), address: 'Địa chỉ kiểm thử B' }),
  ]));
  for (const facility of ['A', 'B']) {
    const result = (await api('get', '/storage?facilityId=' + identity(facility) + '&date=' + today() + '&duration=1')).body;
    expect(result.checkedPeriod).toBe(true);
    expect(result.items.map((item: { id: string }) => item.id)).toEqual([identity('type-' + facility)]);
  }
  await api('get', '/storage?facilityId=unknown', undefined, undefined, 400);
  await api('get', '/storage?date=2099-02-30&duration=flexible', undefined, undefined, 400);
});

it('reports incidents without mutating rentals and secures photo evidence throughout the maintenance workflow', async () => {
  const getFacilities = async (who: string) => (await api('get', '/staff/maintenance/facilities', who)).body;
  expect(await getFacilities('staffA')).toEqual([expect.objectContaining({ id: identity('A') })]);
  expect(await getFacilities('incidentReporter')).toEqual([]);
  const reportGrant = (await api('post', '/admin/facility-access', 'admin', {
    userId: identity('incidentReporter'), facilityId: identity('A'),
  }, 201)).body;
  await api('post', '/admin/facility-access', 'admin', { userId: identity('incidentReporter'), facilityId: identity('B') }, 201);
  expect((await getFacilities('incidentReporter')).map((item: { id: string }) => item.id)).toEqual([identity('A'), identity('B')]);
  await api('get', '/staff/maintenance/units?facilityId=' + identity('B'), 'staffA', undefined, 403);

  const financialCounts = () => Promise.all([db.reservation.count(), db.reservationUnit.count(), db.rentalContract.count(),
    db.invoice.count(), db.payment.count(), db.damageClaim.count()]);
  const before = await financialCounts();
  const statuses = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'MAINTENANCE'] as const;
  const unitIds = statuses.map((_, index) => identity('A-' + (8 + index)));
  for (const [index, status] of statuses.entries()) {
    const storageUnitId = unitIds[index];
    await db.storageUnit.update({ where: { id: storageUnitId }, data: { status } });
    const payload = { facilityId: identity('A'), storageUnitId, category: 'SECURITY', rentalImpact: 'NO_IMPACT', description: 'Kiểm tra hiện trạng ô kho' };
    await denied('post', '/staff/maintenance', 'staffB', payload);
    await api('post', '/staff/maintenance', 'incidentReporter', { ...payload, facilityId: identity('B') }, 400);
    const report = (await api('post', '/staff/maintenance', 'incidentReporter', payload, 201)).body;
    expect(report).toMatchObject({ status: 'OPEN', blocksUnit: false, unit: { status } });
    expect((await db.storageUnit.findUniqueOrThrow({ where: { id: storageUnitId } })).status).toBe(status);
    await db.storageUnit.update({ where: { id: storageUnitId }, data: { status: 'AVAILABLE' } });
  }
  expect(await financialCounts()).toEqual(before);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jLZkAAAAASUVORK5CYII=', 'base64');
  const newAreaReport = (contents: Buffer, createKey: string, filename = 'incident.png', contentType = 'image/png') =>
    request(app.getHttpServer()).post('/api/staff/maintenance')
      .set('Authorization', 'Bearer ' + tokens.incidentReporter).set('Idempotency-Key', createKey)
      .field('facilityId', identity('A')).field('commonArea', 'CORRIDOR').field('locationNote', 'Tầng 2')
      .field('category', 'UTILITIES').field('priority', 'URGENT').field('rentalImpact', 'NO_IMPACT').field('description', 'Phát hiện nước chảy ở hành lang.')
      .attach('photos', contents, { filename, contentType });
  expect((await newAreaReport(Buffer.from('fake png'), key())).status).toBe(400);
  expect((await newAreaReport(png, key(), 'incident.webp', 'image/webp')).status).toBe(400);
  expect((await newAreaReport(Buffer.alloc(5 * 1024 * 1024 + 1), key())).status).toBe(413);
  const createKey = key();
  const created = await newAreaReport(png, createKey);
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const { id, photos } = created.body;
  expect(created.body).toMatchObject({ unit: null, commonArea: 'CORRIDOR', facility: { id: identity('A') }, priority: 'URGENT' });
  expect((await newAreaReport(png, createKey)).body.id).toBe(id);
  const task = '/manager/maintenance/' + id;
  const staffTask = '/staff/maintenance/' + id;
  await denied('get', task, 'managerB');
  await denied('get', task + '/photos/' + photos[0].id, 'managerB');
  await denied('get', staffTask + '/photos/' + photos[0].id, 'staffB');
  expect((await api('get', task + '/photos/' + photos[0].id, 'managerA')).body).toEqual(png);
  expect((await api('get', '/manager/staff?taskType=maintenance&taskId=' + id, 'managerA')).body.items)
    .toEqual(expect.arrayContaining([expect.objectContaining({ id: identity('staffA') })]));
  await denied('patch', task + '/assign', 'managerA', { staffUserId: identity('staffB') });
  await api('patch', task + '/assign', 'managerA', { staffUserId: identity('staffA') });
  await denied('post', staffTask + '/start', 'incidentReporter');
  await api('post', staffTask + '/start', 'staffA', {}, 201);
  await api('post', staffTask + '/complete-work', 'staffA', { workNote: 'Đã xử lý nước rò rỉ và kiểm tra lại.' }, 201);
  await api('post', task + '/verify', 'managerA', { note: 'Đã kiểm tra khu vực.' }, 201);
  expect((await api('get', staffTask, 'incidentReporter')).body).toMatchObject({ status: 'COMPLETED', unit: null });
  expect((await api('get', '/staff/maintenance/reported-by-me', 'incidentReporter')).body.items)
    .toEqual(expect.arrayContaining([expect.objectContaining({ id, unitCode: null, commonArea: 'CORRIDOR' })]));
  expect(await financialCounts()).toEqual(before);
  await api('patch', '/admin/facility-access/' + reportGrant.id + '/revoke', 'admin', {});
  await api('get', staffTask + '/photos/' + photos[0].id, 'incidentReporter', undefined, 401);
  const newSession = await api('post', '/auth/login', undefined, { email: identity('incidentReporter') + '@foundation.test', password }, 200);
  tokens.incidentReporter = newSession.body.token;
  await denied('get', staffTask, 'incidentReporter');
  await denied('get', staffTask + '/photos/' + photos[0].id, 'incidentReporter');
  await denied('post', '/staff/maintenance', 'incidentReporter', {
    facilityId: identity('A'), commonArea: 'CORRIDOR', description: 'Báo tin sau thu hồi quyền', category: 'SECURITY', rentalImpact: 'NO_IMPACT',
  });
});

it('applies incident rental holds immediately and releases only the assessed incident scope', async () => {
  const unit = identity('A-10');
  const second = identity('A-11');
  const payload = { facilityId: identity('A'), category: 'SECURITY', description: 'Phạm vi cần đánh giá an toàn' };
  const booking = {
    productId: identity('type-A'), startDate: today(), periodMode: 'duration', durationMonths: 1, quantity: 1,
    selectedUnitIds: [unit], addonIds: [], paymentChoice: 'pay-later', paymentPlan: 'PAY_MONTHLY',
  };
  const unitMap = async (id: string) => (await api('post', '/booking/unit-map', undefined, booking, 201)).body.units
    .find((entry: { id: string }) => entry.id === id);
  const incident = async (body: object) => (await api('post', '/staff/maintenance', 'staffA2', { ...payload, ...body }, 201)).body;
  const status = async (id: string) => (await db.storageUnit.findUniqueOrThrow({ where: { id } })).status;
  const originalStatus = await status(unit);
  expect(await unitMap(unit)).toMatchObject({ available: true, bookingBlocked: false });
  await api('post', '/staff/maintenance', 'staffA2', { ...payload, commonArea: 'CORRIDOR', rentalImpact: 'UNKNOWN' }, 400);
  await api('post', '/staff/maintenance', 'staffA2', { ...payload, commonArea: 'CORRIDOR', rentalImpact: 'AFFECTED', affectedUnitIds: [identity('B-11')] }, 400);
  const firstHold = await incident({ storageUnitId: unit, rentalImpact: 'UNKNOWN' });
  expect(firstHold).toMatchObject({ blocksUnit: true, rentalImpact: 'UNKNOWN', unit: { status: originalStatus } });
  expect(await unitMap(unit)).toMatchObject({ status: originalStatus, bookingBlocked: true, available: false });
  expect((await api('post', '/booking/availability', undefined, booking, 201)).body.available).toBe(false);
  const declined = await request(app.getHttpServer()).post('/api/reservations')
    .set('Authorization', 'Bearer ' + tokens.customer).send(booking);
  expect([201, 409]).toContain(declined.status);
  expect(declined.body.status).not.toBe('CONFIRMED');
  if (declined.status === 201) {
    const record = await db.reservation.findUniqueOrThrow({ where: { reservationCode: declined.body.id } });
    expect(await db.reservationUnit.count({ where: { reservationId: record.id } })).toBe(0);
  }
  const secondHold = await incident({ commonArea: 'CORRIDOR', rentalImpact: 'AFFECTED', affectedUnitIds: [unit] });
  expect(secondHold).toMatchObject({ unit: null, commonArea: 'CORRIDOR', affectedUnits: [{ id: unit }] });
  expect(await unitMap(second)).toMatchObject({ available: true, bookingBlocked: false });
  const firstPath = '/manager/maintenance/' + firstHold.id;
  const secondPath = '/manager/maintenance/' + secondHold.id;
  await denied('patch', secondPath + '/booking-impact', 'managerB', { affectedUnitIds: [] });
  await api('patch', secondPath + '/booking-impact', 'managerA', { affectedUnitIds: [second], expectedAffectedUnitIds: [unit] });
  expect(await unitMap(second)).toMatchObject({ available: false, bookingBlocked: true });
  expect(await unitMap(unit)).toMatchObject({ available: false, bookingBlocked: true });
  await api('patch', secondPath + '/booking-impact', 'managerA', { affectedUnitIds: [unit, second], expectedAffectedUnitIds: [second] });
  await api('patch', firstPath + '/booking-impact', 'managerA', { affectedUnitIds: [], expectedAffectedUnitIds: [unit] });
  expect(await unitMap(unit)).toMatchObject({ available: false, bookingBlocked: true });
  await api('patch', secondPath + '/assign', 'managerA', { staffUserId: identity('staffA') });
  const staffPath = '/staff/maintenance/' + secondHold.id;
  await api('post', staffPath + '/start', 'staffA', {}, 201);
  await api('post', staffPath + '/complete-work', 'staffA', { workNote: 'Đã xử lý hiện trạng.' }, 201);
  await api('post', secondPath + '/reject-verification', 'managerA', { note: 'Kiểm tra lại khu vực.' }, 201);
  expect(await unitMap(unit)).toMatchObject({ available: false, bookingBlocked: true });
  await api('post', staffPath + '/complete-work', 'staffA', { workNote: 'Đã xử lý lại và kiểm tra.' }, 201);
  await api('post', secondPath + '/verify', 'managerA', {}, 201);
  expect(await unitMap(unit)).toMatchObject({ available: true, bookingBlocked: false, status: originalStatus });
  expect(await unitMap(second)).toMatchObject({ available: true, bookingBlocked: false });
  expect(await db.incidentUnitBlock.count({ where: { maintenanceRequestId: secondHold.id, releasedAt: { not: null } } })).toBeGreaterThan(1);
  const history = await db.auditEvent.findMany({ where: { resourceId: secondHold.id }, select: { action: true } });
  expect(history.map(event => event.action)).toEqual(expect.arrayContaining([
    'INCIDENT_BOOKING_SCOPE', 'TASK_ASSIGNMENT', 'INCIDENT_VERIFICATION_REJECTED', 'INCIDENT_VERIFIED',
  ]));

  const existing = await reserve('A');
  const allocationBefore = await db.reservationUnit.findFirstOrThrow({ where: { reservationId: existing.id } });
  const activeIncident = await incident({ storageUnitId: allocationBefore.storageUnitId, rentalImpact: 'AFFECTED' });
  expect(await db.reservation.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ status: 'CONFIRMED' });
  expect(await db.reservationUnit.findUniqueOrThrow({ where: { id: allocationBefore.id } })).toMatchObject({ releasedAt: null });
  await api('patch', '/manager/maintenance/' + activeIncident.id + '/booking-impact', 'managerA', { affectedUnitIds: [] });

  const start = new Date(today());
  const end = new Date(start.valueOf() + 86400000);
  let markSnapshotReady!: () => void;
  let proceedWithAllocation!: () => void;
  const ready = new Promise<void>(resolve => { markSnapshotReady = resolve; });
  const proceed = new Promise<void>(resolve => { proceedWithAllocation = resolve; });
  const staleBooking = db.$transaction(async tx => {
    await tx.storageUnit.findUniqueOrThrow({ where: { id: second } });
    markSnapshotReady();
    await proceed;
    return tx.reservationUnit.create({ data: {
      reservationId: existing.id, storageUnitId: second, plannedStartDate: start, plannedEndDate: end,
    } });
  }, { isolationLevel: 'Serializable', timeout: 15000 }).then(() => true, () => false);
  await ready;
  let raceIncident;
  try { raceIncident = await incident({ storageUnitId: second, rentalImpact: 'AFFECTED' }); }
  finally { proceedWithAllocation(); }
  expect(await staleBooking).toBe(false);
  expect(await db.reservationUnit.count({ where: { reservationId: existing.id, storageUnitId: second } })).toBe(0);
  await api('patch', '/manager/maintenance/' + raceIncident.id + '/booking-impact', 'managerA', { affectedUnitIds: [] });
});

it('rechecks a stale Customer Web quote even when no specific unit was selected', async () => {
  const productId = identity('type-B');
  const draft = {
    productId, startDate: today(), periodMode: 'duration', durationMonths: 1, quantity: 1,
    addonIds: [], paymentChoice: 'pay-later', paymentPlan: 'PAY_MONTHLY',
  };
  const check = await api('post', '/booking/availability', undefined, draft, 201);
  expect(check.body.available).toBe(true);
  const units = await db.storageUnit.findMany({ where: { storageTypeId: productId }, select: { id: true } });
  const conflict = await api('post', '/staff/maintenance', 'staffB', {
    facilityId: identity('B'), commonArea: 'ENTRANCE', rentalImpact: 'AFFECTED', affectedUnitIds: units.map(unit => unit.id),
    category: 'SECURITY', description: 'Lối vào các ô thuộc loại kho này chưa an toàn.',
  }, 201);
  const before = await db.reservationUnit.count({ where: { storageUnitId: { in: units.map(unit => unit.id) }, releasedAt: null } });
  const rejected = await request(app.getHttpServer()).post('/api/reservations')
    .set('Authorization', 'Bearer ' + tokens.customer).send(draft);
  expect([201, 409]).toContain(rejected.status);
  expect(rejected.body.status).not.toBe('CONFIRMED');
  expect(await db.reservationUnit.count({ where: { storageUnitId: { in: units.map(unit => unit.id) }, releasedAt: null } })).toBe(before);
  await api('patch', '/manager/maintenance/' + conflict.body.id + '/booking-impact', 'managerB', { affectedUnitIds: [] });
});

it('uses persisted bearer sessions and keeps the five role capabilities separate over HTTP', async () => {
  await api('get', '/manager/invoices', undefined, undefined, 401);
  await api('get', '/admin/users', 'admin');
  await api('get', '/operations/facilities', 'bom');
  await api('get', '/customer/invoices', 'customer');
  await api('get', '/staff/appointments', 'staffA');
  for (const who of ['customer', 'staffA', 'managerA', 'bom'])
    await denied('get', '/admin/users', who);
  for (const who of ['customer', 'staffA', 'managerA', 'admin'])
    await denied('get', '/operations/facilities', who);
  for (const who of ['staffA', 'managerA', 'bom', 'admin'])
    await denied('get', '/customer/invoices', who);
  for (const who of ['customer', 'managerA', 'bom', 'admin'])
    await denied('get', '/staff/appointments', who);
});

it.each([
  'reservations',
  'appointments',
  'contracts',
  'units',
  'maintenance',
  'transfers',
  'returns',
  'support-requests',
  'inquiries',
  'overstays',
])(
  'enforces Manager permissions on both canonical and legacy %s routes',
  async (resource) => {
    await api('get', '/manager/' + resource, 'managerA');
    await denied('get', '/staff/management/' + resource, 'managerA');
    for (const who of ['bom', 'admin', 'customer'])
      await denied('get', '/staff/management/' + resource, who);
  },
);

it('scopes invoice detail, documents, writes and nested IDs to trusted ownership and facility relationships', async () => {
  const a = await reserve('A'),
    b = await reserve('B');
  const invoiceA = await db.invoice.findFirstOrThrow({
      where: { reservationId: a.id },
    }),
    invoiceB = await db.invoice.findFirstOrThrow({
      where: { reservationId: b.id },
    });
  const contractA = await db.rentalContract.findFirstOrThrow({
    where: { reservationId: a.id },
  });
  await denied('get', '/manager/invoices/' + invoiceB.id, 'managerA');
  await denied('get', '/customer/invoices/' + invoiceA.id, 'other');
  await denied('get', '/manager/documents/invoices/' + invoiceB.id, 'managerA');
  await denied('get', '/customer/documents/contracts/' + contractA.id, 'other');
  await denied(
    'post',
    '/manager/invoices/' + invoiceB.id + '/payments',
    'managerA',
    { amount: 100, method: 'CASH' },
  );
  await denied(
    'get',
    '/customer/documents/contracts/' +
      contractA.id +
      '/transfers/not-a-transfer',
    'other',
  );
  expect(await db.payment.count({ where: { invoiceId: invoiceB.id } })).toBe(0);
  const list = await api(
    'get',
    '/manager/invoices?search=' + b.reservationCode,
    'managerA',
  );
  expect(list.body.items).toHaveLength(0);
  const pdf = await api(
    'get',
    '/customer/documents/invoices/' + invoiceA.id,
    'customer',
  );
  expect(pdf.headers['content-type']).toContain('application/pdf');
});

it('runs booking, OTP signing, bank verification, task reassignment and physical handover through HTTP', async () => {
  const r = await reserve('A', 2),
    invoice = await db.invoice.findFirstOrThrow({
      where: { reservationId: r.id },
    });
  expect(
    await db.rentalContract.count({ where: { reservationId: r.id } }),
  ).toBe(2);
  await api(
    'post',
    '/manager/invoices/' + invoice.id + '/payments',
    'managerA',
    { amount: 100, method: 'CASH' },
    409,
  );
  await sign(r.id);
  const notice = await api(
    'post',
    '/customer/invoices/' + invoice.id + '/payment-submissions',
    'customer',
    { amount: Number(invoice.totalAmount), transferReference: 'HTTP-NOTICE' },
    201,
  );
  expect(
    (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
      .amountPaid,
  ).toBe(0n);
  await denied(
    'post',
    '/manager/payment-submissions/' + notice.body.id + '/verify',
    'managerB',
    { reference: 'HTTP-BANK-' + key() },
  );
  await api(
    'post',
    '/manager/payment-submissions/' + notice.body.id + '/verify',
    'managerA',
    { reference: 'HTTP-BANK-' + key() },
    201,
  );
  const appointment = await api(
    'post',
    '/customer/appointments',
    'customer',
    {
      reservationId: r.id,
      scheduledAt: new Date(Date.now() + 60000).toISOString(),
    },
    201,
  );
  const id = appointment.body.id;
  expect(appointment.body).toMatchObject({ status: 'REQUESTED', schedulePendingManager: true });
  await denied('patch', '/manager/appointments/' + id + '/schedule', 'managerB', {
    action: 'CONFIRM_EXCEPTION', expectedScheduledAt: appointment.body.scheduledAt, note: 'Check wrong facility',
  });
  await api('patch', '/manager/appointments/' + id + '/schedule', 'managerA', {
    action: 'CONFIRM_EXCEPTION', expectedScheduledAt: appointment.body.scheduledAt, note: 'Staff coverage confirmed for this request.',
  });
  await denied(
    'patch',
    '/staff/management/appointments/' + id + '/assign',
    'managerB',
    { staffUserId: identity('staffB'), expectedAssignedStaffUserId: null },
  );
  await api('patch', '/manager/appointments/' + id + '/assign', 'managerA', {
    staffUserId: identity('staffA'),
    expectedAssignedStaffUserId: null,
  });
  await denied(
    'patch',
    '/staff/management/appointments/' + id + '/assign',
    'managerA',
    {
      staffUserId: identity('staffA2'),
      expectedAssignedStaffUserId: identity('staffA'),
    },
  );
  await api('patch', '/manager/appointments/' + id + '/assign', 'managerA', {
    staffUserId: identity('staffA2'),
    expectedAssignedStaffUserId: identity('staffA'),
  });
  await denied(
    'post',
    '/staff/appointments/' + id + '/complete-handover',
    'staffA',
    {},
  );
  const units = await db.reservationUnit.findMany({
    where: { reservationId: r.id },
  });
  const handoverHold = (await api('post', '/staff/maintenance', 'staffA2', {
    facilityId: identity('A'), commonArea: 'CORRIDOR', rentalImpact: 'AFFECTED',
    affectedUnitIds: [units[0].storageUnitId], category: 'SECURITY', description: 'Lối vào ô kho chưa an toàn.',
  }, 201)).body;
  const issuePath = '/manager/maintenance/' + handoverHold.id;
  const managerWarning = (await api('get', issuePath, 'managerA')).body;
  expect(managerWarning.affectedBookings).toEqual([expect.objectContaining({
    reservationId: r.id, reservationReference: r.reservationCode,
    unitCodes: [expect.any(String)], appointments: [expect.objectContaining({ id, status: 'CONFIRMED' })],
  })]);
  const managerList = (await api('get', '/manager/maintenance?search=' + handoverHold.maintenanceCode, 'managerA')).body.items;
  expect(managerList).toEqual([expect.objectContaining({ id: handoverHold.id, affectedBookingCount: 1, affectedAppointmentCount: 1 })]);
  const noticeQuery = '/notifications?kind=maintenance&scopeFacilityId=' + identity('A');
  const managerNotices = (await api('get', noticeQuery, 'managerA')).body.items;
  expect(managerNotices).toEqual(expect.arrayContaining([expect.objectContaining({
    title: 'Sự cố · Có hồ sơ thuê bị ảnh hưởng',
    summary: expect.stringContaining('1 đơn đặt · 1 lịch bàn giao'), important: true,
  })]));
  const foreignNotices = (await api('get', '/notifications?kind=maintenance&scopeFacilityId=' + identity('B'), 'managerB')).body.items;
  expect(foreignNotices).not.toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Sự cố · Có hồ sơ thuê bị ảnh hưởng' })]));
  await denied('get', issuePath, 'managerB');
  await denied('post', issuePath + '/hold-unsafe-unit', 'managerB');
  await denied('patch', issuePath + '/booking-impact', 'managerB', { affectedUnitIds: [] });
  await denied('patch', issuePath + '/booking-impact', 'staffA2', { affectedUnitIds: [] });
  await denied('post', '/staff/maintenance/' + handoverHold.id + '/start', 'staffB');
  await denied('post', issuePath + '/verify', 'managerB');
  await api('patch', issuePath + '/booking-impact', 'managerA', { affectedUnitIds: [identity('B-0')] }, 400);
  const reportInput = {
    handoverReport: {
      condition: 'Kho sạch và sử dụng tốt', accessItemCount: 2, identityVerified: true, unitInspected: true, accessDelivered: true,
      unitChecks: units.map((u) => ({ unitId: u.storageUnitId, condition: 'Sử dụng tốt', inspected: true })),
    },
  };
  const rejectedHandover = await api('post', '/staff/appointments/' + id + '/complete-handover', 'staffA2', reportInput, 409);
  expect(rejectedHandover.body.message).toContain('chờ xử lý bảo trì');
  const rejectedUnit = await api('patch', '/staff/appointments/' + id + '/units/' + units[0].storageUnitId + '/handover',
    'staffA2', { condition: 'Đã kiểm tra kho', inspected: true, identityVerified: true, accessDelivered: true }, 409);
  expect(rejectedUnit.body.message).toContain('chờ xử lý bảo trì');
  expect(await db.handoverAppointment.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'CONFIRMED', completedAt: null });
  expect(await db.rentalContract.count({ where: { reservationId: r.id, status: 'ACTIVE' } })).toBe(0);
  await api('patch', issuePath + '/booking-impact', 'managerA', { affectedUnitIds: [] });
  await api(
    'post',
    '/staff/appointments/' + id + '/complete-handover',
    'staffA2',
    {
      handoverReport: {
        condition: 'Kho sạch và sử dụng tốt',
        accessItemCount: 2,
        identityVerified: true,
        unitInspected: true,
        accessDelivered: true,
        unitChecks: units.map((u) => ({
          unitId: u.storageUnitId,
          condition: 'Sử dụng tốt',
          inspected: true,
        })),
      },
    },
    201,
  );
  expect(
    await db.rentalContract.count({
      where: { reservationId: r.id, status: 'ACTIVE' },
    }),
  ).toBe(2);
  await denied('get', '/staff/appointments/' + id, 'staffB');

  const contract = await db.rentalContract.findFirstOrThrow({ where: { reservationId: r.id, status: 'ACTIVE' } });
  const support = await api('post', '/customer/support-requests', 'customer', {
    reservationId: r.id, category: 'OTHER', subject: 'Cần hướng dẫn tại cơ sở', description: 'Khách cần hỗ trợ sử dụng kho.',
  }, 201);
  const supportId = support.body.id;
  const assignSupport = '/manager/support-requests/' + supportId + '/assign';
  const staffSupport = '/staff/support-requests/' + supportId;
  await api('patch', assignSupport, 'managerA', { staffUserId: identity('staffA'), expectedAssignedStaffUserId: null });
  await api('post', staffSupport + '/start', 'staffA', {}, 201);
  await api('post', staffSupport + '/escalate', 'staffA', { reason: 'Cần quản lý xác minh.' }, 201);
  await denied('patch', assignSupport, 'managerA', { staffUserId: identity('staffB'), expectedAssignedStaffUserId: identity('staffA') });
  const reassigned = await api('patch', assignSupport, 'managerA', { staffUserId: identity('staffA2'), expectedAssignedStaffUserId: identity('staffA') });
  expect(reassigned.body.status).toBe('ASSIGNED');
  expect(reassigned.body.escalationReason).toBe('Cần quản lý xác minh.');
  const audit = await db.auditEvent.findFirstOrThrow({ where: {
    action: 'TASK_ASSIGNMENT', resourceId: supportId, metadata: { path: ['nextStatus'], equals: 'ASSIGNED' },
  } });
  expect(audit.metadata).toMatchObject({ previousStaffUserId: identity('staffA'), assignedStaffUserId: identity('staffA2'),
    escalationReason: 'Cần quản lý xác minh.' });
  await api('patch', assignSupport, 'managerA2', { staffUserId: identity('staffA'), expectedAssignedStaffUserId: identity('staffA') }, 409);
  await denied('post', staffSupport + '/start', 'staffA', {});
  await api('post', staffSupport + '/start', 'staffA2', {}, 201);
  await api('post', staffSupport + '/resolve', 'staffA2', { resolutionType: 'CUSTOMER_GUIDANCE', resolutionNote: 'Đã hướng dẫn khách.' }, 201);

  const destination = await db.storageUnit.findFirstOrThrow({
    where: { storageTypeId: identity('type-A'), status: 'AVAILABLE', reservationUnits: { none: { releasedAt: null } } },
    orderBy: { id: 'asc' },
  });
  let cancelledHistory: { transferId: string; allocationId: string; releasedAt: Date } | undefined;
  for (const decision of ['CANCEL', 'CONTINUE']) {
    const request = await api('post', '/customer/support-requests', 'customer', {
      reservationId: r.id, rentalContractId: contract.id, category: 'OTHER', subject: 'Yêu cầu chuyển kho',
      description: 'Khách muốn chuyển sang một ô cùng loại.',
    }, 201);
    const transfer = await db.transferRequest.findFirstOrThrow({ where: { supportRequestId: request.body.id } });
    const unitId = destination.id;
    const managerPath = '/manager/transfers/' + transfer.id;
    const staffPath = '/staff/transfers/' + transfer.id;
    const eligible = await api('get', managerPath + '/destinations?limit=100', 'managerA');
    expect(eligible.body.items.find((item: { id: string }) => item.id === unitId).eligible).toBe(true);
    if (decision === 'CANCEL') {
      const blockedDestination = (await api('post', '/staff/maintenance', 'staffA2', {
        storageUnitId: unitId, rentalImpact: 'AFFECTED', category: 'SECURITY', description: 'Ô đích chưa an toàn.',
      }, 201)).body;
      const blocked = (await api('get', managerPath + '/destinations?limit=100', 'managerA')).body.items.find((item: { id: string }) => item.id === unitId);
      expect(blocked).toMatchObject({ eligible: false, unavailableReason: expect.stringContaining('sự cố') });
      const rejected = await api('post', managerPath + '/approve', 'managerA', { toStorageUnitId: unitId, staffUserId: identity('staffA2') }, 409);
      expect(rejected.body.message).toContain('sự cố');
      await api('patch', '/manager/maintenance/' + blockedDestination.id + '/booking-impact', 'managerA', { affectedUnitIds: [] });
    }
    await api('post', managerPath + '/approve', 'managerA', { toStorageUnitId: unitId, staffUserId: identity('staffA2') }, 201);
    await api('post', staffPath + '/problem', 'staffA2', { note: 'Cần kiểm tra cửa kho đích.' }, 201);
    const queue = await api('get', '/manager/transfers?reviewQueue=true', 'managerA');
    expect(queue.body.items.map((item: { id: string }) => item.id)).toContain(transfer.id);
    const foreignQueue = await api('get', '/manager/transfers?reviewQueue=true', 'managerB');
    expect(foreignQueue.body.items.map((item: { id: string }) => item.id)).not.toContain(transfer.id);
    await api('post', staffPath + '/complete', 'staffA2', {}, 409);
    const review = { decision, note: 'Quản lý đã kiểm tra hiện trường.', expectedProblemCount: 1 };
    await denied('post', managerPath + '/review-problem', 'managerB', review);
    await api('post', managerPath + '/review-problem', 'managerA', review, 201);
    await api('post', managerPath + '/review-problem', 'managerA', review, 201);
    const observed = await api('get', staffPath, 'staffA2');
    expect(observed.body.handoverReport.problemReview.decision).toBe(decision);
    if (decision === 'CANCEL') {
      expect(observed.body.status).toBe('REJECTED');
      expect((await db.storageUnit.findUniqueOrThrow({ where: { id: unitId } })).status).toBe('AVAILABLE');
      expect((await db.rentalContract.findUniqueOrThrow({ where: { id: contract.id } })).reservationUnitId).toBe(contract.reservationUnitId);
      const cancelled = await db.transferRequest.findUniqueOrThrow({ where: { id: transfer.id } });
      const allocation = await db.reservationUnit.findUniqueOrThrow({ where: { id: cancelled.toReservationUnitId! } });
      expect(allocation.releasedAt).toBeInstanceOf(Date);
      cancelledHistory = { transferId: cancelled.id, allocationId: allocation.id, releasedAt: allocation.releasedAt! };
    } else {
      const incident = await api('post', '/staff/maintenance', 'staffA2', {
        storageUnitId: unitId, category: 'LOCK_OR_ACCESS', description: 'Cần sửa khóa kho đích đang giữ.',
      }, 201);
      const issueId = incident.body.id;
      const blockedTransfer = await api('post', staffPath + '/complete', 'staffA2', {
        recipientName: 'HTTP customer', returnedKeyCount: 1, deliveredKeyCount: 1,
        destinationReady: true, goodsMoved: true, oldKeysReturned: true, newKeysDelivered: true,
      }, 409);
      expect(blockedTransfer.body.message).toContain('bảo trì');
      expect(await db.transferRequest.findUniqueOrThrow({ where: { id: transfer.id } })).toMatchObject({ status: 'APPROVED', completedAt: null });
      expect(await db.rentalContract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({ reservationUnitId: contract.reservationUnitId });
      const issuePath = '/staff/maintenance/' + issueId;
      await api('patch', '/manager/maintenance/' + issueId + '/assign', 'managerA', {
        staffUserId: identity('staffA'), expectedAssignedStaffUserId: null,
      });
      const reporterView = await api('get', '/staff/maintenance/reported-by-me', 'staffA2');
      expect(reporterView.body.items.find((item: { id: string }) => item.id === issueId).assignedStaff.fullName).toBe('HTTP staffA');
      await denied('post', issuePath + '/start', 'staffA2', {});
      await api('post', issuePath + '/start', 'staffA', {}, 201);
      const result = { workNote: 'Đã sửa khóa và kiểm tra lại.' };
      await api('post', issuePath + '/complete-work', 'staffA', result, 201);
      const rework = await api('post', '/manager/maintenance/' + issueId + '/reject-verification', 'managerA', { note: 'Kiểm tra thêm khóa dự phòng.' }, 201);
      expect(rework.body.status).toBe('IN_PROGRESS');
      await api('post', issuePath + '/complete-work', 'staffA', result, 201);
      await api('post', '/manager/maintenance/' + issueId + '/verify', 'managerA', {}, 201);
      expect((await db.storageUnit.findUniqueOrThrow({ where: { id: unitId } })).status).toBe('RESERVED');
      await api('post', staffPath + '/complete', 'staffA2', {
        recipientName: 'HTTP customer', returnedKeyCount: 1, deliveredKeyCount: 1,
        destinationReady: true, goodsMoved: true, oldKeysReturned: true, newKeysDelivered: true,
      }, 201);
      expect((await db.storageUnit.findUniqueOrThrow({ where: { id: unitId } })).status).toBe('OCCUPIED');
      expect(cancelledHistory).toBeDefined();
      const history = cancelledHistory!;
      expect(await db.transferRequest.findUniqueOrThrow({ where: { id: history.transferId } })).toMatchObject({
        status: 'REJECTED', toStorageUnitId: unitId, toReservationUnitId: history.allocationId,
        handoverReport: { problemReview: { decision: 'CANCEL' } },
      });
      expect(await db.reservationUnit.findUniqueOrThrow({ where: { id: history.allocationId } })).toMatchObject({ releasedAt: history.releasedAt });
      const allocations = await db.reservationUnit.findMany({ where: { reservationId: r.id, storageUnitId: unitId } });
      expect(allocations).toHaveLength(2);
      expect(allocations.filter(item => item.releasedAt === null)).toHaveLength(1);
    }
  }

  const otherBooking = await reserve();
  const occupiedByBooking = await db.reservationUnit.findFirstOrThrow({ where: { reservationId: otherBooking.id, releasedAt: null } });
  const target = await db.storageUnit.findFirstOrThrow({ where: {
    storageTypeId: identity('type-A'), status: 'AVAILABLE', reservationUnits: { none: { releasedAt: null } },
  } });
  const contracts = await db.rentalContract.findMany({ where: { reservationId: r.id, status: 'ACTIVE' } });
  expect(contracts).toHaveLength(2);
  const contenders = [];
  for (const rental of contracts) {
    const requested = await api('post', '/customer/support-requests', 'customer', {
      reservationId: r.id, rentalContractId: rental.id, category: 'OTHER', subject: 'Yêu cầu chuyển kho',
      description: 'Khách đề nghị một ô cùng loại.',
    }, 201);
    contenders.push(await db.transferRequest.findFirstOrThrow({ where: { supportRequestId: requested.body.id } }));
  }
  const path = (id: string) => '/manager/transfers/' + id + '/approve';
  await api('post', path(contenders[0].id), 'managerA', { toStorageUnitId: occupiedByBooking.storageUnitId, staffUserId: identity('staffA') }, 409);
  expect(await db.reservationUnit.findUniqueOrThrow({ where: { id: occupiedByBooking.id } })).toMatchObject({ releasedAt: null });
  const approvals = await Promise.all(contenders.map((transfer, index) => request(app.getHttpServer())
    .post('/api' + path(transfer.id))
    .set('Authorization', 'Bearer ' + tokens[index ? 'managerA2' : 'managerA'])
    .set('Idempotency-Key', key())
    .send({ toStorageUnitId: target.id, staffUserId: identity(index ? 'staffA2' : 'staffA') })));
  expect(approvals.map(result => result.status).sort()).toEqual([201, 409]);
  const held = await db.reservationUnit.findMany({ where: { storageUnitId: target.id, releasedAt: null } });
  expect(held).toHaveLength(1);
  expect(await db.transferRequest.count({ where: {
    id: { in: contenders.map(transfer => transfer.id) }, status: 'APPROVED', toReservationUnitId: held[0].id,
  } })).toBe(1);
});

it('blocks appointment changes before readiness and supports Manager rescheduling and no-show', async () => {
  const reservation = await reserve();
  const oldSchedule = new Date(Date.now() + 60_000);
  const appointment = await db.handoverAppointment.create({ data: {
    appointmentCode: 'HTTP-BLOCKED-' + key(), reservationId: reservation.id, scheduledAt: oldSchedule,
    requestedByUserId: identity('customer'), status: 'CONFIRMED', activeKey: 'HANDOVER:' + reservation.id, idempotencyKey: key(),
  } });
  const detail = '/manager/appointments/' + appointment.id;
  const endpoint = detail + '/schedule';
  const requested = new Date(Date.now() + 180_000).toISOString();
  const change = { action: 'RESCHEDULE', expectedScheduledAt: oldSchedule.toISOString(), scheduledAt: requested, note: 'Khách đổi giờ nhận kho.' };
  const blocked = await api('get', detail, 'managerA');
  expect(blocked.body.handoverReadiness.allowed).toBe(false);
  expect(blocked.body.bookingBlockReason).toMatch(/hóa đơn/i);
  await denied('patch', endpoint, 'managerB', change);
  await denied('patch', endpoint, 'staffA', change);
  await api('patch', endpoint, 'managerA', change, 409);
  await api('patch', endpoint, 'managerA', { ...change, action: 'NO_SHOW' }, 409);
  await sign(reservation.id);
  const invoice = await db.invoice.findFirstOrThrow({ where: { reservationId: reservation.id, type: 'INITIAL' } });
  await api('post', '/manager/invoices/' + invoice.id + '/payments', 'managerA', { amount: Number(invoice.totalAmount), method: 'CASH' }, 201);
  const changed = await api('patch', endpoint, 'managerA', change);
  expect(changed.body.scheduledAt).toBe(requested);
  await api('patch', endpoint, 'managerA', change, 409);
  const passed = new Date(Date.now() - 60_000);
  await db.handoverAppointment.update({ where: { id: appointment.id }, data: { scheduledAt: passed } });
  const cancelled = await api('patch', endpoint, 'managerA', {
    action: 'NO_SHOW', expectedScheduledAt: passed.toISOString(), note: 'Khách không đến sau giờ hẹn.',
  });
  expect(cancelled.body.status).toBe('CANCELLED');
  expect(cancelled.body.scheduleAdjustment.action).toBe('NO_SHOW');
  expect((await db.handoverAppointment.findUniqueOrThrow({ where: { id: appointment.id } })).activeKey).toBeNull();
  expect((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('PAID');
});

it('allows only authorized Staff to report facility issues and prevents execution until assigned', async () => {
  const unit = await db.storageUnit.findFirstOrThrow({
    where: {
      storageTypeId: identity('type-B'),
      status: 'AVAILABLE',
      reservationUnits: { none: { releasedAt: null } },
    },
  });
  const input = {
    storageUnitId: unit.id,
    category: 'LOCK_OR_ACCESS',
    rentalImpact: 'NO_IMPACT',
    description: 'Cửa bị kẹt, cần kiểm tra khóa.',
  };
  await denied('post', '/staff/maintenance', 'staffA', input);
  const issue = await api('post', '/staff/maintenance', 'staffB', input, 201);
  const reports = await api('get', '/staff/maintenance/reported-by-me', 'staffB');
  expect(reports.body.items.map((item: { id: string }) => item.id)).toContain(issue.body.id);
  const otherReports = await api('get', '/staff/maintenance/reported-by-me', 'staffA');
  expect(otherReports.body.items.map((item: { id: string }) => item.id)).not.toContain(issue.body.id);
  await denied(
    'post',
    '/staff/maintenance/' + issue.body.id + '/start',
    'staffB',
  );
  await denied(
    'get',
    '/staff/management/maintenance/' + issue.body.id,
    'managerA',
  );
  const assign = '/manager/maintenance/' + issue.body.id + '/assign';
  const release = '/manager/assignments/maintenance/' + issue.body.id + '/release';
  const expected = identity('staffB');
  await api('patch', assign, 'managerB', { staffUserId: expected, expectedAssignedStaffUserId: null });
  await denied('patch', release, 'managerA', { expectedAssignedStaffUserId: expected, reason: 'Outside scope.' });
  await api('patch', release, 'managerB', { expectedAssignedStaffUserId: expected, reason: 'Ca làm thay đổi.' });
  await denied('post', '/staff/maintenance/' + issue.body.id + '/start', 'staffB');
  await api('patch', release, 'managerB', { expectedAssignedStaffUserId: expected, reason: 'Stale retry.' }, 409);
  expect(await db.auditEvent.count({ where: { resourceId: issue.body.id, action: 'TASK_ASSIGNMENT' } })).toBe(2);
  expect(
    (
      await db.maintenanceRequest.findUniqueOrThrow({
        where: { id: issue.body.id },
      })
    ).assignedStaffUserId,
  ).toBeNull();
});

it('revokes existing sessions when facility access is removed and never grants operational rights to Admin/BOM', async () => {
  const grant = await db.facilityAccess.findFirstOrThrow({
    where: {
      userId: identity('staffB'),
      facilityId: identity('B'),
      revokedAt: null,
    },
  });
  await api(
    'patch',
    '/admin/facility-access/' + grant.id + '/revoke',
    'admin',
    {},
  );
  await api('get', '/staff/appointments', 'staffB', undefined, 401);
  for (const path of [
    '/manager/payment-reconciliations',
    '/manager/online-payment-reconciliations',
    '/manager/reports/invoices.csv',
    '/manager/staff',
  ])
    for (const who of ['admin', 'bom']) await denied('get', path, who);
});

it('keeps analytics cashflow, units, queues and staff workload inside the Manager facility', async () => {
  for (const f of ['A', 'B']) {
    const report = await api(
      'get',
      '/manager/dashboard/analytics',
      'manager' + f,
    );
    const count = await db.storageUnit.count({
      where: { storageType: { facilityId: identity(f) } },
    });
    const receipts = await db.payment.aggregate({
      where: { invoice: { reservation: { facilityId: identity(f) } } },
      _sum: { amount: true },
    });
    expect(report.body.units.total).toBe(count);
    expect(report.body.finance.collectedAmount).toBe(
      Number(receipts._sum.amount ?? 0n),
    );
    expect(
      report.body.workload.map((s: { id: string }) => s.id).sort(),
    ).toEqual(f === 'A' ? [identity('staffA'), identity('staffA2')] : [identity('incidentReporter')]);
  }
  for (const who of ['staffA', 'bom', 'admin'])
    await denied('get', '/manager/dashboard/analytics', who);
});

it('enforces BOM pricing boundaries and pauses only new bookings without changing signed rentals', async () => {
  const contract = await db.rentalContract.findFirstOrThrow({
    where: {
      status: 'ACTIVE',
      reservation: {
        facilityId: identity('A'),
        customerId: identity('customer'),
      },
    },
  });
  const before = contract.signedSnapshot;
  await api(
    'post',
    '/operations/pricing-rules',
    'bom',
    {
      facilityId: identity('A'),
      sizeId: 'small',
      min: 1000000,
      max: 2000000,
      effectiveFrom: new Date(Date.now() + 60_000).toISOString(),
      expectedVersion: 1,
    },
    201,
  );
  const type = await db.storageType.findUniqueOrThrow({
    where: { id: identity('type-A') },
  });
  await api(
    'patch',
    '/manager/storage-types/' + type.id,
    'managerA',
    { monthlyRate: 2500000, expectedUpdatedAt: type.updatedAt.toISOString() },
    400,
  );
  await denied('patch', '/manager/storage-types/' + type.id, 'managerB', {
    monthlyRate: 1700000,
    expectedUpdatedAt: type.updatedAt.toISOString(),
  });
  await api('patch', '/manager/storage-types/' + type.id, 'managerA', {
    monthlyRate: 1700000,
    expectedUpdatedAt: type.updatedAt.toISOString(),
  });
  expect(
    (await db.rentalContract.findUniqueOrThrow({ where: { id: contract.id } }))
      .signedSnapshot,
  ).toEqual(before);
  const facility = await db.facility.findUniqueOrThrow({
    where: { id: identity('A') },
  });
  await api('patch', '/operations/facilities/' + facility.id, 'bom', {
    bookingEnabled: false,
    expectedUpdatedAt: facility.updatedAt.toISOString(),
  });
  await api(
    'post',
    '/reservations',
    'customer',
    {
      productId: type.id,
      startDate: today(),
      periodMode: 'duration',
      durationMonths: 1,
      quantity: 1,
      adjacencyPreference: false,
      addonIds: [],
      paymentChoice: 'pay-later',
      paymentPlan: 'PAY_MONTHLY',
    },
    409,
  );
  await api('get', '/customer/contracts/' + contract.id, 'customer');
  expect(
    (await db.rentalContract.findUniqueOrThrow({ where: { id: contract.id } }))
      .status,
  ).toBe('ACTIVE');
});

it('verifies and claims Guest bookings through the real email-token and ownership flow', async () => {
  const end = new Date(businessToday());
  end.setUTCMonth(end.getUTCMonth() + 1);
  const response = await api(
    'post',
    '/guest/booking-requests',
    undefined,
    {
      storageTypeId: identity('type-B'),
      startDate: today(),
      endDate: end.toISOString().slice(0, 10),
      quantity: 1,
      paymentPlan: 'PAY_MONTHLY',
      fullName: 'HTTP customer',
      email: 'http-customer@foundation.test',
      phone: '0900000011',
      services: [],
    },
    201,
  );
  const mail = guestMail['http-customer@foundation.test'];
  expect(mail).toBeDefined();
  await api(
    'post',
    '/guest/booking-requests/verify',
    undefined,
    { token: mail.claimToken },
    201,
  );
  await denied(
    'post',
    '/customer/booking-requests/' + mail.bookingCode + '/claim',
    'other',
    {},
  );
  const claimed = await api(
    'post',
    '/customer/booking-requests/' + mail.bookingCode + '/claim',
    'customer',
    {},
    201,
  );
  expect(claimed.body.status).toBe('CLAIMED');
  const booking = await db.guestBookingRequest.findUniqueOrThrow({
    where: { bookingCode: mail.bookingCode },
  });
  expect(booking.reservationId).not.toBeNull();
  expect(
    await db.rentalContract.count({
      where: { reservationId: booking.reservationId! },
    }),
  ).toBe(1);
  expect(
    await db.invoice.count({
      where: { reservationId: booking.reservationId!, type: 'INITIAL' },
    }),
  ).toBe(1);
  await api(
    'post',
    '/guest/booking-requests/verify',
    undefined,
    { token: mail.claimToken },
    409,
  );
  expect(response.body).not.toHaveProperty('claimToken');
});

it('requires assigned Staff work and Manager verification before maintenance releases a unit', async () => {
  await api(
    'post',
    '/admin/facility-access',
    'admin',
    { userId: identity('staffB'), facilityId: identity('B') },
    201,
  );
  const login = await api(
    'post',
    '/auth/login',
    undefined,
    { email: 'http-staffb@foundation.test', password },
    200,
  );
  tokens.staffB = login.body.token;
  const issue = await db.maintenanceRequest.findFirstOrThrow({
    where: {
      storageUnit: { storageType: { facilityId: identity('B') } },
      status: 'OPEN',
      assignedStaffUserId: null,
    },
  });
  if (!issue.storageUnitId) throw new Error('Expected a unit incident fixture.');
  expect((await db.storageUnit.findUniqueOrThrow({ where: { id: issue.storageUnitId } })).status).toBe('AVAILABLE');
  await denied('post', '/manager/maintenance/' + issue.id + '/hold-unsafe-unit', 'managerA');
  const held = await api('post', '/manager/maintenance/' + issue.id + '/hold-unsafe-unit', 'managerB', {}, 201);
  expect(held.body).toMatchObject({ blocksUnit: true, unit: { status: 'AVAILABLE' } });
  await api(
    'patch',
    '/manager/maintenance/' + issue.id + '/assign',
    'managerB',
    { staffUserId: identity('staffB') },
  );
  await api(
    'post',
    '/staff/maintenance/' + issue.id + '/start',
    'staffB',
    {},
    201,
  );
  await api(
    'post',
    '/staff/maintenance/' + issue.id + '/complete-work',
    'staffB',
    { workNote: 'Đã sửa khóa, kiểm tra đóng mở bình thường.' },
    201,
  );
  expect(
    (
      await db.storageUnit.findUniqueOrThrow({
        where: { id: issue.storageUnitId },
      })
    ).status,
  ).toBe('AVAILABLE');
  expect(await db.incidentUnitBlock.count({ where: { maintenanceRequestId: issue.id, releasedAt: null } })).toBe(1);
  await denied(
    'post',
    '/manager/maintenance/' + issue.id + '/verify',
    'managerA',
    { note: 'Kiểm tra ngoài cơ sở' },
  );
  await api(
    'post',
    '/manager/maintenance/' + issue.id + '/verify',
    'managerB',
    { note: 'Đã nghiệm thu hiện trạng và khóa.' },
    201,
  );
  expect(await db.incidentUnitBlock.count({ where: { maintenanceRequestId: issue.id, releasedAt: null } })).toBe(0);
  expect(
    (
      await db.storageUnit.findUniqueOrThrow({
        where: { id: issue.storageUnitId },
      })
    ).status,
  ).toBe('AVAILABLE');
});

it('keeps early key handover distinct from activation until the rental start date', async () => {
  const policies = await api('get', '/operations/business-policies', 'bom');
  const lead = policies.body.items.find(
    (x: { key: string }) => x.key === 'handoverLeadDays',
  );
  await api('patch', '/operations/business-policies/handoverLeadDays', 'bom', {
    value: 3,
    expectedUpdatedAt: lead.updatedAt,
  });
  const products = await Promise.all(['HT-BOX', 'HT-TAPE'].map(async code => {
    const product = (await api('post', '/operations/additional-services', 'bom', {
      code, name: code, kind: 'PURCHASE', billingUnit: 'ONE_TIME', physicalUnit: 'cái', isActive: true,
    }, 201)).body;
    await api('post', '/manager/additional-services/' + product.id + '/offerings', 'managerB', {
      facilityId: identity('B'), unitPrice: 1000, stockOnHand: 13, isActive: true,
    }, 201);
    return product;
  }));
  const inventory = async (product = products[0]) => (await api('get',
    '/manager/additional-services/' + product.id + '/inventory?facilityId=' + identity('B'), 'managerB')).body;
  const start = new Date(businessToday().getTime() + 2 * 86400000),
    r = await reserve('B', 2, start.toISOString().slice(0, 10), products.map(product => ({ serviceId: product.id, quantity: 3 })));
  expect(await inventory()).toMatchObject({ stockOnHand: 13, reservedQuantity: 3, availableQuantity: 10, soldByUnit: [] });
  const lines = await db.reservationService.findMany({ where: { reservationId: r.id } });
  const [first, second] = products.map(product => lines.find(line => line.additionalServiceId === product.id)!);
  await sign(r.id);
  const invoice = await db.invoice.findFirstOrThrow({
    where: { reservationId: r.id },
  });
  await api(
    'post',
    '/manager/invoices/' + invoice.id + '/payments',
    'managerB',
    { amount: Number(invoice.totalAmount), method: 'CASH' },
    201,
  );
  expect(await inventory()).toMatchObject({ stockOnHand: 13, reservedQuantity: 3, soldByUnit: [] });
  const appt = await api(
    'post',
    '/customer/appointments',
    'customer',
    {
      reservationId: r.id,
      scheduledAt: new Date(Date.now() + 60000).toISOString(),
    },
    201,
  );
  await api('patch', '/manager/appointments/' + appt.body.id + '/schedule', 'managerB', {
    action: 'CONFIRM_EXCEPTION', expectedScheduledAt: appt.body.scheduledAt, note: 'Staff coverage confirmed for this request.',
  });
  await api(
    'patch',
    '/manager/appointments/' + appt.body.id + '/assign',
    'managerB',
    { staffUserId: identity('staffB'), expectedAssignedStaffUserId: null },
  );
  const units = await db.reservationUnit.findMany({ where: { reservationId: r.id } });
  const path = '/staff/appointments/' + appt.body.id + '/complete-handover';
  await api(
    'post',
    path,
    'staffB',
    {
      deliveredPurchaseIds: [first.id],
      handoverReport: {
        condition: 'Kho sạch',
        accessItemCount: 1,
        identityVerified: true,
        unitInspected: true,
        accessDelivered: true,
        unitChecks: units.map(unit => ({ unitId: unit.storageUnitId, condition: 'Tốt', inspected: true })),
      },
    },
    201,
  );
  expect(await inventory()).toMatchObject({ stockOnHand: 10, reservedQuantity: 0, soldByUnit: [{ unit: 'cái', quantity: 3 }] });
  expect(await inventory(products[1])).toMatchObject({ stockOnHand: 13, reservedQuantity: 3, soldByUnit: [] });
  await denied('post', path, 'staffA', { deliveredPurchaseIds: [second.id] });
  await api('post', path, 'staffB', { deliveredPurchaseIds: [first.id] }, 201);
  expect(await inventory()).toMatchObject({ stockOnHand: 10, soldByUnit: [{ unit: 'cái', quantity: 3 }] });
  await api('patch', '/manager/additional-services/' + products[0].id + '/inventory', 'managerB', { stockOnHand: 20 });
  expect(await inventory()).toMatchObject({ stockOnHand: 20, soldByUnit: [{ unit: 'cái', quantity: 3 }] });
  await denied('get', '/manager/additional-services/' + products[0].id + '/inventory?facilityId=' + identity('B'), 'managerA');
  const scheduler = app.get(AppointmentsService);
  await scheduler.activateDueHandovers();
  expect(
    await db.rentalContract.count({
      where: { reservationId: r.id, status: 'ACTIVE' },
    }),
  ).toBe(0);
  try {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(start.getTime() + 3600000));
    await scheduler.activateDueHandovers();
  } finally {
    vi.useRealTimers();
  }
  expect(
    await db.rentalContract.count({
      where: { reservationId: r.id, status: 'ACTIVE' },
    }),
  ).toBe(2);
  expect(await inventory(products[1])).toMatchObject({ stockOnHand: 13, reservedQuantity: 3, soldByUnit: [] });
  await api('post', path, 'staffB', { deliveredPurchaseIds: [second.id] }, 201);
  expect(await inventory(products[1])).toMatchObject({ stockOnHand: 10, reservedQuantity: 0, soldByUnit: [{ unit: 'cái', quantity: 3 }] });
});


it('creates facility offerings with category-specific quantities and a catalog version header', async () => {
  const facilityId = identity('A');
  await db.facility.update({ where: { id: facilityId }, data: { bookingEnabled: true, operationalStatus: 'OPEN' } });
  const scope = '?scopeFacilityId=' + facilityId;
  const catalog = '/operations/additional-services';
  const createShared = async (code: string, name: string, kind: 'PURCHASE' | 'RENTAL', billingUnit: 'ONE_TIME' | 'DAY', physicalUnit: string) =>
    (await api('post', catalog, 'bom', { code, name, kind, billingUnit, physicalUnit, isActive: true }, 201)).body;
  const box = await createShared('BOX-S', 'Thùng carton nhỏ', 'PURCHASE', 'ONE_TIME', 'thùng');
  const dolly = await createShared('DOLLY-HTTP', 'Xe đẩy', 'RENTAL', 'DAY', 'xe');
  const base = { facilityId, unitPrice: 1000, isActive: true };
  const boxPath = '/manager/additional-services/' + box.id;
  const rentalPath = '/manager/additional-services/' + dolly.id;
  const boxPayload = { ...base, stockOnHand: 10 };
  const version = { 'X-Catalog-Updated-At': box.updatedAt };
  await api('post', boxPath + '/offerings' + scope, 'managerA', boxPayload, 409, {
    'X-Catalog-Updated-At': '2000-01-01T00:00:00.000Z',
  });
  const invalid = await api('post', boxPath + '/offerings' + scope, 'managerA', { ...boxPayload, unexpected: true }, 400);
  expect(invalid.body.message).toContain('Dữ liệu thêm dịch vụ');
  await denied('post', boxPath + '/offerings' + scope, 'managerB', boxPayload);
  const created = await api('post', boxPath + '/offerings' + scope, 'managerA', boxPayload, 201, version);
  expect(created.body).toMatchObject({ facilityId, unitPrice: 1000, isActive: true, stockOnHand: 10 });
  await api('post', boxPath + '/offerings' + scope, 'managerA', boxPayload, 409, version);

  await api('post', rentalPath + '/offerings' + scope, 'managerA', boxPayload, 400);
  const rental = await api('post', rentalPath + '/offerings' + scope, 'managerA', { ...base, rentalCapacity: 2 }, 201);
  expect(rental.body).toMatchObject({ facilityId, rentalCapacity: 2 });
  await api('patch', boxPath + scope, 'managerA', { ...base, unitPrice: 1500, stockOnHand: 12 }, 400);
  const edit = await api('patch', boxPath + scope, 'managerA', { ...base, unitPrice: 1500 });
  expect(edit.body).toMatchObject({ unitPrice: 1500, stockOnHand: 10 });
  const stock = await api('patch', boxPath + '/inventory' + scope, 'managerA', { facilityId, stockOnHand: 12, expectedQuantity: 10 });
  expect(stock.body.stockOnHand).toBe(12);
  for (const item of [box, dolly]) {
    const detail = await api('get', catalog + '/' + item.id, 'bom');
    expect(detail.body).toMatchObject({ configuredFacilityCount: 1, offeringFacilityCount: 1 });
  }
});

it('verifies the facility-group price range lifecycle through BOM, Manager and Customer HTTP', async () => {
  const facilityId = identity('A'), typeId = identity('type-A');
  const priceRules = '/operations/pricing-rules';
  const catalog = async () => (await api('get', '/booking/catalog?facilityId=' + facilityId)).body.products;
  const draft = (productId = typeId) => ({
    productId, startDate: today(), periodMode: 'duration', durationMonths: 1, quantity: 1,
    paymentChoice: 'pay-later', paymentPlan: 'PAY_MONTHLY',
  });
  const availability = async (productId = typeId, status = 201) =>
    (await api('post', '/booking/availability', undefined, draft(productId), status)).body;
  const inventory = async () => (await api('get', '/manager/storage-types?scopeFacilityId=' + facilityId, 'managerA')).body;
  const update = async (type: string, fields: Record<string, unknown>, status = 200) => {
    const { updatedAt } = await db.storageType.findUniqueOrThrow({ where: { id: type } });
    return (await api('patch', '/manager/storage-types/' + type, 'managerA',
      { expectedUpdatedAt: updatedAt.toISOString(), ...fields }, status)).body;
  };

  const prepared = (await api('post', '/manager/storage-types', 'managerA', {
    facilityId, sizeId: 'medium', code: 'HTTP-MEDIUM-DRAFT', name: 'Kho nháp chưa có khung',
    condition: 'STANDARD', widthCm: 200, lengthCm: 250, heightCm: 250, monthlyRate: 900000, allowDailyRental: false,
  }, 201)).body;
  expect(prepared.bookingEnabled).toBe(false);
  await update(prepared.id, { bookingEnabled: true }, 409);
  await db.storageUnit.create({ data: { unitNumber: 'HTTP-PRICING-DRAFT-UNIT', storageTypeId: prepared.id } });
  // Existing rows receive bookingEnabled=true from the migration, even without a price range.
  await db.storageType.update({ where: { id: prepared.id }, data: { bookingEnabled: true } });
  expect((await catalog()).some((item: { id: string }) => item.id === prepared.id)).toBe(false);
  await availability(prepared.id, 409);
  await api('post', '/reservations', 'customer', draft(prepared.id), 409);

  const committed = await reserve('A');
  await sign(committed.id);
  const snapshot = async () => ({
    reservation: await db.reservation.findUniqueOrThrow({ where: { id: committed.id } }),
    contracts: await db.rentalContract.findMany({ where: { reservationId: committed.id }, orderBy: { id: 'asc' } }),
    invoices: await db.invoice.findMany({ where: { reservationId: committed.id }, orderBy: { id: 'asc' } }),
  });
  const saved = await snapshot();
  expect(saved.reservation.status).toBe('CONFIRMED');
  expect(saved.contracts[0].signedSnapshot).not.toBeNull();
  expect(saved.invoices[0].rentalAmount).toBe(1500000n);
  const before = await availability();
  expect(before.quote.monthlyUnitPrice).toBe(1500000);
  await update(typeId, { monthlyRate: 2500000 }, 400);

  const effectiveFrom = new Date(Date.now() + 10_000);
  await api('post', priceRules, 'bom', {
    facilityId, sizeId: 'small', min: 2000000, max: 2400000, expectedVersion: 1, effectiveFrom: effectiveFrom.toISOString(),
  }, 201);
  const versions = (await api('get', priceRules, 'bom')).body.items
    .filter((rule: { facilityId: string; sizeId: string }) => rule.facilityId === facilityId && rule.sizeId === 'small');
  expect(versions.map((rule: { version: number; status: string }) => [rule.version, rule.status]))
    .toEqual([[2, 'SCHEDULED'], [1, 'EFFECTIVE']]);
  expect((await inventory()).pricingRanges).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizeId: 'small', status: 'EFFECTIVE', value: { min: 1000000, max: 2400000 } }),
    expect.objectContaining({ sizeId: 'small', status: 'SCHEDULED', value: { min: 2000000, max: 2400000 } }),
  ]));
  expect((await availability()).quote.monthlyUnitPrice).toBe(1500000);
  const managerNotices = (await api('get', '/notifications?kind=price-range-changes', 'managerA')).body.items;
  expect(managerNotices).toEqual([expect.objectContaining({ title: 'BOM đã công bố khung giá thuê', summary: expect.stringContaining('HTTP Kho A') })]);
  expect((await api('get', '/notifications?kind=price-range-changes', 'managerB')).body.items).toEqual([]);

  await new Promise(resolve => setTimeout(resolve, Math.max(0, +effectiveFrom - Date.now()) + 100));
  expect((await inventory()).pricingRanges).toEqual([
    expect.objectContaining({ sizeId: 'small', status: 'EFFECTIVE', value: { min: 2000000, max: 2400000 } }),
  ]);
  expect((await catalog()).some((item: { id: string }) => item.id === typeId)).toBe(false);
  await availability(typeId, 409);
  await api('post', '/reservations', 'customer', draft(), 409);
  expect((await availability(identity('type-B'))).quote.monthlyUnitPrice).toBe(1500000);

  const corrected = await update(typeId, { monthlyRate: 2000000 });
  expect(corrected.bookingEnabled).toBe(true);
  const after = await availability();
  expect(after.quote.monthlyUnitPrice).toBe(2000000);
  await api('post', '/reservations', 'customer', { ...draft(), expectedServiceQuoteVersion: before.serviceQuoteVersion }, 409);
  const newBooking = await api('post', '/reservations', 'customer', { ...draft(), expectedServiceQuoteVersion: after.serviceQuoteVersion }, 201);
  expect(newBooking.body.status).toBe('CONFIRMED');
  await update(typeId, { bookingEnabled: false });
  await update(typeId, { monthlyRate: 2400000 });
  await api('post', '/reservations', 'customer', { ...draft(), note: 'Yêu cầu mới sau khi tắt kinh doanh' }, 409);
  expect(await snapshot()).toEqual(saved);
});

it('publishes BOM pricing policy and applies it to a new multi-unit quote', async () => {
  const catalog = (await api('get', '/operations/business-policies', 'bom')).body;
  const policies = catalog.pricing;
  const scheduled = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  for (const [policyKey, value] of [['depositRefundDays', 12], ['transferFee', { method: 'FIXED_AMOUNT', amount: 35_000 }]] as const) {
    const query = { where: { key: policyKey }, orderBy: { version: 'asc' as const } };
    const history = await db.businessRule.findMany(query);
    expect([...catalog.items, ...policies].some((rule: { key: string }) => rule.key === policyKey)).toBe(false);
    await api('patch', '/operations/business-policies/' + policyKey, 'bom', { expectedUpdatedAt: null, value }, 400);
    await api('patch', '/operations/business-policies/' + policyKey, 'bom', { expectedUpdatedAt: null, value, effectiveFrom: scheduled }, 400);
    expect(await db.businessRule.findMany(query)).toEqual(history);
  }
  const deposit = policies.find((rule: { key: string }) => rule.key === 'deposit');
  const prepaid = policies.find((rule: { key: string }) => rule.key === 'prepaid');
  const input = {
    storageTypeId: identity('type-A'), quantity: 2, paymentPlan: 'PREPAID',
    startDate: '2090-01-01', endDate: '2090-04-01',
  };
  const before = (await api('post', '/pricing/quote', undefined, input, 201)).body;
  const depositUpdate = {
    expectedUpdatedAt: deposit.updatedAt,
    value: { ...deposit.value, other: { method: 'FIXED_AMOUNT', amount: 250_000 } },
  };
  await denied('patch', '/operations/business-policies/deposit', 'managerA', depositUpdate);
  const published = (await api('patch', '/operations/business-policies/deposit', 'bom', depositUpdate)).body;
  await api('patch', '/operations/business-policies/deposit', 'bom', depositUpdate, 409);
  await api('patch', '/operations/business-policies/prepaid', 'bom', {
    expectedUpdatedAt: prepaid.updatedAt, effectiveFrom: scheduled,
    value: { ...prepaid.value, 3: { enabled: false, percent: 5 } },
  });
  const after = (await api('post', '/pricing/quote', undefined, input, 201)).body;
  expect(after).toMatchObject({
    depositAmount: 500_000, rentalAmount: before.rentalAmount,
    discountPercent: before.discountPercent,
    pricingPolicy: { deposit: { version: published.version }, prepaid: { version: before.pricingPolicy.prepaid.version } },
  });
  const listed = (await api('get', '/operations/business-policies', 'bom')).body.pricing;
  expect(listed.find((rule: { key: string }) => rule.key === 'prepaid').history)
    .toEqual(expect.arrayContaining([expect.objectContaining({ effectiveFrom: scheduled, status: 'SCHEDULED' })]));
});
