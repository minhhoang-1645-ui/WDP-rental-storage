// UI-only regression. All business API traffic is mocked; no database writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff } from './fixtures/workspace.mjs';
const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const browser = await launchTestBrowser(), failures = [], requests = [], writes = [];
const out = 'artifacts/rv3-internal-ui'; await mkdir(out, { recursive: true });
const report = { asOf: new Date().toISOString(), units: { total: 120, occupied: 30, available: 80, maintenance: 10, reserved: 0 }, activeContracts: 31, finance: { outstandingAmount: 600000, unpaidInvoices: 2 }, queue: { escalatedSupport: 1, maintenanceReview: 2, depositReview: 1, unassignedStock: 3, unassignedSupport: 1, unassignedMaintenance: 0, paymentVerification: 2 } };
const users = Array.from({ length: 47 }, (_, i) => ({ id: `user-${i}`, fullName: `Tài khoản ${i}`, email: `user${i}@example.test`, role: i % 2 ? 'STAFF' : 'MANAGER', accountStatus: i % 3 ? 'ACTIVE' : 'DISABLED', createdAt: '2026-11-10T01:00:00Z' }));
async function setup(role, width = 1366) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'fixture-ui-only'));
  let failed = false;
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (!['fetch', 'xhr', 'eventsource'].includes(req.resourceType())) return route.continue();
    const path = url.pathname.replace(/^\/(?:api\/)?/, '').replace('staff/management/', 'staff/');
    const send = json => route.fulfill({ json });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    requests.push({ role, path, query: Object.fromEntries(url.searchParams) });
    if (req.method() !== 'GET') { writes.push(path); return send({ id: 'saved', fullName: 'Đã lưu', role: 'STAFF' }); }
    if (path === 'auth/me') return send({ ...staff, id: 'actor', fullName: 'Người dùng kiểm thử', role });
    if (failed && (path === 'manager/dashboard/analytics' || path === 'admin/users')) return route.fulfill({ status: 503, json: { message: 'Không tải được dữ liệu kiểm thử.' } });
    if (path === 'manager/dashboard/analytics') return send(report);
    if (path === 'admin/users') {
      const selected = users.filter(row => (!url.searchParams.get('role') || row.role === url.searchParams.get('role')) && (!url.searchParams.get('accountStatus') || row.accountStatus === url.searchParams.get('accountStatus')) && (!url.searchParams.get('search') || `${row.fullName} ${row.email}`.includes(url.searchParams.get('search'))));
      const page = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 20);
      return send({ page, limit, total: selected.length, items: selected.slice((page - 1) * limit, page * limit) });
    }
    if (path === 'booking/catalog') return send({ products: [], sizes: [], conditions: [], approvedTerms: [], amenities: [] });
    if (path.endsWith('additional-services') || path.endsWith('additional-services/inventory')) return send([]);
    if (path.endsWith('assigned-units')) return send({ enabled: true, items: [] });
    if (path.endsWith('reports/overview')) return send({ buckets: [], categories: [], unitSummary: [], total: 0, received: 0, debt: 0, rent: 0, bookingCount: 0, confirmedCount: 0, allocatedUnits: 0 });
    const resource = path.split('/').at(-1);
    if (path === 'manager/units/unit-id') return send(fixture.units[0]);
    const data = resource === 'units' ? Array.from({ length: 47 }, (_, i) => ({ ...fixture.units[0], id: i ? `unit-${i}` : 'unit-id', unitCode: `KHO-${i}` })) : resource === 'appointments' ? fixture.appointments : resource === 'reservations' ? fixture.reservations : ['maintenance', 'support-requests', 'stock-movements'].includes(resource) ? [] : fixture[resource] ?? [];
    const page = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 20);
    return send({ page, limit, total: data.length, items: data.slice((page - 1) * limit, page * limit) });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => failures.push(`${role}: ${error.message}`));
  return { page, context, fail: () => { failed = true; } };
}
try {
  for (const role of ['STAFF', 'MANAGER', 'ADMIN']) {
    const { page, context, fail } = await setup(role);
    const root = `/${role.toLowerCase()}`;
    await page.goto(base + root);
    await page.locator('.internal-kpi strong').first().waitFor();
    assert((await page.locator('.internal-kpi').count()) >= 3 && (await page.locator('.internal-kpi').count()) <= 5);
    assert((await page.locator('.internal-task-list li').count()) <= 5);
    if (role === 'MANAGER') await page.getByText('30 / 120', { exact: true }).waitFor();
    if (role === 'ADMIN') await page.locator('.internal-kpi').filter({ hasText: 'Tổng tài khoản' }).getByText('47', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Tài khoản cá nhân', exact: true }).click();
    await page.getByRole('dialog', { name: 'Tài khoản cá nhân', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Đóng tài khoản', exact: true }).click();
    const menu = await page.locator('aside.manager-sidebar nav a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    assert(menu.every(path => path === root || path.startsWith(root + '/')), 'Menu must stay within role');
    for (const width of [1366, 1920, 1024, 768, 390, 1092, 1536, 614, 312]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role} overflow at ${width}`);
      const style = await page.locator('main h1').evaluate(node => ({ size: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight) }));
      assert(style.size >= 26 && style.size <= 30 && style.line > style.size);
      if (width === 390) { await page.getByRole('button', { name: 'Mở điều hướng' }).click(); await page.getByRole('dialog', { name: 'Điều hướng nội bộ' }).waitFor(); await page.getByRole('button', { name: 'Đóng điều hướng' }).click(); }
      await page.screenshot({ path: `${out}/${role.toLowerCase()}-${width}.png`, fullPage: true, animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1366, height: 900 });
    for (const path of menu) {
      await page.goto(base + path); await page.locator('main h1').waitFor();
      assert.equal(await page.getByRole('heading', { name: /Không tìm thấy trang|Không có quyền/ }).count(), 0, `${role} invalid menu ${path}`);
    }
    if (role === 'ADMIN') {
      await page.goto(base + '/admin/users');
      await page.getByText('1–10 / 47 bản ghi', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
      await page.getByText('11–20 / 47 bản ghi', { exact: true }).waitFor();
      await page.getByRole('combobox', { name: 'Số dòng mỗi trang' }).selectOption('5');
      await page.getByText('1–5 / 47 bản ghi', { exact: true }).waitFor();
      await Promise.all([
        page.waitForResponse(response => response.url().includes('admin/users?') && response.url().includes('role=STAFF') && response.url().includes('limit=5')),
        page.getByRole('combobox', { name: 'Vai trò', exact: true }).selectOption('STAFF'),
      ]);
      await page.getByRole('row').filter({ hasText: 'user1@example.test' }).waitFor();
      assert(requests.some(req => req.role === role && req.path === 'admin/users' && req.query.role === 'STAFF' && req.query.limit === '5' && req.query.page === '1'));
      await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
      const form = page.getByRole('dialog');
      await form.getByLabel('Họ và tên', { exact: true }).fill('Giữ nội dung đang nhập');
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      assert.equal(await form.getByLabel('Họ và tên', { exact: true }).inputValue(), 'Giữ nội dung đang nhập');
      await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    }
    if (role === 'MANAGER') {
      await page.goto(base + '/manager/units?search=Kho&page=2');
      await page.getByRole('link', { name: 'KHO-10', exact: true }).click();
      await page.locator('a.booking-back').waitFor();
      assert.equal(await page.locator('a.booking-back').getAttribute('href'), '/manager/units?search=Kho&page=2');
      await page.locator('a.booking-back').click();
      assert(page.url().includes('page=2') && page.url().includes('search=Kho'));
    }
    for (const other of ['staff', 'manager', 'admin'].filter(other => other !== role.toLowerCase())) {
      await page.goto(`${base}/${other}`); await page.waitForURL(`${base}${root}`);
    }
    if (role !== 'STAFF') { fail(); await page.goto(base + root); await page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu kiểm thử.' }).waitFor(); assert.equal(await page.locator('.internal-kpi strong').filter({ hasText: /^0$/ }).count(), 0); }
    await context.close();
  }
  const { page, context } = await setup('CUSTOMER');
  await page.goto(base + '/customer/payments'); await page.getByRole('heading', { name: /Hóa đơn và lịch sử thanh toán/ }).waitFor();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.internal-web').count(), 0);
  const before = await page.screenshot({ animations: 'disabled' });
  await page.evaluate(() => document.querySelectorAll('style[data-vite-dev-id*="internal-web.css"]').forEach(node => node.remove()));
  const after = await page.screenshot({ animations: 'disabled' });
  assert(before.equals(after), 'Internal CSS must not alter Customer Web');
  await context.close();
  assert.deepEqual(failures, []);
  assert.deepEqual(writes, [], 'Read-only UI test must not issue writes');
  console.log('PASS internal dashboards, role menus/deep links, 1366/1920/1024/390 layouts, pagination/filter memory, error states and Customer CSS isolation. All APIs mocked.');
} finally { await browser.close(); }
