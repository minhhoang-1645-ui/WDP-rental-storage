import { randomUUID, scryptSync } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaService } from '../dist/prisma/prisma.service.js';

const enabled = process.env.NESTBOX_ISOLATED_TEST === '1';
const target = 'postgresql://nestbox_test@127.0.0.1:55439/nestbox_foundation_test';
if (enabled && (process.env.DATABASE_URL !== target || process.env.DIRECT_URL !== target)) {
  throw new Error('Physical unit code tests require the disposable localhost PostgreSQL database.');
}

const suite = enabled ? it : it.skip;
let app: INestApplication;
let db: PrismaService;

beforeAll(async () => {
  if (!enabled) return;
  db = new PrismaService();
  const { FoundationHttpModule } = await import('./foundation-http.module.js');
  const module = await Test.createTestingModule({ imports: [FoundationHttpModule] }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

suite('issues physical unit codes through the Manager API and preserves historical codes', async () => {
  const marker = randomUUID().slice(0, 8).toUpperCase();
  const password = 'isolated-unit-code-test';
  const salt = randomUUID().replaceAll('-', '');
  const passwordHash = ['scrypt', salt, scryptSync(password, salt, 64).toString('hex')].join('$');
  const makeUser = (name: string, role: 'FACILITY_MANAGER' | 'STORAGE_CUSTOMER') => db.user.create({
    data: { fullName: name, email: `${marker}-${name}@example.test`.toLowerCase(), role, passwordHash },
  });
  const [manager, colleague, otherManager, customer] = await Promise.all([
    makeUser('manager', 'FACILITY_MANAGER'), makeUser('colleague', 'FACILITY_MANAGER'),
    makeUser('other-manager', 'FACILITY_MANAGER'), makeUser('customer', 'STORAGE_CUSTOMER'),
  ]);
  const createFacility = (name: string) => db.facility.create({ data: { code: `${marker}-${name}`, name, address: 'Test' } });
  const [site, otherSite] = await Promise.all([createFacility('A'), createFacility('B')]);
  await db.facilityAccess.createMany({ data: [[manager, site], [colleague, site], [otherManager, otherSite]].map(([person, facility]) => ({
    userId: person.id, facilityId: facility.id, grantedById: manager.id, activeKey: JSON.stringify([person.id, facility.id]),
  })) });

  const http = request(app.getHttpServer());
  const login = async (email: string) => (await http.post('/api/auth/login').send({ email, password }).expect(200)).body.token as string;
  const [token, secondToken, otherToken] = await Promise.all([login(manager.email), login(colleague.email), login(otherManager.email)]);
  const api = async (method: 'get' | 'post' | 'patch', path: string, auth: string, data?: object, expected = method === 'post' ? 201 : 200) => {
    const req = http[method]('/api/manager/' + path).set('Authorization', 'Bearer ' + auth);
    if (data) req.send(data);
    const response = await req;
    expect(response.status, method + ' ' + path + ' ' + JSON.stringify(response.body)).toBe(expected);
    return response.body;
  };
  const typeData = {
    name: 'Kho thử', sizeId: 'small', condition: 'STANDARD', widthCm: 150, lengthCm: 200, heightCm: 240,
    monthlyRate: 1500000, allowDailyRental: false, bookingEnabled: false,
  };
  const makeType = (facilityId: string, code: string, auth: string, status = 201) =>
    api('post', 'storage-types', auth, { ...typeData, facilityId, code }, status);
  const code = 'LG-' + marker;
  const secondCode = 'MD-' + marker;
  const otherCode = 'SM-' + marker;
  const type = await makeType(site.id, ' ' + code.toLowerCase() + ' ', token);
  expect(type.code).toBe(code);
  const secondType = await makeType(site.id, secondCode, token);
  const otherType = await makeType(otherSite.id, otherCode, otherToken);
  await makeType(otherSite.id, code.toLowerCase(), otherToken, 409);

  const preview = (storageTypeId: string, auth = token, status = 200) => api('get', `storage-types/${storageTypeId}/next-unit-code`, auth, undefined, status);
  const create = (storageTypeId: string, auth = token, data = {}, status = 201) => api('post', 'units', auth, { storageTypeId, ...data }, status);
  await preview(otherType.id, token, 403);
  await create(otherType.id, token, {}, 403);
  await create(type.id, token, { unitNumber: 'MANUAL' }, 400);
  expect(await preview(type.id)).toEqual({ unitNumber: code + '-01' });
  expect(await preview(type.id, secondToken)).toEqual({ unitNumber: code + '-01' });

  const coordinates = { floor: 'Ground', zone: 'A', row: 1, position: 1 };
  const first = await create(type.id, token, coordinates);
  expect(first.unitNumber).toBe(code + '-01');
  await create(type.id, secondToken, coordinates, 409);
  const second = await create(type.id);
  const third = await create(type.id);
  const fourth = await create(type.id);
  expect([second, third, fourth].map(unit => unit.unitNumber)).toEqual([code + '-02', code + '-03', code + '-04']);
  const renamed = await api('patch', 'storage-types/' + type.id, token, { name: 'Kho đổi tên', expectedUpdatedAt: type.updatedAt });

  const concurrent = await Promise.all([create(secondType.id, token), create(secondType.id, secondToken)]);
  expect(concurrent.map(unit => unit.unitNumber).sort()).toEqual([secondCode + '-01', secondCode + '-02']);
  expect((await create(otherType.id, otherToken)).unitNumber).toBe(otherCode + '-01');
  await db.facility.update({ where: { id: otherSite.id }, data: { operationalStatus: 'CLOSED', bookingEnabled: false } });
  await preview(otherType.id, otherToken, 409);
  await create(otherType.id, otherToken, {}, 409);

  await db.storageUnit.update({ where: { id: third.id }, data: { status: 'MAINTENANCE' } });
  await db.storageUnit.delete({ where: { id: fourth.id } });
  expect((await create(type.id)).unitNumber).toBe(code + '-05');
  // A numeric legacy import advances the high-water mark, even if it is later removed.
  const legacy = await db.storageUnit.create({ data: { unitNumber: code + '-099', storageTypeId: type.id, status: 'MAINTENANCE' } });
  await db.storageUnit.delete({ where: { id: legacy.id } });
  expect(await preview(type.id)).toEqual({ unitNumber: code + '-100' });
  expect((await create(type.id)).unitNumber).toBe(code + '-100');

  const edit = await api('patch', 'storage-types/' + type.id, token, { imageAlt: 'Mô tả mới', expectedUpdatedAt: renamed.updatedAt });
  await api('patch', 'storage-types/' + type.id, token, { code: 'RENAMED', expectedUpdatedAt: edit.updatedAt }, 409);
  expect(await preview(type.id)).toEqual({ unitNumber: code + '-101' });

  const start = new Date('2026-10-01'), end = new Date('2026-10-31');
  const reservation = await db.reservation.create({ data: {
    reservationCode: marker + '-R', idempotencyKey: marker + '-R', customerId: customer.id, facilityId: site.id,
    storageTypeId: type.id, startDate: start, endDate: end, quantity: 1, periodMode: 'DURATION', durationMonths: 1,
    status: 'CONFIRMED', quoteSnapshot: { original: true }, availabilitySnapshot: {},
  } });
  const allocation = await db.reservationUnit.create({ data: {
    reservationId: reservation.id, storageUnitId: first.id, plannedStartDate: start, plannedEndDate: end,
  } });
  const contract = await db.rentalContract.create({ data: {
    contractCode: marker + '-C', reservationId: reservation.id, reservationUnitId: allocation.id,
    startDate: start, endDate: end, signedSnapshot: { unitNumber: first.unitNumber },
  } });
  await api('patch', 'units/' + first.id, token, { zone: 'B', expectedUpdatedAt: first.updatedAt }, 409);
  expect(await api('get', 'units/' + first.unitNumber, token)).toMatchObject({ id: first.id, unitCode: code + '-01' });
  expect(await db.rentalContract.findUnique({ where: { id: contract.id }, include: { reservationUnit: { include: { storageUnit: true } } } })).toMatchObject({
    contractCode: marker + '-C', signedSnapshot: { unitNumber: code + '-01' },
    reservationUnit: { storageUnit: { id: first.id, unitNumber: code + '-01' } },
  });
});
