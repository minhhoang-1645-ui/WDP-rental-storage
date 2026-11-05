// Browser-only auth and work-form regressions. Every API request is intercepted.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { customer, fixture } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser(), errors = [], unexpected = [], checks = [];
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts/production-20261104', { recursive: true });
async function setup(role, { blocked = false, failingSession = false, submission = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const actor = { ...customer, id: 'resilient-' + role, role, accountStatus: 'ACTIVE' };
  const state = { failingSession, logins: 0 };
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
    if (path === '/auth/me') return state.failingSession ? send({ message: 'Kết nối đang gián đoạn.' }, 503) : send(actor);
    if (path === '/reservations' || path === '/customer/stored-items') return send([]);
    if (path === '/manager/dashboard/summary') return send({ availableUnits: 0 });
    if (path === '/health') return send({ status: 'ok' });
    if (path === '/manager/unit-staff-assignments' || path === '/staff/assigned-units') return send({ enabled: false, items: [] });
    const items = path === '/admin/users' ? [actor] : submission && path === '/manager/payment-submissions'
      ? [{ id: 'sub-review', submissionCode: 'TRANSFER-REVIEW', status: 'PENDING_VERIFICATION', amount: 650000, customer, invoice: fixture.invoices[0], submittedAt: '2026-11-04T04:00:00Z' }] : [];
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
    await test.page.waitForURL(/\/account\/login$/);
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
  const crossTab = await setup('STAFF', { failingSession: true });
  await crossTab.page.goto(base + '/staff', { waitUntil: 'domcontentloaded' });
  await crossTab.page.getByRole('heading', { name: 'Chưa kết nối được tài khoản', exact: true }).waitFor();
  await crossTab.page.evaluate(() => { localStorage.removeItem('wdp-auth-token-v1'); window.dispatchEvent(new StorageEvent('storage', { key: 'wdp-auth-token-v1', oldValue: 'resilient-session', newValue: null })); });
  await crossTab.page.getByRole('heading', { name: 'Đăng nhập nội bộ', exact: true }).waitFor();
  checks.push('Logout in another tab clears a failed-session retry screen instead of trapping the user');
  await crossTab.context.close();
  const forms = await setup('MANAGER', { submission: true });
  await forms.page.goto(base + '/manager/payment-submissions', { waitUntil: 'domcontentloaded' });
  await forms.page.getByPlaceholder('Mã hóa đơn, yêu cầu, khách hàng, tham chiếu').fill('chuyen kho');
  const hasDraft = () => forms.page.evaluate(async () => (await import('/src/services/live-events.ts')).hasDraft());
  assert.equal(await hasDraft(), false);
  await forms.page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  assert.equal(await hasDraft(), false, 'A read-only search must not freeze automatic updates');
  await forms.page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await forms.page.getByLabel('Mã tham chiếu giao dịch ngân hàng', { exact: true }).fill('UNSAVED-REFERENCE');
  assert.equal(await hasDraft(), true, 'Actual financial edits still suspend automatic screen refresh');
  checks.push('Manager search filters do not block live updates; financial edits still preserve the draft');
  await forms.context.close();
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed: checks, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
