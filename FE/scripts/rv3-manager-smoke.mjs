// Browser regression: every API/SSE request is mocked, no shared database access.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { mkdir } from 'node:fs/promises';
const browser = await launchTestBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const base = process.env.WDP_FE_URL || 'http://localhost:5173';
let failed = false;
const queries = [], writes = [], errors = [];
const report = {
  asOf: '2026-11-10T09:00:00Z', period: { from: null, to: null, timeZone: 'Asia/Ho_Chi_Minh' }, units: { total: 120, occupied: 30, available: 80, reserved: 0, maintenance: 10, utilizationPercent: 25 }, activeContracts: 31,
  finance: { unpaidInvoices: 2, outstandingAmount: 600000, collectedAmount: 3000000, paymentCount: 1, depositOnFullyPaidInvoices: 1500000, approvedRefundOutstanding: 1000000 },
  queue: { unassignedStock: 1, unassignedSupport: 0, unassignedMaintenance: 0, escalatedSupport: 0, maintenanceReview: 0, paymentVerification: 1, depositReview: 0, onlineReconciliation: 1 },
  workload: [{ id: 'staff', fullName: 'Nhân viên kiểm thử', accountStatus: 'ACTIVE', stock: 3, support: 0, maintenance: 0 }],
};
const addon = { id: 'addon', code: 'SHELF', name: 'Kệ kiểm thử', physicalUnit: 'bộ', billingUnit: 'MONTH', kind: 'RENTAL', unitPrice: 150000, isActive: true };
const customer = { fullName: 'Khách kiểm thử', email: 'customer@example.test' };
const refund = { id: 'refund', settlementCode: 'DEP-REFUND', status: 'APPROVED', depositAmount: 500000, refundAmount: 500000, outstandingAmount: 0, refundedAt: null, issues: [], physicalInspections: [{ unit: { unitCode: 'MD-D04-002' } }], updatedAt: report.asOf, reservation: { id: 'r', reference: 'R-TEST', customer } };
const settlements = [refund,
  { ...refund, id: 'no-refund', settlementCode: 'DEP-NO-REFUND', refundAmount: 0 },
  { ...refund, id: 'already-refunded', settlementCode: 'DEP-REFUNDED', refundedAt: report.asOf },
  { ...refund, id: 'settled', settlementCode: 'DEP-SETTLED', status: 'SETTLED' },
];
const pendingMovement = { id: 'needs-assignment', movementCode: 'MOV-ASSIGN', type: 'IN', status: 'REQUESTED', customer, currentStorageUnit: { unitNumber: 'MD-D04-002' }, createdAt: report.asOf };
const earlyReturn = { id: 'early', supportCode: 'SUP-EARLY', subject: 'Đề nghị trả kho trước hạn', status: 'OPEN', customer, createdAt: report.asOf };
let units = report.units;
const bankInvoice = { id: 'bank-invoice', invoiceCode: 'INV-BANK', status: 'OPEN', balanceDue: 600000, currency: 'VND' };
const submission = { id: 'bank', submissionCode: 'BANK-TEST', status: 'PENDING_VERIFICATION', amount: 600000, invoice: bankInvoice, customer, submittedAt: report.asOf, transferReference: 'BANK-TXN-TEST' };
const reconciliation = { id: 'online', reconciliationCode: 'RECON-TEST', status: 'REFUND_REQUIRED', amount: 600000, reason: 'Thanh toán đến sau khi hết hạn', createdAt: report.asOf, transaction: { merchantOrderRef: 'VNP-TEST', invoice: { ...bankInvoice, reservation: { reference: 'R-TEST', customer } } } };
const reconciliationHistory = Array.from({ length: 6 }, (_, index) => ({ ...reconciliation, id: `closed-${index}`, reconciliationCode: `RECON-CLOSED-${index}`, status: 'RECONCILED' }));
const quote = { paymentPlan: 'PAY_MONTHLY', billingMode: 'MONTHLY', termMonths: 3, monthlyUnitPrice: 1500000, baseRentalAmount: 4500000, discountPercent: 0, discountAmount: 0, rentalAmount: 4500000, depositAmount: 1500000, purchaseAddOnAmount: 0, rentalAddOnAmount: 0, quotedTotalAmount: 6000000, initialPaymentBreakdown: { rentalAmount: 1500000, depositAmount: 1500000, purchaseAddOnAmount: 0, rentalAddOnAmount: 0, totalAmount: 3000000, remainingAmount: 3000000 } };
await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'fixture-MANAGER'));
await context.route('**/*', async route => {
  const request = route.request();
  if (!['fetch', 'xhr', 'eventsource'].includes(request.resourceType())) return route.continue();
  const url = new URL(request.url()), path = url.pathname.replace(/^\/(?:api\/)?/, '');
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  if (request.method() !== 'GET') { writes.push({ path, body: request.postDataJSON() }); return route.fulfill({ json: addon }); }
  if (path === 'auth/me') return route.fulfill({ json: { id: 'manager', fullName: 'Quản lý kiểm thử', email: 'manager@example.test', role: 'MANAGER' } });
  if (path === 'manager/dashboard/analytics') {
    queries.push(Object.fromEntries(url.searchParams));
    return failed ? route.fulfill({ status: 503, json: { message: 'Không thể tải số liệu báo cáo.' } }) : route.fulfill({ json: { ...report, units } });
  }
  if (path === 'manager/additional-services') return route.fulfill({ json: [addon] });
  if (path === 'manager/payment-submissions') return route.fulfill({ json: { page: 1, limit: 100, total: 1, items: [submission] } });
  if (path === 'manager/deposit-settlements') return route.fulfill({ json: { page: 1, limit: 100, total: settlements.length, items: settlements } });
  if (path === 'manager/deposit-settlements/refund') return route.fulfill({ json: refund });
  if (path === 'manager/support-requests' || path === 'manager/early-return-requests') return route.fulfill({ json: { page: 1, limit: 100, total: 1, items: [earlyReturn] } });
  if (path === 'manager/online-payment-reconciliations') return route.fulfill({ json: { page: 1, limit: 100, total: 7, items: [reconciliation, ...reconciliationHistory] } });
  if (path === 'manager/additional-services/inventory') return route.fulfill({ json: [{ serviceId: 'addon', rentalCapacity: 5 }] });
  if (path === 'manager/invoices/invoice') return route.fulfill({ json: { id: 'invoice', invoiceCode: 'INV-TEST', type: 'INITIAL', status: 'OPEN', totalAmount: 3000000, balanceDue: 3000000, amountPaid: 0, rentalAmount: 1500000, depositAmount: 1500000, serviceAmount: 0, chargeAmount: 0, historicalPricing: quote, reservation: { id: 'r', reference: 'R-TEST' } } });
  if (path === 'manager/stored-items') return route.fulfill({ json: { page: 1, limit: 20, total: 1, items: [{ id: 'item', itemCode: 'ITEM-TEST', name: 'Thùng hồ sơ', unit: 'thùng', balance: 2, customer: { fullName: 'Khách kiểm thử' }, rentalContract: { id: 'contract', contractCode: 'C-TEST' }, currentStorageUnit: { id: 'unit', unitNumber: 'MD-D04-002', floor: 'Tầng 1', zone: 'D04' } }] } });
  if (path === 'manager/stock-movements') return route.fulfill({ json: { page: 1, limit: 20, total: 2, items: [pendingMovement, { id: 'movement', movementCode: 'MOV-TEST', type: 'IN', status: 'COMPLETED', assignedStaff: { id: 'staff', fullName: 'Nhân viên kiểm thử' }, completedBy: { fullName: 'Nhân viên kiểm thử' }, completedAt: report.asOf, completionNote: 'Khách mang thiếu một thùng', currentStorageUnit: { unitNumber: 'MD-D04-002' }, lines: [{ id: 'line', requestedQty: 3, actualQty: 2, storedItem: { name: 'Thùng hồ sơ', unit: 'thùng' } }] }] } });
  return route.fulfill({ json: { page: 1, limit: 20, total: 0, items: [] } });
});
const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${base}/manager/reports`);
  await page.getByRole('heading', { name: 'Báo cáo vận hành', exact: true }).waitFor();
  await page.getByText('25%', { exact: true }).waitFor();
  await page.getByRole('cell', { name: /Nhân viên kiểm thử/ }).waitFor();
  await page.getByLabel('Từ ngày', { exact: true }).fill('2026-11-10');
  await page.getByLabel('Đến ngày', { exact: true }).fill('2026-11-10');
  await page.getByText('25%', { exact: true }).waitFor();
  assert(queries.some(query => query.from === '2026-11-10' && query.to === '2026-11-10'));
  await mkdir('artifacts/manager-workspace', { recursive: true });
  await page.screenshot({ path: 'artifacts/manager-workspace/report-mocked.png', fullPage: true });
  failed = true; await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Không thể tải số liệu báo cáo.' }).waitFor();
  assert.equal(await page.getByText('25%', { exact: true }).count(), 0, 'API error must not render fake or stale KPI');
  failed = false;
  await page.goto(`${base}/manager`);
  await page.locator('.manager-dashboard-kpi').filter({ hasText: 'Kho đang sử dụng' }).getByText('30 / 120', { exact: true }).waitFor();
  assert.deepEqual(await page.locator('.manager-dashboard-kpi strong').allTextContents().then(values => values.map(value => value.replace(/\s/g, ' '))), ['0', '1', '30 / 120', '600.000 ₫', '1']);
  const chart = page.getByRole('region', { name: 'Tình trạng kho' });
  await chart.getByText('Hiện có 80/120 kho ở trạng thái sẵn sàng.', { exact: true }).waitFor();
  const legend = chart.locator('.manager-storage-legend li');
  const values = await legend.evaluateAll(items => items.map(item => [
    Number.parseInt(item.querySelector('strong').textContent),
    Number.parseFloat(item.lastElementChild.textContent.replace(',', '.')),
  ]));
  assert.deepEqual(values, [[30, 25], [80, 66.7], [0, 0], [10, 8.3]]);
  assert.equal(values.reduce((sum, [count]) => sum + count, 0), report.units.total);
  assert(Math.abs(values.reduce((sum, [, share]) => sum + share, 0) - 100) < 0.2);
  assert.deepEqual(await chart.locator('.manager-storage-segment').evaluateAll(bars => bars.map(bar => Number(bar.style.flexGrow))), [30, 80, 10]);
  const work = page.locator('.manager-work-list');
  await work.getByRole('link', { name: /Ghi nhận hoàn cọc/ }).waitFor();
  await work.getByRole('link', { name: /Duyệt trả trước hạn/ }).waitFor();
  assert.equal(await work.getByRole('link').count(), 5);
  assert.match(await work.getByRole('link').first().innerText(), /Xác minh chuyển khoản/);
  assert.doesNotMatch(await work.innerText(), /DEP-NO-REFUND|DEP-REFUNDED|DEP-SETTLED|MOV-TEST/);
  assert.match(await work.getByRole('link', { name: /Ghi nhận hoàn cọc/ }).innerText(), /Chờ hoàn cọc/);
  await page.screenshot({ path: 'artifacts/manager-workspace/dashboard-light.png' });
  const shell = page.locator('[data-workspace-role="manager"]');
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  await page.keyboard.press('Escape');
  assert.equal(await shell.getAttribute('data-workspace-theme'), 'dark');
  await page.reload();
  await page.getByText('30 / 120', { exact: true }).waitFor();
  assert.equal(await shell.getAttribute('data-workspace-theme'), 'dark');
  await page.locator('.manager-work-list').getByRole('link', { name: /Xác minh chuyển khoản/ }).waitFor();
  await page.screenshot({ path: 'artifacts/manager-workspace/dashboard-dark.png' });
  await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
  const expandSidebar = page.getByRole('button', { name: 'Mở rộng thanh bên' });
  assert.equal(await expandSidebar.getAttribute('aria-expanded'), 'false');
  await page.locator('.manager-sidebar').getByRole('link', { name: 'Đối soát VNPay' }).waitFor();
  await expandSidebar.click();
  await page.locator('.manager-work-list').getByRole('link', { name: /Xác minh chuyển khoản/ }).click();
  await page.waitForURL('**/manager/payment-submissions?submission=bank');
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  const verifyDialog = page.getByRole('dialog', { name: 'Xác nhận chuyển khoản' });
  await verifyDialog.waitFor();
  assert.equal(await verifyDialog.getByRole('button', { name: 'Xác nhận đã nhận tiền' }).isDisabled(), true);
  await verifyDialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  await page.goto(`${base}/manager`);
  await work.getByRole('link', { name: /Phân công nhân viên/ }).click();
  await page.waitForURL('**/manager/assignments?kind=stock-movements&record=needs-assignment');
  await page.getByRole('dialog', { name: /MOV-ASSIGN/ }).waitFor();
  await page.goto(`${base}/manager`);
  await work.getByRole('link', { name: /Duyệt trả trước hạn/ }).click();
  await page.waitForURL('**/manager/early-returns?record=early');
  await page.getByRole('heading', { name: /SUP-EARLY/ }).waitFor();
  await page.goto(`${base}/manager`);
  await work.getByRole('link', { name: /Ghi nhận hoàn cọc/ }).click();
  await page.waitForURL('**/manager/operations/deposit-settlements/refund');
  await page.getByRole('button', { name: 'Ghi nhận hoàn tiền', exact: true }).waitFor();
  await page.goto(`${base}/manager`);
  await page.locator('.manager-work-list').getByRole('link', { name: /Theo dõi hoàn tiền VNPay/ }).click();
  await page.waitForURL('**/manager/online-payment-reconciliations?record=online');
  await page.getByRole('button', { name: 'Ghi nhận đã hoàn tiền' }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.getByRole('link', { name: 'Xem tất cả hồ sơ đối soát' }).click();
  await page.getByRole('combobox', { name: 'Trạng thái', exact: true }).selectOption('RECONCILED');
  await page.getByText('6 bản ghi', { exact: false }).waitFor();
  await page.getByRole('combobox', { name: 'Số dòng mỗi trang' }).selectOption('5');
  await page.getByText('Trang 1 / 2', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 5);
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await page.getByText('Trang 2 / 2', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.goto(`${base}/manager`);
  await page.locator('.manager-dashboard-kpi').filter({ hasText: 'Việc cần duyệt' }).click();
  await page.waitForURL('**/manager/reviews');
  await page.goto(`${base}/manager`);
  await page.locator('.manager-dashboard-kpi').filter({ hasText: 'Chờ phân công' }).click();
  await page.waitForURL('**/manager/assignments?assignment=unassigned');
  await page.goto(`${base}/manager`);
  for (const width of [1920, 1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Dashboard overflows at ${width}px`);
  }
  await page.getByRole('button', { name: 'Mở điều hướng' }).click();
  await page.locator('.portal-mobile-nav').getByRole('link', { name: 'Phân công', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'artifacts/manager-workspace/dashboard-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  units = { ...report.units, total: 123, disabled: 2 };
  await page.reload();
  await chart.getByText('Trạng thái khác (disabled)', { exact: true }).waitFor();
  await chart.getByText('Chưa có chi tiết trạng thái', { exact: true }).waitFor();
  assert.equal(await legend.evaluateAll(items => items.reduce((total, item) => total + Number.parseInt(item.querySelector('strong').textContent), 0)), 123);
  units = { ...report.units, total: 119 };
  await page.reload();
  await chart.getByText('Số liệu trạng thái kho chưa khớp với tổng kho.').waitFor();
  assert.equal(await chart.locator('.manager-storage-segment').count(), 0);
  units = { total: 0, occupied: 0, available: 0, reserved: 0, maintenance: 0, utilizationPercent: null };
  await page.reload();
  await chart.getByText('Chưa có kho vật lý trong hệ thống.').waitFor();
  assert.equal(await legend.count(), 4);
  assert.equal(await chart.locator('.manager-storage-segment').count(), 0);
  units = report.units;
  for (const path of ['/staff', '/admin/users']) {
    await page.goto(base + path);
    await page.waitForURL(url => url.pathname === '/manager');
  }
  await page.goto(`${base}/manager/catalog/additional-services`);
  await page.getByText('/bộ/tháng', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Tạo dịch vụ', exact: true }).click();
  await page.getByLabel('Mã dịch vụ', { exact: true }).fill('BOX_TEST');
  await page.getByLabel('Tên dịch vụ', { exact: true }).fill('Thùng kiểm thử');
  await page.getByLabel('Đơn vị vật lý', { exact: true }).selectOption('cái');
  await page.getByLabel('Giá đã duyệt (VND)', { exact: true }).fill('20000');
  await page.getByRole('button', { name: 'Lưu dịch vụ', exact: true }).click();
  await page.getByText('Đã lưu dịch vụ. Báo giá lịch sử được giữ nguyên.', { exact: true }).waitFor();
  assert(writes.some(write => write.body.physicalUnit === 'cái' && write.body.billingUnit === 'ONE_TIME'));
  await page.goto(`${base}/manager/stored-items`);
  await page.getByRole('button', { name: 'MD-D04-002', exact: true }).waitFor();
  assert.match(await page.locator('body').innerText(), /Tầng 1 · D04/);
  assert.match(await page.getByRole('link', { name: 'Phiếu và Staff kiểm đếm' }).getAttribute('href'), /rentalContractId=contract/);
  await page.goto(`${base}/manager/assignments?scope=all&kind=stock-movements`);
  await page.getByRole('row', { name: /MOV-TEST/ }).getByRole('button', { name: 'Xem', exact: true }).click();
  await page.getByText('Khách mang thiếu một thùng', { exact: false }).waitFor();
  await page.getByRole('link', { name: 'Xem hồ sơ công việc', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Hoàn tất phiếu', exact: true }).count(), 0);
  await page.goto(`${base}/manager/operations/invoices/invoice`);
  await page.getByRole('heading', { name: 'Báo giá đã lưu · toàn bộ kỳ thuê', exact: true }).waitFor();
  await page.getByText('Tổng thanh toán cả kỳ gồm cọc', { exact: true }).waitFor();
  await page.getByText('Dự kiến các kỳ tiếp theo', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS Manager report/date filters/error state, physical unit form, current storage/history link and saved initial vs full-term pricing. All APIs mocked.');
} catch (error) {
  console.error(page.url(), (await page.locator('body').innerText()).slice(-4500));
  throw error;
} finally { await context.close(); await browser.close(); }
