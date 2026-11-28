import { chooseDate, openCalendar } from './browser-test.mjs';
// Browser-only regression; ALL fetch/xhr traffic is mocked, no shared database writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';

const browser = await launchTestBrowser(), base = process.env.WDP_FE_URL || 'http://localhost:5173';
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const queries = [], mutations = [], errors = [];
let unavailable = false;
let hasNewEvents = false;
let failProfileUpdate = false;
const accountsOnly = process.env.WDP_ADMIN_ACCOUNTS_ONLY === '1';
const sessions = Array.from({ length: 21 }, (_, index) => ({
  id: 'session-' + index, device: index === 0 ? 'Chrome trên Windows' : index === 20 ? null : 'Thiết bị ' + index,
  createdAt: index === 20 ? null : '2026-11-23T02:30:00Z', expiresAt: '2099-11-24T02:30:00Z',
  status: index < 2 ? 'ACTIVE' : index === 20 ? 'EXPIRED' : 'REVOKED',
}));
const baseEvent = { actorName: 'Fixture Admin', actorEmail: 'admin@example.test', actorRole: 'ADMIN', createdAt: '2026-11-03T01:00:00.000Z', outcome: 'SUCCESS' };
const users = Array.from({ length: 25 }, (_, index) => ({
  id: index === 0 ? 'admin' : `user-${index}`,
  fullName: index === 0 ? 'Fixture Admin' : `Fixture User ${index}`,
  email: `user-${index}@example.test`,
  phone: '0900000042',
  role: index === 0 ? 'SYSTEM_ADMINISTRATOR' : index === 3 ? 'STORAGE_CUSTOMER' : index === 5 ? 'BUSINESS_OPERATIONS_MANAGER' : index % 2 ? 'FACILITY_STAFF' : 'FACILITY_MANAGER',
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
  if (path === 'auth/me') return route.fulfill({ json: { id: 'admin', fullName: 'Fixture Admin', email: 'admin@example.test', role: 'SYSTEM_ADMINISTRATOR' } });
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
    const items = users.filter(user => (!search || [user.email, user.fullName, user.phone].some(value => value.toLowerCase().includes(search.toLowerCase())))
      && (!role || user.role === role) && (!accountStatus || user.accountStatus === accountStatus));
    if (sort?.startsWith('name-')) items.sort((a, b) => a.fullName.localeCompare(b.fullName) * (sort === 'name-asc' ? 1 : -1));
    const page = Number(url.searchParams.get('page'));
    const limit = Number(url.searchParams.get('limit'));
    return route.fulfill({ json: { page, limit, total: items.length, items: items.slice((page - 1) * limit, page * limit) } });
  }
  if (/^admin\/facility-access\/users\/[^/]+\/role$/.test(path) && req.method() === 'PATCH') {
    const target = users.find(user => user.id === path.split('/')[3]);
    const { role, expectedRole } = req.postDataJSON();
    assert.equal(target.role, expectedRole);
    target.role = role;
    return route.fulfill({ json: { changed: true } });
  }
  const sessionRoute = /^admin\/users\/([^/]+)\/sessions(?:\/(.*))?$/.exec(path);
  if (sessionRoute) {
    const [, id, action] = sessionRoute;
    const items = id === 'user-23' ? sessions : [];
    if (req.method() === 'PATCH') {
      const target = action === 'revoke' ? null : action.split('/')[0];
      const active = items.filter(session => session.status === 'ACTIVE' && (!target || target === session.id));
      for (const session of active) session.status = 'REVOKED';
      return route.fulfill({ json: { count: active.length } });
    }
    if (action) return route.fulfill({ json: items.find(session => session.id === action) });
    const page = Number(url.searchParams.get('page') || 1), limit = 20;
    return route.fulfill({ json: { page, limit, total: items.length, activeCount: items.filter(session => session.status === 'ACTIVE').length,
      items: items.slice((page - 1) * limit, page * limit) } });
  }
  const accessRoute = /^admin\/users\/([^/]+)\/access$/.exec(path);
  if (accessRoute) return route.fulfill({ json: { sessionManagement: true, openAssignments: 0, closedAssignments: 0, sessions: [],
    history: accessRoute[1] === 'user-22' ? [{ id: 'grant-1', facility: { name: 'Cơ sở Đông' }, revokedAt: null }] : [] } });
  if (path.startsWith('admin/users/')) {
    if (path === 'admin/users/user-2/status') return route.fulfill({ status: 403, json: { message: 'Tài khoản được bảo vệ.' } });
    const user = users.find(user => user.id === path.split('/')[2]);
    if (!user) return route.fulfill({ status: 404, json: {} });
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON();
      if (path.endsWith('/status')) user.accountStatus = body.accountStatus;
      else {
        assert(Object.keys(body).every(key => ['fullName', 'phone'].includes(key)));
        if (failProfileUpdate) return route.fulfill({ status: 503, json: { message: 'Chưa lưu được thông tin.' } });
        Object.assign(user, body);
      }
    }
    return route.fulfill({ json: user });
  }
  if (path === 'admin/audit-events') {
    queries.push(Object.fromEntries(url.searchParams));
    if (url.searchParams.get('category') === 'ACCOUNT_NOTICES') return route.fulfill({ json: { page: 1, limit: 100, total: 0, items: [] } });
    if (unavailable) return route.fulfill({ status: 503, json: { message: 'Chưa đọc được nhật ký. Kiểm tra kết nối DB và migration nhật ký Admin.' } });
    const login = url.searchParams.get('category') === 'LOGIN';
    const items = login ? [
      ...(hasNewEvents ? [{ ...baseEvent, id: 'new-session', category: 'LOGIN', action: 'AUTH_LOGIN', resource: 'auth', actorName: 'Newest Customer', actorRole: 'CUSTOMER', createdAt: '2026-11-04T18:10:00.000Z' }] : []),
      { ...baseEvent, id: 'logout', category: 'ACTIVITY', action: 'AUTH_LOGOUT', resource: 'auth' },
      { ...baseEvent, id: 'login', category: 'LOGIN', action: 'AUTH_LOGIN', resource: 'auth' },
      { ...baseEvent, id: 'attempt', category: 'LOGIN', action: 'AUTH_LOGIN', resource: 'auth', actorName: null, attemptAccountName: 'Fixture Attempt', actorEmail: 'attempt@example.test', actorRole: null, outcome: 'FAILURE' },
      { ...baseEvent, id: 'disabled-login', category: 'LOGIN', action: 'AUTH_LOGIN_ACCOUNT_DISABLED', resource: 'auth', actorName: 'Fixture Disabled', actorEmail: 'disabled@example.test', actorRole: 'CUSTOMER', outcome: 'FAILURE' },
      { ...baseEvent, id: 'staff-login', category: 'LOGIN', action: 'AUTH_LOGIN', resource: 'auth', actorName: 'Fixture Staff', actorRole: 'STAFF' },
      { ...baseEvent, id: 'manager-login', category: 'LOGIN', action: 'AUTH_LOGIN', resource: 'auth', actorName: 'Fixture Manager', actorRole: 'MANAGER' },
    ] : [
      ...(hasNewEvents ? [{ ...baseEvent, id: 'new-stock', category: 'ACTIVITY', action: 'COMPLETE', resource: 'stock-movements', resourceId: 'stock-1', actorName: 'Newest Staff', actorRole: 'STAFF' }] : []),
      { ...baseEvent, id: 'stock-assign', category: 'ACTIVITY', action: 'ASSIGN', resource: 'stock-movements', resourceId: 'stock-1', actorName: 'Fixture Manager', actorRole: 'MANAGER' },
      { ...baseEvent, id: 'support-start', category: 'ACTIVITY', action: 'START', resource: 'support-requests', actorName: 'Fixture Staff', actorRole: 'STAFF' },
      { ...baseEvent, id: 'status', category: 'ACTIVITY', action: 'DISABLE_ACCOUNT', resource: 'users', resourceId: 'admin', targetAccount: { fullName: 'Fixture Affected Account', role: 'CUSTOMER' } },
      { ...baseEvent, id: 'status-active', category: 'ACTIVITY', action: 'REACTIVATE_ACCOUNT', resource: 'users' },
      { ...baseEvent, id: 'unsupported', category: 'ACTIVITY', action: 'UNKNOWN_FIXTURE_ACTION', resource: 'returns', outcome: 'FAILURE' },
    ];
    const role = url.searchParams.get('role');
    const search = url.searchParams.get('search')?.toLowerCase();
    const limit = Number(url.searchParams.get('limit') || 20);
    return route.fulfill({ json: { page: Number(url.searchParams.get('page') || 1), limit, total: 21,
      items: items.filter(item => (!role || item.actorRole === role) && (!search || JSON.stringify(item).toLowerCase().includes(search))).slice(0, limit) } });
  }
  return route.fulfill({ json: { page: 1, limit: 20, total: 0, items: [] } });
});
const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
try {
  if (!accountsOnly) {
  await page.goto(`${base}/admin/activity?event=status`);
  await page.getByRole('heading', {name:'Khóa tài khoản', exact:true}).waitFor();
  await page.getByRole('link', {name:'Fixture Affected Account', exact:true}).waitFor();
  assert.equal(await page.getByRole('search', {name:'Bộ lọc nhật ký'}).count(), 0);
  await page.getByRole('link', {name:'Về nhật ký hoạt động'}).click();
  await page.waitForURL('**/admin/activity');
  await page.goto(`${base}/admin/activity?event=missing`);
  await page.getByRole('heading', {name:'Không tìm thấy hoạt động'}).waitFor();
  await page.goto(`${base}/admin/login-history`);
  await page.getByRole('heading', { name: 'Lịch sử đăng nhập', exact: true }).waitFor();
  await page.getByText('attempt@example.test', { exact: true }).waitFor();
  const auditTable = page.getByRole('table');
  await auditTable.getByText('Đăng nhập', { exact: true }).first().waitFor();
  await auditTable.getByText('Đăng xuất', { exact: true }).waitFor();
  await auditTable.getByText('Đăng nhập thất bại', { exact: true }).waitFor();
  const blocked = auditTable.getByRole('row').filter({ hasText: 'disabled@example.test' });
  await blocked.getByText('Đăng nhập thất bại do tài khoản đã khóa', { exact: true }).waitFor();
  await blocked.getByText('Fixture Disabled', { exact: true }).waitFor();
  await blocked.getByText('Khách hàng', { exact: true }).waitFor();
  await auditTable.getByRole('row').filter({ hasText: 'attempt@example.test' }).getByText('Không ghi nhận', { exact: true }).waitFor();
  await auditTable.getByRole('row').filter({ hasText: 'attempt@example.test' }).getByText('Fixture Attempt', { exact: true }).waitFor();
  assert.deepEqual(await auditTable.getByRole('columnheader').allTextContents(), ['Thời gian', 'Tài khoản', 'Vai trò', 'Sự kiện']);
  const auditSearch = page.getByRole('searchbox', { name: 'Tìm nhật ký', exact: true });
  const waitForAuditQuery = condition => page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/admin/audit-events') && condition(url.searchParams);
  });
  await Promise.all([waitForAuditQuery(params => params.get('search') === 'attempt@example.test'), auditSearch.fill('attempt@example.test')]);
  await auditTable.getByText('attempt@example.test', { exact: true }).waitFor();
  assert.equal(await auditTable.getByText('Fixture Disabled', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Lọc nhật ký', exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Kết quả', { exact: true }).count(), 0);
  const fromDate = page.getByRole('button', { name: 'Từ ngày', exact: true });
  await Promise.all([waitForAuditQuery(params => params.get('from') === '2026-11-03'), chooseDate(page, 'Từ ngày', '2026-11-03')]);
  const toCalendar = await openCalendar(page, 'Đến ngày', '2026-11-02');
  assert(await toCalendar.getByRole('button', { name: '02/11/2026' }).isDisabled());
  await Promise.all([waitForAuditQuery(params => params.get('to') === '2026-11-03'),
    toCalendar.getByRole('button', { name: '03/11/2026' }).click()]);
  assert(queries.some(query => query.category === 'LOGIN' && !('outcome' in query) && query.from === '2026-11-03' && query.to === '2026-11-03' && query.search === 'attempt@example.test'));
  assert(!queries.some(query => query.from === '2026-11-03' && query.to === '2026-11-02'));
  await Promise.all([page.waitForResponse(response => response.url().includes('audit-events') && response.url().includes('page=2')), page.getByRole('button', { name: 'Trang sau', exact: true }).click()]);
  assert(queries.some(query => query.page === '2'));
  const attempted = auditTable.getByRole('row').filter({ hasText: 'attempt@example.test' });
  await attempted.getByRole('link', { name: /^Xem sự kiện Đăng nhập thất bại/ }).press('Enter');
  await page.waitForURL(url => url.searchParams.get('event') === 'attempt');
  await page.getByRole('heading', { name: 'Thông tin sự kiện đăng nhập' }).waitFor();
  await page.getByRole('link', { name: 'Về lịch sử đăng nhập' }).click();
  assert.equal(new URL(page.url()).searchParams.get('page'), '2');
  assert.equal(await auditSearch.inputValue(), 'attempt@example.test');
  await Promise.all([waitForAuditQuery(params => params.get('category') === 'LOGIN' && params.get('page') === '1' && !params.has('search')), page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click()]);
  assert.equal(await auditSearch.inputValue(), '');
  assert.equal(await fromDate.innerText(), 'dd/MM/yyyy');
  await page.getByRole('link', { name: 'Hoạt động', exact: true }).click();
  await page.getByRole('heading', { name: 'Nhật ký hoạt động', exact: true }).waitFor();
  await auditTable.getByText('Khóa tài khoản', { exact: true }).waitFor();
  await auditTable.getByText('Mở khóa tài khoản', { exact: true }).waitFor();
  await auditTable.getByText('Bắt đầu xử lý hỗ trợ', { exact: true }).waitFor();
  await auditTable.getByText('Bắt đầu xử lý hỗ trợ', { exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('event') === 'support-start');
  await page.getByRole('heading', { name: 'Bắt đầu xử lý hỗ trợ', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Về nhật ký hoạt động' }).click();
  await auditTable.getByText('Hoạt động chưa có nhãn', { exact: true }).waitFor();
  await auditTable.getByText('Thất bại', { exact: true }).waitFor();
  const disabledAccount = auditTable.getByRole('row').filter({ has: page.getByText('Khóa tài khoản', { exact: true }) });
  assert.equal(await disabledAccount.getByRole('link', { name: 'Fixture Affected Account' }).getAttribute('href'), '/admin/users/admin');
  await disabledAccount.getByText('Thành công', { exact: true }).waitFor();
  assert.equal(await auditTable.getByText('Đăng nhập', { exact: true }).count(), 0);
  assert.equal(await auditTable.getByText('Đăng xuất', { exact: true }).count(), 0);
  assert.equal(await auditTable.getByText('Xem chi tiết', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Kết quả', { exact: true }).count(), 0);
  assert.deepEqual(await auditTable.getByRole('columnheader').allTextContents(), ['Thời gian', 'Tài khoản', 'Vai trò', 'Hoạt động']);
  await Promise.all([waitForAuditQuery(params => params.get('category') === 'ACTIVITY' && params.get('search') === 'Fixture Manager'), auditSearch.fill('Fixture Manager')]);
  await auditTable.getByText('Phân công nhập/xuất hàng', { exact: true }).waitFor();
  assert.equal(await auditTable.getByText('Bắt đầu xử lý hỗ trợ', { exact: true }).count(), 0);
  await Promise.all([waitForAuditQuery(params => params.get('category') === 'ACTIVITY' && !params.has('search')), auditSearch.fill('')]);
  await auditTable.getByText('Bắt đầu xử lý hỗ trợ', { exact: true }).waitFor();
  unavailable = true;
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'migration' }).waitFor();
  unavailable = false;
  await page.goto(`${base}/admin`);
  await page.locator('.admin-kpis strong').first().filter({ hasText: /^25$/ }).waitFor();
  assert.deepEqual(await page.locator('.admin-kpis strong').allTextContents(), ['25', '12', '12', '1']);
  const recent = page.getByRole('region', { name: 'Đăng nhập gần đây' });
  const recentActivity = page.getByRole('region', { name: 'Hoạt động gần đây' });
  await recent.getByText('Đăng xuất', { exact: true }).waitFor();
  assert.equal(await recent.locator('li').count(), 5);
  await recentActivity.getByText('Phân công nhập/xuất hàng', { exact: true }).waitFor();
  assert(queries.some(query => query.category === 'LOGIN' && query.page === '1' && query.limit === '5'));
  assert(queries.some(query => query.category === 'ACTIVITY' && !query.role && query.page === '1' && query.limit === '5'));
  assert.equal(await page.getByText('Thành công', { exact: true }).count(), 0);
  assert.equal(await recent.getByRole('link', { name: 'Xem tất cả lịch sử đăng nhập' }).getAttribute('href'), '/admin/login-history');
  assert.equal(await recentActivity.getByRole('link', { name: 'Xem tất cả hoạt động' }).getAttribute('href'), '/admin/activity');
  hasNewEvents = true;
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await recent.locator('li').first().getByText('Newest Customer').waitFor();
  assert.match(await recent.locator('li').first().locator('time').innerText(), /01:10.*05\/11\/2026/);
  await recentActivity.locator('li').first().getByText('Hoàn tất nhập/xuất hàng').waitFor();
  await recent.getByRole('link', { name: 'Xem tất cả lịch sử đăng nhập' }).click();
  await auditTable.locator('tbody tr').first().getByText('Newest Customer').waitFor();
  await page.getByLabel('Vai trò', { exact: true }).selectOption('MANAGER');
  await auditTable.getByText('Fixture Manager', { exact: true }).waitFor();
  await auditTable.getByText('Newest Customer', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await auditTable.getByText('Newest Customer', { exact: true }).count(), 0);
  await page.locator('.manager-sidebar').getByRole('link', { name: 'Tổng quan', exact: true }).click();
  await recentActivity.locator('li').first().getByText('Hoàn tất nhập/xuất hàng').waitFor();
  await recentActivity.getByRole('link', { name: 'Xem tất cả hoạt động' }).click();
  await auditTable.locator('tbody tr').first().getByText('Hoàn tất nhập/xuất hàng').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('role'), null);
  await page.locator('.manager-sidebar').getByRole('link', { name: 'Tổng quan', exact: true }).click();
  await recentActivity.getByRole('link', { name: 'Người dùng' }).click();
  await page.waitForURL('**/admin/users/admin');
  await page.getByRole('tab', { name: 'Phân quyền', exact: true }).click();
  await page.getByText('Bạn đang dùng tài khoản này.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Khóa tài khoản' }).count(), 0);
  }
  await testAccounts();
  if (!accountsOnly) {
  await page.goto(`${base}/admin/notifications`);
  await page.getByRole('heading', { name: 'Thông báo', exact: true }).waitFor();
  assert.equal(await page.locator('.manager-sidebar a[href="/admin/notifications"]').count(), 0);
  await page.getByRole('button', { name: 'Menu tài khoản' }).waitFor();
  await page.getByRole('button', { name: /^Thông báo,/ }).click();
  const notifications = page.getByRole('dialog', { name: 'Thông báo', exact: true });
  await notifications.waitFor();
  assert.equal(await notifications.getByRole('link', { name: /Xem tất cả thông báo/ }).count(), 1);
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
  await page.goto(base + '/admin/users/user-23');
  await page.getByRole('tab', { name: 'Phân quyền', exact: true }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).click();
  await page.locator('[data-workspace-role="admin"][data-workspace-theme="light"]').waitFor();
  await page.keyboard.press('Escape');
  if (process.env.WDP_AUDIT_SCREENSHOTS === '1') {
    await mkdir('artifacts/admin-audit', { recursive: true });
    for (const theme of ['dark', 'light']) {
      if (await page.locator('[data-workspace-role="admin"]').getAttribute('data-workspace-theme') !== theme) {
        await page.getByRole('button', { name: 'Menu tài khoản' }).click();
        await page.getByRole('button', { name: theme === 'light' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối' }).click();
        await page.keyboard.press('Escape');
      }
      for (const route of ['', '/login-history', '/activity', '/users']) {
        await page.goto(base + '/admin' + route);
        await page.locator(route ? 'tbody tr' : '.admin-preview li').first().waitFor();
        for (const width of [1440, 1024, 768, 390]) {
          await page.setViewportSize({ width, height: 900 });
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route || '/admin'} ${theme} at ${width}px`);
          if (width === 1440 || width === 390) {
            await page.screenshot({ path: `artifacts/admin-audit/${route.slice(1) || 'dashboard'}-${theme}-${width}.png` });
          }
        }
      }
    }
  }
  }
  assert.deepEqual(errors, []);
  console.log(accountsOnly ? 'PASS: Admin account list, profile, permissions, and sessions on local Web.'
    : 'PASS: Admin dashboard, audit, and account management on local Web.');
} catch (error) {
  console.error(page.url(), (await page.locator('body').innerText()).slice(0, 2000)); throw error;
} finally { await context.close(); await browser.close(); }

async function testAccounts() {
  await page.goto(base + '/admin/users');
  const table = page.getByRole('table', { name: 'Danh sách tài khoản' });
  await table.getByText('Tài khoản của bạn').waitFor();
  assert.deepEqual((await table.getByRole('columnheader').allTextContents()).map(value => value.replace(/\s*[↑↓↕]$/, '')),
    ['Tài khoản', 'Vai trò', 'Trạng thái', 'Ngày tạo', 'Thao tác']);
  assert.equal(await table.getByRole('checkbox').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Hiển thị cột' }).count(), 0);
  await page.getByRole('button', { name: 'Thao tác tài khoản user-0@example.test' }).click();
  assert.equal(await page.getByRole('link', { name: 'Khóa tài khoản', exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Trang cuối' }).click();
  await page.getByText('21–25 / 25 bản ghi', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'Trang sau' }).isDisabled());
  await page.getByRole('combobox', { name: 'Số dòng mỗi trang' }).selectOption('5');
  await page.getByText('1–5 / 25 bản ghi', { exact: true }).waitFor();
  await table.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('sort') === 'name-asc');
  const search = page.getByLabel('Tìm tài khoản');
  await search.fill('0900000042');
  await page.getByRole('combobox', { name: 'Trạng thái', exact: true }).selectOption('DISABLED');
  await table.getByText('user-24@example.test', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Vai trò', exact: true }).selectOption('FACILITY_STAFF');
  await page.getByText('Không tìm thấy tài khoản', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await page.waitForURL(url => !['role', 'status', 'search'].some(key => url.searchParams.has(key)));
  await page.getByRole('table', { name: 'Danh sách tài khoản' }).waitFor();
  await search.fill('user-23@');
  await table.getByRole('link', { name: 'Fixture User 23', exact: true }).click();
  await page.waitForURL('**/admin/users/user-23');

  const profile = page.getByRole('tabpanel', { name: 'Thông tin tài khoản' });
  await profile.getByText('Cập nhật gần nhất', { exact: true }).waitFor();
  assert.equal(await profile.getByText('Thông tin kỹ thuật', { exact: true }).count(), 0);
  await profile.getByRole('button', { name: 'Chỉnh sửa' }).click();
  const edit = page.getByRole('dialog', { name: 'Chỉnh sửa tài khoản' });
  const save = edit.getByRole('button', { name: 'Lưu thay đổi' });
  assert.equal(await edit.locator('input').count(), 2);
  assert(await save.isDisabled());
  await edit.locator('[name=phone]').fill('123');
  await edit.getByText('Số điện thoại phải có 8–15 chữ số.').waitFor();
  assert(await save.isDisabled());
  await edit.locator('[name=phone]').fill('0901234567');
  await edit.locator('[name=fullName]').fill('Fixture Updated Staff');
  failProfileUpdate = true;
  await save.click();
  await edit.getByText('Chưa lưu được thông tin.').waitFor();
  assert.equal(await edit.locator('[name=fullName]').inputValue(), 'Fixture Updated Staff');
  failProfileUpdate = false;
  await save.click();
  await page.getByRole('heading', { name: 'Fixture Updated Staff', exact: true }).waitFor();
  await page.getByRole('navigation', { name: 'Đường dẫn tài khoản' }).getByRole('link', { name: 'Quản lý tài khoản' }).click();
  assert.equal(await search.inputValue(), 'user-23@');
  await page.getByRole('button', { name: 'Thao tác tài khoản user-23@example.test' }).click();
  assert.equal(await page.getByRole('link', { name: 'Phiên đăng nhập', exact: true }).count(), 0);
  await page.getByRole('link', { name: 'Xem chi tiết', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Khóa tài khoản', exact: true }).click();
  const permissions = page.getByRole('tabpanel', { name: 'Phân quyền' });
  for (const action of ['Khóa tài khoản', 'Mở khóa tài khoản']) {
    if (action.startsWith('Mở')) {
      await page.getByRole('navigation', { name: 'Đường dẫn tài khoản' }).getByRole('link', { name: 'Quản lý tài khoản' }).click();
      await page.getByRole('button', { name: 'Thao tác tài khoản user-23@example.test' }).click();
      await page.getByRole('link', { name: action, exact: true }).click();
    }
    const confirmation = page.getByRole('dialog', { name: new RegExp(action, 'i') });
    const confirm = confirmation.getByRole('button', { name: action, exact: true });
    await confirm.waitFor();
    assert(await confirm.isDisabled());
    await confirmation.getByRole('checkbox').check();
    await confirm.click();
    await confirmation.waitFor({ state: 'hidden' });
  }

  await page.getByRole('tab', { name: 'Phiên đăng nhập' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Phiên đăng nhập' });
  const sessionTable = panel.getByRole('region', { name: 'Danh sách phiên đăng nhập' });
  const filter = panel.getByRole('combobox', { name: 'Trạng thái phiên' });
  await panel.getByText('2 phiên còn hiệu lực', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Làm mới/ }).count(), 1);
  assert(await sessionTable.evaluate(el => {
    const container = el.getBoundingClientRect();
    const last = el.querySelector('tbody tr td:last-child').getBoundingClientRect();
    return el.scrollWidth <= el.clientWidth + 1 && last.right <= container.right + 1;
  }));
  await sessionTable.getByText('09:30', { exact: true }).first().waitFor();
  await filter.selectOption('EXPIRED');
  await sessionTable.getByText('Đã hết hạn', { exact: true }).waitFor();
  assert.equal(await sessionTable.getByRole('row').count(), 2);
  await sessionTable.getByRole('button', { name: 'Thao tác phiên 1', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: 'Thu hồi phiên', exact: true }).count(), 0);
  await panel.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
  await page.getByRole('dialog', { name: 'Chi tiết phiên đăng nhập' }).getByText('Đã hết hạn', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await filter.selectOption('ACTIVE');
  await sessionTable.getByText('Chrome trên Windows', { exact: true }).waitFor();
  await sessionTable.getByRole('button', { name: 'Thao tác phiên 1', exact: true }).click();
  await panel.getByRole('button', { name: 'Thu hồi phiên', exact: true }).click();
  await page.getByRole('dialog', { name: 'Xác nhận thu hồi phiên', exact: true }).getByRole('button', { name: 'Thu hồi phiên', exact: true }).click();
  await panel.getByText('1 phiên còn hiệu lực', { exact: true }).waitFor();
  const revokeAll = panel.getByRole('button', { name: 'Thu hồi toàn bộ phiên' });
  await revokeAll.click();
  await page.getByRole('dialog', { name: 'Xác nhận thu hồi toàn bộ phiên', exact: true }).getByRole('button', { name: 'Thu hồi phiên', exact: true }).click();
  await panel.getByText('Không có phiên phù hợp', { exact: true }).waitFor();
  assert(await revokeAll.isDisabled());
  await filter.selectOption('REVOKED');
  await sessionTable.getByText('Chrome trên Windows', { exact: true }).waitFor();

  await page.getByRole('tab', { name: 'Phân quyền' }).click();
  await permissions.getByText('Chưa được cấp quyền tại cơ sở nào.', { exact: true }).waitFor();
  const changeRole = permissions.getByRole('button', { name: 'Đổi vai trò', exact: true });
  assert(await changeRole.isDisabled());
  await permissions.getByLabel('Vai trò mới').selectOption('FACILITY_MANAGER');
  await changeRole.click();
  await page.getByRole('dialog', { name: 'Xác nhận đổi vai trò' }).getByRole('button', { name: 'Xác nhận đổi' }).click();
  await page.getByText('Đã đổi vai trò tài khoản.', { exact: true }).waitFor();
  assert.equal(users.find(user => user.id === 'user-23').role, 'FACILITY_MANAGER');
  for (const [id, facilityRole] of [['user-22', true], ['user-3', false], ['user-5', false], ['admin', false]]) {
    await page.goto(base + '/admin/users/' + id + '?tab=permissions');
    await permissions.getByRole('heading', { name: 'Quyền nghiệp vụ hiện tại' }).waitFor();
    assert.equal(await permissions.getByRole('heading', { name: 'Phạm vi cơ sở' }).count(), Number(facilityRole));
    if (facilityRole) {
      await permissions.getByText('Cơ sở Đông', { exact: true }).waitFor();
      assert.equal(await permissions.locator('.admin-permission-cards > li').count(), 4);
      assert.deepEqual(await permissions.locator('.admin-permission-work dd').allTextContents(), ['0', '0']);
      assert.equal(await permissions.locator('.admin-permission-scope').getByRole('link', { name: 'Quản lý quyền cơ sở' }).getAttribute('href'), '/admin/facility-access?user=' + id);
      assert.equal(await permissions.getByRole('link', { name: 'Lịch sử thay đổi quyền' }).getAttribute('href'), '/admin/permission-history?accountId=' + id);
      if (process.env.WDP_ADMIN_PERMISSION_SCREENSHOTS === '1') await mkdir('artifacts/admin-accounts', { recursive: true });
      for (const width of [1586, 1024, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        const layout = await permissions.locator('.admin-permission-grid').evaluate(el => ({
          columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
          fits: el.scrollWidth <= el.clientWidth + 1,
        }));
        assert.equal(layout.columns, width === 390 ? 1 : 2);
        assert.ok(layout.fits, 'Permissions should fit at ' + width);
        if (process.env.WDP_ADMIN_PERMISSION_SCREENSHOTS === '1') {
          await page.screenshot({ path: 'artifacts/admin-accounts/permissions-' + width + '.png', fullPage: true });
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await permissions.getByLabel('Vai trò mới').selectOption('FACILITY_STAFF');
      assert(await changeRole.isDisabled());
    }
  }
  await page.getByRole('tab', { name: 'Phiên đăng nhập' }).click();
  await panel.getByText('Chưa có lịch sử phiên đăng nhập', { exact: true }).waitFor();

  await page.goto(base + '/admin/users');
  await page.locator('.portal-topbar').getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  await page.locator('[data-workspace-role="admin"][data-workspace-theme="dark"]').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Tạo tài khoản' });
  const submit = create.getByRole('button', { name: 'Tạo tài khoản' });
  await create.locator('[name=fullName]').fill('Fixture New Manager');
  await create.locator('[name=email]').fill('user-23@example.test');
  await create.locator('[name=phone]').fill('0900000001');
  await create.getByLabel('Vai trò', { exact: true }).selectOption('FACILITY_MANAGER');
  await create.locator('[name=password]').fill('fixture-password');
  await create.locator('[name=confirmPassword]').fill('fixture-mismatch');
  await submit.click();
  await create.getByText('Mật khẩu xác nhận không khớp.', { exact: true }).waitFor();
  await create.locator('[name=confirmPassword]').fill('fixture-password');
  await submit.click();
  await create.getByText('Email đã được sử dụng.', { exact: true }).waitFor();
  await create.locator('[name=email]').fill('fixture-new@example.test');
  await submit.click();
  await page.getByText('Đã tạo tài khoản Fixture New Manager.', { exact: true }).waitFor();
  assert.equal(users[0].role, 'FACILITY_MANAGER');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.goto(base + '/admin/users/user-23?tab=sessions');
  await sessionTable.getByText('Chrome trên Windows', { exact: true }).waitFor();
  await sessionTable.getByRole('button', { name: 'Thao tác phiên 1', exact: true }).click();
  const menu = panel.locator('.staff-table-popover:popover-open');
  await menu.getByRole('button', { name: 'Xem chi tiết', exact: true }).waitFor();
  assert(await menu.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth + 1;
  }));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
}
