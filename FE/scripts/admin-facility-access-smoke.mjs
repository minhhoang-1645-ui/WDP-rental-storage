import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const facilities = [
  { id: 'a', name: 'Cơ sở Đông', code: 'NB101' }, { id: 'b', name: 'Cơ sở Tây', code: 'NB102' },
  { id: 'c', name: 'Cơ sở Nam', code: 'NB103' }, { id: 'd', name: 'Cơ sở Bắc', code: 'NB104' },
];
const users = [
  { id: 'm', fullName: 'Quản lý thử nghiệm', email: 'manager@example.test', role: 'FACILITY_MANAGER', accountStatus: 'ACTIVE' },
  { id: 's', fullName: 'Nhân viên thử nghiệm', email: 'staff@example.test', role: 'FACILITY_STAFF', accountStatus: 'DISABLED' },
];
const makeGrant = (userId, facilityId, id, day, revokedAt = null) => ({
  id, userId, facilityId, facility: facilities.find(facility => facility.id === facilityId),
  grantedAt: `2026-11-${day}T02:15:00Z`, grantedByName: 'Quản trị viên A', revokedAt,
  revokedByName: revokedAt ? 'Quản trị viên B' : null,
});
const browser = await launchTestBrowser();
try {
  for (const [theme, width] of [['light', 1440], ['dark', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    page.setDefaultTimeout(8000);
    const history = [makeGrant('m', 'a', 'old-a', '01', '2026-11-02T02:15:00Z'), makeGrant('m', 'a', 'active-a', '20')];
    const writes = [];
    const errors = [];
    let blockRelocate = true;
    let blockRevoke = true;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => {
      localStorage.setItem('wdp-auth-token-v1', 'test-admin');
      localStorage.setItem('nestbox-workspace-theme', value);
    }, theme);
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const path = url.pathname.replace(/^\/api/, '');
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      if (path === '/auth/me') return route.fulfill({ json: {
        id: 'admin', fullName: 'Admin', email: 'admin@example.test', role: 'SYSTEM_ADMINISTRATOR', accountStatus: 'ACTIVE',
      } });
      if (path === '/admin/facility-access' && request.method() === 'GET') {
        return route.fulfill({ json: { facilities, users, items: history.filter(grant => !grant.revokedAt) } });
      }
      if (path === '/admin/facility-access' && request.method() === 'POST') {
        const { userId, facilityId } = request.postDataJSON();
        writes.push('grant-' + facilityId);
        assert.equal(history.filter(grant => grant.userId === userId && !grant.revokedAt).length, 0);
        const grant = makeGrant(userId, facilityId, 'new-' + facilityId, '23');
        history.push(grant);
        return route.fulfill({ json: grant });
      }
      if (path === '/admin/facility-access/users/m/relocate' && request.method() === 'PATCH') {
        assert.deepEqual(request.postDataJSON(), { expectedAccessId: 'active-a', facilityId: 'c' });
        writes.push('relocate-c');
        if (blockRelocate) return route.fulfill({ status: 409, json: { message: 'Cần kiểm tra lại cơ sở.' } });
        Object.assign(history.find(grant => grant.id === 'active-a'), { revokedAt: '2026-11-25T03:00:00Z', revokedByName: 'Quản trị viên B' });
        const grant = makeGrant('m', 'c', 'active-c', '23');
        history.push(grant);
        return route.fulfill({ json: grant });
      }
      if (path === '/admin/facility-access/active-c/revoke' && request.method() === 'PATCH') {
        writes.push('revoke-c');
        if (blockRevoke) return route.fulfill({ status: 409, json: { message: 'Tài khoản còn công việc chưa hoàn tất. Quản lý cần phân công lại trước.' } });
        Object.assign(history.find(grant => grant.id === 'active-c'), { revokedAt: '2026-11-26T03:00:00Z', revokedByName: 'Quản trị viên B' });
        return route.fulfill({ json: { revoked: true } });
      }
      const account = users.find(user => path === '/admin/users/' + user.id || path === '/admin/users/' + user.id + '/access');
      if (path.endsWith('/access') && account) return route.fulfill({ json: {
        history: history.filter(grant => grant.userId === account.id), openAssignments: 5, closedAssignments: 4, sessions: [],
      } });
      return route.fulfill({ json: account ?? { items: [], total: 0 } });
    });
    await page.goto(base + '/admin/facility-access');
    await page.locator(`[data-workspace-theme="${theme}"]`).waitFor();
    await page.getByRole('heading', { name: 'Chọn một tài khoản' }).waitFor().catch(async error => {
      console.error(page.url(), errors, (await page.locator('body').innerText()).slice(0, 1500));
      throw error;
    });
    const directory = page.locator('.admin-facility-directory');
    const manager = directory.getByRole('button', { name: /Quản lý thử nghiệm/ });
    const staff = directory.getByRole('button', { name: /Nhân viên thử nghiệm/ });
    await directory.getByLabel('Vai trò').selectOption('FACILITY_STAFF');
    await staff.waitFor();
    assert.equal(await manager.count(), 0);
    await directory.getByLabel('Trạng thái').selectOption('DISABLED');
    await directory.getByLabel('Tìm tài khoản').fill('staff@');
    await staff.click();
    await page.waitForURL('**/admin/facility-access?user=s');
    await page.getByRole('heading', { name: 'Chưa được cấp quyền tại cơ sở nào' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Cấp quyền', exact: true }).count(), 0);
    await directory.getByLabel('Tìm tài khoản').fill('');
    await directory.getByLabel('Vai trò').selectOption('');
    await directory.getByLabel('Trạng thái').selectOption('');
    assert.equal(await staff.getAttribute('aria-pressed'), 'true');
    await manager.click();
    await page.waitForURL('**/admin/facility-access?user=m');
    await manager.getByText('1 cơ sở còn quyền truy cập').waitFor();
    const current = page.getByRole('table', { name: 'Cơ sở đang được cấp quyền' });
    await current.getByText('NB101').waitFor();
    assert.equal(await current.getByRole('row').count(), 2);
    const historyTab = page.getByRole('tab', { name: 'Lịch sử cấp và thu hồi' });
    const historyTable = page.getByRole('table', { name: 'Lịch sử cấp và thu hồi' });
    await historyTab.click();
    await historyTable.getByText('Đã thu hồi').waitFor();
    assert.equal(await historyTable.getByText('Cơ sở Đông', { exact: true }).count(), 2);
    assert.match(await historyTable.locator('tbody tr').first().innerText(), /20\/11\/2026/);
    assert.equal(await current.count(), 0);
    const noHorizontalOverflow = table => table.evaluate(el => el.parentElement.scrollWidth <= el.parentElement.clientWidth + 1);
    assert(await noHorizontalOverflow(historyTable));
    await historyTab.press('ArrowLeft');
    await current.waitFor();
    assert(await noHorizontalOverflow(current));
    await page.getByRole('button', { name: 'Điều chuyển cơ sở', exact: true }).click();
    const relocate = page.getByRole('dialog', { name: 'Điều chuyển cơ sở', exact: true });
    assert(await relocate.getByRole('radio', { name: /Cơ sở Đông/ }).isDisabled());
    await relocate.getByLabel('Tìm cơ sở').fill('NB103');
    await relocate.getByRole('radio', { name: /Cơ sở Nam/ }).check();
    const relocateButton = relocate.getByRole('button', { name: 'Xác nhận điều chuyển' });
    await relocateButton.click();
    await relocate.getByRole('alert').getByText('Cần kiểm tra lại cơ sở.').waitFor();
    blockRelocate = false;
    await relocateButton.click();
    await relocate.waitFor({ state: 'hidden' });
    await current.getByText('NB103').waitFor();
    assert.equal(await current.getByText('NB101').count(), 0);
    await current.getByRole('button', { name: 'Thu hồi quyền tại Cơ sở Nam' }).click();
    const revoke = page.getByRole('dialog', { name: 'Xác nhận thu hồi quyền cơ sở' });
    await revoke.getByText('Cơ sở Nam · NB103').waitFor();
    const confirm = revoke.getByRole('button', { name: 'Thu hồi quyền', exact: true });
    await confirm.click();
    await revoke.getByRole('alert').getByText(/còn công việc chưa hoàn tất/).waitFor();
    blockRevoke = false;
    await confirm.click();
    await revoke.waitFor({ state: 'hidden' });
    await manager.getByText('0 cơ sở còn quyền truy cập').waitFor();
    await page.getByRole('button', { name: 'Cấp quyền', exact: true }).click();
    const grant = page.getByRole('dialog', { name: 'Cấp quyền cơ sở', exact: true });
    await grant.getByRole('radio', { name: /Cơ sở Bắc/ }).check();
    await grant.getByRole('button', { name: 'Cấp quyền', exact: true }).click();
    await grant.waitFor({ state: 'hidden' });
    await current.getByText('NB104').waitFor();
    assert.deepEqual(writes, ['relocate-c', 'relocate-c', 'revoke-c', 'revoke-c', 'grant-d']);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole('link', { name: 'Xem hồ sơ tài khoản' }).click();
    await page.waitForURL('**/admin/users/m?tab=permissions');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: FacilityAccess filters, masters, tabs, grants, relocation, revocation, history, themes and geometry.');
} finally {
  await browser.close();
}
