import assert from 'node:assert/strict';
import { chooseDate, launchTestBrowser, openCalendar } from './browser-test.mjs';

const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const admin = { id: 'admin', role: 'SYSTEM_ADMINISTRATOR', fullName: 'Quản trị mẫu', email: 'admin@example.test' };
const manager = { id: 'manager', role: 'FACILITY_MANAGER', fullName: 'Quản lý mẫu', email: 'manager@example.test', accountStatus: 'ACTIVE' };
const event = { actorId: manager.id, actorName: manager.fullName, actorEmail: manager.email, actorRole: 'MANAGER',
  action: 'AUTH_LOGIN', resource: 'auth', outcome: 'SUCCESS', createdAt: '2026-11-16T02:30:00Z', ipAddress: '192.0.2.10' };
const events = [
  { ...event, id: 'locked', action: 'AUTH_LOGIN_ACCOUNT_DISABLED', outcome: 'FAILURE' },
  { ...event, id: 'logout', action: 'AUTH_LOGOUT' },
  { ...event, id: 'unknown', actorId: null, actorName: null, actorRole: null, actorEmail: 'unknown@example.test', outcome: 'FAILURE', ipAddress: null },
  ...Array.from({ length: 23 }, (_, index) => ({ ...event, id: 'login-' + index })),
];
const browser = await launchTestBrowser();

try {
  for (const [theme, width] of [['light', 1440], ['dark', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 660 }, timezoneId: 'America/Los_Angeles' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => {
      localStorage.setItem('wdp-auth-token-v1', 'fixture-admin');
      localStorage.setItem('nestbox-workspace-theme', value);
    }, theme);
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const path = url.pathname.replace(/^\/api/, '');
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      assert.equal(request.method(), 'GET');
      if (path === '/auth/me') return route.fulfill({ json: admin });
      if (path === '/admin/users/manager') return route.fulfill({ json: manager });
      if (path === '/admin/users/manager/access') return route.fulfill({ json: { history: [], sessionManagement: true } });
      if (path === '/admin/users/manager/sessions') return route.fulfill({ json: { items: [], page: 1, limit: 20, total: 0, activeCount: 0 } });
      const query = Object.fromEntries(url.searchParams);
      const rows = path === '/admin/audit-events' && query.category === 'LOGIN' ? events.filter(row =>
        (!query.event || row.id === query.event) && (!query.search || (row.actorEmail + row.actorName).toLowerCase().includes(query.search.toLowerCase()))
        && (!query.role || (row.actorRole && query.role === manager.role)) && (!query.action || row.action === query.action)
        && (!query.outcome || row.outcome === query.outcome) && (!query.accountId || row.actorId === query.accountId)) : [];
      const number = Number(query.page) || 1, limit = Number(query.limit) || 10;
      return route.fulfill({ json: { page: number, limit, total: rows.length, items: rows.slice((number - 1) * limit, number * limit) } });
    });
    await page.goto(base + '/admin/users/manager?tab=sessions');
    const loginHistory = page.getByRole('link', { name: 'Xem lịch sử đăng nhập', exact: true });
    await loginHistory.click();
    await page.waitForURL('**/admin/login-history?accountId=manager');
    await page.locator(`[data-workspace-role="admin"][data-workspace-theme="${theme}"]`).waitFor();
    const scope = page.locator('.admin-login-account-scope');
    await scope.getByText(manager.fullName).waitFor();
    const filters = page.getByRole('search', { name: 'Bộ lọc nhật ký' });
    assert.equal(await page.getByRole('navigation', { name: 'Nhóm nhật ký' }).count(), 0);
    assert.equal(await filters.getByLabel('Mã tài khoản').count(), 0);
    const table = page.locator('.admin-audit-table');
    await table.getByText('Đăng xuất', { exact: true }).waitFor();
    assert.deepEqual(await table.getByRole('columnheader').allTextContents(), ['Thời gian', 'Tài khoản', 'Vai trò', 'Sự kiện', 'Kết quả']);
    await filters.getByRole('searchbox', { name: 'Tìm tài khoản' }).fill('manager@');
    await page.waitForURL(url => url.searchParams.get('search') === 'manager@');
    await filters.getByLabel('Vai trò', { exact: true }).selectOption('FACILITY_MANAGER');
    await page.waitForURL(url => url.searchParams.get('role') === 'FACILITY_MANAGER');
    await filters.getByLabel('Sự kiện').selectOption('AUTH_LOGIN');
    await page.waitForURL(url => url.searchParams.get('action') === 'AUTH_LOGIN');
    await filters.getByLabel('Kết quả').selectOption('SUCCESS');
    await page.waitForURL(url => url.searchParams.get('outcome') === 'SUCCESS');
    await chooseDate(page, 'Từ ngày', '2026-11-16');
    const calendar = await openCalendar(page, 'Đến ngày', '2026-11-15');
    assert(await calendar.getByRole('button', { name: '15/11/2026' }).isDisabled());
    await calendar.getByRole('button', { name: '16/11/2026' }).click();
    await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('page') === '2');
    assert.equal(new URL(page.url()).searchParams.get('search'), 'manager@', page.url());
    const trigger = table.getByRole('button', { name: /^Xem sự kiện Đăng nhập/ }).last();
    await trigger.evaluate(el => {
      el.closest('tr').scrollIntoView({ block: 'center' });
      el.focus({ preventScroll: true });
    });
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await trigger.press('Enter');
    const modal = page.getByRole('dialog', { name: 'Chi tiết sự kiện' });
    await modal.getByText('192.0.2.10').waitFor();
    assert.equal(await modal.getByText('Thành công', { exact: true }).count(), 1);
    assert.equal(await modal.getByRole('button', { name: 'Làm mới' }).count(), 0);
    const profile = modal.getByRole('link', { name: 'Xem hồ sơ tài khoản' });
    await profile.waitFor();
    assert.equal(await profile.getAttribute('href'), '/admin/users/manager');
    assert(await modal.evaluate(el => getComputedStyle(el).textAlign === 'start' && el.getBoundingClientRect().right <= innerWidth));
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden' });
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    assert.equal(new URL(page.url()).searchParams.get('accountId'), 'manager');
    assert.equal(new URL(page.url()).searchParams.get('search'), 'manager@', page.url());
    await page.waitForFunction(top => window.scrollY === top, scrollBefore);
    assert(await trigger.evaluate(el => document.activeElement === el));
    await scope.getByRole('button', { name: 'Bỏ lọc theo tài khoản' }).click();
    await page.waitForURL(url => !url.searchParams.has('accountId'));
    assert.equal(new URL(page.url()).searchParams.get('search'), 'manager@');
    assert.equal(new URL(page.url()).searchParams.get('accountId'), null);
    await page.goto(base + '/admin/login-history?event=locked');
    await modal.getByText('Tài khoản đã khóa.', { exact: true }).waitFor();
    assert.equal(await modal.getByText('Thất bại', { exact: true }).count(), 1);
    await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
    await table.getByRole('row').filter({ hasText: 'unknown@example.test' }).getByText('unknown@example.test').click();
    await modal.getByText('unknown@example.test').waitFor();
    assert.equal(await modal.getByText('Nguyên nhân', { exact: true }).count(), 0);
    assert.equal(await modal.getByRole('link', { name: 'Xem hồ sơ tài khoản' }).count(), 0);
    await page.keyboard.press('Escape');
    await table.getByText('Đăng xuất', { exact: true }).click();
    await modal.getByText('Đăng xuất', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: Admin login-history filters, scoped account links, paging, event details, focus, scroll and themes.');
} finally {
  await browser.close();
}
