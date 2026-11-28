import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const admin = { id: 'admin', role: 'SYSTEM_ADMINISTRATOR', fullName: 'Quản trị kiểm thử', email: 'admin@example.test' };
const target = { id: 'staff', role: 'FACILITY_STAFF', fullName: 'Nhân viên kiểm thử', email: 'staff@example.test' };
const common = { actorId: admin.id, actorRole: admin.role, actorName: admin.fullName, actorEmail: admin.email,
  resource: 'users', resourceId: target.id, targetUserId: target.id, targetAccount: target,
  outcome: 'SUCCESS', createdAt: '2026-11-26T03:00:00Z' };
const relocation = { ...common, id: 'move', action: 'RELOCATE_FACILITY_ACCESS', previousFacilityName: 'NestBox Thủ Đức',
  facilityName: 'NestBox Bình Thạnh', metadata: { previousFacilityId: 'a', facilityId: 'b', reason: 'Điều phối cơ sở', sessionToken: 'DO_NOT_SHOW' } };
const roleChange = { ...common, id: 'role', action: 'CHANGE_ROLE',
  metadata: { previousRole: 'STORAGE_CUSTOMER', nextRole: 'FACILITY_STAFF' } };
const history = [relocation, roleChange, ...Array.from({ length: 6 }, (_, index) =>
  ({ ...common, id: 'grant-' + index, action: 'GRANT_FACILITY_ACCESS', facilityName: index === 5 ? 'Cơ sở cuối trang hai' : 'NestBox Thủ Đức' }))];

const browser = await launchTestBrowser();
try {
  for (const [theme, width] of [['light', 1366], ['dark', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 820 } });
    page.setDefaultTimeout(10000);
    const calls = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => {
      localStorage.setItem('wdp-auth-token-v1', 'fixture-admin');
      localStorage.setItem('nestbox-workspace-theme', value);
    }, theme);
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: admin });
      if (url.pathname.endsWith('/admin/users/staff')) return route.fulfill({ json: target });
      if (url.pathname.endsWith('/admin/audit-events') && url.searchParams.get('scope') === 'permissions') {
        const query = Object.fromEntries(url.searchParams);
        calls.push(query);
        const pageNumber = Number(query.page), limit = Number(query.limit);
        const matching = history.filter(event => (!query.accountId || event.targetUserId === query.accountId)
          && (!query.event || event.id === query.event) && (!query.action || event.action === query.action)
          && (!query.search || event.targetAccount.email.includes(query.search)));
        return route.fulfill({ json: { page: pageNumber, limit, total: matching.length,
          items: matching.slice((pageNumber - 1) * limit, pageNumber * limit) } });
      }
      return route.fulfill({ json: { page: 1, limit: 20, total: 0, items: [] } });
    });
    await page.goto(base + '/admin/permission-history?accountId=staff&limit=5');
    await page.locator(`[data-workspace-theme="${theme}"]`).waitFor();
    await page.getByText('Đang lọc theo tài khoản', { exact: false }).waitFor();
    assert.equal(await page.getByRole('navigation', { name: 'Nhóm nhật ký' }).count(), 0);
    assert.equal(await page.getByLabel('Mã tài khoản').count(), 0);
    await page.getByRole('button', { name: 'Trang sau' }).click();
    await page.waitForURL(/page=2/);
    const lastRow = page.getByRole('row').filter({ hasText: 'Cơ sở cuối trang hai' });
    await lastRow.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
    const historyDialog = page.getByRole('dialog', { name: 'Chi tiết thay đổi quyền' });
    await historyDialog.getByText('Cơ sở cuối trang hai', { exact: true }).waitFor();
    await historyDialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    await page.getByLabel('Loại thay đổi quyền').selectOption('RELOCATE_FACILITY_ACCESS');
    await page.getByRole('cell', { name: 'NestBox Thủ Đức → NestBox Bình Thạnh' }).waitFor();
    await page.getByLabel('Tìm tài khoản').fill('staff@');
    const detail = page.getByRole('button', { name: 'Xem chi tiết', exact: true });
    await detail.click();
    const dialog = page.getByRole('dialog', { name: 'Chi tiết thay đổi quyền' });
    await dialog.waitFor();
    for (const text of [admin.fullName, target.fullName, 'NestBox Thủ Đức', 'NestBox Bình Thạnh', 'Điều phối cơ sở']) {
      await dialog.getByText(text, { exact: true }).waitFor();
    }
    assert(!await dialog.getByText('DO_NOT_SHOW').count());
    const box = await dialog.boundingBox();
    assert(box && Math.abs(box.x + box.width / 2 - width / 2) <= 3);
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const query = new URL(page.url()).searchParams;
    assert.equal(query.get('accountId'), 'staff');
    assert.equal(query.get('action'), 'RELOCATE_FACILITY_ACCESS');
    assert.equal(query.get('search'), 'staff@');
    assert(calls.some(call => call.event === 'move' && call.scope === 'permissions'));
    assert(calls.some(call => call.page === '2' && call.accountId === 'staff'));
    await page.getByRole('button', { name: 'Bỏ lọc theo tài khoản' }).click();
    await page.waitForURL(url => !url.searchParams.has('accountId'));
    await page.getByLabel('Loại thay đổi quyền').selectOption('CHANGE_ROLE');
    await page.getByRole('cell', { name: 'Khách thuê kho → Nhân viên cơ sở' }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: permission history filters, pagination, account link scope, centered private detail, light/dark.');
} finally {
  await browser.close();
}
