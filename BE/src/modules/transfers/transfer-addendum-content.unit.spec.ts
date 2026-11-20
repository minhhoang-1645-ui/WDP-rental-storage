import { describe, expect, it, vi } from 'vitest';
import { snapshotHash } from '../contracts/signature.js';
import { PdfDocumentService } from '../documents/pdf-document.service.js';
import { TransfersService } from './transfers.service.js';
import { transferAddendumContent } from './transfer-addendum-content.js';

const stamp = new Date('2026-11-20T00:00:00Z');
const snapshot = {
  code: 'TRF-01-PL01', contractCode: 'CON-01', version: 'NESTBOX-TRANSFER-COMMERCIAL-V1',
  issuer: { brand: 'NestBox', draft: false, legalName: 'NestBox' }, customer: { fullName: 'Khách kiểm thử' },
  from: { code: 'A01', typeName: 'Kho vừa' }, to: { code: 'B01', typeName: 'Kho nhỏ' },
  currentRate: 3600000, newRate: 2900000, effectiveFrom: '2027-05-17', smaller: true,
};

describe('transfer appendix reader', () => {
  it('derives the customer document from the signed snapshot and limits lookup to its owner', async () => {
    const stored = { ...snapshot, version: 'NESTBOX-TRANSFER-COMMERCIAL-V2', financialReview: {
      leaseStart: '2026-11-17', leaseEnd: '2027-05-17', requestedMoveDate: null,
      outstandingAmount: 7200000, dueAmount: 0, paidAmount: 17460000, depositAmount: 3600000,
      futureRentIncrease: 0, futureRentReduction: 0, renewals: [{ appendixCode: 'RN-01-PL01', start: '2027-02-17', end: '2027-05-17' }],
    } };
    const findFirst = vi.fn().mockResolvedValue({ id: 'order', transferCode: 'TRF-01', status: 'COMPLETED', commercialSnapshot: stored,
      customerAcceptedAt: stamp, rentalContract: { startDate: stamp, endDate: stamp }, reservation: { startDate: stamp, endDate: stamp }, fromStorageUnit: {}, createdAt: stamp, updatedAt: stamp });
    const service = new TransfersService({ transferRequest: { findFirst } } as never);
    const result = await service.getCustomerOrder({ id: 'owner' } as never, 'order');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'order', reservation: { customerId: 'owner' } } }));
    expect(result.commercial).toMatchObject({ snapshotHash: snapshotHash(stored), acceptedAt: stamp.toISOString() });
    expect(result.addendumContent).toEqual(transferAddendumContent(stored, 'TRF-01'));
    expect(JSON.stringify(result.addendumContent)).toContain('RN-01-PL01');
  });

  it('still generates PDFs for legacy snapshots with no financial review', async () => {
    const service = new PdfDocumentService({} as never);
    const pdf = await service.transferAddendum({ transferCode: 'TRF-01', commercial: { snapshot, snapshotHash: snapshotHash(snapshot) } });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(transferAddendumContent(snapshot, 'TRF-01').sections.map(section => section.title)).not.toContain('Đối chiếu tại thời điểm lập phụ lục');
  });
});
