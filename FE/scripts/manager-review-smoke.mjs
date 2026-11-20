// Browser regression against mocked responses; no database writes.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser();
const context = await browser.newContext();
const writes = [];
const errors = [];
const data = structuredClone(fixture);
data['support-requests'][0].status = 'ESCALATED';
data.maintenance[0].status = 'AWAITING_VERIFICATION';
const billed = { ...data.invoices[0], type: 'RECURRING', billingCycle: 2, totalAmount: 5400000, balanceDue: 2700000 };
data.rentals[0] = { ...data.rentals[0], id: 'rental-test', invoices: [billed], contracts: data.contracts,
  historicalPricing: { rentalAmount: 8600000, depositAmount: 1800000, quotedTotalAmount: 10400000 },
  billingSummary: { totalInvoiced: 5400000, totalPaid: 2700000, totalOutstanding: 2700000, payableBalance: 900000 } };
data['stock-movements'][0] = { ...data['stock-movements'][0], id: 'movement-detail', status: 'COMPLETED',
  completedBy: staff, completedAt: data.maintenance[0].createdAt, completionNote: 'Đã đối chiếu kiện hàng tại kho.' };
await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'fixture-MANAGER'));
await context.route(/\/api\//, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace(/^\/api\//, '');
  const send = (json, status = 200) => route.fulfill({ status, json });
  if (path === 'auth/me') return send({ ...staff, id: 'manager-id', role: 'MANAGER' });
  const [namespace, resource, id, action] = path.split('/');
  if (namespace !== 'manager') return send({ message: 'Unexpected namespace' }, 403);
  if (resource === 'staff') return send({ page: 1, limit: 20, total: 1, items: [staff] });
  const items = data[resource];
  if (!Array.isArray(items)) return send({ page: 1, limit: 20, total: 0, items: [] });
  const row = items.find((item) => item.id === id);
  if (request.method() === 'GET') return send(id ? row : { page: 1, limit: 20, total: items.length, items });
  writes.push({ path, method: request.method(), key: request.headers()['idempotency-key'] });
  if (action === 'resolve') row.status = 'RESOLVED';
  if (action === 'verify') row.status = 'COMPLETED';
  if (action === 'reject-verification') row.status = 'IN_PROGRESS';
  return send(row);
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto('http://localhost:5173/manager/operations/support-requests/support-id');
  await page.getByLabel('Nội dung giải quyết').fill('Đã xử lý yêu cầu chuyển cấp.');
  await page.getByRole('button', { name: 'Hoàn tất hỗ trợ', exact: true }).click();
  await page.getByText('Đã lưu thao tác thành công.').waitFor();
  assert.equal(writes.at(-1).path, 'manager/support-requests/support-id/resolve');
  assert.ok(writes.at(-1).key);

  await page.goto('http://localhost:5173/manager/operations/maintenance/maintenance-id');
  await page.getByLabel('Ghi chú nghiệm thu').fill('Đã kiểm tra sửa chữa.');
  await page.getByRole('button', { name: 'Nghiệm thu hoàn tất', exact: true }).click();
  await page.getByText('Đã lưu thao tác thành công.').waitFor();
  assert.equal(writes.at(-1).path, 'manager/maintenance/maintenance-id/verify');
  assert.ok(writes.at(-1).key);

  data.maintenance[0].status = 'AWAITING_VERIFICATION';
  await page.goto('http://localhost:5173/manager/operations/maintenance/maintenance-id');
  await page.getByLabel('Kết quả nghiệm thu').selectOption('rework');
  await page.getByLabel('Yêu cầu sửa lại').fill('Cần sửa lại khóa.');
  await page.getByRole('button', { name: 'Trả về sửa tiếp', exact: true }).click();
  await page.getByText('Đã lưu thao tác thành công.').waitFor();
  assert.equal(writes.at(-1).path, 'manager/maintenance/maintenance-id/reject-verification');
  assert.ok(writes.at(-1).key);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({width, height: 850});
    await page.goto('http://localhost:5173/manager/operations/rentals/rental-test');
    await page.getByRole('heading', {name:'Kỳ thuê', exact:true}).waitFor();
    await page.getByText('Công nợ còn lại', {exact:true}).waitFor();
    await page.getByText('Tổng báo giá (gồm cọc)', {exact:true}).waitFor();
    await page.getByRole('link', {name:/Kỳ 2/}).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.goto('http://localhost:5173/manager/operations/stock-movements/movement-detail');
    const movement = page.getByRole('table', {name:'Số lượng hàng giao nhận'});
    await movement.getByRole('rowheader', {name:/Thùng hồ sơ/}).waitFor();
    assert.equal(await page.getByRole('button', {name:'Hoàn tất phiếu'}).count(), 0);
    await page.getByText('Đã đối chiếu kiện hàng tại kho.', {exact:false}).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  assert.deepEqual(errors, []);
  console.log('Manager support, maintenance, rental billing and completed stock detail passed.');
} finally {
  await context.close();
  await browser.close();
}
