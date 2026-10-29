import { describe, expect, it } from 'vitest';
import { handoverReport } from './handover-report.js';

describe('handover report without schema changes', () => {
  const report = { recipientName: 'Người nhận', condition: 'Cửa và khóa hoạt động, sàn sạch', accessItemCount: 1, identityVerified: true, unitInspected: true, accessDelivered: true };
  it('records the actual recipient, condition and access items in the existing note', () => {
    expect(handoverReport({ handoverReport: report, note: 'Đã hướng dẫn truy cập' })).toContain('Số chìa khóa/thẻ: 1');
    expect(handoverReport({ handoverReport: report })).toContain('Người nhận: Người nhận');
  });
  it('rejects incomplete attestations and invalid access counts', () => {
    for (const patch of [{ identityVerified: false }, { unitInspected: false }, { accessDelivered: false }, { accessItemCount: -1 }, { condition: '' }, { recipientName: '' }]) expect(() => handoverReport({ handoverReport: { ...report, ...patch } })).toThrow();
  });
  it('keeps legacy payload handling for existing clients', () => { expect(handoverReport({ note: 'Ghi chú cũ' })).toBeUndefined(); });
});
