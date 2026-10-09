import 'dotenv/config';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ManagerCustomersController } from './manager-customers.controller.js';
import { ManagerService } from './manager.service.js';
import { ManagerUnitsController } from './manager-units.controller.js';

const runId = randomUUID().slice(0, 8);
const facilityId = `manager-facility-${runId}`;
const storageTypeId = `manager-product-${runId}`;
const unitCodes = [`MGR-${runId}-02`, `MGR-${runId}-01`];
const customerId = `manager-customer-${runId}`;
const staffId = `manager-staff-${runId}`;
const managerId = `manager-user-${runId}`;
const reservationCode = `WDP-MANAGER-${runId}`;

const dateOffset = (days: number) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
};

describe('Manager inventory and customer APIs', () => {
  let prisma: PrismaService;
  let service: ManagerService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new ManagerService(prisma);
    await prisma.facility.create({ data: { id: facilityId, code: `MGR-${runId}`, name: 'Manager API Test Facility', address: 'Test only' } });
    await prisma.storageType.create({
      data: {
        id: storageTypeId,
        facilityId,
        code: `MT-${runId}`,
        name: 'Manager Test Storage',
        sizeId: 'small',
        sizeName: 'Kho nhỏ',
        kicker: 'Test only',
        condition: 'AIR_CONDITIONED',
        widthCm: 150,
        lengthCm: 200,
        heightCm: 240,
        roomEquivalent: 'Test room',
        capacity: 'Test capacity',
        boxCount: '20 thùng',
        suitableItems: ['Boxes'],
        image: 'https://example.test/manager-storage.jpg',
        imageAlt: 'Manager test storage',
        floor: 'Tầng 9',
        access: 'Test access',
        features: ['Test feature'],
      },
    });
    await prisma.storageUnit.createMany({
      data: [
        { storageTypeId, unitNumber: unitCodes[0], floor: 'Tầng 9', zone: 'Z', row: 2, position: 2, status: 'MAINTENANCE' },
        { storageTypeId, unitNumber: unitCodes[1], floor: 'Tầng 9', zone: 'Z', row: 2, position: 1, status: 'AVAILABLE' },
      ],
    });
    await prisma.user.createMany({
      data: [
        { id: customerId, fullName: `Customer ${runId}`, email: `customer-${runId}@example.test`, phone: `09${runId}`, role: 'CUSTOMER', passwordHash: 'secret-customer-hash' },
        { id: staffId, fullName: `Staff ${runId}`, email: `staff-${runId}@example.test`, phone: '0900000011', role: 'STAFF', passwordHash: 'secret-staff-hash' },
        { id: managerId, fullName: `Manager ${runId}`, email: `manager-${runId}@example.test`, phone: '0900000012', role: 'MANAGER', passwordHash: 'secret-manager-hash' },
      ],
    });
    const reservation = await prisma.reservation.create({
      data: {
        reservationCode,
        customerId,
        facilityId,
        storageTypeId,
        quantity: 1,
        startDate: dateOffset(-1),
        endDate: dateOffset(30),
        periodMode: 'CUSTOM_DATES',
        durationMonths: null,
        adjacentPreference: false,
        availabilitySnapshot: { available: true },
        quoteSnapshot: { status: 'QUOTE_REQUIRED', grandTotal: null },
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        idempotencyKey: `manager-api-${runId}`,
      },
    });
    const allocatedUnit = await prisma.storageUnit.findUniqueOrThrow({ where: { unitNumber: unitCodes[1] } });
    await prisma.reservationUnit.create({
      data: {
        reservationId: reservation.id,
        storageUnitId: allocatedUnit.id,
        plannedStartDate: dateOffset(-1),
        plannedEndDate: dateOffset(30),
      },
    });
  });

  afterAll(async () => {
    await prisma.reservationUnit.deleteMany({ where: { reservation: { reservationCode } } });
    await prisma.reservation.deleteMany({ where: { reservationCode } });
    await prisma.storageUnit.deleteMany({ where: { storageTypeId } });
    await prisma.storageType.deleteMany({ where: { id: storageTypeId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, staffId, managerId] } } });
    await prisma.facility.deleteMany({ where: { id: facilityId } });
    await prisma.$disconnect();
  });

  it('lists units with stable unit-code ordering', async () => {
    const result = await service.listUnits({ page: 1, limit: 100, storageType: storageTypeId });
    const testUnits = result.items.filter((unit) => unit.storageType.id === storageTypeId);
    expect(testUnits.map((unit) => unit.unitCode)).toEqual([unitCodes[1], unitCodes[0]]);
  });

  it('filters units by code, status, storage type, floor and zone', async () => {
    const result = await service.listUnits({
      page: 1,
      limit: 20,
      search: unitCodes[1].toLowerCase(),
      status: 'AVAILABLE',
      storageType: `mt-${runId}`,
      floor: 'tầng 9',
      zone: 'z',
    });
    expect(result.total).toBe(1);
    expect(result.items[0].unitCode).toBe(unitCodes[1]);
  });

  it('returns unit storage data and the current confirmed allocation', async () => {
    const detail = await service.getUnit(unitCodes[1].toLowerCase());
    expect(detail.storageType.id).toBe(storageTypeId);
    expect(detail.condition).toBe('AIR_CONDITIONED');
    expect(detail.dimensions).toMatchObject({ widthCm: 150, lengthCm: 200, heightCm: 240 });
    expect(detail.currentAllocation?.reservationReference).toBe(reservationCode);
    expect(detail.currentAllocation?.customer.id).toBe(customerId);
    expect(detail.allocations).toHaveLength(1);
  });

  it('returns 404 for an unknown physical unit', async () => {
    await expect(service.getUnit(`missing-${runId}`)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists only CUSTOMER users and supports name, email and phone search', async () => {
    for (const search of [`customer ${runId}`, `CUSTOMER-${runId}@EXAMPLE.TEST`, `09${runId}`]) {
      const result = await service.listCustomers({ page: 1, limit: 20, search });
      expect(result.items.some((customer) => customer.id === customerId)).toBe(true);
      expect(result.items.some((customer) => [staffId, managerId].includes(customer.id))).toBe(false);
    }
  });

  it('returns customer reservation history without passwordHash', async () => {
    const detail = await service.getCustomer(customerId);
    expect(detail.reservationCount).toBe(1);
    expect(detail.reservations[0]).toMatchObject({ reference: reservationCode, storageType: { id: storageTypeId }, quantity: 1, status: 'CONFIRMED' });
    expect(JSON.stringify(detail)).not.toContain('passwordHash');
    expect(JSON.stringify(detail)).not.toContain('secret-customer-hash');
    const list = await service.listCustomers({ page: 1, limit: 20, search: `customer-${runId}@example.test` });
    expect(list.items[0].latestReservation?.reference).toBe(reservationCode);
    expect(JSON.stringify(list)).not.toContain('passwordHash');
  });

  it('returns 404 when a requested user is not a CUSTOMER', async () => {
    await expect(service.getCustomer(staffId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces 401 without auth and 403 for CUSTOMER or STAFF on both controllers', async () => {
    const authGuard = new AuthGuard({ getUserByToken: async () => { throw new Error('not called'); } } as never);
    const unauthenticated = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    await expect(authGuard.canActivate(unauthenticated)).rejects.toBeInstanceOf(UnauthorizedException);

    const rolesGuard = new RolesGuard(new Reflector());
    for (const controller of [ManagerUnitsController, ManagerCustomersController]) {
      for (const role of ['CUSTOMER', 'STAFF']) {
        const context = {
          getHandler: () => function managerRead() {},
          getClass: () => controller,
          switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
        } as unknown as ExecutionContext;
        expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
      }
      for (const role of ['MANAGER', 'ADMIN']) {
        const context = {
          getHandler: () => function managerRead() {},
          getClass: () => controller,
          switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
        } as unknown as ExecutionContext;
        expect(rolesGuard.canActivate(context)).toBe(true);
      }
    }
  });
});
