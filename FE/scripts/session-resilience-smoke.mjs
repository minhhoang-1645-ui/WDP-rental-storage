// Browser-only auth and work-form regressions. Every API request is intercepted.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { customer } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser(), errors = [], unexpected = [], checks = [];
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts/production-20261104', { recursive: true });
async function setup(role, { blocked = false, failingSession = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const actor = { ...customer, id: 'resilient-' + role, role, accountStatus: 'ACTIVE' };
  const state = { failingSession, sessionError: null, logins: 0 };
  await context.addInitScript(({ blocked }) => {
    if (blocked) for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, { get() { throw new DOMException('Blocked storage', 'SecurityError'); } });
    else localStorage.setItem('wdp-auth-token-v1', 'resilient-session');
  }, { blocked });
  await context.route(/\/api\//, async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const send = (json, status = 200) => route.fulfill({ json, status });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/auth/login' && req.method() === 'POST') { state.logins++; return send({ token: 'resilient-session', user: actor }); }
    if (path === '/auth/logout' && req.method() === 'POST') return send({});
    if (req.method() !== 'GET') { unexpected.push(req.method() + ':' + path); return route.abort(); }
    if (state.sessionError) return send(state.sessionError, 401);
    if (path === '/auth/me') return state.failingSession ? send({ message: 'Kết nối đang gián đoạn.' }, 503) : send(actor);
    if (path === '/reservations' || path === '/customer/stored-items') return send([]);
    if (path === '/manager/dashboard/summary') return send({ availableUnits: 0 });
    if (path === '/health') return send({ status: 'ok' });
    if (path === '/manager/unit-staff-assignments' || path === '/staff/assigned-units') return send({ enabled: false, items: [] });
    const items = path === '/admin/users' ? [actor] : path === '/manager/early-return-requests'
      ? [{ id: 'early-return', supportCode: 'EARLY-TEST', status: 'OPEN', subject: 'Đề nghị trả trước hạn', customer }] : [];
    return send({ page: 1, limit: 100, total: items.length, items });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, state };
}
try {
  for (const role of ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN']) {
    const test = await setup(role, { blocked: true });
    await test.page.goto(base + '/account/login', { waitUntil: 'domcontentloaded' });
    await test.page.getByLabel('Email', { exact: true }).fill(customer.email);
    await test.page.getByLabel('Mật khẩu', { exact: true }).fill('browser-fixture-only');
    await test.page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await test.page.waitForURL(url => url.pathname === '/' + role.toLowerCase());
    await test.page.locator('main').first().waitFor();
    assert.equal(test.state.logins, 1);
    const token = await test.page.evaluate(async () => (await import('/src/services/browser-storage.ts')).safeLocalStorage.getItem('wdp-auth-token-v1'));
    assert.equal(token, 'resilient-session');
    await test.page.setViewportSize({ width: 320, height: 960 });
    assert(await test.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), role + ' workspace overflows at 320px');
    await test.page.screenshot({ path: 'artifacts/production-20261104/' + role.toLowerCase() + '-320.png', fullPage: true, animations: 'disabled' });
    await test.page.setViewportSize({ width: 1440, height: 960 });
    await test.page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await test.page.waitForURL(url => url.pathname === (role === 'CUSTOMER' ? '/account/login' : '/portal/login'));
    assert.equal(await test.page.evaluate(async () => (await import('/src/services/browser-storage.ts')).safeLocalStorage.getItem('wdp-auth-token-v1')), null);
    checks.push(role + ': blocked browser storage still permits login, correct workspace and logout without stale bearer state');
    await test.context.close();
  }
  const reconnect = await setup('CUSTOMER', { failingSession: true });
  await reconnect.page.goto(base + '/customer', { waitUntil: 'domcontentloaded' });
  await reconnect.page.getByRole('heading', { name: 'Chưa kết nối được tài khoản', exact: true }).waitFor();
  assert.equal(await reconnect.page.evaluate(() => localStorage.getItem('wdp-auth-token-v1')), 'resilient-session');
  reconnect.state.failingSession = false;
  await reconnect.page.getByRole('button', { name: 'Thử kết nối lại', exact: true }).click();
  await reconnect.page.getByRole('heading', { name: 'Chưa kết nối được tài khoản', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(reconnect.state.logins, 0);
  checks.push('A failed saved-session check preserves the token and retries without asking for a password');
  await reconnect.context.close();
  for (const [role, reason, message, loginPath] of [
    ['CUSTOMER', 'ACCOUNT_DISABLED', 'Tài khoản đã bị vô hiệu hóa.', '/account/login'],
    ['STAFF', 'ACCOUNT_DISABLED', 'Tài khoản đã bị vô hiệu hóa.', '/portal/login'],
    ['CUSTOMER', 'SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.', '/account/login'],
    ['CUSTOMER', 'SESSION_INVALID', 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.', '/account/login'],
  ]) {
    const test = await setup(role);
    const other = await test.context.newPage();
    const workspace = base + '/' + role.toLowerCase();
    await test.page.goto(workspace);
    await other.goto(workspace);
    await Promise.all([test.page, other].map(page => page.getByRole('button', { name: 'Menu tài khoản' }).waitFor()));
    test.state.sessionError = { code: reason, message: 'Phiên không sử dụng được.' };
    await test.page.evaluate(async () => {
      const { apiRequest } = await import('/src/services/api.ts');
      await apiRequest('/auth/me').catch(() => {});
    });
    for (const page of [test.page, other]) {
      await page.waitForURL(url => url.pathname === loginPath);
      await page.getByRole('alert').getByText(message, { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('wdp-auth-token-v1')), null);
    }
    checks.push(role + ': ' + reason + ' shows the correct notice in both open tabs');
    await test.context.close();
  }
  for (const [role, loginPath, response] of [
    ['CUSTOMER', '/account/login', { code: 'ACCOUNT_DISABLED' }],
    ['STAFF', '/portal/login', { message: 'Tài khoản đã bị vô hiệu hóa.' }],
  ]) {
    const test = await setup(role);
    await test.context.addInitScript(() => sessionStorage.setItem('wdp-session-expired', 'SESSION_EXPIRED'));
    test.state.sessionError = response;
    await test.page.goto(base + loginPath);
    await test.page.getByRole('alert').getByText('Tài khoản đã bị vô hiệu hóa.', { exact: true }).waitFor();
    assert.equal(await test.page.getByRole('alert').getByText(/hết hạn/).count(), 0);
    checks.push(role + ': login loaded directly replaces a stale expiry notice with the actual disabled reason');
    await test.context.close();
  }
  const crossTab = await setup('STAFF', { failingSession: true });
  await crossTab.page.goto(base + '/staff', { waitUntil: 'domcontentloaded' });
  await crossTab.page.getByRole('heading', { name: 'Chưa kết nối được tài khoản', exact: true }).waitFor();
  await crossTab.page.evaluate(() => { localStorage.removeItem('wdp-auth-token-v1'); window.dispatchEvent(new StorageEvent('storage', { key: 'wdp-auth-token-v1', oldValue: 'resilient-session', newValue: null })); });
  await crossTab.page.getByRole('heading', { name: 'Đăng nhập nội bộ', exact: true }).waitFor();
  checks.push('Logout in another tab clears a failed-session retry screen instead of trapping the user');
  await crossTab.context.close();
  const forms = await setup('MANAGER');
  await forms.page.goto(base + '/manager/reviews', { waitUntil: 'domcontentloaded' });
  await forms.page.getByRole('searchbox', { name: 'Tìm kiếm', exact: true }).fill('EARLY-TEST');
  const hasDraft = () => forms.page.evaluate(async () => (await import('/src/services/live-events.ts')).hasDraft());
  assert.equal(await hasDraft(), false, 'A read-only search must not freeze automatic updates');
  await forms.page.goto(base + '/manager/early-returns', { waitUntil: 'domcontentloaded' });
  await forms.page.getByLabel('Điều kiện hoặc lý do trả sớm').fill('Khách đề nghị trả trước hạn.');
  assert.equal(await hasDraft(), true, 'An unsaved review still suspends automatic screen refresh');
  checks.push('Manager search filters do not block live updates; review edits still preserve the draft');
  await forms.context.close();
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed: checks, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
