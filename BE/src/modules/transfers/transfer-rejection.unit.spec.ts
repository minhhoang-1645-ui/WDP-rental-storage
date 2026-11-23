import { describe, expect, it, vi } from 'vitest';
import { TransfersService } from './transfers.service.js';
import type { PublicUser } from '../auth/auth.types.js';
const staff = { id: 'staff', role: 'FACILITY_STAFF' } as PublicUser;
const manager = { id: 'manager', role: 'FACILITY_MANAGER' } as PublicUser;
describe('Transfer rejection reason', () => {
  it('requires a reason and shares it with the customer’s linked request', async () => {
    const row = { id: 'transfer', status: 'REQUESTED', reservationId: 'reservation', supportRequestId: 'support' };
    const update = vi.fn(async ({ data }) => Object.assign(row, data)), updateMany = vi.fn();
    const tx = { $queryRaw: vi.fn(), transferRequest: { findFirst: vi.fn().mockResolvedValue(row), update }, supportRequest: { updateMany } };
    const service = new TransfersService({ $transaction: (operation: any) => operation(tx) } as never);
    vi.spyOn(service as any, 'toTransfer').mockImplementation(value => value);
    await expect(service.reject('transfer', staff, { reason: 'Không còn kho cùng loại phù hợp' })).rejects.toThrow('Chỉ quản lý');
    await expect(service.reject('transfer', manager, {})).rejects.toThrow('lý do');
    expect(update).not.toHaveBeenCalled();
    await service.reject('transfer', manager, { reason: 'Không còn kho cùng loại phù hợp' });
    expect(row).toMatchObject({ status: 'REJECTED', rejectionReason: 'Không còn kho cùng loại phù hợp' });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ resolutionNote: 'Từ chối chuyển kho: Không còn kho cùng loại phù hợp', lastAction: 'TRANSFER_REJECTED' }) }));
    await service.reject('transfer', manager, { reason: 'Không còn kho cùng loại phù hợp' });
    expect(update).toHaveBeenCalledOnce();
  });
});
