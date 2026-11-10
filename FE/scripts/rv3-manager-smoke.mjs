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
  queue: { unassignedStock: 1, unassignedSupport: 0, unassignedMaintenance: 0, escalatedSupport: 0, maintenanceReview: 0, paymentVerification: 0, depositReview: 0, onlineReconciliation: 0 },
  workload: [{ id: 'staff', fullName: 'Nhân viên kiểm thử', accountStatus: 'ACTIVE', stock: 3, support: 0, maintenance: 0 }],
};
const addon = { id: 'addon', code: 'SHELF', name: 'Kệ kiểm thử', physicalUnit: 'bộ', billingUnit: 'MONTH', kind: 'RENTAL', unitPrice: 150000, isActive: true };
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
    return failed ? route.fulfill({ status: 503, json: { message: 'Không thể tải số liệu báo cáo.' } }) : route.fulfill({ json: report });
  }
  if (path === 'manager/additional-services') return route.fulfill({ json: [addon] });
  if (path === 'manager/additional-services/inventory') return route.fulfill({ json: [{ serviceId: 'addon', rentalCapacity: 5 }] });
  if (path === 'manager/invoices/invoice') return route.fulfill({ json: { id: 'invoice', invoiceCode: 'INV-TEST', type: 'INITIAL', status: 'OPEN', totalAmount: 3000000, balanceDue: 3000000, amountPaid: 0, rentalAmount: 1500000, depositAmount: 1500000, serviceAmount: 0, chargeAmount: 0, historicalPricing: quote, reservation: { id: 'r', reference: 'R-TEST' } } });
  if (path === 'manager/stored-items') return route.fulfill({ json: { page: 1, limit: 20, total: 1, items: [{ id: 'item', itemCode: 'ITEM-TEST', name: 'Thùng hồ sơ', unit: 'thùng', balance: 2, customer: { fullName: 'Khách kiểm thử' }, rentalContract: { id: 'contract', contractCode: 'C-TEST' }, currentStorageUnit: { id: 'unit', unitNumber: 'MD-D04-002', floor: 'Tầng 1', zone: 'D04' } }] } });
  if (path === 'manager/stock-movements') return route.fulfill({ json: { page: 1, limit: 20, total: 1, items: [{ id: 'movement', movementCode: 'MOV-TEST', type: 'IN', status: 'COMPLETED', assignedStaff: { id: 'staff', fullName: 'Nhân viên kiểm thử' }, completedBy: { fullName: 'Nhân viên kiểm thử' }, completedAt: report.asOf, completionNote: 'Khách mang thiếu một thùng', currentStorageUnit: { unitNumber: 'MD-D04-002' }, lines: [{ id: 'line', requestedQty: 3, actualQty: 2, storedItem: { name: 'Thùng hồ sơ', unit: 'thùng' } }] }] } });
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
  await mkdir('../docs/rv3-manager', { recursive: true });
  await page.screenshot({ path: '../docs/rv3-manager/report-mocked.png', fullPage: true });
  failed = true; await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Không thể tải số liệu báo cáo.' }).waitFor();
  assert.equal(await page.getByText('25%', { exact: true }).count(), 0, 'API error must not render fake or stale KPI');
  failed = false;
  await page.goto(`${base}/manager`);
  await page.locator('a.portal-metric').filter({ hasText: 'Tổng kho vật lý' }).getByText('120', { exact: true }).waitFor();
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
  await page.getByRole('button', { name: 'Xem', exact: true }).click();
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
