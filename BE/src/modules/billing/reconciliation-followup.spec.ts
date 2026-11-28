import { describe, expect, it, vi } from 'vitest';
import { OnlinePaymentService } from './online-payment.service.js';
import type { PublicUser } from '../auth/auth.types.js';

const manager = { id: 'manager', role: 'FACILITY_MANAGER' } as PublicUser;
function setup() {
  const record = { id: 'case', reconciliationCode: 'RC', status: 'REFUND_REQUIRED', resolutionNote: 'Cần hoàn khoản thành công muộn', amount: 100n, createdAt: new Date(), reviewedAt: null, onlinePaymentTransaction: { id: 'transaction', invoiceId: 'invoice', invoice: { id: 'invoice', reservation: { reservationCode: 'RES', customer: {} } } } };
  const model = { findFirst: vi.fn().mockResolvedValue(record), findUniqueOrThrow: vi.fn(async () => record), updateMany: vi.fn(async ({ data }) => { Object.assign(record, data); return { count: 1 }; }) };
  const tx = { onlinePaymentReconciliation: model, invoice: { findUnique: vi.fn().mockResolvedValue({ reservationId: 'reservation' }) }, reservation: {findUnique:vi.fn().mockResolvedValue({facilityId:'A'})}, user: { findFirst: vi.fn().mockResolvedValue({ id: 'manager' }) }, facilityAccess: { findMany: vi.fn().mockResolvedValue([{ facilityId: 'A' }]) }, $queryRawUnsafe: vi.fn() };
  return { service: new OnlinePaymentService({ ...tx, $transaction: (work: (client: typeof tx) => unknown) => work(tx) } as never, {} as never, {} as never), record, model };
}
describe('VNPay refund follow-up recording', () => {
  it('requires actual refund attestation and a reference before closing REFUND_REQUIRED', async () => {
    const { service, model } = setup();
    await expect(service.resolveReconciliation('case', { resolution: 'RECONCILED', resolutionNote: 'Đã hoàn' }, manager)).rejects.toThrow('hoàn tiền thực tế');
    expect(model.updateMany).not.toHaveBeenCalled();
  });
  it('records evidence, preserves the prior reason and makes the terminal retry harmless', async () => {
    const { service, model } = setup();
    const input = { resolution: 'RECONCILED', resolutionNote: 'Đã kiểm tra chứng từ', refundReference: 'BANK-REF', refundConfirmed: true };
    expect(await service.resolveReconciliation('case', input, manager)).toMatchObject({ status: 'RECONCILED' });
    expect(model.updateMany.mock.calls[0][0].data.resolutionNote).toContain('BANK-REF');
    expect(model.updateMany.mock.calls[0][0].data.resolutionNote).toContain('Cần hoàn khoản thành công muộn');
    await service.resolveReconciliation('case', input, manager);
    expect(model.updateMany).toHaveBeenCalledTimes(1);
  });
  it('denies Staff and reports a concurrent decision', async () => {
    const { service, model } = setup();
    await expect(service.resolveReconciliation('case', {}, { id: 'staff', role: 'FACILITY_STAFF' } as PublicUser)).rejects.toThrow('Chỉ Manager');
    model.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.resolveReconciliation('case', { resolution: 'RECONCILED', resolutionNote: 'Đã kiểm tra', refundReference: 'BANK-REF', refundConfirmed: true }, manager)).rejects.toThrow('vừa thay đổi');
  });
});
