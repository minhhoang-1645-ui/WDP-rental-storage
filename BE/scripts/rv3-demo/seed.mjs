import 'reflect-metadata';
import assert from 'node:assert/strict';
import { PrismaService } from '../../dist/prisma/prisma.service.js';
import { PricingService } from '../../dist/modules/pricing/pricing.service.js';
import { ContractsService } from '../../dist/modules/contracts/contracts.service.js';
import { BillingService } from '../../dist/modules/billing/billing.service.js';
import { AppointmentsService } from '../../dist/modules/appointments/appointments.service.js';
import { StockMovementsService } from '../../dist/modules/stock-movements/stock-movements.service.js';
import { ReturnsService } from '../../dist/modules/returns/returns.service.js';
import { businessDate } from '../../dist/business-date.js';
import { accounts, assertAccounts, catalogCodes, prefix, marker, hash, protectedTables, quoteIdentifier } from './safety.mjs';

const dateKey = date => date.toISOString().slice(0, 10);
const months = (value, count) => { const date = new Date(value), day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + count); date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate())); return date; };
// Existing services may start nested transactions. In this fixture runner they all
// participate in the SAME outer serializable transaction, not separate commits.
const transactionFacade = tx => new Proxy(tx, { get(target, key) { if (key === '$transaction') return async callback => { if (typeof callback !== 'function') throw new Error('Unsupported batch transaction.'); return callback(tx); }; const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; } });

async function verify(tx) {
  const reservations = await tx.reservation.findMany({ where: { id: { startsWith: prefix + '-reservation-' } }, include: { units: true, contracts: { include: { reservationUnit: { include: { storageUnit: true } } } }, invoices: { include: { payments: true } } } });
  assert.equal(reservations.length, 5, 'Exactly five RV3 scenarios required.');
  const used = new Set(); let paid = 0n, outstanding = 0n, invoices = 0;
  for (const reservation of reservations) {
    assert.equal(reservation.units.length, reservation.status === 'CONFIRMED' ? reservation.quantity : 0);
    assert.equal(reservation.contracts.length, reservation.units.length);
    assert.equal(reservation.invoices.filter(invoice => invoice.type === 'INITIAL').length, reservation.status === 'CONFIRMED' ? 1 : 0);
    for (const contract of reservation.contracts) {
      assert.equal(contract.reservationUnit.reservationId, reservation.id);
      assert.equal(dateKey(contract.startDate), dateKey(reservation.startDate));
      assert.equal(dateKey(contract.endDate), dateKey(reservation.endDate));
      assert(!used.has(contract.reservationUnit.storageUnitId), 'Demo contracts must have distinct physical units.'); used.add(contract.reservationUnit.storageUnitId);
      if (['ACTIVE', 'READY_FOR_HANDOVER'].includes(contract.status)) {
        assert(contract.termsAcceptedAt && contract.termsAcceptedByUserId === reservation.customerId);
        assert(reservation.invoices.some(invoice => invoice.type === 'INITIAL' && invoice.status === 'PAID'));
      }
      if (contract.status === 'ACTIVE') {
        assert(dateKey(contract.startDate) <= businessDate());
        assert.equal(contract.reservationUnit.storageUnit.status, 'OCCUPIED');
        assert.equal(await tx.handoverAppointment.count({ where: { reservationId: reservation.id, status: 'COMPLETED' } }), 1);
      }
    }
    for (const invoice of reservation.invoices) {
      const sum = invoice.payments.reduce((total, payment) => total + payment.amount, 0n);
      assert.equal(invoice.amountPaid, sum); assert.equal(invoice.balanceDue, invoice.totalAmount - sum);
      assert.equal(invoice.totalAmount, invoice.rentalAmount + invoice.depositAmount + invoice.serviceAmount);
      assert.equal(invoice.status === 'PAID', invoice.balanceDue === 0n);
      if (invoice.type === 'RECURRING') assert.equal(invoice.depositAmount, 0n);
      paid += sum; outstanding += invoice.balanceDue; invoices++;
    }
  }
  const items = await tx.storedItem.findMany({ include: { movementLines: { include: { stockMovement: true } } } });
  for (const item of items) {
    let balance = 0;
    for (const line of item.movementLines) {
      if (line.stockMovement.status === 'COMPLETED') { assert.notEqual(line.actualQty, null); balance += (line.stockMovement.type === 'IN' ? 1 : -1) * line.actualQty; }
      else assert.equal(line.actualQty, null, 'Requested quantity is not an actual count.');
    }
    assert.equal(item.balance, balance);
  }
  const assignments = await tx.unitStaffAssignment.findMany({ include: { staff: true, assignedBy: true } });
  assert(assignments.every(item => item.staff.role === 'STAFF' && item.assignedBy.role === 'MANAGER'));
  return { reservations: reservations.map(row => ({ id: row.id, code: row.reservationCode, status: row.status, typeId: row.storageTypeId, start: dateKey(row.startDate), end: dateKey(row.endDate) })), totals: { invoices, recordedDemoCash: paid.toString(), outstanding: outstanding.toString(), storedBalance: items.reduce((sum, item) => sum + item.balance, 0) }, integrity: 'PASS', authentication: 'Four original credential records preserved; live-password login not attempted.' };
}

export async function execute(verifyOnly = false) {
  const db = new PrismaService();
  try {
    return await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(735319341)");
      const preserved = await tx.user.findMany({ where: { email: { in: Object.values(accounts) } }, orderBy: { email: 'asc' } }); assertAccounts(preserved);
      const existing = await tx.reservation.count({ where: { id: { startsWith: prefix + '-reservation-' } } });
      if (verifyOnly || existing) return { existing: true, ...await verify(tx) };
      // New fixture set only. Do not merge with legacy/shared operational data.
      const operationalTables = (await tx.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).map(row => row.tablename).filter(table => !protectedTables.has(table));
      for (const table of operationalTables) if (Number((await tx.$queryRawUnsafe(`SELECT count(*) AS count FROM ${quoteIdentifier(table)}`))[0].count)) throw new Error(`Target contains ${table}; seed refused. Use a new isolated demo database.`);
      const types = await tx.storageType.findMany({ where: { code: { in: catalogCodes } } });
      if (types.length !== 4 || types.some(type => !type.monthlyRate || Number(type.monthlyRate) <= 0)) throw new Error('Missing canonical monthly prices; never invent/overwrite rates.');
      const actors = Object.fromEntries(preserved.map(user => [user.role, user]));
      const client = transactionFacade(tx), pricing = new PricingService(client), contracts = new ContractsService(client), billing = new BillingService(client), appointments = new AppointmentsService(client), stock = new StockMovementsService(client);
      const today = new Date(businessDate() + 'T00:00:00Z'), tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 2);
      const units = [];
      for (const [index, code] of catalogCodes.entries()) {
        const type = types.find(type => type.code === code);
        for (let position = 1; position <= 3; position++) {
          const unit = await tx.storageUnit.create({ data: { id: `${prefix}-unit-${index}-${position}`, storageTypeId: type.id, unitNumber: `RV3-${['TU', 'NHO', 'VUA', 'LON'][index]}-0${position}`, floor: 'Tầng trệt', zone: `RV3-${code}`, row: index + 1, position, status: index === 3 && position === 3 ? 'MAINTENANCE' : 'AVAILABLE' } });
          await tx.unitStaffAssignment.create({ data: { storageUnitId: unit.id, staffUserId: actors.STAFF.id, assignedByUserId: actors.MANAGER.id } }); units.push(unit);
        }
      }
      const cases = [
        { name: '01-cho-staff', unit: units[6], start: tomorrow, pending: true, description: 'Ngoại lệ chờ Staff kiểm tra; chưa phân bổ, chưa có hợp đồng/hóa đơn.' },
        { name: '02-cho-ky', unit: units[0], start: tomorrow, description: 'Đã xác nhận; Customer cần ký rồi thanh toán.' },
        { name: '03-da-thanh-toan', unit: units[3], start: tomorrow, paid: true, description: 'Đã thu tiền mô phỏng; bàn giao chìa khóa sớm, chưa được dùng kho.' },
        { name: '04-dang-thue', unit: units[7], start: today, paid: true, active: true, description: 'Đang thuê; nhập 8/10 thùng thực tế; chờ nhập thêm và xuất hàng.' },
        { name: '05-den-han-tra', unit: units[9], start: months(today, -3), paid: true, active: true, due: true, description: 'Hồ sơ lịch sử mô phỏng đến hạn trả hôm nay.' },
      ];
      for (const [index, scenario] of cases.entries()) {
        const type = types.find(type => type.id === scenario.unit.storageTypeId), end = scenario.due ? today : months(scenario.start, 3);
        const paymentPlan = scenario.due ? 'PREPAID' : 'PAY_MONTHLY';
        const quote = pricing.calculate(type, { storageTypeId: type.id, quantity: 1, startDate: dateKey(scenario.start), endDate: dateKey(end), paymentPlan });
        scenario.reservation = await tx.reservation.create({ data: { id: `${prefix}-reservation-${scenario.name}`, reservationCode: `RV3-DAT-0${index + 1}`, customerId: actors.CUSTOMER.id, facilityId: type.facilityId, storageTypeId: type.id, quantity: 1, startDate: scenario.start, endDate: end, periodMode: 'DURATION', durationMonths: 3, status: scenario.pending ? 'PENDING' : 'CONFIRMED', quoteSnapshot: quote, quotedAmount: quote.quotedTotalAmount, availabilitySnapshot: { available: true, demoDataset: prefix }, notes: `${marker} ${scenario.description}`, idempotencyKey: `${prefix}-${scenario.name}`, confirmedAt: scenario.pending ? null : new Date(), expiresAt: scenario.paid ? null : new Date(Date.now() + 86400000) } });
        if (scenario.pending) continue;
        await tx.reservationUnit.create({ data: { reservationId: scenario.reservation.id, storageUnitId: scenario.unit.id, plannedStartDate: scenario.start, plannedEndDate: end } });
        await tx.storageUnit.update({ where: { id: scenario.unit.id }, data: { status: 'RESERVED' } });
        await contracts.ensureForConfirmedReservation(tx, scenario.reservation.id);
        scenario.contract = await tx.rentalContract.findFirstOrThrow({ where: { reservationId: scenario.reservation.id } });
        await billing.ensureInitialInvoice(tx, scenario.reservation.id);
        if (!scenario.paid) continue;
        // Explicit HISTORICAL PAPER fixture. No signature drawing, OTP evidence or
        // electronic acceptance is fabricated; production signing is unchanged.
        const document = await contracts.getCustomerContract(actors.CUSTOMER.id, scenario.contract.id);
        await tx.rentalContract.update({ where: { id: scenario.contract.id }, data: { termsVersion: 'RV3-DEMO-PAPER-HISTORY', termsAcceptedAt: scenario.start, termsAcceptedByUserId: actors.CUSTOMER.id, acceptanceName: actors.CUSTOMER.fullName, acceptanceNote: marker + ' Giả định ký giấy trong hồ sơ lịch sử demo; không xác thực OTP.', signedSnapshot: { ...document.terms.document, demoFixture: true } } });
        const invoice = await tx.invoice.findFirstOrThrow({ where: { reservationId: scenario.reservation.id, type: 'INITIAL' } });
        await billing.recordPayment(invoice.id, { amount: Number(invoice.totalAmount), method: 'CASH', reference: `RV3-FIXTURE-${scenario.name}`, note: marker }, `${prefix}-payment-${scenario.name}`, actors.MANAGER, tx);
        if (scenario.due) {
          // Import a clearly labelled completed historical handover. Current-time
          // handover service correctly refuses new activation after rental expiry.
          await tx.handoverAppointment.create({ data: { appointmentCode: 'RV3-BG-LICHSU', reservationId: scenario.reservation.id, status: 'COMPLETED', scheduledAt: scenario.start, requestedByUserId: actors.CUSTOMER.id, confirmedByUserId: actors.STAFF.id, confirmedAt: scenario.start, completedByUserId: actors.STAFF.id, completedAt: scenario.start, note: marker, handoverNote: marker + ' Hồ sơ lịch sử ký giấy và nhận chìa khóa.', idempotencyKey: `${prefix}-historical-handover` } });
          await tx.rentalContract.update({ where: { id: scenario.contract.id }, data: { status: 'ACTIVE', activatedAt: scenario.start } });
          await tx.storageUnit.update({ where: { id: scenario.unit.id }, data: { status: 'OCCUPIED' } });
        } else {
          const appointment = await appointments.createCustomerAppointment(actors.CUSTOMER, { reservationId: scenario.reservation.id, scheduledAt: new Date(Date.now() + 60000).toISOString(), note: marker }, `${prefix}-handover-${scenario.name}`);
          await appointments.completeHandover(appointment.id, { note: marker, handoverReport: { recipientType: 'CUSTOMER', identityVerified: true, unitInspected: true, accessDelivered: true, documentsDelivered: true, condition: 'Kho sạch, khô ráo; hồ sơ mô phỏng.', accessItemCount: 1 } }, actors.STAFF);
        }
      }
      const active = cases[3], movementInput = { rentalContractId: active.contract.id, type: 'IN', note: marker, lines: [{ name: 'Thùng hồ sơ RV3', unit: 'thùng', quantity: 10 }] };
      const incoming = await stock.create(actors.CUSTOMER, movementInput, `${prefix}-stock-completed`);
      await stock.assign(incoming.id, actors.STAFF.id, actors.MANAGER);
      await stock.complete(incoming.id, { note: marker + ' Khách thực mang 8/10 thùng, Staff đếm 8.', lines: incoming.lines.map(line => ({ lineId: line.id, actualQty: 8 })) }, actors.STAFF);
      const itemId = incoming.lines[0].storedItem.id;
      for (const [type, quantity] of [['IN', 3], ['OUT', 2]]) {
        const movement = await stock.create(actors.CUSTOMER, { rentalContractId: active.contract.id, type, note: marker + ' Khách tự vận chuyển, Staff kiểm đếm.', lines: [{ storedItemId: itemId, quantity }] }, `${prefix}-stock-pending-${type}`);
        await stock.assign(movement.id, actors.STAFF.id, actors.MANAGER);
      }
      const renewalEnd = months(active.reservation.endDate, 3), renewalQuote = pricing.calculate(types.find(type => type.id === active.reservation.storageTypeId), { storageTypeId: active.reservation.storageTypeId, quantity: 1, startDate: dateKey(active.reservation.endDate), endDate: dateKey(renewalEnd), paymentPlan: 'PREPAID' });
      await tx.renewalRequest.create({ data: { renewalCode: 'RV3-GIAHAN-01', reservationId: active.reservation.id, requestedByUserId: actors.CUSTOMER.id, previousEndDate: active.reservation.endDate, requestedEndDate: renewalEnd, termMonths: 3, paymentPlan: 'PREPAID', quoteSnapshot: { currency: 'VND', storageTypeId: active.reservation.storageTypeId, storageTypeName: types.find(type => type.id === active.reservation.storageTypeId).name, quantity: 1, previousEndDate: dateKey(active.reservation.endDate), renewalStartDate: dateKey(active.reservation.endDate), requestedEndDate: dateKey(renewalEnd), termMonths: 3, paymentPlan: 'PREPAID', monthlyUnitPrice: renewalQuote.monthlyUnitPrice, baseRentalAmount: renewalQuote.baseRentalAmount, discountPercent: renewalQuote.discountPercent, discountAmount: renewalQuote.discountAmount, rentalAmount: renewalQuote.rentalAmount, depositAmount: 0, totalAmount: renewalQuote.rentalAmount }, status: 'PENDING', activeKey: `RENEWAL:${active.reservation.id}`, idempotencyKey: `${prefix}-renewal` } });
      await new ReturnsService(client).createCustomerReturn(actors.CUSTOMER, { reservationId: cases[4].reservation.id, note: marker }, `${prefix}-return`);
      await tx.supportRequest.create({ data: { supportCode: 'RV3-HOTRO-01', customerUserId: actors.CUSTOMER.id, reservationId: active.reservation.id, rentalContractId: active.contract.id, storageUnitId: active.unit.id, subject: 'RV3 · Hướng dẫn lấy hàng', description: marker + ' Khách muốn được hướng dẫn lối đi.', category: 'OTHER', priority: 'MEDIUM', status: 'ASSIGNED', assignedStaffUserId: actors.STAFF.id, idempotencyKey: `${prefix}-support` } });
      await tx.maintenanceRequest.create({ data: { maintenanceCode: 'RV3-BAOTRI-01', storageUnitId: units[11].id, source: 'MANUAL', category: 'CLEANING', priority: 'MEDIUM', status: 'OPEN', description: marker + ' Vệ sinh kho trống, chưa cho thuê.', reportedByUserId: actors.MANAGER.id, assignedStaffUserId: actors.STAFF.id, activeKey: `MAINTENANCE:${units[11].id}`, createIdempotencyKey: `${prefix}-maintenance` } });
      const nextInvoice = await tx.invoice.findFirstOrThrow({ where: { reservationId: active.reservation.id, type: 'RECURRING' }, orderBy: { billingCycle: 'asc' } });
      const previousDemo = process.env.DEMO_PAYMENT_ENABLED; process.env.DEMO_PAYMENT_ENABLED = 'true';
      try { await billing.createDemoPaymentSubmission(actors.CUSTOMER, nextInvoice.id, { amount: Number(nextInvoice.balanceDue) }, `${prefix}-submission`); }
      finally { if (previousDemo === undefined) delete process.env.DEMO_PAYMENT_ENABLED; else process.env.DEMO_PAYMENT_ENABLED = previousDemo; }
      assert.equal(hash(await tx.user.findMany({ where: { email: { in: Object.values(accounts) } }, orderBy: { email: 'asc' } })), hash(preserved), 'Accounts must remain byte-for-byte unchanged.');
      const manifestIds = {};
      // Capture ownership BEFORE COMMIT. Records another app creates after commit
      // must never accidentally become deletable fixtures in the manifest.
      for (const table of operationalTables) manifestIds[table] = (await tx.$queryRawUnsafe(`SELECT id FROM ${quoteIdentifier(table)} ORDER BY id`)).map(row => row.id);
      return { existing: false, manifestIds, ...await verify(tx) };
    }, { isolationLevel: 'Serializable', timeout: 120000, maxWait: 15000 });
  } finally { await db.$disconnect(); }
}
