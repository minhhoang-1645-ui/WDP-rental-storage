// Opt-in, additive review data. Never update/delete existing accounts or business records.
import 'dotenv/config';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { PricingService } from '../dist/modules/pricing/pricing.service.js';
import { BillingService } from '../dist/modules/billing/billing.service.js';
import { businessDate } from '../dist/business-date.js';

const prefix = 'nestbox-review-20261110';
const accountsFile = new URL('../../FE/artifacts/review-20261110/accounts.local.json', import.meta.url);
const marker = '[DEMO RV10 — dữ liệu mô phỏng, không có giao dịch tiền thật]';
const actors = [
  { role: 'ADMIN', name: 'Trần Thị Lan · RV10', email: 'review.rv10.admin@nestbox.test', phone: '0901000011' },
  { role: 'MANAGER', name: 'Lê Minh Tuấn · RV10', email: 'review.rv10.manager@nestbox.test', phone: '0901000012' },
  { role: 'STAFF', name: 'Phạm Văn Nam · RV10', email: 'review.rv10.staff@nestbox.test', phone: '0901000013' },
  { role: 'CUSTOMER', name: 'Nguyễn Minh Anh · RV10', email: 'review.rv10.customer@nestbox.test', phone: '0901000014' },
].map(actor => ({ ...actor, id: `${prefix}-${actor.role.toLowerCase()}` }));
const addMonths = (value, count) => { const date = new Date(value), day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + count); const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(day, last)); return date; };
const db = new PrismaService();
try {
  if (process.env.NODE_ENV === 'production') throw new Error('Không nạp demo khi NODE_ENV=production.');
  const types = await db.storageType.findMany({ where: { id: { in: ['sm-b12', 'md-d04'] }, monthlyRate: { gt: 0 } } });
  if (types.length !== 2) throw new Error('Cần hai loại kho sm-b12/md-d04 đã có giá. Không tự tạo hoặc sửa bảng giá của nhóm.');
  for (const actor of actors) {
    const existing = await db.user.findUnique({ where: { email: actor.email }, select: { id: true } });
    if (existing && existing.id !== actor.id) throw new Error('Email demo đã thuộc tài khoản khác; không ghi đè.');
  }
  const existing = await db.user.count({ where: { id: { in: actors.map(actor => actor.id) } } });
  if (existing) {
    if (existing !== actors.length) throw new Error('Bộ demo đã tồn tại một phần; cần kiểm tra, không tự sửa.');
    if (process.argv.includes('--apply') || process.argv.includes('--verify')) {
      await db.$transaction(async tx => {
        const reservations = await tx.reservation.findMany({ where: { id: { startsWith: prefix + '-reservation-' }, customerId: actors.find(actor => actor.role === 'CUSTOMER').id, status: 'CONFIRMED', contracts: { every: { status: 'ACTIVE' }, some: {} } }, select: { id: true } });
        for (const reservation of reservations) await new BillingService(db).ensureRecurringInvoices(tx, reservation.id);
        if (process.argv.includes('--verify')) throw new Error('RV10_VERIFY_ROLLBACK');
      }, { timeout: 45000 });
    }
    console.log('Bộ RV10 đã có. Giữ nguyên dữ liệu và tiến trình demo; không reset mật khẩu. --apply chỉ bổ sung hóa đơn kỳ sau còn thiếu cho đơn RV10 đang thuê.');
    console.log('Thông tin tài khoản riêng trên máy: ' + fileURLToPath(accountsFile));
  } else if (!process.argv.includes('--apply') && !process.argv.includes('--verify')) {
    console.log('Kế hoạch RV10: 4 tài khoản mới; 3 đơn đang thuê (2 kho nhỏ, 1 kho vừa); 3 phiếu nhập đã kiểm đếm; 1 phiếu xuất chờ xử lý; 1 hỗ trợ; 1 bảo trì; hóa đơn và khoản thu mô phỏng khớp báo giá.');
    console.log('Không có update/delete/migration, không gửi email/OTP hoặc gọi cổng thanh toán. Chỉ --apply mới ghi dữ liệu.');
    console.log(types.map(type => `${type.name}: ${type.monthlyRate} đ/kho/tháng`).join('\n'));
  } else {
    let saved;
    try { saved = JSON.parse(await readFile(accountsFile, 'utf8')); } catch { /* New private manifest. */ }
    const password = saved?.password ?? randomBytes(18).toString('base64url') + '!9a';
    const salt = randomBytes(16).toString('hex');
    const hash = 'scrypt$' + salt + '$' + scryptSync(password, salt, 64).toString('hex');
    await mkdir(new URL('.', accountsFile), { recursive: true });
    const manifest = { dataset: prefix, applied: false, password, accounts: actors, note: 'Email .test không nhận OTP thật. Dùng tài khoản email thật của nhóm khi demo gửi OTP. Chứng từ RV10 là giả định lịch sử, không phải hợp đồng hay giao dịch thật.' };
    await writeFile(accountsFile, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await db.$transaction(async tx => {
      for (const actor of actors) await tx.user.create({ data: { id: actor.id, email: actor.email, fullName: actor.name, phone: actor.phone, role: actor.role, passwordHash: hash } });
      const byRole = Object.fromEntries(actors.map(actor => [actor.role, actor.id]));
      const today = new Date(businessDate() + 'T00:00:00Z');
      const units = [];
      for (let index = 0; index < 5; index++) {
        const type = types.find(type => type.id === (index < 2 || index === 3 ? 'sm-b12' : 'md-d04'));
        const unit = await tx.storageUnit.create({ data: { id: `${prefix}-unit-${index}`, storageTypeId: type.id, unitNumber: `RV10-${index < 2 || index === 3 ? 'SM' : 'MD'}-0${index + 1}`, floor: 'Tầng trệt', zone: 'RV10', row: 10, position: index + 1, status: index < 3 ? 'OCCUPIED' : index === 4 ? 'MAINTENANCE' : 'AVAILABLE' } });
        units.push(unit);
        await tx.unitStaffAssignment.create({ data: { storageUnitId: unit.id, staffUserId: byRole.STAFF, assignedByUserId: byRole.MANAGER } });
      }
      for (let index = 0; index < 3; index++) {
        const type = types.find(type => type.id === units[index].storageTypeId);
        const start = new Date(today); start.setUTCDate(start.getUTCDate() - 3 + index);
        const end = addMonths(start, 3);
        const firstEnd = addMonths(start, 1);
        const quote = new PricingService(tx).calculate(type, { storageTypeId: type.id, quantity: 1, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), paymentPlan: 'PAY_MONTHLY' });
        const reservation = await tx.reservation.create({ data: { id: `${prefix}-reservation-${index}`, reservationCode: `RV10-DAT-0${index + 1}`, customerId: byRole.CUSTOMER, facilityId: type.facilityId, storageTypeId: type.id, quantity: 1, startDate: start, endDate: end, periodMode: 'DURATION', durationMonths: 3, status: 'CONFIRMED', quoteSnapshot: quote, quotedAmount: quote.quotedTotalAmount, availabilitySnapshot: { available: true, demoDataset: prefix }, notes: marker, idempotencyKey: `${prefix}-reservation-${index}`, confirmedAt: start, createdAt: start } });
        const allocation = await tx.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: units[index].id, plannedStartDate: start, plannedEndDate: end } });
        const contract = await tx.rentalContract.create({ data: { id: `${prefix}-contract-${index}`, contractCode: `RV10-HD-0${index + 1}`, reservationId: reservation.id, reservationUnitId: allocation.id, startDate: start, endDate: end, status: 'ACTIVE', activatedAt: start, termsVersion: 'RV10-HISTORICAL-SAMPLE', termsAcceptedAt: start, termsAcceptedByUserId: byRole.CUSTOMER, acceptanceName: actors.find(actor => actor.role === 'CUSTOMER').name, acceptanceNote: marker + ' Hồ sơ lịch sử giả định ký giấy; không giả lập xác thực OTP.' } });
        await new BillingService(db).ensureRecurringInvoices(tx, reservation.id);
        const total = BigInt(quote.estimatedInitialAmountDue);
        const invoice = await tx.invoice.create({ data: { invoiceCode: `RV10-HDTHU-0${index + 1}`, reservationId: reservation.id, type: 'INITIAL', billingCycle: 1, billingPeriodStart: start, billingPeriodEnd: firstEnd, dueAt: start, status: 'PAID', rentalAmount: BigInt(quote.initialPaymentBreakdown.rentalAmount), depositAmount: BigInt(quote.depositAmount), totalAmount: total, amountPaid: total, balanceDue: 0n, issuedAt: start, paidAt: start } });
        await tx.payment.create({ data: { paymentCode: `RV10-THU-0${index + 1}`, invoiceId: invoice.id, amount: total, method: 'CASH', reference: `RV10-MO-PHONG-${index}`, note: marker, receivedAt: start, recordedByUserId: byRole.MANAGER, idempotencyKey: `${prefix}-payment-${index}` } });
        await tx.handoverAppointment.create({ data: { appointmentCode: `RV10-BG-0${index + 1}`, reservationId: reservation.id, scheduledAt: start, status: 'COMPLETED', requestedByUserId: byRole.CUSTOMER, confirmedByUserId: byRole.STAFF, confirmedAt: start, completedByUserId: byRole.STAFF, completedAt: start, note: marker, handoverNote: marker + ' Đã giao chìa khóa và đối chiếu người nhận trong bộ dữ liệu giả định.', idempotencyKey: `${prefix}-handover-${index}` } });
        const item = await tx.storedItem.create({ data: { id: `${prefix}-item-${index}`, itemCode: `RV10-HANG-0${index + 1}`, customerUserId: byRole.CUSTOMER, rentalContractId: contract.id, name: ['Hồ sơ kế toán đã đóng thùng', 'Sách tham khảo', 'Tủ hồ sơ văn phòng'][index], unit: index === 2 ? 'cái' : 'thùng', balance: [12, 8, 2][index], note: marker } });
        await tx.stockMovement.create({ data: { movementCode: `RV10-NHAP-0${index + 1}`, customerUserId: byRole.CUSTOMER, rentalContractId: contract.id, type: 'IN', status: 'COMPLETED', assignedStaffUserId: byRole.STAFF, assignedByUserId: byRole.MANAGER, completedByUserId: byRole.STAFF, assignedAt: start, completedAt: start, note: marker, completionNote: 'Đã kiểm đếm đủ trong dữ liệu mô phỏng.', idempotencyKey: `${prefix}-in-${index}`, lines: { create: { storedItemId: item.id, requestedQty: item.balance, actualQty: item.balance } } } });
        if (index === 0) {
          await tx.stockMovement.create({ data: { movementCode: 'RV10-XUAT-01', customerUserId: byRole.CUSTOMER, rentalContractId: contract.id, type: 'OUT', status: 'ASSIGNED', assignedStaffUserId: byRole.STAFF, assignedByUserId: byRole.MANAGER, assignedAt: new Date(), note: marker + ' Khách tự lấy 2 thùng; nhân viên kiểm đếm.', idempotencyKey: `${prefix}-out`, lines: { create: { storedItemId: item.id, requestedQty: 2 } } } });
          await tx.supportRequest.create({ data: { supportCode: 'RV10-HOTRO-01', customerUserId: byRole.CUSTOMER, reservationId: reservation.id, rentalContractId: contract.id, storageUnitId: units[index].id, subject: 'Cần hướng dẫn lấy hàng lần đầu', description: marker + ' Khách muốn biết lối đi và thủ tục lấy 2 thùng hồ sơ.', category: 'OTHER', priority: 'MEDIUM', status: 'ASSIGNED', assignedStaffUserId: byRole.STAFF, idempotencyKey: `${prefix}-support` } });
        }
      }
      await tx.maintenanceRequest.create({ data: { maintenanceCode: 'RV10-BAOTRI-01', storageUnitId: units[4].id, source: 'MANUAL', category: 'CLEANING', priority: 'MEDIUM', status: 'OPEN', description: marker + ' Vệ sinh kho trống trước khi đưa lại vào cho thuê.', reportedByUserId: byRole.MANAGER, assignedStaffUserId: byRole.STAFF, activeKey: `MAINTENANCE:${units[4].id}`, createIdempotencyKey: `${prefix}-maintenance` } });
      if (process.argv.includes('--verify')) throw new Error('RV10_VERIFY_ROLLBACK');
    }, { maxWait: 15000, timeout: 45000 });
    await writeFile(accountsFile, JSON.stringify({ ...manifest, applied: true, appliedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    console.log('Đã tạo bộ RV10 mới, không ghi đè hồ sơ cũ. Không gửi email hoặc chuyển tiền thật.');
    console.log('Tài khoản và mật khẩu nằm trong file riêng bị Git bỏ qua: ' + fileURLToPath(accountsFile));
  }
} catch (error) { if (error?.message === 'RV10_VERIFY_ROLLBACK') console.log('Đã kiểm tra toàn bộ bộ demo bằng giao dịch rollback; không giữ dữ liệu thử trong DB.'); else throw error; } finally { await db.$disconnect(); }
