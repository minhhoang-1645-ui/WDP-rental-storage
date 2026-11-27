import { describe, expect, it, vi } from 'vitest';
import { AdditionalServicesService } from './additional-services.service.js';
import type { PublicUser } from '../auth/auth.types.js';

describe('Manager shared catalog boundary', () => {
  it('lets only BOM set or clear the minimum and defaults unconfigured rentals to one month', async () => {
    const bom = { id: 'bom', role: 'BUSINESS_OPERATIONS_MANAGER' } as PublicUser;
    const manager = { id: 'manager', role: 'FACILITY_MANAGER' } as PublicUser;
    const updatedAt = new Date('2026-11-28T00:00:00Z');
    const create = vi.fn(async ({ data }) => ({ ...data, id: 'service', createdAt: updatedAt, updatedAt }));
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: bom.id }) }, $queryRawUnsafe: vi.fn(),
      additionalService: { findUnique: vi.fn().mockResolvedValue(null), create, update: vi.fn() },
      auditEvent: { create: vi.fn() },
      facilityAccess: { findMany: vi.fn().mockResolvedValue([{ facilityId: 'facility' }]) },
    };
    const service = new AdditionalServicesService({ ...tx, $transaction: (run: (client: typeof tx) => unknown) => run(tx) } as never);
    const item = { code: 'VACUUM', name: 'Máy hút', kind: 'RENTAL', billingUnit: 'MONTH' };
    await expect(service.saveCatalog(undefined, item, bom)).resolves.toMatchObject({ minimumRentalMonths: 1 });
    await expect(service.saveCatalog(undefined, { ...item, minimumRentalMonths: 2 }, bom)).resolves.toMatchObject({ minimumRentalMonths: 2 });
    await expect(service.saveCatalog(undefined, { ...item, minimumRentalMonths: 0 }, bom)).rejects.toThrow('tối thiểu');
    await expect(service.saveCatalog(undefined, { ...item, kind: 'PURCHASE', billingUnit: 'ONE_TIME', minimumRentalMonths: 2 }, bom)).rejects.toThrow('tối thiểu');
    await expect(service.saveCatalog(undefined, { ...item, minimumRentalMonths: 2 }, manager)).rejects.toThrow('Vai trò');
    await expect(service.configure('service', { facilityId: 'facility', unitPrice: 1000, minimumRentalMonths: 2 }, manager, false)).rejects.toThrow('Chỉ sửa giá');
    const current = { ...item, id: 'service', minimumRentalMonths: 2, offerings: [], createdAt: updatedAt, updatedAt };
    tx.additionalService.findUnique.mockResolvedValue(current);
    tx.additionalService.update.mockImplementation(async ({ data }) => ({ ...current, ...data }));
    await expect(service.saveCatalog('service', { minimumRentalMonths: null, expectedUpdatedAt: updatedAt.toISOString() }, bom)).resolves.toMatchObject({ minimumRentalMonths: 1 });
  });
  it('requires existing shared catalog definitions for facility offerings', async () => {
    const create = vi.fn();
    const service = new AdditionalServicesService({ additionalService: { create } } as never);
    await expect(service.create({ code: 'NEW' }, { id: 'manager', role: 'FACILITY_MANAGER' } as PublicUser)).rejects.toThrow('Chỉ điều hành kinh doanh');
    expect(create).not.toHaveBeenCalled();
  });
});
