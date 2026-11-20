import { selectChoice } from './select-choice.mjs';
import { mkdir } from 'node:fs/promises';
// Every API request is intercepted. No test rental, invoice or account reaches the database.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, customer, staff, unit, reservation } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser(), errors = [], unexpected = [], writes = [], checks = [];
const end = '2030-04-01', contract = { ...fixture.contracts[0], endDate: end, unit: { ...unit, status: 'OCCUPIED' }, storageUnit: unit };
const webUrl = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const mobileUrl = process.env.WDP_MOBILE_URL || 'http://127.0.0.1:8081';
const rental = { ...fixture.rentals[0], rentalState: 'ACTIVE', effectiveEndDate: end, isOverdue: false, contracts: [contract], pendingRenewal: null, historicalPricing: { billingMode: 'MONTHLY' }, billingSummary: { totalInvoiced: 300, totalPaid: 200, totalOutstanding: 100, nextInvoice: null } };
let proposals = [], returns = [], stale = false;
const deposit = { ...fixture['deposit-settlements'][0], customer, status: 'APPROVED', refundAmount: 1000000, physicalInspections: [] };
const estimate = { effectiveDate: '2029-01-10', lastCycleStart: '2028-12-17', rentalAmount: 200, outstandingAmount: 75, serviceAmount: 0, waivedAmount: 25, refundAmount: 100,
  adjustedInvoices: [
    { id: 'inv-recurring', code: 'INV-RECURRING', type: 'RECURRING', periodStart: '2029-01-17', periodEnd: '2029-02-17', paidAmount: 0, unusedRent: 25, waived: 25, refund: 0 },
    { id: 'inv-renewal', code: 'INV-RENEWAL', type: 'RENEWAL', periodStart: '2029-02-17', periodEnd: '2029-03-17', paidAmount: 100, unusedRent: 100, waived: 0, refund: 100 },
  ],
};
const review = () => proposals.map(item => ({ ...item, decision: item.earlyReturnDecision, customer, reservation: { ...reservation, effectiveEndDate: end }, contracts: [{ ...contract, unitCode: unit.unitCode }], estimate, currentDeposit: 50, financialSummary: { outstandingAmount: 100, paidAmount: 200, invoicedDeposit: 50 }, ...item.closeoutReview }));
async function open(role, width, path, mobile = false) {
  const context = await browser.newContext({ viewport: { width, height: 960 } });
  await context.addInitScript(role => { localStorage.setItem('wdp-auth-token-v1', `isolated-${role}`); localStorage.setItem('wdp-mobile-auth-token', `isolated-${role}`); }, role);
  await context.route(/\/api\//, async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace(/^\/api\//, ''), method = req.method(), parts = path.split('/');
    const kind = parts[parts[1] === 'management' ? 2 : 1], id = parts[parts[1] === 'management' ? 3 : 2];
    const send = (json, status = 200) => route.fulfill({ json, status });
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === 'auth/me') return send({ ...(role === 'CUSTOMER' ? customer : staff), role, id: role === 'CUSTOMER' ? customer.id : role.toLowerCase() + '-id', accountStatus: 'ACTIVE' });
    if (path === 'customer/payment-config') return send({ vnpayConfigured: true, configured: false });
    if (path === 'reservations') return send([]);
    if (method === 'GET') {
      if (path === 'manager/dashboard/summary') return send({});
      if (path === 'notifications' || kind === 'notifications') return send({ items: [], total: 0, unreadCount: 0, page: 1, limit: 100 });
      if (['transfer-orders', 'damage-claims'].includes(kind)) return send({ items: [], total: 0, page: 1, limit: 100 });
      if (path === 'booking/catalog') return send({ products: [] });
      if (role === 'STAFF' && kind === 'support-requests' && id) return send({ message: 'Không tìm thấy yêu cầu hỗ trợ.' }, 404);
      if (kind === 'early-return-requests') return send({ page: 1, limit: 100, total: proposals.length, items: review() });
      if (kind === 'deposit-settlements' && id === deposit.id && role === 'MANAGER') return send({
        ...deposit, earlyReturnSettlement: proposals[0]?.closeoutReview ?? null,
      });
      const approved = proposals.find(item => item.earlyReturnDecision === 'APPROVED');
      const currentRental = { ...rental, contracts: [{ ...contract, returnReadiness: { canReturn: Boolean(approved), totalOutstanding: 100,
        ...(approved ? { policy: 'PERIOD_CLOSEOUT_V1', earlyReturnBlockReason: null } : {}) }, earlyReturnEstimate: estimate }] };
      const items = kind === 'support-requests' ? proposals : kind === 'returns' ? returns : kind === 'rentals' ? [currentRental] : ['deposit-settlements', 'payment-submissions'].includes(kind) ? [] : fixture[kind];
      if (!items) { unexpected.push(path); return send({ message: 'Unexpected GET ' + path }, 500); }
      return send(id ? items.find(row => (row.id || row.reservationId) === id) : { page: 1, limit: 100, total: items.length, items });
    }
    const body = req.postDataJSON(); writes.push({ role, path, body });
    if (kind === 'deposit-settlements' && id === deposit.id && role === 'MANAGER' && parts.at(-1) === 'refund') {
      assert.deepEqual(body, { method: 'BANK_TRANSFER', refundConfirmed: true });
      assert(req.headers()['idempotency-key']);
      Object.assign(deposit, { status: 'SETTLED', refundMethod: body.method, refundedAt: new Date().toISOString() });
      return send(deposit);
    }
    if (kind === 'deposit-settlements' && id === deposit.id && role === 'MANAGER' && parts.at(-1) === 'confirm-return-refund') {
      assert.deepEqual(body, { depositAmount: deposit.status === 'APPROVED' ? deposit.refundAmount : 0, rentAmount: 100, refundConfirmed: true });
      assert(req.headers()['idempotency-key']);
      const now = new Date().toISOString();
      if (body.depositAmount) Object.assign(deposit, { status: 'SETTLED', refundMethod: 'BANK_TRANSFER', refundedAt: now });
      Object.assign(proposals[0].closeoutReview.rentRefund, { approvedAt: now, refundedAt: now });
      return send(deposit);
    }
    if (kind === 'support-requests' && role === 'CUSTOMER') {
      assert.equal(body.reservationId, reservation.id); assert.equal(body.subject, 'Đề nghị trả kho trước hạn'); assert.equal(body.category, 'OTHER'); assert.equal(body.rentalContractId, contract.id);
      const row = { ...body, id: 'early-proposal', supportCode: 'SUP-EARLY', status: 'OPEN', reservation, contract, createdAt: new Date().toISOString(), earlyReturnDecision: null,
        earlyReturnFinancialReview: { requestedDate: body.earlyReturnRequestedDate, reason: body.earlyReturnReason } }; proposals.push(row); return send(row, 201);
    }
    if (kind === 'early-return-requests' && role === 'MANAGER') {
      assert.equal(body.reviewedEndDate, end); assert.equal(body.reviewedOutstandingAmount, 100); assert.equal(body.reviewedPaidAmount, 200); assert.equal(body.financialReviewConfirmed, true);
      if (stale) { stale = false; return send({ message: 'Công nợ vừa thay đổi. Tải lại để đối chiếu.' }, 409); }
      Object.assign(proposals[0], { status: 'RESOLVED', earlyReturnDecision: body.decision, earlyReturnForEndDate: end, financialReview: { policy: 'PERIOD_CLOSEOUT_V1' }, resolutionNote: 'Đã chấp thuận trả trước hạn. ' + body.note, resolvedAt: new Date().toISOString() }); return send(review()[0]);
    }
    if (kind === 'returns' && role === 'CUSTOMER') {
      assert(proposals.some(item => item.earlyReturnDecision === 'APPROVED')); assert.equal(body.reservationId, reservation.id); assert.equal(body.rentalContractId, contract.id);
      const row = { ...fixture.returns[0], id: 'return-early', returnCode: 'RET-EARLY', status: 'REQUESTED', rentalContractId: contract.id }; returns.push(row); return send(row, 201);
    }
    if (kind === 'returns' && role === 'STAFF' && parts.at(-1) === 'finalize') {
      assert.equal(body.accessRevoked, true);
      Object.assign(returns[0], { status: 'PENDING_SETTLEMENT', physicallyReturnedAt: new Date().toISOString() });
      return send(returns[0]);
    }
    if (kind === 'returns' && role === 'STAFF' && parts.at(-1) === 'start-inspection') {
      Object.assign(returns[0], { status: 'INSPECTION_IN_PROGRESS', inspectionStartedAt: new Date().toISOString() });
      return send(returns[0]);
    }
    unexpected.push(`${method} ${path}`); return send({ message: 'Unexpected write' }, 500);
  });
  const page = await context.newPage(); page.setDefaultTimeout(mobile ? 60000 : 20000); page.on('pageerror', error => errors.push(error.message));
  await page.goto((mobile ? mobileUrl : webUrl) + path);
  return { context, page };
}
try {
  const refund = await open('MANAGER', 1440, '/manager/operations/deposit-settlements/' + deposit.id);
  const recordRefund = refund.page.getByRole('button', { name: 'Ghi nhận hoàn tiền', exact: true });
  await recordRefund.waitFor();
  assert(await recordRefund.isDisabled());
  assert.equal(await refund.page.getByRole('region', { name: 'Xác nhận hoàn tiền' }).count(), 0);
  await refund.page.getByRole('heading', { name: /^Hoàn tiền ·/ }).waitFor();
  await refund.page.getByRole('navigation', { name: 'Đường dẫn' }).getByText('Hoàn tiền', { exact: true }).waitFor();
  await refund.page.locator('.manager-sidebar').getByRole('link', { name: /^Hoàn tiền/ }).waitFor();
  assert.equal(await refund.page.getByLabel('Mã giao dịch hoàn tiền', { exact: true }).count(), 0);
  await refund.page.getByRole('checkbox', { name: 'Tôi đã hoàn tiền thực tế cho khách.' }).check();
  await recordRefund.click();
  await recordRefund.waitFor({ state: 'hidden' });
  assert.equal(deposit.status, 'SETTLED');
  await refund.context.close();
  checks.push('Manager can record a deposit refund with confirmation and no transaction code');
  proposals = [{ id: 'legacy-early-proposal', supportCode: 'SUP-LEGACY', status: 'RESOLVED', earlyReturnDecision: 'APPROVED',
    resolvedAt: new Date().toISOString(), resolvedBy: staff, description: 'Trả kho trước hạn.',
    resolutionNote: 'Đã chấp thuận trả trước hạn. Khách phải thanh toán đủ hóa đơn liên quan đến kho này, kể cả các kỳ chưa đến hạn, trước khi gửi yêu cầu và bàn giao lại kho. Chấp nhận.' }];
  const legacy = await open('MANAGER', 1440, '/manager/early-returns?record=legacy-early-proposal');
  await legacy.page.getByText('Các kỳ chưa bắt đầu được miễn sau khi bàn giao kho.', { exact: false }).waitFor();
  assert.equal(await legacy.page.getByText('kể cả các kỳ chưa đến hạn', { exact: false }).count(), 0);
  await legacy.page.getByText('Chấp nhận.', { exact: true }).waitFor();
  await legacy.page.getByText('Chi tiết miễn thu và hoàn tiền (2 hóa đơn)', { exact: true }).click();
  await legacy.page.getByRole('listitem').filter({ hasText: 'INV-RECURRING' }).getByText('Chưa thu tiền', { exact: true }).waitFor();
  const renewalDetail = legacy.page.getByRole('listitem').filter({ hasText: 'INV-RENEWAL' });
  await renewalDetail.getByText('tiền gia hạn của kỳ chưa bắt đầu', { exact: false }).waitFor();
  await renewalDetail.getByText('Dự kiến hoàn', { exact: false }).first().waitFor();
  assert.equal(await legacy.page.getByRole('button', { name: 'Duyệt theo chính sách mới' }).count(), 0);
  assert.equal(await legacy.page.getByRole('button', { name: 'Cho phép trả kho trước hạn' }).count(), 0);
  await legacy.context.close();
  checks.push('Legacy Manager approval shows the current policy and keeps the manager note');
  if (!process.argv.includes('--web-only')) {
    Object.assign(proposals[0], { subject: 'Đề nghị trả kho trước hạn', reservation, contract, earlyReturnForEndDate: end });
    const path = '/customer/returns/new?approvedEarlyReturn=1&reservationId=' + reservation.id + '&rentalContractId=' + contract.id;
    const ready = await open('CUSTOMER', 390, path, true);
    await ready.page.getByRole('button', { name: 'Gửi yêu cầu trả kho', exact: true }).click();
    await ready.page.getByRole('checkbox', { name: 'Tôi xác nhận muốn trả kho ' + unit.unitCode, exact: true }).click();
    await ready.page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
    await ready.page.getByText('Theo dõi trả kho', { exact: true }).first().waitFor();
    assert.equal(returns.length, 1);
    await ready.context.close();
    const rentalDetail = await open('CUSTOMER', 390, '/customer/rentals/' + reservation.id, true);
    await rentalDetail.page.getByRole('button', { name: /Theo dõi yêu cầu trả kho/ }).click();
    await rentalDetail.page.getByText('Theo dõi trả kho', { exact: true }).first().waitFor();
    assert.match(rentalDetail.page.url(), /\/customer\/returns\/return-early$/);
    await rentalDetail.context.close();
    checks.push('Expo Web: an existing approval can submit despite outstanding future invoices');
    checks.push('Expo Web: rental details link directly to the submitted return request');
  }
  for (const width of [1440, 390]) {
    proposals = []; returns = [];
    const client = await open('CUSTOMER', width, '/customer/returns');
    const eligible = client.page.getByLabel('Kho muốn trả', { exact: true }); await eligible.waitFor(); assert.equal(await eligible.locator('..').locator('option').count(), 1);
    if (process.env.WDP_SCREENSHOTS_DIR) { await mkdir(process.env.WDP_SCREENSHOTS_DIR, { recursive: true }); await client.page.screenshot({ path: `${process.env.WDP_SCREENSHOTS_DIR}/early-customer-${width}.png`, fullPage: true }); }
    await client.page.getByText('Gửi đề nghị mới', { exact: true }).click();
    await selectChoice(client.page.getByLabel('Kho muốn trả sớm', { exact: true }), contract.id); await client.page.getByLabel('Lý do trả trước hạn', { exact: true }).fill('Tôi không còn nhu cầu lưu trữ.');
    await client.page.getByRole('button', { name: 'Gửi đề nghị trả trước hạn', exact: true }).click(); await client.page.getByText('Chờ quản lý xem xét', { exact: false }).waitFor(); await client.context.close();
    const manager = await open('MANAGER', width, '/manager/early-returns'); await manager.page.getByText('100 ₫', { exact: false }).first().waitFor();
    if (process.env.WDP_SCREENSHOTS_DIR) await manager.page.screenshot({ path: `${process.env.WDP_SCREENSHOTS_DIR}/early-manager-${width}.png`, fullPage: true });
    const save = manager.page.getByRole('button', { name: 'Cho phép trả kho trước hạn', exact: true }); assert(await save.isDisabled());
    await manager.page.getByLabel('Ghi chú quyết định', { exact: true }).fill('Đã đối chiếu công nợ; quyết toán khi nhận lại kho.');
    await manager.page.getByLabel('Tôi đã kiểm tra hóa đơn, tiền cọc và điều kiện trả kho', { exact: true }).check();
    stale = true; await save.click(); await manager.page.getByRole('alert').filter({ hasText: 'Công nợ vừa thay đổi' }).waitFor(); assert.equal(proposals[0].status, 'OPEN');
    await save.click(); await manager.page.getByRole('heading', { name: 'Không có đề nghị phù hợp', exact: true }).waitFor(); await manager.context.close();
    const approved = await open('CUSTOMER', width, '/customer/returns'); const ready = approved.page.getByLabel('Kho muốn trả', { exact: true }); await selectChoice(ready, contract.id);
    await approved.page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await approved.page.getByRole('dialog', { name: 'Xác nhận trả kho' }).getByRole('button', { name: 'Gửi yêu cầu trả kho', exact: true }).click();
    await approved.page.getByText('Đã gửi yêu cầu trả kho.', { exact: true }).waitFor(); assert.equal(returns.length, 1);
    assert(await approved.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await approved.context.close();
    Object.assign(returns[0], {
      assignedStaff: { ...staff, id: 'staff-id' },
      inspections: [{ ...fixture.returns[0].inspections[0], result: 'PASS', issueType: null, contract }],
      inspectionSummary: { total: 1, pending: 0, passed: 1, issues: 0 },
      returnReadiness: { canReturn: true, policy: 'PERIOD_CLOSEOUT_V1' }, inventory: { pendingMovements: 0, remainingItemTypes: 0 },
    });
    const handover = await open('STAFF', width, '/staff/returns/return-early');
    await handover.page.getByRole('button', { name: 'Bắt đầu kiểm tra' }).click();
    await handover.page.getByRole('checkbox', { name: /thu hồi chìa khóa/ }).check();
    await handover.page.getByRole('button', { name: 'Hoàn tất nhận kho trả' }).click();
    await handover.page.getByText('Đã lưu thao tác thành công.').first().waitFor();
    await handover.context.close();
    if (width === 1440) Object.assign(deposit, { status: 'APPROVED', outstandingAmount: 0, refundedAt: null });
    proposals[0].closeoutReview = { returnId: 'return-early', physicallyReturnedAt: new Date().toISOString(), closeout: { ...estimate, appliedAt: new Date().toISOString() }, rentRefund: {}, depositSettlement: deposit };
    const earlyReturnPath = '/manager/early-returns?record=early-proposal';
    const depositPath = '/manager/operations/deposit-settlements/' + deposit.id;
    const settlement = await open('MANAGER', width, earlyReturnPath);
    await settlement.page.getByRole('link', { name: 'Xem hồ sơ hoàn tiền' }).click();
    await settlement.page.waitForURL(url => url.pathname === depositPath);
    const combined = settlement.page.getByRole('region', { name: 'Xác nhận hoàn tiền' });
    await combined.getByText(width === 1440 ? '1.000.100 ₫' : '100 ₫', { exact: true }).last().waitFor();
    await combined.getByText('Chi tiết miễn thu và hoàn tiền (2 hóa đơn)').click();
    await combined.getByText('Hóa đơn gia hạn', { exact: false }).waitFor();
    assert.equal(await settlement.page.getByLabel('Mã chuyển khoản').count(), 0);
    assert.equal(await settlement.page.getByLabel('Thời điểm chuyển khoản').count(), 0);
    assert.equal(await settlement.page.getByRole('button', { name: 'Ghi nhận hoàn tiền', exact: true }).count(), 0);
    const confirm = combined.getByRole('button', { name: 'Xác nhận đã chuyển tiền' });
    assert(await confirm.isDisabled());
    await combined.getByRole('checkbox', { name: 'Tôi đã chuyển số tiền trên cho khách.' }).check();
    await confirm.click();
    await combined.getByText('Đã ghi nhận hoàn', { exact: false }).waitFor();
    assert.equal(await confirm.count(), 0);
    await settlement.context.close();
    const linkedSettlement = await open('MANAGER', width, earlyReturnPath);
    await linkedSettlement.page.getByText('Tiền thuê và dịch vụ đã hoàn', { exact: true }).waitFor();
    await linkedSettlement.context.close();
    const operator = await open('STAFF', width, '/staff/support-requests/early-proposal'); await operator.page.getByText('Không tìm thấy yêu cầu hỗ trợ.', { exact: false }).waitFor(); assert.equal(await operator.page.getByRole('button', { name: 'Hoàn tất hỗ trợ', exact: true }).count(), 0); await operator.context.close();
    checks.push(`${width}px: proposal → stale ledger caught → Manager approval → Customer request → Staff handover → Manager settlement approval → refund recorded`);
  }
  if (!process.argv.includes('--web-only')) {
    proposals = []; returns = [];
    const mobileClient = await open('CUSTOMER', 390, '/customer/early-returns/new?rentalContractId=' + contract.id, true);
    await mobileClient.page.getByLabel('Ngày muốn trả kho *', { exact: true }).fill('2029-01-10');
    await mobileClient.page.getByRole('radio', { name: 'Không còn nhu cầu', exact: true }).click();
    await mobileClient.page.getByRole('button', { name: 'Gửi đề nghị', exact: true }).click();
    await mobileClient.page.getByText('Ngày muốn trả', { exact: false }).waitFor();
    assert.equal(proposals[0].earlyReturnRequestedDate, '2029-01-10'); await mobileClient.context.close();
    const mobileManager = await open('MANAGER', 390, '/manager/early-returns', true);
    await mobileManager.page.getByRole('button', { name: 'Chấp thuận trả trước hạn', exact: true }).click();
    await mobileManager.page.getByLabel('Điều kiện hoặc lý do trả sớm', { exact: true }).fill('Đã đối chiếu, giữ nguyên hóa đơn và xử lý cọc khi kiểm tra.');
    await mobileManager.page.getByRole('checkbox', { name: 'Tôi đã đối chiếu công nợ, cọc và điều kiện với hồ sơ hiện tại', exact: true }).click();
    await mobileManager.page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
    await mobileManager.page.getByText('Đã phản hồi đề nghị trả trước hạn cho khách.', { exact: true }).waitFor(); await mobileManager.context.close();
    const mobileApproved = await open('CUSTOMER', 390, '/customer/rentals/' + reservation.id, true);
    await mobileApproved.page.getByRole('button', { name: 'Yêu cầu trả kho', exact: true }).click();
    await mobileApproved.page.getByRole('checkbox', { name: 'Tôi xác nhận muốn trả kho ' + unit.unitCode, exact: true }).click();
    await mobileApproved.page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
    await mobileApproved.page.getByText('Đã gửi yêu cầu.', { exact: true }).waitFor(); assert.equal(returns.length, 1); await mobileApproved.context.close();
    checks.push('390px Expo web: Customer proposal → Manager financial approval → Customer early return');
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); console.log(JSON.stringify({ checks, mockedWrites: writes.length, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
