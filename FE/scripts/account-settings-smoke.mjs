// All API calls are mocked. No shared database writes.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const browser = await launchTestBrowser();
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const roles = { CUSTOMER: 'Khách hàng', STAFF: 'Nhân viên', MANAGER: 'Quản lý', ADMIN: 'Quản trị viên' };
try {
  for (const [role, roleName] of Object.entries(roles)) {
    const root = '/' + role.toLowerCase();
    const actor = { id: role, role, email: role.toLowerCase() + '@example.test', fullName: 'Người dùng ' + roleName, phone: '' };
    const calls = [];
    const context = await browser.newContext({ viewport: { width: 1366, height: 850 } });
    await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'settings-fixture'));
    await context.route('**/*', async route => {
      const request = route.request();
      if (!['fetch', 'xhr', 'eventsource'].includes(request.resourceType())) return route.continue();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      if (method === 'OPTIONS') return route.fulfill({ status: 204 });
      if (path.endsWith('/auth/me')) {
        if (method === 'PATCH') {
          const fields = request.postDataJSON();
          calls.push(fields);
          if (calls.length === 1) return route.fulfill({ status: 400, json: { message: 'Không thể lưu hồ sơ kiểm thử.' } });
          Object.assign(actor, fields);
        }
        return route.fulfill({ json: actor });
      }
      if (path.endsWith('/auth/logout')) {
        calls.push('logout');
        return route.fulfill({ status: 204 });
      }
      assert.equal(method, 'GET');
      if (path.endsWith('/api/reservations')) return route.fulfill({ json: [] });
      return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(12000);
    await page.goto(base + root + '/settings/profile');
    await page.getByRole('heading', { name: 'Cài đặt tài khoản' }).waitFor();
    const profile = page.getByRole('form', { name: 'Cập nhật hồ sơ' });
    assert.equal(await profile.getByLabel('Vai trò').count(), 0);
    assert.equal(await profile.getByLabel('Email đăng nhập').inputValue(), actor.email);
    await page.locator('.account-settings-identity').getByText(roleName, { exact: true }).waitFor();
    assert.equal(await profile.getByLabel('Email đăng nhập').isEditable(), false);
    assert.equal(await page.locator('.account-settings-nav a').count(), 2);
    const name = profile.getByLabel('Họ và tên');
    assert.equal(await name.inputValue(), actor.fullName);
    await profile.getByLabel('Số điện thoại').fill('123');
    const save = profile.getByRole('button', { name: 'Lưu thông tin' });
    await save.click();
    await profile.getByRole('alert').filter({ hasText: '8–15 chữ số' }).waitFor();
    assert.deepEqual(calls, []);
    await profile.getByRole('button', { name: 'Bỏ thay đổi' }).click();
    await name.fill('Tên đã cập nhật');
    await page.getByRole('navigation', { name: 'Cài đặt tài khoản' }).getByRole('link', { name: 'Giao diện' }).click();
    await page.getByRole('radio', { name: 'Tối' }).check();
    await page.goBack();
    assert.equal(await name.inputValue(), 'Tên đã cập nhật');
    await save.click();
    await profile.getByRole('alert').filter({ hasText: 'Không thể lưu hồ sơ kiểm thử.' }).waitFor();
    assert.equal(await name.inputValue(), 'Tên đã cập nhật');
    await save.click();
    await profile.getByRole('status').filter({ hasText: 'Đã cập nhật hồ sơ' }).waitFor();
    assert.deepEqual(calls, [{ fullName: 'Tên đã cập nhật' }, { fullName: 'Tên đã cập nhật' }]);
    assert.equal(await profile.getByLabel('Số điện thoại').inputValue(), '');

    const menu = page.getByRole('button', { name: 'Menu tài khoản' });
    await menu.click();
    await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).waitFor();
    await page.getByRole('button', { name: 'Cài đặt giao diện' }).click();
    await page.waitForURL(base + root + '/settings/appearance');
    await page.reload();
    const dark = page.getByRole('radio', { name: 'Tối' });
    await dark.waitFor({ state: 'attached' });
    assert(await dark.isChecked());
    await menu.click();
    await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).click();
    assert(await page.getByRole('radio', { name: 'Sáng' }).isChecked());
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 360, height: 760 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await menu.click();
    await page.getByRole('button', { name: 'Thông tin cá nhân' }).click();
    await page.waitForURL(base + root + '/settings/profile');

    const other = role === 'ADMIN' ? '/staff' : '/admin';
    await page.goto(base + other + '/settings/profile');
    await page.waitForURL(base + root);
    await page.locator('main h1').waitFor();
    await menu.click();
    await page.locator('.workspace-profile-panel').getByRole('button', { name: 'Đăng xuất' }).click();
    await page.waitForURL(url => url.pathname === (role === 'CUSTOMER' ? '/account/login' : '/portal/login'));
    assert.equal(await page.evaluate(() => localStorage.getItem('wdp-auth-token-v1')), null);
    assert.deepEqual(errors, []);
    assert.equal(calls.at(-1), 'logout');
    console.log(role + ': profile, theme, navigation, role guard and logout passed.');
    await context.close();
  }
} finally {
  await browser.close();
}
