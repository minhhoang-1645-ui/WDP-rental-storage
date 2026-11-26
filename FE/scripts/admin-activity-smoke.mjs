import assert from 'node:assert/strict';
import { chooseDate, launchTestBrowser } from './browser-test.mjs';

const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const admin = { id: 'admin', fullName: 'Admin mẫu', email: 'admin@example.test', role: 'SYSTEM_ADMINISTRATOR' };
const related = { id: 'manager', fullName: 'Quản lý mẫu', email: 'manager@example.test', role: 'FACILITY_MANAGER', accountStatus: 'ACTIVE' };
const common = { actorId: admin.id, actorName: admin.fullName, actorRole: admin.role, actorEmail: admin.email,
  createdAt: '2026-11-16T02:30:00Z', outcome: 'SUCCESS', resource: 'users' };
const events = [
  { ...common, id: 'grant', action: 'GRANT_FACILITY_ACCESS', resourceId: related.id, targetAccount: related, facilityName: 'NestBox Thủ Đức' },
  { ...common, id: 'facility', action: 'FACILITY_LIFECYCLE', resource: 'facility',
    metadata: { previousStatus: 'OPEN', status: 'CLOSING', facilityName: 'NestBox Thủ Đức', closureReason: 'Kết thúc hợp đồng mặt bằng' } },
  { ...common, id: 'unknown', action: 'LEGACY_EVENT', resource: 'legacy-resource', outcome: 'FAILURE',
    actorId: null, actorRole: null, actorName: null, actorEmail: null, metadata: { token: 'must-not-render' } },
  { ...common, id: 'auto', action: 'TASK_ASSIGNMENT', resource: 'appointments', route: '/system/dispatch',
    actorId: null, actorRole: null, actorName: null, actorEmail: null, metadata: { source: 'AUTO' } },
  ...Array.from({ length: 16 }, (_, index) => ({ ...common, id: 'shift-' + index, action: 'CREATE_SHIFT', resource: 'staff-shifts' })),
];

const browser = await launchTestBrowser();
try {
  for (const [theme, width] of [['light', 1440], ['dark', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 680 }, timezoneId: 'America/Los_Angeles' });
    page.setDefaultTimeout(9000);
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
      if (path === '/auth/me' || path === '/admin/users/admin') return route.fulfill({ json: admin });
      if (path === '/admin/users/manager') return route.fulfill({ json: related });
      if (path === '/admin/users/manager/access') return route.fulfill({ json: { history: [], sessions: [], openAssignments: 0 } });
      const query = Object.fromEntries(url.searchParams);
      const rows = path === '/admin/audit-events' && query.category === 'ACTIVITY' ? events.filter(row =>
        (!query.event || query.event === row.id) && (!query.search || row.actorEmail?.includes(query.search))
        && (!query.role || row.actorRole === query.role) && (!query.action || row.action === query.action)
        && (!query.outcome || row.outcome === query.outcome) && (!query.accountId || row.actorId === query.accountId)) : [];
      const number = Number(query.page) || 1, limit = Number(query.limit) || 10;
      return route.fulfill({ json: { page: number, limit, total: rows.length, items: rows.slice((number - 1) * limit, number * limit) } });
    });

    await page.goto(base + '/admin/activity');
    const table = page.locator('.admin-activity-audit .admin-audit-table');
    await table.waitFor();
    await page.locator(`[data-workspace-role="admin"][data-workspace-theme="${theme}"]`).waitFor();
    assert.deepEqual(await table.getByRole('columnheader').allTextContents(), ['Thời gian', 'Người thực hiện', 'Hoạt động', 'Kết quả']);
    assert.equal(await page.getByRole('navigation', { name: 'Nhóm nhật ký' }).count(), 0);
    assert.equal(await page.getByLabel('Mã tài khoản').count(), 0);
    await table.getByText('Quản lý mẫu · NestBox Thủ Đức').waitFor();
    assert(await table.evaluate(el => el.parentElement.scrollWidth <= el.parentElement.clientWidth + 1));
    await table.getByText('Hệ thống', { exact: true }).waitFor();
    const unknown = table.getByRole('row').filter({ hasText: 'Không ghi nhận người thực hiện' });
    await unknown.getByText('Hoạt động chưa phân loại').click();
    const modal = page.getByRole('dialog', { name: 'Chi tiết hoạt động' });
    await modal.getByText('Thất bại', { exact: true }).waitFor();
    await modal.getByText('Thông tin kỹ thuật').click();
    await modal.getByText('LEGACY_EVENT', { exact: true }).waitFor();
    assert(!((await modal.innerText()).includes('must-not-render')));
    assert.equal(await modal.getByText('Nội dung thay đổi').count(), 0);
    await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
    await table.getByText('Thay đổi trạng thái kinh doanh').click();
    await modal.getByText('Đang ngừng kinh doanh', { exact: true }).waitFor();
    await modal.getByText('Kết thúc hợp đồng mặt bằng', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await table.getByText('Cấp quyền truy cập cơ sở', { exact: true }).click();
    await modal.getByRole('link', { name: 'Xem hồ sơ tài khoản' }).click();
    await page.waitForURL('**/admin/users/manager');

    await page.goto(base + '/admin/activity?accountId=admin');
    await page.locator('.admin-login-account-scope').getByText(admin.fullName, { exact: true }).waitFor();
    await page.getByRole('searchbox', { name: 'Tìm nhật ký' }).fill('admin@');
    await page.waitForURL(url => url.searchParams.get('search') === 'admin@');
    await page.getByLabel('Vai trò', { exact: true }).selectOption(admin.role);
    await page.getByLabel('Hoạt động', { exact: true }).selectOption('CREATE_SHIFT');
    await page.getByLabel('Kết quả', { exact: true }).selectOption('SUCCESS');
    await chooseDate(page, 'Từ ngày', '2026-11-16');
    await table.getByText('Xếp ca nhân viên').first().waitFor();
    await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('page') === '2');
    const trigger = table.getByRole('button', { name: /^Xem sự kiện Xếp ca nhân viên/ }).last();
    await trigger.evaluate(el => { el.closest('tr').scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); });
    const scroll = await page.evaluate(() => window.scrollY);
    await trigger.press('Enter');
    await modal.getByText('Xếp ca nhân viên', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden' });
    for (const [key, value] of Object.entries({ page: '2', search: 'admin@', accountId: 'admin', role: admin.role, action: 'CREATE_SHIFT', outcome: 'SUCCESS', from: '2026-11-16' })) {
      assert.equal(new URL(page.url()).searchParams.get(key), value);
    }
    await page.waitForFunction(top => window.scrollY === top, scroll);
    assert(await trigger.evaluate(el => document.activeElement === el));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.goto(base + '/admin/activity?event=grant');
    await modal.getByText('Cấp quyền truy cập cơ sở', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: Admin activity mappings, account scope, filters, modal, pagination, and themes.');
} finally {
  await browser.close();
}
