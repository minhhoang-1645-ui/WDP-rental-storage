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
  await page.getByLabel('Yêu cầu sửa lại').fill('Cần sửa lại khóa.');
  await page.getByRole('button', { name: 'Trả về sửa tiếp', exact: true }).click();
  await page.getByText('Đã lưu thao tác thành công.').waitFor();
  assert.equal(writes.at(-1).path, 'manager/maintenance/maintenance-id/reject-verification');
  assert.ok(writes.at(-1).key);
  assert.deepEqual(errors, []);
  console.log('Manager support resolve, maintenance verify and rejection passed.');
} finally {
  await context.close();
  await browser.close();
}
