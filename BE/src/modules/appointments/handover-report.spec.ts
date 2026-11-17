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
  it('records explicit paperwork delivery and rejects an unchecked confirmation', () => {
    expect(handoverReport({ handoverReport: { ...report, documentsDelivered: true } })).toContain('Đã giao giấy tờ bàn giao cho khách.');
    expect(() => handoverReport({ handoverReport: { ...report, documentsDelivered: false } })).toThrow('Cần xác nhận đã giao giấy tờ');
    expect(handoverReport({ handoverReport: report })).not.toContain('Đã giao giấy tờ bàn giao cho khách.');
  });
  it('requires structured evidence for new completions', () => { expect(() => handoverReport({ note: 'Ghi chú cũ' })).toThrow('biên bản'); });
});

describe('verified handover recipient', () => {
  const customer = { id: 'customer', fullName: 'Khách thuê' };
  const report = { condition: 'Kho bình thường', accessItemCount: 1, identityVerified: true, unitInspected: true, accessDelivered: true, documentsDelivered: true };
  it('uses the customer record as the default recipient', () => {
    expect(handoverReport({ handoverReport: report }, customer)).toContain('Người nhận: Khách thuê');
    expect(() => handoverReport({ handoverReport: { ...report, recipientName: 'Người khác' } }, customer)).toThrow('ủy quyền');
  });
  it('records authorized recipient and authorization evidence', () => {
    expect(handoverReport({ handoverReport: { ...report, recipientType: 'AUTHORIZED', recipientName: 'Người đại diện', authorizationBasis: 'Giấy ủy quyền đã đối chiếu tại quầy' } }, customer)).toContain('Căn cứ ủy quyền: Giấy ủy quyền');
  });
  it.each([{ recipientName: 'Đại diện' }, { authorizationBasis: 'Giấy ủy quyền' }])('rejects incomplete authorization: %j', fields => {
    expect(() => handoverReport({ handoverReport: { ...report, recipientType: 'AUTHORIZED', ...fields } }, customer)).toThrow();
  });
});
