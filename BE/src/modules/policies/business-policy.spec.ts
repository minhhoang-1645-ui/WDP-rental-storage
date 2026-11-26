import { describe, expect, it, vi } from 'vitest';
import { BusinessPolicyService, validatePolicy } from './business-policy.service.js';
import { loadPricingPolicy, pricingPolicyDefaults, pricingPolicyValidators } from './pricing-policy.js';
import type { PublicUser } from '../auth/auth.types.js';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BusinessPolicyModule } from './business-policy.module.js';

it('serves the applied catalog under the production API prefix with role guards', async () => {
  const module = await Test.createTestingModule({ imports: [PrismaModule, BusinessPolicyModule] })
    .overrideProvider(PrismaService).useValue({
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'active-user' }) },
      businessPolicy: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
      businessRule: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    })
    .overrideProvider(AuthService).useValue({ getUserByToken: async (role: PublicUser['role']) => ({ id: role, role }) })
    .compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  try {
    const http = request(app.getHttpServer());
    const path = '/api/business-policies/applied';
    await http.get(path).expect(401);
    for (const role of ['STORAGE_CUSTOMER', 'FACILITY_MANAGER']) {
      const response = await http.get(path).set('Authorization', 'Bearer ' + role).expect(200);
      expect(response.body.items).toHaveLength(5);
      expect(response.body.pricing).toHaveLength(7);
      const paymentOverdue = response.body.pricing.find((row: { key: string }) => row.key === 'paymentOverdue');
      if (role === 'FACILITY_MANAGER') expect(paymentOverdue.value).toHaveProperty('managerDays');
      else expect(paymentOverdue.value).not.toHaveProperty('managerDays');
      await http.patch('/api/operations/business-policies/deposit').set('Authorization', 'Bearer ' + role).expect(403);
    }
    for (const role of ['FACILITY_STAFF', 'SYSTEM_ADMINISTRATOR', 'BUSINESS_OPERATIONS_MANAGER']) {
      await http.get(path).set('Authorization', 'Bearer ' + role).expect(403);
    }
  } finally {
    await app.close();
  }
});

it('publishes only effective policy values and keeps managerial thresholds private', async () => {
  const findMany = vi.fn().mockResolvedValue([{
    id: 'rule', key: 'returnOverdue', version: 2, facilityId: null,
    effectiveFrom: new Date('2020-01-01T00:00:00Z'), effectiveTo: null, createdAt: new Date(),
    createdById: 'bom', value: { ...pricingPolicyDefaults.returnOverdue, managerDays: 11 },
  }]);
  const service = new BusinessPolicyService({
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'user' }) },
    businessPolicy: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
    businessRule: { findMany, findFirst: vi.fn().mockResolvedValue(null) },
  } as never);
  const actor = { id: 'user', role: 'STORAGE_CUSTOMER' } as PublicUser;
  const customer = await service.applied(actor);
  const manager = await service.applied({ ...actor, role: 'FACILITY_MANAGER' });
  const customerReturn = customer.pricing.find(row => row.key === 'returnOverdue');
  expect(customer.items.length + customer.pricing.length).toBe(12);
  expect(customerReturn).toMatchObject({ effectiveVersion: 2, effectiveFrom: new Date('2020-01-01T00:00:00Z') });
  expect(customerReturn?.value).not.toHaveProperty('managerDays');
  expect(customerReturn).not.toHaveProperty('history');
  expect(manager.pricing.find(row => row.key === 'returnOverdue')?.value).toHaveProperty('managerDays', 11);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
    facilityId: null, storageTypeId: null, effectiveFrom: { lte: expect.any(Date) },
  }) }));
  for (const role of ['SYSTEM_ADMINISTRATOR', 'FACILITY_STAFF'] as const) {
    await expect(service.applied({ ...actor, role })).rejects.toThrow();
  }
});
describe('Safe Admin policy boundaries', () => {
  it('never exposes a secret/configuration editor', () => {
    for (const key of ['SMTP_PASS', 'DATABASE_URL', 'VNPAY_HASH_SECRET', '__proto__']) expect(() => validatePolicy(key, 10)).toThrow();
  });
  it('accepts exact integer units and bounds only', () => {
    expect(validatePolicy('reservationHoldMinutes', 1440)).toBe(1440);
    expect(validatePolicy('handoverLeadDays', 0)).toBe(0);
    for (const value of ['3', NaN, -1, 8, 1.5, null]) expect(() => validatePolicy('handoverLeadDays', value)).toThrow();
  });
});

describe('Versioned deposit and prepaid policy', () => {
  it('rejects unexpected fields and invalid amounts or switches', () => {
    for (const amount of [-1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => pricingPolicyValidators.deposit({ ...pricingPolicyDefaults.deposit, locker: { method: 'FIXED_AMOUNT', amount } })).toThrow();
    }
    expect(() => pricingPolicyValidators.deposit({ ...pricingPolicyDefaults.deposit, extra: {} })).toThrow();
    expect(() => pricingPolicyValidators.prepaid({ ...pricingPolicyDefaults.prepaid, 3: { enabled: 'true', percent: 5 } })).toThrow();
    expect(() => pricingPolicyValidators.prepaid({ ...pricingPolicyDefaults.prepaid, 3: { enabled: true, percent: 31 } })).toThrow();
  });

  it('selects the effective rows as of the quote and rejects corrupt stored rules', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([{ key: 'prepaid', version: 2, value: pricingPolicyDefaults.prepaid }])
      .mockResolvedValueOnce([{ key: 'deposit', version: 3, value: 0 }]);
    const db = { businessRule: { findMany } } as never;
    const now = new Date('2030-04-01T00:00:00+07:00');
    expect(await loadPricingPolicy(db, now)).toMatchObject({ deposit: { version: 0 }, prepaid: { version: 2 } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    }) }));
    await expect(loadPricingPolicy(db, now)).rejects.toThrow();
  });

  it('publishes the structured value in one transaction and rejects stale or unauthorized edits', async () => {
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'bom' }) },
      businessRule: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }) => data),
        update: vi.fn(),
      },
      $queryRawUnsafe: vi.fn(),
    };
    const service = new BusinessPolicyService({ $transaction: (operation: (db: typeof tx) => unknown) => operation(tx) } as never);
    const bom = { id: 'bom', role: 'BUSINESS_OPERATIONS_MANAGER' } as PublicUser;
    const effectiveFrom = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const body = { value: pricingPolicyDefaults.deposit, expectedUpdatedAt: null, effectiveFrom };
    await expect(service.save('deposit', body, { ...bom, role: 'FACILITY_MANAGER' })).rejects.toThrow();
    await expect(service.save('deposit', { ...body, effectiveFrom: '2020-01-01T00:00:00Z' }, bom)).rejects.toThrow();
    await expect(service.save('deposit', body, bom)).resolves.toMatchObject({
      key: 'deposit', version: 1, createdById: 'bom', effectiveFrom: new Date(effectiveFrom), value: pricingPolicyDefaults.deposit,
    });
    tx.businessRule.findFirst.mockResolvedValue({ createdAt: new Date(), version: 1, effectiveFrom: new Date(effectiveFrom) });
    await expect(service.save('deposit', body, bom)).rejects.toThrow('vừa thay đổi');
    expect(tx.businessRule.create).toHaveBeenCalledTimes(1);
    expect(tx.businessRule.update).not.toHaveBeenCalled();
  });
});
