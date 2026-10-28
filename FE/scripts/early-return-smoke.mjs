import { mkdir } from 'node:fs/promises';
// Every API request is intercepted. No test rental, invoice or account reaches the database.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, customer, staff, unit, reservation } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser(), errors = [], unexpected = [], writes = [], checks = [];
const end = '2030-04-01', contract = { ...fixture.contracts[0], endDate: end, unit, storageUnit: unit };
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
    if (path === 'customer/payment-config') return send({ configured: false });
    if (path === 'reservations') return send([]);
    if (method === 'GET') {
      if (kind === 'early-return-requests') return send({ page: 1, limit: 100, total: proposals.length, items: review() });
      const items = kind === 'support-requests' ? proposals : kind === 'returns' ? returns : kind === 'rentals' ? [rental] : ['deposit-settlements', 'payment-submissions'].includes(kind) ? [] : fixture[kind];
      if (!items) { unexpected.push(path); return send({ message: 'Unexpected GET ' + path }, 500); }
      return send(id ? items.find(row => (row.id || row.reservationId) === id) : { page: 1, limit: 100, total: items.length, items });
    }
    const body = req.postDataJSON(); writes.push({ role, path, body });
    if (kind === 'support-requests' && role === 'CUSTOMER') {
      assert.equal(body.reservationId, reservation.id); assert.equal(body.subject, 'Đề nghị trả kho trước hạn'); assert.equal(body.category, 'OTHER'); assert(!body.rentalContractId);
      const row = { ...body, id: 'early-proposal', supportCode: 'SUP-EARLY', status: 'OPEN', reservation, createdAt: new Date().toISOString(), earlyReturnDecision: null }; proposals.push(row); return send(row, 201);
    }
    if (kind === 'early-return-requests' && role === 'MANAGER') {
      assert.equal(body.reviewedEndDate, end); assert.equal(body.reviewedOutstandingAmount, 100); assert.equal(body.reviewedPaidAmount, 200); assert.equal(body.financialReviewConfirmed, true);
      if (stale) { stale = false; return send({ message: 'Công nợ vừa thay đổi. Tải lại để đối chiếu.' }, 409); }
      Object.assign(proposals[0], { status: 'RESOLVED', earlyReturnDecision: body.decision, earlyReturnForEndDate: end, resolutionNote: 'Đã chấp thuận trả trước hạn. ' + body.note, resolvedAt: new Date().toISOString() }); return send(review()[0]);
    }
    if (kind === 'returns' && role === 'CUSTOMER') {
      assert(proposals.some(item => item.earlyReturnDecision === 'APPROVED')); assert.equal(body.reservationId, reservation.id);
      const row = { ...fixture.returns[0], id: 'return-early', returnCode: 'RET-EARLY', status: 'REQUESTED' }; returns.push(row); return send(row, 201);
    }
    unexpected.push(`${method} ${path}`); return send({ message: 'Unexpected write' }, 500);
  });
  const page = await context.newPage(); page.setDefaultTimeout(mobile ? 60000 : 20000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${mobile ? 8081 : 5173}${path}`);
  return { context, page };
}
try {
  for (const width of [1440, 390]) {
    proposals = []; returns = [];
    const client = await open('CUSTOMER', width, '/customer/returns');
    const eligible = client.page.getByLabel('Yêu cầu thuê đủ điều kiện trả', { exact: true }); await eligible.waitFor(); assert.equal(await eligible.locator('option').count(), 1);
    if (process.env.WDP_SCREENSHOTS_DIR) { await mkdir(process.env.WDP_SCREENSHOTS_DIR, { recursive: true }); await client.page.screenshot({ path: `${process.env.WDP_SCREENSHOTS_DIR}/early-customer-${width}.png`, fullPage: true }); }
    await client.page.getByLabel('Kho muốn trả sớm', { exact: true }).selectOption(reservation.id); await client.page.getByLabel('Lý do trả trước hạn', { exact: true }).fill('Tôi không còn nhu cầu lưu trữ.');
    await client.page.getByRole('button', { name: 'Gửi đề nghị trả trước hạn', exact: true }).click(); await client.page.getByText('Chờ quản lý xem xét', { exact: false }).waitFor(); await client.context.close();
    const manager = await open('MANAGER', width, '/manager/early-returns'); await manager.page.getByText('100 ₫', { exact: false }).first().waitFor();
    if (process.env.WDP_SCREENSHOTS_DIR) await manager.page.screenshot({ path: `${process.env.WDP_SCREENSHOTS_DIR}/early-manager-${width}.png`, fullPage: true });
    const save = manager.page.getByRole('button', { name: 'Lưu quyết định trả sớm', exact: true }); assert(await save.isDisabled());
    await manager.page.getByLabel('Điều kiện hoặc lý do trả sớm', { exact: true }).fill('Đã đối chiếu công nợ; quyết toán theo hồ sơ hiện có.');
    await manager.page.getByLabel('Tôi đã đối chiếu công nợ, cọc và điều kiện với hồ sơ hiện tại', { exact: true }).check();
    stale = true; await save.click(); await manager.page.getByRole('alert').filter({ hasText: 'Công nợ vừa thay đổi' }).waitFor(); assert.equal(proposals[0].status, 'OPEN');
    await save.click(); await manager.page.getByRole('heading', { name: 'Không có đề nghị phù hợp', exact: true }).waitFor(); await manager.context.close();
    const approved = await open('CUSTOMER', width, '/customer/returns'); const ready = approved.page.getByLabel('Yêu cầu thuê đủ điều kiện trả', { exact: true }); await ready.selectOption(reservation.id);
    await approved.page.getByRole('button', { name: 'Gửi yêu cầu trả kho', exact: true }).click(); await approved.page.getByText('Đã gửi yêu cầu trả kho.', { exact: true }).waitFor(); assert.equal(returns.length, 1);
    assert(await approved.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await approved.context.close();
    const operator = await open('STAFF', width, '/staff/support-requests/early-proposal'); await operator.page.getByText('Đề nghị trả trước hạn thuộc quản lý', { exact: false }).waitFor(); assert.equal(await operator.page.getByRole('button', { name: 'Hoàn tất hỗ trợ', exact: true }).count(), 0); await operator.context.close();
    checks.push(`${width}px: future rental blocked → proposal → Manager financial review → stale ledger error retained → approve → Customer returns early; Staff cannot resolve approval as support`);
  }
  proposals = []; returns = [];
  const mobileClient = await open('CUSTOMER', 390, '/customer/rentals/' + reservation.id, true);
  await mobileClient.page.getByRole('button', { name: 'Đề nghị trả trước hạn', exact: true }).click();
  await mobileClient.page.getByLabel('Lý do trả trước hạn', { exact: true }).fill('Tôi muốn trả kho sớm.');
  await mobileClient.page.getByRole('button', { name: '□ Tôi xác nhận thông tin và thao tác này', exact: true }).click();
  await mobileClient.page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await mobileClient.page.getByText('Đề nghị đang chờ quản lý', { exact: true }).waitFor(); await mobileClient.context.close();
  const mobileManager = await open('MANAGER', 390, '/manager/early-returns', true);
  await mobileManager.page.getByRole('button', { name: 'Chấp thuận trả trước hạn', exact: true }).click();
  await mobileManager.page.getByLabel('Điều kiện hoặc lý do trả sớm', { exact: true }).fill('Đã đối chiếu, giữ nguyên hóa đơn và xử lý cọc khi kiểm tra.');
  await mobileManager.page.getByRole('button', { name: '□ Tôi đã đối chiếu công nợ, cọc và điều kiện với hồ sơ hiện tại', exact: true }).click();
  await mobileManager.page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await mobileManager.page.getByText('Đã phản hồi đề nghị trả trước hạn cho khách.', { exact: true }).waitFor(); await mobileManager.context.close();
  const mobileApproved = await open('CUSTOMER', 390, '/customer/rentals/' + reservation.id, true);
  await mobileApproved.page.getByRole('button', { name: 'Yêu cầu trả kho', exact: true }).click();
  await mobileApproved.page.getByRole('button', { name: '□ Tôi xác nhận muốn trả toàn bộ kho của yêu cầu này', exact: true }).click();
  await mobileApproved.page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await mobileApproved.page.getByText('Đã lưu thành công.', { exact: true }).waitFor(); assert.equal(returns.length, 1); await mobileApproved.context.close();
  checks.push('390px Expo web: Customer proposal → Manager financial approval → Customer early return');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); console.log(JSON.stringify({ checks, mockedWrites: writes.length, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
