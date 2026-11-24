import { describe, expect, it, vi } from 'vitest';
import { DamageClaimsService } from './damage-claims.service.js';
import type { PublicUser } from '../auth/auth.types.js';
const manager = { id: 'manager', role: 'FACILITY_MANAGER' } as PublicUser;
function setup() {
  const now = new Date();
  const row = { id: 'claim', rentalContractId: 'contract', status: 'RESOLVED', decision: 'APPROVED', decisionReason: 'Lý do quyết định trước đây', resolutionNote: 'Kết quả đã thông báo trước đây', staffFacts: 'Ghi nhận thực tế tại kho', history: [], updatedAt: now, discoveredOn: now, createdAt: now, estimatedValue: null };
  const update = vi.fn(async ({ data }) => Object.assign(row, data));
  const tx = {
    $queryRawUnsafe: vi.fn(),
    user: { findFirst: vi.fn(async ({ where }) => ({ id: where.id })) },
    facilityAccess: { findMany: vi.fn().mockResolvedValue([{ facilityId: 'facility' }]) },
    rentalContract: { findUnique: vi.fn().mockResolvedValue({ reservation: { facilityId: 'facility' } }) },
    $queryRaw: vi.fn(), damageClaim: { findUnique: vi.fn().mockResolvedValue(row), update } };
  return { row, update, service: new DamageClaimsService({ $transaction: (operation: any) => operation(tx) } as never) };
}
describe('Manager incident amendments', () => {
  it('amends saved decision reasons and outcomes without reopening the incident and preserves previous values', async () => {
    const { service, row } = setup();
    const originalResolvedStatus = row.status;
    await service.action(manager, row.id, { expectedUpdatedAt: row.updatedAt.toISOString(), action: 'amend-decision', decisionReason: 'Lý do đã chỉnh sau khi đối chiếu' });
    expect(row.status).toBe(originalResolvedStatus); expect(row.decision).toBe('APPROVED');
    expect(row.resolutionNote).toBe('Kết quả đã thông báo trước đây');
    expect(row.history[0]).toMatchObject({ action: 'amend-decision', decisionReason: 'Lý do quyết định trước đây' });
    await service.action(manager, row.id, { expectedUpdatedAt: row.updatedAt.toISOString(), action: 'amend-resolution', resolutionNote: 'Kết quả cập nhật đã trao đổi với khách' });
    expect(row.status).toBe('RESOLVED');
    expect(row.history[1]).toMatchObject({ action: 'amend-resolution', resolutionNote: 'Kết quả đã thông báo trước đây' });
  });
  it('blocks other roles and stale amendments', async () => {
    const app = setup();
    for (const role of ['FACILITY_STAFF', 'STORAGE_CUSTOMER'] as const) await expect(app.service.action({ ...manager, role }, app.row.id, { expectedUpdatedAt: app.row.updatedAt.toISOString(), action: 'amend-decision', decisionReason: 'Lý do chỉnh sửa có đủ độ dài' })).rejects.toThrow();
    await expect(app.service.action(manager, app.row.id, { expectedUpdatedAt: 'stale', action: 'amend-resolution', resolutionNote: 'Kết quả cập nhật đủ độ dài' })).rejects.toThrow('vừa thay đổi');
    expect(app.update).not.toHaveBeenCalled();
  });
});
