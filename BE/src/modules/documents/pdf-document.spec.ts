import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PdfDocumentService } from './pdf-document.service.js';
import { DocumentPolicy } from './document-policy.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
const png = () => {
  const crc = (data: Buffer) => { let n = 0xffffffff; for (const byte of data) { n ^= byte; for (let i = 0; i < 8; i++) n = n & 1 ? (n >>> 1) ^ 0xedb88320 : n >>> 1; } return (n ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const kind = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([kind, data]))); return Buffer.concat([length, kind, data, checksum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(300, 0); header.writeUInt32BE(100, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(100 * (300 * 4 + 1)); for (let y = 0; y < 100; y++) for (let x = 0; x < 300; x++) { const at = y * 1201 + 1 + x * 4; pixels.fill(Math.abs(y - (30 + (x % 60))) < 2 ? 40 : 255, at, at + 3); pixels[at + 3] = 255; }
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
};
const signature = png();
describe('Protected PDF rendering', () => {
  it('creates Vietnamese contracts, appendices and invoices from saved snapshots', async () => {
    const policy = new DocumentPolicy(new ConfigService({})), pdf = new PdfDocumentService(policy);
    const customer = { fullName: 'Nguyễn Thị Ánh', email: 'customer@example.test', phone: '0900000000' };
    const issuer = { brand: 'NestBox Storage', draft: true };
    const quote = { quotedTotalAmount: 1_950_000, initialInvoiceEstimate: { totalAmount: 650_000 }, lineItems: [{ label: 'Tiền thuê kho: 3 tháng × 1 kho', amount: 1_950_000 }] };
    const terms = { acceptedAt: '2026-10-30T03:00:00Z', acceptanceName: customer.fullName, signatureImage: signature, snapshotHash: 'a'.repeat(64), verification: { method: 'EMAIL_OTP', recipient: 'cu***@example.test', verifiedAt: '2026-10-30T03:00:00Z' }, document: { issuer, clauses: policy.terms(), customer, storage: { name: 'Tủ lưu trữ A01', unitCode: 'LK-A01-002' }, version: 'NESTBOX-RENTAL-V2', reservationReference: 'QA-ONLY-001', startDate: '2026-10-30', endDate: '2027-01-30', quantity: 1, pricing: quote } };
    const contract = { contractCode: 'QA-ONLY-001-C01', terms, reservation: { customer }, storageType: { name: 'Tủ lưu trữ A01' }, storageUnit: { unitCode: 'LK-A01-002' } };
    const appendix = { appendix: { ...terms, code: 'QA-ONLY-PL01', snapshot: { issuer, customer, quote, contracts: [contract], previousEndDate: '2027-01-30', requestedEndDate: '2027-04-30', termMonths: 3, reservationReference: 'QA-ONLY-001' } }, renewalCode: 'QA-ONLY-R01', reservation: { quantity: 1 } };
    const invoice = { invoiceCode: 'QA-ONLY-I01', reservation: { reference: 'QA-ONLY-001' }, issuedAt: '2026-10-30', billingPeriodStart: '2026-10-30', billingPeriodEnd: '2026-11-30', status: 'PARTIALLY_PAID', rentalAmount: 650_000, depositAmount: 0, serviceAmount: 0, chargeAmount: 0, totalAmount: 650_000, amountPaid: 150_000, balanceDue: 500_000, payments: [{ amount: 150_000, method: 'BANK_TRANSFER', receivedAt: '2026-10-30', paymentCode: 'QA-ONLY-P01' }] };
    const files = { contract: await pdf.contract(contract), appendix: await pdf.appendix(appendix, customer), invoice: await pdf.invoice(invoice, customer, [contract]) };
    for (const [name, bytes] of Object.entries(files)) { expect(bytes.subarray(0, 5).toString()).toBe('%PDF-'); expect(bytes.length).toBeGreaterThan(10_000); if (process.env.PDF_QA_DIR) { await mkdir(process.env.PDF_QA_DIR, { recursive: true }); await writeFile(`${process.env.PDF_QA_DIR}/${name}.pdf`, bytes); } }
  });
});
