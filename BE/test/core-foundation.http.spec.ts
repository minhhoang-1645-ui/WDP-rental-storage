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
) {
  let operation = request(app.getHttpServer())[method]('/api' + path);
  if (who) operation = operation.set('Authorization', 'Bearer ' + tokens[who]);
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
async function reserve(facility = 'A', quantity = 1, startDate = today()) {
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
    managerA: 'FACILITY_MANAGER',
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
        address: 'Isolated HTTP test',
      },
    });
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
      ...(f === 'A' ? ['staffA2'] : []),
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
  'stock-movements',
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
    description: 'Cửa bị kẹt, cần kiểm tra khóa.',
  };
  await denied('post', '/staff/maintenance', 'staffA', input);
  const issue = await api('post', '/staff/maintenance', 'staffB', input, 201);
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
    ).toEqual(f === 'A' ? [identity('staffA'), identity('staffA2')] : []);
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
      min: 1000000,
      max: 2000000,
      effectiveFrom: new Date().toISOString(),
      expectedVersion: 0,
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
  ).toBe('MAINTENANCE');
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
  const start = new Date(businessToday().getTime() + 2 * 86400000),
    r = await reserve('B', 1, start.toISOString().slice(0, 10));
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
  await api(
    'patch',
    '/manager/appointments/' + appt.body.id + '/assign',
    'managerB',
    { staffUserId: identity('staffB'), expectedAssignedStaffUserId: null },
  );
  const unit = await db.reservationUnit.findFirstOrThrow({
    where: { reservationId: r.id },
  });
  await api(
    'post',
    '/staff/appointments/' + appt.body.id + '/complete-handover',
    'staffB',
    {
      handoverReport: {
        condition: 'Kho sạch',
        accessItemCount: 1,
        identityVerified: true,
        unitInspected: true,
        accessDelivered: true,
        unitChecks: [
          { unitId: unit.storageUnitId, condition: 'Tốt', inspected: true },
        ],
      },
    },
    201,
  );
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
  ).toBe(1);
});
