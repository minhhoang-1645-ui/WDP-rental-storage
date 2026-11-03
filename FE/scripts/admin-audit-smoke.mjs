// Browser-only regression; ALL fetch/xhr traffic is mocked, no shared database writes.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const browser = await launchTestBrowser(), base = process.env.WDP_FE_URL || 'http://localhost:5173';
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const queries = [], mutations = [], errors = [];
let unavailable = false;
await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'fixture-ADMIN'));
await context.route('**/*', async route => {
  const req = route.request();
  if (!['fetch', 'xhr', 'eventsource'].includes(req.resourceType())) return route.continue();
  const url = new URL(req.url()), path = url.pathname.replace(/^\/(?:api\/)?/, '');
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  if (req.method() !== 'GET') mutations.push(path);
  if (path === 'auth/me') return route.fulfill({ json: { id: 'admin', fullName: 'Fixture Admin', email: 'admin@example.test', role: 'ADMIN' } });
  if (path === 'admin/audit-events') {
    queries.push(Object.fromEntries(url.searchParams));
    if (unavailable) return route.fulfill({ status: 503, json: { message: 'Chưa đọc được nhật ký. Kiểm tra kết nối DB và migration nhật ký Admin.' } });
    const login = url.searchParams.get('category') === 'LOGIN';
    return route.fulfill({ json: { page: Number(url.searchParams.get('page') || 1), limit: 20, total: 21, items: [{ id: 'event', category: login ? 'LOGIN' : 'ACTIVITY', action: login ? 'AUTH_LOGIN' : 'STATUS', resource: login ? 'auth' : 'users', resourceId: login ? null : 'user-1', outcome: login ? 'FAILURE' : 'SUCCESS', actorName: login ? null : 'Fixture Admin', actorEmail: login ? 'attempt@example.test' : 'admin@example.test', actorRole: login ? null : 'ADMIN', httpStatus: login ? 401 : 200, ipAddress: '127.0.0.1', method: login ? 'POST' : 'PATCH', route: login ? '/auth/login' : '/admin/users/:id/status', createdAt: '2026-11-03T01:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { page: 1, limit: 20, total: 0, items: [] } });
});
const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${base}/admin/login-history`);
  await page.getByRole('heading', { name: 'Lịch sử đăng nhập', exact: true }).waitFor();
  await page.getByText('attempt@example.test', { exact: true }).waitFor();
  await page.getByText('Thất bại', { exact: true }).last().waitFor();
  await page.getByLabel('Tìm nhật ký', { exact: true }).fill('attempt@example.test');
  await page.getByLabel('Kết quả', { exact: true }).selectOption('FAILURE');
  await page.getByLabel('Từ ngày', { exact: true }).fill('2026-11-03');
  await page.getByLabel('Đến ngày', { exact: true }).fill('2026-11-03');
  await Promise.all([page.waitForResponse(response => response.url().includes('audit-events') && response.url().includes('search=attempt')), page.getByRole('button', { name: 'Lọc nhật ký', exact: true }).click()]);
  assert(queries.some(query => query.category === 'LOGIN' && query.outcome === 'FAILURE' && query.from === '2026-11-03' && query.search === 'attempt@example.test'));
  await Promise.all([page.waitForResponse(response => response.url().includes('audit-events') && response.url().includes('page=2')), page.getByRole('button', { name: 'Trang sau', exact: true }).click()]);
  assert(queries.some(query => query.page === '2'));
  await page.getByRole('link', { name: 'Hoạt động', exact: true }).click();
  await page.getByRole('heading', { name: 'Nhật ký hoạt động', exact: true }).waitFor();
  await page.getByText('Đổi trạng thái', { exact: true }).waitFor();
  await page.getByText('Xem chi tiết', { exact: true }).click();
  await page.getByText('Mã hồ sơ: user-1', { exact: true }).waitFor();
  unavailable = true;
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'migration' }).waitFor();
  assert.deepEqual(mutations, []); assert.deepEqual(errors, []);
  console.log('PASS: Admin login/activity routes, filters, pagination, details and unavailable-storage state; no write requests.');
} catch (error) {
  console.error(page.url(), (await page.locator('body').innerText()).slice(0, 2000)); throw error;
} finally { await context.close(); await browser.close(); }
