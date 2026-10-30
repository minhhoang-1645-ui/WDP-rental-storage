import 'reflect-metadata';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Refuse to load the application or create any records outside the disposable local database.
for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
  const url = new URL(process.env[name] || 'https://invalid.test');
  if (process.env.NESTBOX_ISOLATED_TEST !== '1' || url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/nestbox_flow_test') throw new Error('This suite requires the disposable local nestbox_flow_test database on 127.0.0.1:55439. Never use the shared database.');
}
const { AppModule } = await import('../dist/app.module.js');
const { PrismaService } = await import('../dist/prisma/prisma.service.js');
const { AuthService } = await import('../dist/modules/auth/auth.service.js');
const { EmailService } = await import('../dist/modules/guest-booking/email.service.js');
const mailbox = new Map<string, string>();
let emailConfigured = true;
const tag = randomUUID().slice(0, 8), password = `Local-only-${randomUUID()}`;
const baseTime = Date.now(), startDate = new Date(baseTime + 25200000).toISOString().slice(0, 10), appointmentAt = new Date(baseTime + 60000).toISOString();
const gatewaySecret = 'isolated-vnpay-no-real-merchant';
const tokens: Record<string, string> = {}, users: Record<string, any> = {};
let app: any, db: any;
const png = () => {
  const crc = (data: Buffer) => { let n = 0xffffffff; for (const byte of data) { n ^= byte; for (let i = 0; i < 8; i++) n = n & 1 ? (n >>> 1) ^ 0xedb88320 : n >>> 1; } return (n ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const kind = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([kind, data]))); return Buffer.concat([length, kind, data, checksum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(300, 0); header.writeUInt32BE(100, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(100 * (300 * 4 + 1)); for (let y = 0; y < 100; y++) for (let x = 0; x < 300; x++) { const at = y * 1201 + 1 + x * 4; pixels.fill(Math.abs(y - (30 + (x % 60))) < 2 ? 40 : 255, at, at + 3); pixels[at + 3] = 255; }
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
};
const signatureImage = png();
async function api(method: string, path: string, role?: string, body?: any, expected?: number) {
  const call = (request(app.getHttpServer()) as any)[method.toLowerCase()]('/api' + path).set('Idempotency-Key', 'local-flow-' + randomUUID());
  if (role) call.set('Authorization', 'Bearer ' + tokens[role]);
  const response = await (body === undefined ? call : call.send(body));
  expect(response.status, `${method} ${path}: ${JSON.stringify(response.body?.message ?? response.body?.code ?? '')}`).toBe(expected ?? (method === 'POST' ? 201 : 200));
  return response.body;
}
async function pay(invoice: any, existingNotice?: any) {
  const notice = existingNotice ?? await api('POST', `/customer/invoices/${invoice.id}/payment-submissions`, 'CUSTOMER', { method: 'BANK_TRANSFER', amount: Number(invoice.balanceDue), reference: `LOCAL-NOT-A-REAL-PAYMENT-${tag}` });
  expect((await api('GET', `/customer/invoices/${invoice.id}`, 'CUSTOMER')).status).not.toBe('PAID');
  await api('POST', `/manager/payment-submissions/${notice.id}/verify`, 'STAFF', { reference: 'not-allowed' }, 403);
  await api('POST', `/manager/payment-submissions/${notice.id}/verify`, 'MANAGER', { reference: `LOCAL-VERIFICATION-${randomUUID()}` });
  expect((await api('GET', `/customer/invoices/${invoice.id}`, 'CUSTOMER')).status).toBe('PAID');
}
async function callback(session: any, amountDelta = 0n, invalidSignature = false) {
  const params = new URL(session.paymentUrl).searchParams;
  const providerId = BigInt('0x' + createHash('sha256').update(params.get('vnp_TxnRef')!).digest('hex').slice(0, 14)).toString();
  const fields: Record<string, string> = { vnp_TmnCode: 'LOCALTEST', vnp_TxnRef: params.get('vnp_TxnRef')!, vnp_Amount: String(BigInt(params.get('vnp_Amount')!) + amountDelta), vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_TransactionNo: providerId, vnp_BankCode: 'NCB' };
  const canonical = Object.keys(fields).sort().map(key => `${encodeURIComponent(key)}=${encodeURIComponent(fields[key]).replace(/%20/g, '+')}`).join('&');
  const signature = invalidSignature ? '0'.repeat(128) : createHmac('sha512', gatewaySecret).update(canonical).digest('hex');
  return api('GET', '/payments/vnpay/ipn?' + canonical + '&vnp_SecureHash=' + signature);
}
async function payOnline(invoice: any) {
  const session = await api('POST', `/customer/invoices/${invoice.id}/online-payment`, 'CUSTOMER', { bankCode: 'VNPAYQR' });
  expect((await callback(session, 0n, true)).RspCode).toBe('97');
  expect((await callback(session, 100n)).RspCode).toBe('04');
  expect((await api('GET', `/customer/invoices/${invoice.id}`, 'CUSTOMER')).status).not.toBe('PAID');
  expect((await callback(session)).RspCode).toBe('00');
  expect((await callback(session)).RspCode).toBe('00');
  expect((await api('GET', `/customer/invoices/${invoice.id}`, 'CUSTOMER')).status).toBe('PAID');
  expect(await db.payment.count({ where: { invoiceId: invoice.id } })).toBe(1);
}


async function signDocument(resource: 'contracts' | 'renewals', row: any) {
  vi.setSystemTime(new Date(Date.now() + 61_000));
  const terms = resource === 'contracts' ? row.terms : row.appendix;
  const base = `/customer/${resource}/${row.id}/${resource === 'contracts' ? '' : 'appendix/'}`;
  const body = { agreed: true, acceptanceName: users.CUSTOMER.fullName, signatureImage, snapshotHash: terms.snapshotHash };
  await api('POST', base + 'accept', 'CUSTOMER', body, 400);
  const receipt = await api('POST', base + 'signature-otp', 'CUSTOMER', body);
  expect(receipt).not.toHaveProperty('otp'); expect(receipt).not.toHaveProperty('code');
  await api('POST', base + 'accept', 'OTHER_CUSTOMER', { ...body, challengeId: receipt.challengeId, otp: mailbox.get(users.CUSTOMER.email) }, 404);
  const signed = await api('POST', base + 'accept', 'CUSTOMER', { ...body, challengeId: receipt.challengeId, otp: mailbox.get(users.CUSTOMER.email) });
  const result = resource === 'contracts' ? signed.terms : signed.appendix;
  expect(result.verification.method).toBe('EMAIL_OTP'); expect(result.snapshotHash).toBe(terms.snapshotHash);
  return signed;
}

describe('Four roles through real HTTP + disposable PostgreSQL, no email/payment provider calls', () => {
  beforeAll(async () => {
    process.env.VNPAY_TMN_CODE = 'LOCALTEST'; process.env.VNPAY_HASH_SECRET = gatewaySecret; process.env.VNPAY_PAYMENT_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'; process.env.VNPAY_RETURN_URL = 'http://127.0.0.1:5173/customer/payments/vnpay-return';
    process.env.WDP_BANK_CODE = '970436'; process.env.WDP_BANK_ACCOUNT_NUMBER = '0123456789';
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(baseTime));
    vi.spyOn(EmailService.prototype, 'signatureDeliveryConfigured').mockImplementation(() => emailConfigured);
    vi.spyOn(EmailService.prototype, 'sendSignatureOtp').mockImplementation(async (message: any) => { mailbox.set(message.to, message.code); });
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    db = app.get(PrismaService); const auth = app.get(AuthService);
    for (const role of ['ADMIN', 'MANAGER', 'STAFF', 'OTHER_STAFF', 'CUSTOMER', 'OTHER_CUSTOMER']) {
      const registered = await auth.register({ fullName: 'Local ' + role, email: `${tag}-${role.toLowerCase()}@example.test`, password, phone: '0900000000' });
      users[role] = await db.user.update({ where: { id: registered.user.id }, data: { role: role.startsWith('OTHER_') ? role.slice(6) : role } });
      tokens[role] = (await auth.login({ email: users[role].email, password })).token;
    }
  }, 60000);
  afterAll(async () => { if (app) await app.close(); vi.useRealTimers(); });

  it('completes booking, signatures, verified payment, handover, stock, support, renewal, transfer, maintenance, early return and settlement', async () => {
    const paymentChannels = await api('GET', '/customer/payment-config', 'CUSTOMER');
    expect(paymentChannels.vnpayConfigured).toBe(true);
    expect(paymentChannels).not.toHaveProperty('hashSecret');
    expect(paymentChannels).not.toHaveProperty('VNPAY_HASH_SECRET');
    const facility = await db.facility.create({ data: { code: `LOCAL-${tag}`, name: 'Disposable local flow test', address: 'Local test only' } });
    const type = await db.storageType.create({ data: { id: `flow-${tag}`, facilityId: facility.id, code: `FLOW-${tag}`, name: 'Kho kiểm thử tạm', sizeId: 'small', sizeName: 'Kho nhỏ', kicker: 'Local test only', condition: 'STANDARD', widthCm: 150, lengthCm: 200, heightCm: 240, roomEquivalent: 'Local', capacity: 'Local', boxCount: '20', suitableItems: ['Thùng'], image: '/local-only.png', imageAlt: 'Local test', floor: 'Tầng trệt', access: 'Local', features: ['Local'], monthlyRate: 1500000, depositMonths: 1, minRentalDays: 7, allowDailyRental: true } });
    const units = await Promise.all([1,2,3].map(n => db.storageUnit.create({ data: { storageTypeId: type.id, unitNumber: `LOCAL-${tag}-${n}`, floor: 'Tầng trệt', zone: 'A', row: 1, position: n } })));
    for (const unit of units) await api('PATCH', `/manager/units/${unit.id}/staff-assignment`, 'MANAGER', { staffUserId: users.STAFF.id, expectedAssignmentId: null });
    expect((await api('GET', '/staff/assigned-units', 'OTHER_STAFF')).items).toHaveLength(0);
    await api('PATCH', `/manager/units/${units[0].id}/staff-assignment`, 'STAFF', { staffUserId: users.OTHER_STAFF.id, expectedAssignmentId: null }, 403);
    const bookingBody = { productId: type.id, startDate, periodMode: 'duration', durationMonths: 3, quantity: 1, paymentPlan: 'PAY_MONTHLY', paymentChoice: 'pay-later', addonIds: [], services: [] };
    expect((await api('POST', '/booking/availability', undefined, bookingBody)).available).toBe(true);
    await api('POST', '/reservations', 'MANAGER', bookingBody, 403);
    const booking = await api('POST', '/reservations', 'CUSTOMER', bookingBody);
    expect(booking.status).toBe('CONFIRMED'); expect((await api('POST', '/reservations', 'CUSTOMER', bookingBody)).id).toBe(booking.id);
    await api('GET', '/manager/units', 'ADMIN', undefined, 403);
    await api('GET', `/reservations/${booking.id}`, 'ADMIN', undefined, 403);
    await api('GET', '/manager/payment-submissions', 'ADMIN', undefined, 403);
    const contracts = (await api('GET', '/customer/contracts?limit=100', 'CUSTOMER')).items;
    expect(contracts).toHaveLength(1); const contract = contracts[0];
    await api('GET', `/customer/contracts/${contract.id}`, 'OTHER_CUSTOMER', undefined, 404);
    let invoice = (await api('GET', '/customer/invoices?limit=100', 'CUSTOMER')).items.find((i: any) => i.type === 'INITIAL');
    expect(invoice.signing.complete).toBe(false);
    await api('POST', `/customer/invoices/${invoice.id}/online-payment`, 'CUSTOMER', {}, 409);
    // A notice can report an accidental transfer, but must never settle an unsigned invoice.
    const unsignedNotice = await api('POST', `/customer/invoices/${invoice.id}/payment-submissions`, 'CUSTOMER', { method: 'BANK_TRANSFER', amount: invoice.balanceDue });
    await api('POST', `/manager/payment-submissions/${unsignedNotice.id}/verify`, 'MANAGER', { reference: 'LOCAL-UNSIGNED-BLOCK' }, 409);
    emailConfigured = false;
    await api('POST', `/customer/contracts/${contract.id}/signature-otp`, 'CUSTOMER', { agreed: true, acceptanceName: users.CUSTOMER.fullName, signatureImage, snapshotHash: contract.terms.snapshotHash }, 503);
    expect((await api('GET', `/customer/contracts/${contract.id}`, 'CUSTOMER')).terms.acceptedAt).toBeNull();
    emailConfigured = true;
    await signDocument('contracts', contract);
    const file = await request(app.getHttpServer()).get(`/api/customer/documents/contracts/${contract.id}`).set('Authorization', 'Bearer ' + tokens.CUSTOMER);
    expect(file.status).toBe(200); expect(file.headers['content-type']).toContain('application/pdf'); expect(file.headers['cache-control']).toContain('no-store'); expect(file.body.subarray(0, 5).toString()).toBe('%PDF-');
    for (const role of ['OTHER_CUSTOMER', 'MANAGER', 'STAFF', 'ADMIN']) {
      await api('GET', `/customer/documents/contracts/${contract.id}`, role, undefined, role === 'OTHER_CUSTOMER' ? 404 : 403);
    }
    await api('GET', `/customer/documents/contracts/${contract.id}`, undefined, undefined, 401);
    const invoiceFile = await request(app.getHttpServer()).get(`/api/customer/documents/invoices/${invoice.id}`).set('Authorization', 'Bearer ' + tokens.CUSTOMER);
    expect(invoiceFile.status).toBe(200); expect(invoiceFile.body.subarray(0, 5).toString()).toBe('%PDF-');

    invoice = await api('GET', `/customer/invoices/${invoice.id}`, 'CUSTOMER'); expect(invoice.signing.complete).toBe(true); await pay(invoice, unsignedNotice);
    const appointment = await api('POST', '/customer/appointments', 'CUSTOMER', { reservationId: booking.id, scheduledAt: new Date(Math.max(Date.parse(appointmentAt), Date.now() + 60_000)).toISOString() });
    expect(appointment.status).toBe('CONFIRMED');
    const handover = { note: 'Local test, not a real handover', handoverReport: { recipientName: 'Local receiver', condition: 'Sạch và khóa hoạt động', accessItemCount: 1, identityVerified: true, unitInspected: true, accessDelivered: true } };
    await api('POST', `/staff/appointments/${appointment.id}/complete-handover`, 'STAFF', handover, 409);
    vi.setSystemTime(new Date(appointment.scheduledAt));
    expect((await api('POST', `/staff/appointments/${appointment.id}/complete-handover`, 'STAFF', handover)).status).toBe('COMPLETED');
    expect((await api('GET', '/customer/rentals', 'CUSTOMER')).items[0].rentalState).toBe('ACTIVE');
    const support = await api('POST', '/customer/support-requests', 'CUSTOMER', { reservationId: booking.id, rentalContractId: contract.id, storageUnitId: contract.storageUnit.id, category: 'UNIT_ISSUE', subject: 'Local support', description: 'Kiểm tra hỗ trợ tạm trên local' });
    expect((await api('GET', `/manager/support-requests/${support.id}`, 'MANAGER')).assignedStaff.id).toBe(users.STAFF.id);
    await api('POST', `/staff/support-requests/${support.id}/start`, 'OTHER_STAFF', {}, 403);
    await api('POST', `/staff/support-requests/${support.id}/start`, 'STAFF', {});
    await api('POST', `/staff/support-requests/${support.id}/escalate`, 'STAFF', { reason: 'Cần quản lý kiểm tra' });
    await api('POST', `/manager/support-requests/${support.id}/resolve`, 'STAFF', { resolutionType: 'MANAGER_RESOLVED', resolutionNote: 'Không có quyền' }, 403);
    await api('POST', `/manager/support-requests/${support.id}/resolve`, 'MANAGER', { resolutionType: 'MANAGER_RESOLVED', resolutionNote: 'Đã đối chiếu trên môi trường local' });
    expect((await api('GET', `/customer/support-requests/${support.id}`, 'CUSTOMER')).status).toBe('RESOLVED');
    const incoming = await api('POST', '/customer/stock-movements', 'CUSTOMER', { rentalContractId: contract.id, type: 'IN', lines: [{ name: 'Thùng local', unit: 'thùng', quantity: 2 }] });
    expect(incoming.status).toBe('ASSIGNED');
    const counted = { lines: [{ lineId: incoming.lines[0].id, actualQty: 2 }], note: 'Local count' };
    await api('POST', `/staff/stock-movements/${incoming.id}/complete`, 'OTHER_STAFF', counted, 403);
    await api('POST', `/staff/stock-movements/${incoming.id}/complete`, 'STAFF', counted);
    await api('POST', `/staff/stock-movements/${incoming.id}/complete`, 'STAFF', counted);
    const stored = (await api('GET', '/customer/stored-items', 'CUSTOMER'))[0]; expect(stored.balance).toBe(2);
    const outgoing = await api('POST', '/customer/stock-movements', 'CUSTOMER', { rentalContractId: contract.id, type: 'OUT', lines: [{ storedItemId: stored.id, quantity: 2 }] });
    await api('POST', `/staff/stock-movements/${outgoing.id}/complete`, 'STAFF', {});
    expect(await api('GET', '/customer/stored-items', 'CUSTOMER')).toHaveLength(0);
    let renewal = await api('POST', '/customer/renewals', 'CUSTOMER', { reservationId: booking.id, termMonths: 3, paymentPlan: 'PREPAID' });
    expect(renewal.status).toBe('APPROVED_PENDING_PAYMENT');
    await signDocument('renewals', renewal);
    const renewalInvoice = (await api('GET', '/customer/invoices?limit=100', 'CUSTOMER')).items.find((i: any) => i.type === 'RENEWAL' && i.renewalCycle === 1); await payOnline(renewalInvoice);
    renewal = await api('GET', `/customer/renewals/${renewal.id}`, 'CUSTOMER'); expect(renewal.status).toBe('COMPLETED');
    const transferRequest = await api('POST', '/customer/support-requests', 'CUSTOMER', { reservationId: booking.id, rentalContractId: contract.id, storageUnitId: contract.storageUnit.id, category: 'UNIT_ISSUE', subject: 'Yêu cầu chuyển kho', description: 'Local transfer request' });
    const transfer = await api('POST', '/staff/management/transfers', 'STAFF', { rentalContractId: contract.id, supportRequestId: transferRequest.id, reason: 'UNIT_ISSUE' });
    const destination = units.find(u => u.id !== contract.storageUnit.id)!;
    await api('POST', `/staff/management/transfers/${transfer.id}/approve`, 'STAFF', { toStorageUnitId: destination.id });
    await api('POST', `/staff/transfers/${transfer.id}/complete`, 'STAFF', {});
    expect((await api('GET', `/customer/support-requests/${transferRequest.id}`, 'CUSTOMER')).status).toBe('RESOLVED');
    expect((await api('GET', `/customer/contracts/${contract.id}`, 'CUSTOMER')).storageUnit.id).toBe(destination.id);
    const maintenance = (await api('GET', '/manager/maintenance', 'MANAGER')).items.find((m: any) => m.unit.id === contract.storageUnit.id);
    expect(maintenance.assignedStaff.id).toBe(users.STAFF.id);
    await api('POST', `/staff/maintenance/${maintenance.id}/start`, 'STAFF', {});
    await api('POST', `/staff/maintenance/${maintenance.id}/complete-work`, 'STAFF', { workNote: 'Đã sửa khóa và vệ sinh trong bài test local' });
    await api('POST', `/manager/maintenance/${maintenance.id}/verify`, 'STAFF', {}, 403);
    await api('POST', `/manager/maintenance/${maintenance.id}/verify`, 'MANAGER', { note: 'Local verification' });
    expect((await db.storageUnit.findUnique({ where: { id: contract.storageUnit.id } })).status).toBe('AVAILABLE');
    const proposal = await api('POST', '/customer/support-requests', 'CUSTOMER', { reservationId: booking.id, category: 'OTHER', subject: 'Đề nghị trả kho trước hạn', description: 'Local early return proposal' });
    const review = (await api('GET', '/manager/early-return-requests', 'MANAGER')).items.find((r: any) => r.id === proposal.id);
    await api('POST', `/manager/early-return-requests/${proposal.id}/decision`, 'MANAGER', { decision: 'APPROVED', financialReviewConfirmed: true, reviewedEndDate: review.reservation.effectiveEndDate, reviewedOutstandingAmount: review.financialSummary.outstandingAmount, reviewedPaidAmount: review.financialSummary.paidAmount, note: 'Local review; no new fee or refund policy' });
    const returned = await api('POST', '/customer/returns', 'CUSTOMER', { reservationId: booking.id });
    await api('POST', `/staff/returns/${returned.id}/start-inspection`, 'STAFF', {});
    for (const inspection of returned.inspections) await api('PATCH', `/staff/returns/${returned.id}/inspections/${inspection.id}`, 'STAFF', { result: 'ISSUE_FOUND', issueType: 'FACILITY_FAULT', issueNote: 'Khóa cần kiểm tra, không phải lỗi khách', conditionNote: 'Kho đã lấy hết hàng' });
    const pendingGoods = await api('POST', '/customer/stock-movements', 'CUSTOMER', { rentalContractId: contract.id, type: 'IN', lines: [{ name: 'Local final item', unit: 'thùng', quantity: 1 }] });
    await api('POST', `/staff/returns/${returned.id}/finalize`, 'STAFF', {}, 409);
    await api('POST', `/staff/stock-movements/${pendingGoods.id}/complete`, 'STAFF', {});
    await api('POST', `/staff/returns/${returned.id}/finalize`, 'STAFF', {}, 409);
    const lastItem = (await api('GET', '/customer/stored-items', 'CUSTOMER'))[0];
    const finalOut = await api('POST', '/customer/stock-movements', 'CUSTOMER', { rentalContractId: contract.id, type: 'OUT', lines: [{ storedItemId: lastItem.id, quantity: 1 }] });
    await api('POST', `/staff/stock-movements/${finalOut.id}/complete`, 'STAFF', {});
    await api('POST', `/staff/returns/${returned.id}/finalize`, 'STAFF', {});
    const settlement = (await api('GET', '/manager/deposit-settlements', 'MANAGER')).items.find((s: any) => s.reservation.id === contract.reservation.id);
    await api('POST', `/manager/deposit-settlements/${settlement.id}/review`, 'STAFF', { issues: [] }, 403);
    const reviewed = await api('POST', `/manager/deposit-settlements/${settlement.id}/review`, 'MANAGER', { issues: returned.inspections.map((i: any) => ({ inspectionId: i.id, issueType: 'FACILITY_FAULT', approvedChargeAmount: 0, reason: 'Lỗi thiết bị cơ sở, không thu phí khách' })), note: 'Local review' });
    if (reviewed.refundAmount > 0) await api('POST', `/manager/deposit-settlements/${settlement.id}/refund`, 'MANAGER', { method: 'BANK_TRANSFER', reference: 'LOCAL-ONLY-NO-REAL-REFUND', note: 'No real bank call' });
    expect((await api('GET', `/customer/deposit-settlements/${settlement.id}`, 'CUSTOMER')).status).toBe('SETTLED');
    expect((await api('GET', `/customer/contracts/${contract.id}`, 'CUSTOMER')).status).toBe('COMPLETED');
    await api('POST', '/customer/stock-movements', 'CUSTOMER', { rentalContractId: contract.id, type: 'IN', lines: [{ name: 'Not allowed', unit: 'thùng', quantity: 1 }] }, 409);
    const lateBooking = await api('POST', '/reservations', 'CUSTOMER', { ...bookingBody, startDate: new Date(baseTime + 86400000 + 25200000).toISOString().slice(0, 10), durationMonths: 1 });
    const lateContract = (await api('GET', '/customer/contracts?limit=100', 'CUSTOMER')).items.find((c: any) => c.reservation.reference === lateBooking.id);
    await signDocument('contracts', lateContract);
    const lateInvoice = (await api('GET', '/customer/invoices?limit=100', 'CUSTOMER')).items.find((i: any) => i.reservation.reference === lateBooking.id);
    const lateSession = await api('POST', `/customer/invoices/${lateInvoice.id}/online-payment`, 'CUSTOMER', {});
    // Simulate a cancellation racing a provider callback, only in this disposable database.
    await db.invoice.update({ where: { id: lateInvoice.id }, data: { status: 'VOID' } });
    await api('POST', `/customer/invoices/${lateInvoice.id}/online-payment`, 'CUSTOMER', {}, 409);
    expect((await callback(lateSession)).RspCode).toBe('00');
    expect((await api('GET', `/customer/invoices/${lateInvoice.id}`, 'CUSTOMER')).status).toBe('VOID');
    expect(await db.payment.count({ where: { invoiceId: lateInvoice.id } })).toBe(0);
    const reconciliation = (await api('GET', '/manager/online-payment-reconciliations', 'MANAGER')).items.find((r: any) => r.transaction.invoice.invoiceCode === lateInvoice.invoiceCode);
    expect(reconciliation.status).toBe('PENDING_REVIEW');
    await api('POST', `/manager/online-payment-reconciliations/${reconciliation.id}/resolve`, 'STAFF', { resolution: 'RECONCILED', resolutionNote: 'Not allowed' }, 403);
    await api('POST', `/manager/online-payment-reconciliations/${reconciliation.id}/resolve`, 'MANAGER', { resolution: 'REFUND_REQUIRED', resolutionNote: 'Local callback after cancellation' });
    await api('POST', `/manager/online-payment-reconciliations/${reconciliation.id}/resolve`, 'MANAGER', { resolution: 'RECONCILED', resolutionNote: 'Missing evidence' }, 400);
    await api('POST', `/manager/online-payment-reconciliations/${reconciliation.id}/resolve`, 'MANAGER', { resolution: 'RECONCILED', resolutionNote: 'Local evidence only, no real bank call', refundConfirmed: true, refundReference: 'LOCAL-REFUND-ONLY' });
    expect((await db.onlinePaymentReconciliation.findUnique({ where: { id: reconciliation.id } })).status).toBe('RECONCILED');
    await api('PATCH', `/admin/users/${users.ADMIN.id}/status`, 'ADMIN', { accountStatus: 'DISABLED' }, 400);
    await api('PATCH', `/admin/users/${users.OTHER_STAFF.id}/status`, 'MANAGER', { accountStatus: 'DISABLED' }, 403);
    await api('PATCH', `/admin/users/${users.OTHER_STAFF.id}/status`, 'ADMIN', { accountStatus: 'DISABLED' });
    await api('GET', '/auth/me', 'OTHER_STAFF', undefined, 401);
    await api('PATCH', `/admin/users/${users.OTHER_STAFF.id}/status`, 'ADMIN', { accountStatus: 'ACTIVE' });
    const accountList = await api('GET', '/admin/users', 'ADMIN'); expect(JSON.stringify(accountList)).not.toContain('passwordHash');
    await db.user.update({ where: { id: users.OTHER_CUSTOMER.id }, data: { role: 'ADMIN' } });
    const secondAdmin = await app.get(AuthService).login({ email: users.OTHER_CUSTOMER.email, password });
    const outcomes = await Promise.all([
      request(app.getHttpServer()).patch(`/api/admin/users/${users.OTHER_CUSTOMER.id}/status`).set('Authorization', 'Bearer ' + tokens.ADMIN).send({ accountStatus: 'DISABLED' }),
      request(app.getHttpServer()).patch(`/api/admin/users/${users.ADMIN.id}/status`).set('Authorization', 'Bearer ' + secondAdmin.token).send({ accountStatus: 'DISABLED' }),
    ]);
    expect(outcomes.map(result => result.status).sort((a, b) => a - b)).toEqual([200, 403]);
    expect(await db.user.count({ where: { id: { in: [users.ADMIN.id, users.OTHER_CUSTOMER.id] }, accountStatus: 'ACTIVE', role: 'ADMIN' } })).toBe(1);
    console.log('Real local HTTP flow passed: four-role permissions, signed booking/payment/handover, inventory, escalation, renewal appendix/payment, transfer sync/maintenance, early return and deposit settlement. No external provider calls.');
  }, 120000);
});
