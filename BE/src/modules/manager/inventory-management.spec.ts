import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client.js';
import { InventoryManagementService } from './inventory-management.service.js';
import { InventoryManagementController } from './inventory-management.controller.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { PublicUser } from '../auth/auth.types.js';

const actor = { id: 'manager', role: 'MANAGER' } as PublicUser;
const version = '2026-11-03T00:00:00.000Z';
const type = { id: 'type', facilityId: 'facility', code: 'SM-A', name: 'Kho nhỏ', sizeId: 'small', condition: 'STANDARD', widthCm: 100, lengthCm: 200, heightCm: 240, monthlyRate: new Prisma.Decimal(1500000), allowDailyRental: false, minRentalDays: null, image: '', imageAlt: '', updatedAt: new Date(version) };
const unit = { id: 'unit', unitNumber: 'SM-A-001', storageTypeId: 'type', floor: 'Trệt', zone: 'A', row: 1, position: 1, status: 'AVAILABLE', updatedAt: new Date(version), _count: { reservationUnits: 0, maintenanceRequests: 0, supportRequests: 0, outgoingTransfers: 0, incomingTransfers: 0, returnInspections: 0, staffAssignments: 0 } };
function fixture() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    storageType: { findUnique: vi.fn().mockResolvedValue(type), findMany: vi.fn().mockResolvedValue([type, { ...type, id: 'no-price', monthlyRate: null }]), create: vi.fn().mockImplementation(async ({ data }) => data), update: vi.fn().mockImplementation(async ({ data }) => ({ ...type, ...data })) },
    facility: { findUnique: vi.fn().mockResolvedValue({ id: 'facility' }), findMany: vi.fn().mockResolvedValue([{ id: 'facility', name: 'Cơ sở' }]) },
    storageUnit: { findUnique: vi.fn().mockResolvedValue(unit), count: vi.fn().mockResolvedValue(0), create: vi.fn().mockImplementation(async ({ data }) => data), update: vi.fn().mockImplementation(async ({ data }) => data) },
    reservation: { count: vi.fn().mockResolvedValue(0) }, guestBookingRequest: { count: vi.fn().mockResolvedValue(0) }, contactInquiry: { count: vi.fn().mockResolvedValue(0) },
  };
  const prisma = { ...tx, $transaction: vi.fn().mockImplementation(async operation => operation(tx)) };
  return { tx, prisma, service: new InventoryManagementService(prisma as never) };
}
describe('Manager inventory configuration safety (mock DB only)', () => {
  it('returns real prices and preserves unavailable prices', async () => {
    const { service } = fixture();
    expect(await service.listTypes()).toMatchObject({ total: 2, items: [{ monthlyRate: 1500000 }, { monthlyRate: null }] });
  });
  it.each(['CUSTOMER', 'STAFF', 'ADMIN'] as const)('rejects %s before any database write', async role => {
    const { service, prisma } = fixture();
    await expect(service.saveUnit(undefined, {}, { ...actor, role })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.saveType(undefined, {}, { ...actor, role })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('changes only catalog price even when reservation history exists', async () => {
    const { service, tx, prisma } = fixture();
    tx.reservation.count.mockResolvedValue(2);
    expect(await service.saveType('type', { monthlyRate: 1800000, expectedUpdatedAt: version }, actor)).toMatchObject({ monthlyRate: 1800000 });
    expect(tx.storageType.update).toHaveBeenCalledOnce();
    expect(tx.storageUnit.update).not.toHaveBeenCalled();
    expect(tx.reservation.count).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
  });
  it.each([null, 0, -1, 1.5, [12], 'invalid'])('rejects invalid monthly price %j', async monthlyRate => {
    const { service, tx } = fixture();
    await expect(service.saveType('type', { monthlyRate, expectedUpdatedAt: version }, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.storageType.update).not.toHaveBeenCalled();
  });
  it('creates a catalog item without overwriting old records', async () => {
    const { service, tx } = fixture();
    const { id: _id, updatedAt: _updatedAt, ...input } = type;
    expect(await service.saveType(undefined, { ...input, code: 'NEW', monthlyRate: 2000000 }, actor)).toMatchObject({ code: 'NEW', sizeName: 'Kho nhỏ', monthlyRate: 2000000 });
    expect(tx.storageType.update).not.toHaveBeenCalled();
  });
  it('preserves legacy monthly minimums when editing only the price', async () => {
    const { service, tx } = fixture();
    tx.storageType.findUnique.mockResolvedValue({ ...type, minRentalDays: 30 });
    tx.reservation.count.mockResolvedValue(1);
    expect(await service.saveType('type', { monthlyRate: 1800000, minRentalDays: 30, expectedUpdatedAt: version }, actor)).toMatchObject({ monthlyRate: 1800000, minRentalDays: 30 });
    expect(tx.reservation.count).not.toHaveBeenCalled();
  });
  it('blocks structural changes with booking or operational history', async () => {
    for (const history of ['reservation', 'storageUnit'] as const) {
      const { service, tx } = fixture(); tx[history].count.mockResolvedValue(1);
      await expect(service.saveType('type', { widthCm: 300, expectedUpdatedAt: version }, actor)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.storageType.update).not.toHaveBeenCalled();
    }
  });
  it('validates daily rental minimum and facility existence', async () => {
    const { service, tx } = fixture();
    await expect(service.saveType('type', { allowDailyRental: true, minRentalDays: null, expectedUpdatedAt: version }, actor)).rejects.toBeInstanceOf(BadRequestException);
    tx.facility.findUnique.mockResolvedValue(null);
    await expect(service.saveType('type', { monthlyRate: 1600000, expectedUpdatedAt: version }, actor)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('requires a fresh version and prevents metadata writes to occupied/history units', async () => {
    const { service, tx } = fixture();
    await expect(service.saveUnit('unit', { zone: 'B' }, actor)).rejects.toBeInstanceOf(ConflictException);
    tx.storageUnit.findUnique.mockResolvedValue({ ...unit, _count: { ...unit._count, reservationUnits: 1 } });
    await expect(service.saveUnit('unit', { zone: 'B', expectedUpdatedAt: version }, actor)).rejects.toBeInstanceOf(ConflictException);
    tx.storageUnit.findUnique.mockResolvedValue({ ...unit, status: 'OCCUPIED' });
    await expect(service.saveUnit('unit', { zone: 'B', expectedUpdatedAt: version }, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.storageUnit.update).not.toHaveBeenCalled();
  });
  it('allows moving an unused unit, but never manually setting status', async () => {
    const { service, tx } = fixture();
    await expect(service.saveUnit('unit', { zone: 'B', expectedUpdatedAt: version }, actor)).resolves.toMatchObject({ zone: 'B' });
    await expect(service.saveUnit(undefined, { unitNumber: 'NEW', storageTypeId: 'type' }, actor)).resolves.toMatchObject({ unitNumber: 'NEW' });
    expect(tx.storageUnit.create.mock.calls[0][0].data).not.toHaveProperty('status');
    await expect(service.saveUnit('unit', { status: 'AVAILABLE', expectedUpdatedAt: version }, actor)).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['P2002', 'P2034'])('converts %s races to actionable conflicts', async code => {
    const { service, tx } = fixture(); tx.storageUnit.create.mockRejectedValue({ code });
    await expect(service.saveUnit(undefined, { unitNumber: 'NEW', storageTypeId: 'type' }, actor)).rejects.toBeInstanceOf(ConflictException);
  });
  it('route guard grants configuration only to Manager, including GET list', () => {
    const guard = new RolesGuard(new Reflector());
    for (const name of ['list', 'createType', 'updateType', 'createUnit', 'updateUnit'] as const) {
      for (const role of ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN']) {
        const context = { getClass: () => InventoryManagementController, getHandler: () => InventoryManagementController.prototype[name], switchToHttp: () => ({ getRequest: () => ({ method: name === 'list' ? 'GET' : 'POST', originalUrl: '/api/manager/storage-types', user: { role } }) }) } as unknown as ExecutionContext;
        if (role === 'MANAGER') expect(guard.canActivate(context)).toBe(true);
        else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      }
    }
  });
});
