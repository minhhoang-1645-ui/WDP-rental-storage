// Browser-only regression; ALL fetch/xhr traffic is mocked, no shared database writes.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const browser = await launchTestBrowser(), base = process.env.WDP_FE_URL || 'http://localhost:5173';
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const queries = [], mutations = [], errors = [];
let unavailable = false;
const users = Array.from({ length: 25 }, (_, index) => ({
  id: index === 0 ? 'admin' : `user-${index}`,
  fullName: index === 0 ? 'Fixture Admin' : `Fixture User ${index}`,
  email: `user-${index}@example.test`,
  role: index === 0 ? 'ADMIN' : index % 2 ? 'STAFF' : 'MANAGER',
  accountStatus: index === 24 ? 'DISABLED' : 'ACTIVE',
  createdAt: new Date(Date.UTC(2026, 10, 25 - index)).toISOString(),
}));
await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'fixture-ADMIN'));
await context.route('**/*', async route => {
  const req = route.request();
  if (!['fetch', 'xhr', 'eventsource'].includes(req.resourceType())) return route.continue();
  const url = new URL(req.url()), path = url.pathname.replace(/^\/(?:api\/)?/, '');
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  if (req.method() !== 'GET') mutations.push(path);
  if (path === 'auth/me') return route.fulfill({ json: { id: 'admin', fullName: 'Fixture Admin', email: 'admin@example.test', role: 'ADMIN' } });
  if (path === 'admin/users') {
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      if (users.some(user => user.email === body.email)) {
        return route.fulfill({ status: 409, json: { message: 'Email đã được sử dụng.' } });
      }
      const created = { ...body, password: undefined, id: `created-${users.length}`, accountStatus: 'ACTIVE' };
      users.unshift(created);
      return route.fulfill({ status: 201, json: created });
    }
    const { search, role, accountStatus, sort } = Object.fromEntries(url.searchParams);
    const items = users.filter(user => (!search || user.email.includes(search))
      && (!role || user.role === role) && (!accountStatus || user.accountStatus === accountStatus));
    if (sort?.startsWith('name-')) items.sort((a, b) => a.fullName.localeCompare(b.fullName) * (sort === 'name-asc' ? 1 : -1));
    const page = Number(url.searchParams.get('page'));
    const limit = Number(url.searchParams.get('limit'));
    return route.fulfill({ json: { page, limit, total: items.length, items: items.slice((page - 1) * limit, page * limit) } });
  }
  if (path.startsWith('admin/users/')) {
    if (path === 'admin/users/user-2/status') return route.fulfill({ status: 403, json: { message: 'Tài khoản được bảo vệ.' } });
    const user = users.find(user => user.id === path.split('/')[2]);
    if (!user) return route.fulfill({ status: 404, json: {} });
    if (req.method() === 'PATCH') user.accountStatus = req.postDataJSON().accountStatus;
    return route.fulfill({ json: user });
  }
  if (path === 'admin/audit-events') {
    queries.push(Object.fromEntries(url.searchParams));
    if (unavailable) return route.fulfill({ status: 503, json: { message: 'Chưa đọc được nhật ký. Kiểm tra kết nối DB và migration nhật ký Admin.' } });
    const login = url.searchParams.get('category') === 'LOGIN';
    const baseEvent = { actorName: 'Fixture Admin', actorEmail: 'admin@example.test', actorRole: 'ADMIN', createdAt: '2026-11-03T01:00:00.000Z', outcome: 'SUCCESS' };
    const items = login ? [
      { ...baseEvent, id: 'logout', category: 'ACTIVITY', action: 'AUTH_LOGOUT', resource: 'auth' },
      { ...baseEvent, id: 'login', category: 'LOGIN', action: 'AUTH_LOGIN', resource: 'auth' },
      { ...baseEvent, id: 'attempt', category: 'LOGIN', action: 'AUTH_LOGIN', resource: 'auth', actorName: null, actorEmail: 'attempt@example.test', actorRole: null, outcome: 'FAILURE' },
    ] : [{ ...baseEvent, id: 'status', category: 'ACTIVITY', action: 'STATUS', resource: 'users' }];
    const outcome = url.searchParams.get('outcome');
    return route.fulfill({ json: { page: Number(url.searchParams.get('page') || 1), limit: 20, total: 21,
      items: items.filter(item => !outcome || item.outcome === outcome) } });
  }
  return route.fulfill({ json: { page: 1, limit: 20, total: 0, items: [] } });
});
const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${base}/admin/login-history`);
  await page.getByRole('heading', { name: 'Lịch sử đăng nhập', exact: true }).waitFor();
  await page.getByText('attempt@example.test', { exact: true }).waitFor();
  const auditTable = page.getByRole('table');
  await auditTable.getByText('Đăng nhập', { exact: true }).waitFor();
  await auditTable.getByText('Đăng xuất', { exact: true }).waitFor();
  await auditTable.getByText('Thử đăng nhập', { exact: true }).waitFor();
  assert.deepEqual(await auditTable.getByRole('columnheader').allTextContents(), ['Thời gian', 'Tài khoản', 'Vai trò', 'Sự kiện']);
  await page.getByLabel('Tìm nhật ký', { exact: true }).fill('attempt@example.test');
  assert.equal(await page.getByLabel('Kết quả', { exact: true }).count(), 0);
  await page.getByLabel('Từ ngày', { exact: true }).fill('2026-11-03');
  await page.getByLabel('Đến ngày', { exact: true }).fill('2026-11-03');
  await Promise.all([page.waitForResponse(response => response.url().includes('audit-events') && response.url().includes('search=attempt')), page.getByRole('button', { name: 'Lọc nhật ký', exact: true }).click()]);
  assert(queries.some(query => query.category === 'LOGIN' && !('outcome' in query) && query.from === '2026-11-03' && query.search === 'attempt@example.test'));
  await Promise.all([page.waitForResponse(response => response.url().includes('audit-events') && response.url().includes('page=2')), page.getByRole('button', { name: 'Trang sau', exact: true }).click()]);
  assert(queries.some(query => query.page === '2'));
  await page.getByRole('link', { name: 'Hoạt động', exact: true }).click();
  await page.getByRole('heading', { name: 'Nhật ký hoạt động', exact: true }).waitFor();
  await page.getByText('Đổi trạng thái', { exact: true }).waitFor();
  assert.equal(await auditTable.getByText('Đăng nhập', { exact: true }).count(), 0);
  assert.equal(await auditTable.getByText('Đăng xuất', { exact: true }).count(), 0);
  assert.equal(await auditTable.getByText('Xem chi tiết', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Kết quả', { exact: true }).count(), 0);
  assert.deepEqual(await auditTable.getByRole('columnheader').allTextContents(), ['Thời gian', 'Tài khoản', 'Vai trò', 'Hoạt động']);
  unavailable = true;
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'migration' }).waitFor();
  unavailable = false;
  await page.goto(`${base}/admin`);
  await page.locator('.admin-kpis strong').first().filter({ hasText: /^25$/ }).waitFor();
  assert.deepEqual(await page.locator('.admin-kpis strong').allTextContents(), ['25', '12', '12', '1']);
  const recent = page.getByRole('region', { name: 'Tài khoản gần đây' });
  assert.equal(await recent.locator('li').count(), 5);
  await page.getByText('Đổi trạng thái tài khoản', { exact: true }).waitFor();
  await recent.getByRole('link', { name: /Fixture Admin/ }).click();
  await page.waitForURL('**/admin/users/admin');
  await page.getByText('Bạn đang dùng tài khoản này.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Vô hiệu hóa tài khoản' }).count(), 0);
  await page.getByRole('link', { name: 'Về danh sách tài khoản' }).click();
  await page.getByText('user-19@example.test', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await page.getByText('user-24@example.test', { exact: true }).waitFor();
  await page.getByLabel('Tìm tài khoản').fill('user-23@');
  await page.waitForURL(url => url.searchParams.get('search') === 'user-23@');
  await page.getByText('1–1 / 1 bản ghi', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Lọc theo vai trò' }).click();
  await page.getByRole('button', { name: 'Nhân viên', exact: true }).click();
  await page.getByRole('button', { name: 'Thao tác tài khoản user-23@example.test' }).click();
  await page.getByRole('link', { name: 'Vô hiệu hóa', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const disable = dialog.getByRole('button', { name: 'Vô hiệu hóa tài khoản', exact: true });
  await disable.waitFor();
  assert(await disable.isDisabled());
  await dialog.getByRole('checkbox').check();
  await disable.click();
  await page.getByRole('button', { name: 'Kích hoạt lại tài khoản' }).click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Kích hoạt tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Vô hiệu hóa tài khoản' }).waitFor();
  await page.getByRole('link', { name: 'Về danh sách tài khoản' }).click();
  assert.equal(await page.getByLabel('Tìm tài khoản').inputValue(), 'user-23@');

  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  await page.reload();
  await page.locator('[data-workspace-role="admin"][data-workspace-theme="dark"]').waitFor();
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await dialog.locator('[name=fullName]').fill('Fixture New Manager');
  await dialog.locator('[name=email]').fill('user-23@example.test');
  await dialog.locator('[name=phone]').fill('0900000001');
  await dialog.getByLabel('Vai trò').selectOption('MANAGER');
  await dialog.locator('[name=password]').fill('fixture-password');
  await dialog.locator('[name=confirmPassword]').fill('fixture-password');
  const create = dialog.getByRole('button', { name: 'Tạo tài khoản', exact: true });
  await create.click();
  await dialog.getByText('Email đã được sử dụng.', { exact: true }).waitFor();
  await dialog.locator('[name=email]').fill('fixture-new@example.test');
  await create.click();
  await page.getByText('Đã tạo tài khoản Fixture New Manager.', { exact: true }).waitFor();
  assert.equal(users[0].role, 'MANAGER');
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await dialog.locator('[name=fullName]').fill('Fixture New Staff');
  await dialog.locator('[name=email]').fill('fixture-staff@example.test');
  await dialog.locator('[name=phone]').fill('0900000002');
  await dialog.locator('[name=password]').fill('fixture-password');
  await dialog.locator('[name=confirmPassword]').fill('fixture-password');
  await create.click();
  await page.getByText('Đã tạo tài khoản Fixture New Staff.', { exact: true }).waitFor();
  assert.equal(users[0].role, 'STAFF');
  await page.goto(`${base}/staff/reservations`);
  await page.waitForURL(url => url.pathname === '/admin');
  assert.deepEqual(mutations, ['admin/users/user-23/status', 'admin/users/user-23/status', 'admin/users', 'admin/users', 'admin/users']);

  await page.goto(`${base}/admin/notifications`);
  await page.waitForURL(url => url.pathname === '/admin');
  assert.equal(await page.locator('.manager-sidebar a[href="/admin/notifications"]').count(), 0);
  await page.locator('.manager-sidebar').getByRole('button', { name: 'Hồ sơ cá nhân' }).waitFor();
  await page.getByRole('button', { name: /^Thông báo,/ }).click();
  const notifications = page.getByRole('dialog', { name: 'Trung tâm thông báo' });
  await notifications.waitFor();
  assert.equal(await notifications.getByRole('link', { name: /Mở trung tâm thông báo/ }).count(), 0);
  await notifications.getByRole('button', { name: 'Đóng thông báo' }).click();
  await page.goto(`${base}/admin/settings`);
  await page.getByRole('heading', { name: 'Cài đặt tài khoản', exact: true }).waitFor();
  const sidebar = page.locator('.manager-sidebar');
  assert.equal(await sidebar.getByRole('link', { name: 'Chính sách hệ thống' }).count(), 0);
  await sidebar.getByRole('link', { name: 'Lịch sử đăng nhập', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/admin/login-history');
  await sidebar.getByRole('link', { name: 'Nhật ký hoạt động', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/admin/activity');
  await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
  await page.getByRole('button', { name: 'Mở rộng thanh bên' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS: Admin dashboard, audit, account filtering, pagination, duplicate email, status confirmation, and narrow layout. All APIs mocked.');
} catch (error) {
  console.error(page.url(), (await page.locator('body').innerText()).slice(0, 2000)); throw error;
} finally { await context.close(); await browser.close(); }
