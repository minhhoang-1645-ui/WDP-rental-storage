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
const review = () => proposals.map(item => ({ ...item, decision: item.earlyReturnDecision, customer, reservation: { ...reservation, effectiveEndDate: end }, contracts: [{ ...contract, unitCode: unit.unitCode }], financialSummary: { outstandingAmount: 100, paidAmount: 200, invoicedDeposit: 50 } }));
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
      const paid = proposals.some(item => item.earlyReturnDecision === 'APPROVED');
      const currentRental = { ...rental, contracts: [{ ...contract, returnReadiness: { canReturn: paid, totalOutstanding: paid ? 0 : 100 } }] };
      const items = kind === 'support-requests' ? proposals : kind === 'returns' ? returns : kind === 'rentals' ? [currentRental] : ['deposit-settlements', 'payment-submissions'].includes(kind) ? [] : fixture[kind];
      if (!items) { unexpected.push(path); return send({ message: 'Unexpected GET ' + path }, 500); }
      return send(id ? items.find(row => (row.id || row.reservationId) === id) : { page: 1, limit: 100, total: items.length, items });
    }
    const body = req.postDataJSON(); writes.push({ role, path, body });
    if (kind === 'support-requests' && role === 'CUSTOMER') {
      assert.equal(body.reservationId, reservation.id); assert.equal(body.subject, 'Đề nghị trả kho trước hạn'); assert.equal(body.category, 'OTHER'); assert.equal(body.rentalContractId, contract.id);
      const row = { ...body, id: 'early-proposal', supportCode: 'SUP-EARLY', status: 'OPEN', reservation, contract, createdAt: new Date().toISOString(), earlyReturnDecision: null }; proposals.push(row); return send(row, 201);
    }
    if (kind === 'early-return-requests' && role === 'MANAGER') {
      assert.equal(body.reviewedEndDate, end); assert.equal(body.reviewedOutstandingAmount, 100); assert.equal(body.reviewedPaidAmount, 200); assert.equal(body.financialReviewConfirmed, true);
      if (stale) { stale = false; return send({ message: 'Công nợ vừa thay đổi. Tải lại để đối chiếu.' }, 409); }
      Object.assign(proposals[0], { status: 'RESOLVED', earlyReturnDecision: body.decision, earlyReturnForEndDate: end, resolutionNote: 'Đã chấp thuận trả trước hạn. ' + body.note, resolvedAt: new Date().toISOString() }); return send(review()[0]);
    }
    if (kind === 'returns' && role === 'CUSTOMER') {
      assert(proposals.some(item => item.earlyReturnDecision === 'APPROVED')); assert.equal(body.reservationId, reservation.id); assert.equal(body.rentalContractId, contract.id);
      const row = { ...fixture.returns[0], id: 'return-early', returnCode: 'RET-EARLY', status: 'REQUESTED' }; returns.push(row); return send(row, 201);
    }
    unexpected.push(`${method} ${path}`); return send({ message: 'Unexpected write' }, 500);
  });
  const page = await context.newPage(); page.setDefaultTimeout(mobile ? 60000 : 20000); page.on('pageerror', error => errors.push(error.message));
  await page.goto((mobile ? mobileUrl : webUrl) + path);
  return { context, page };
}
try {
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
    const save = manager.page.getByRole('button', { name: 'Lưu quyết định trả sớm', exact: true }); assert(await save.isDisabled());
    await manager.page.getByLabel('Điều kiện hoặc lý do trả sớm', { exact: true }).fill('Đã đối chiếu công nợ; quyết toán theo hồ sơ hiện có.');
    await manager.page.getByLabel('Tôi đã kiểm tra hóa đơn, tiền cọc và điều kiện trả kho', { exact: true }).check();
    stale = true; await save.click(); await manager.page.getByRole('alert').filter({ hasText: 'Công nợ vừa thay đổi' }).waitFor(); assert.equal(proposals[0].status, 'OPEN');
    await save.click(); await manager.page.getByRole('heading', { name: 'Không có đề nghị phù hợp', exact: true }).waitFor(); await manager.context.close();
    const approved = await open('CUSTOMER', width, '/customer/returns'); const ready = approved.page.getByLabel('Kho muốn trả', { exact: true }); await selectChoice(ready, contract.id);
    await approved.page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await approved.page.getByRole('dialog', { name: 'Xác nhận trả kho' }).getByRole('button', { name: 'Gửi yêu cầu trả kho', exact: true }).click();
    await approved.page.getByText('Đã gửi yêu cầu trả kho.', { exact: true }).waitFor(); assert.equal(returns.length, 1);
    assert(await approved.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await approved.context.close();
    const operator = await open('STAFF', width, '/staff/support-requests/early-proposal'); await operator.page.getByText('Không tìm thấy yêu cầu hỗ trợ.', { exact: false }).waitFor(); assert.equal(await operator.page.getByRole('button', { name: 'Hoàn tất hỗ trợ', exact: true }).count(), 0); await operator.context.close();
    checks.push(`${width}px: future rental blocked → proposal → Manager financial review → stale ledger error retained → approve → Customer returns early; Staff cannot resolve approval as support`);
  }
  if (!process.argv.includes('--web-only')) {
    proposals = []; returns = [];
    const mobileClient = await open('CUSTOMER', 390, '/customer/rentals/' + reservation.id, true);
    await mobileClient.page.getByRole('button', { name: 'Đề nghị trả trước hạn kho ' + unit.unitCode, exact: true }).click();
    await mobileClient.page.getByLabel('Lý do trả trước hạn', { exact: true }).fill('Tôi muốn trả kho sớm.');
    await mobileClient.page.getByRole('checkbox', { name: 'Tôi xác nhận thông tin và thao tác này', exact: true }).click();
    await mobileClient.page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
    await mobileClient.page.getByText('Đề nghị đang chờ quản lý', { exact: true }).waitFor(); await mobileClient.context.close();
    const mobileManager = await open('MANAGER', 390, '/manager/early-returns', true);
    await mobileManager.page.getByRole('button', { name: 'Chấp thuận trả trước hạn', exact: true }).click();
    await mobileManager.page.getByLabel('Điều kiện hoặc lý do trả sớm', { exact: true }).fill('Đã đối chiếu, giữ nguyên hóa đơn và xử lý cọc khi kiểm tra.');
    await mobileManager.page.getByRole('checkbox', { name: 'Tôi đã đối chiếu công nợ, cọc và điều kiện với hồ sơ hiện tại', exact: true }).click();
    await mobileManager.page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
    await mobileManager.page.getByText('Đã phản hồi đề nghị trả trước hạn cho khách.', { exact: true }).waitFor(); await mobileManager.context.close();
    const mobileApproved = await open('CUSTOMER', 390, '/customer/rentals/' + reservation.id, true);
    await mobileApproved.page.getByRole('button', { name: 'Trả kho ' + unit.unitCode, exact: true }).click();
    await mobileApproved.page.getByRole('checkbox', { name: 'Tôi xác nhận muốn trả kho ' + unit.unitCode, exact: true }).click();
    await mobileApproved.page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
    await mobileApproved.page.getByText('Đã gửi yêu cầu.', { exact: true }).waitFor(); assert.equal(returns.length, 1); await mobileApproved.context.close();
    checks.push('390px Expo web: Customer proposal → Manager financial approval → Customer early return');
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); console.log(JSON.stringify({ checks, mockedWrites: writes.length, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
