// Expo-web acceptance checks; all business API requests are browser fixtures.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { customer, fixture } from './fixtures/workspace.mjs';

const base = process.env.WDP_MOBILE_URL || 'http://127.0.0.1:8081';
const catalog = await fetch((process.env.WDP_API_URL || 'http://127.0.0.1:3000/api') + '/booking/catalog').then(response => { assert(response.ok); return response.json(); });
const product = catalog.products.find(item => item.id === 'lk-a01') || catalog.products.find(item => item.sizeId === 'locker');
assert(product, 'An existing public product is required; this test never seeds one.');
const browser = await launchTestBrowser(), checks = [], errors = [], unexpected = [];
const quote = input => ({ status: 'PRICED', currency: 'VND', paymentPlan: 'PAY_MONTHLY', termMonths: input.durationMonths, rentalAmount: 650000 * input.durationMonths, depositAmount: 0, quotedTotalAmount: 650000 * input.durationMonths, estimatedInitialAmountDue: 650000, lineItems: [{ code: 'rent', label: 'Tiền thuê kho', amount: 650000 * input.durationMonths, basis: input.durationMonths + ' tháng' }], initialPaymentBreakdown: { rentalAmount: 650000, depositAmount: 0, purchaseAddOnAmount: 0, rentalAddOnAmount: 0, totalAmount: 650000, remainingAmount: 650000 * (input.durationMonths - 1), periodStart: input.startDate, periodEnd: '2027-02-28' } });
async function setup(width, { blocked = false, offline = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 960 } });
  const state = { user: { ...customer, role: 'CUSTOMER', phone: '', accountStatus: 'ACTIVE' }, offline, profileAttempts: 0, logins: 0, requests: [], held: undefined, version: 1, rentalReads: 0 };
  await context.addInitScript(({ blocked }) => {
    if (blocked) Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked storage', 'SecurityError'); } });
    else localStorage.setItem('wdp-mobile-auth-token', 'mobile-resilient-session');
  }, { blocked });
  await context.route(/\/api\//, async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace(/^\/api/, ''), method = req.method();
    const send = (json, status = 200) => route.fulfill({ json, status });
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/auth/login' && method === 'POST') { state.logins++; return send({ token: 'mobile-resilient-session', user: state.user }); }
    if (path === '/auth/logout' && method === 'POST') return send({});
    if (path === '/auth/me' && method === 'GET') return state.offline ? send({ message: 'Kết nối bị gián đoạn.' }, 503) : send(state.user);
    if (path === '/auth/me' && method === 'PATCH') {
      state.profileAttempts++; const input = req.postDataJSON(); assert.deepEqual(Object.keys(input).sort(), ['fullName', 'phone']);
      if (state.profileAttempts === 1) return send({ message: 'Chưa cập nhật được, vui lòng thử lại.' }, 503);
      state.user = { ...state.user, ...input }; return send(state.user);
    }
    if (path === '/booking/catalog' && method === 'GET') return send(catalog);
    if (path === '/additional-services' && method === 'GET') return send([]);
    if (path === '/booking/availability' && method === 'POST') {
      const input = req.postDataJSON(); state.requests.push(input);
      if (state.requests.length === 1) { state.held = route; return; }
      return send({ available: true, quote: quote(input) });
    }
    if (path === '/booking/unit-map' && method === 'POST') return send({ productId: product.id, units: [], startDate: '2027-01-31', endDateExclusive: '2027-07-31' });
    if (method !== 'GET') { unexpected.push(method + ':' + path); return route.abort(); }
    if (path === '/reservations' || path === '/customer/stored-items') return send([]);
    if (path === '/customer/rentals') {
      state.rentalReads++;
      return send({ items: [{ ...fixture.rentals[0], rentalState: 'ACTIVE', isOverdue: false, effectiveEndDate: '2027-07-31', storageType: { name: state.version === 1 ? 'Kho trước cập nhật' : 'Kho sau cập nhật' } }], total: 1, page: 1, limit: 100 });
    }
    const support = path === '/customer/support-requests' ? [{ ...fixture['support-requests'][0], status: state.version === 1 ? 'OPEN' : 'RESOLVED', updatedAt: state.version === 1 ? '2026-11-01T01:00:00Z' : '2026-11-05T01:00:00Z' }] : [];
    return send({ items: support, total: support.length, page: 1, limit: 100 });
  });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
  return { context, page, state };
}
try {
  for (const width of [320, 390]) {
    const test = await setup(width), { page, state } = test;
    await page.goto(base + '/customer/booking?product=' + product.id, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.getByLabel('Ngày bắt đầu', { exact: true }).fill('2027-01-31');
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await page.getByRole('button', { name: 'Xem báo giá', exact: true }).click();
    await page.waitForFunction(() => document.body.textContent.includes('Đang kiểm tra…'));
    for (let index = 0; !state.held && index < 100; index++) await page.waitForTimeout(50);
    assert(state.held);
    await page.getByLabel('Số tháng (1, 3, 6 hoặc 12)', { exact: true }).fill('6');
    await state.held.fulfill({ json: { available: true, quote: quote(state.requests[0]) } }).catch(() => {});
    assert.equal(await page.getByText('Kiểm tra & xác nhận', { exact: true }).count(), 0, 'A cancelled stale quote must never advance the edited booking');
    assert.equal(await page.getByLabel('Số tháng (1, 3, 6 hoặc 12)', { exact: true }).inputValue(), '6');
    await page.getByRole('button', { name: 'Xem báo giá', exact: true }).click();
    await page.getByText('Kiểm tra & xác nhận', { exact: true }).waitFor();
    assert.equal(state.requests.at(-1).durationMonths, 6);
    assert(await page.getByRole('button', { name: 'Gửi yêu cầu đặt kho', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Cập nhật thông tin liên hệ', exact: true }).click();
    const phone = page.getByLabel('Số điện thoại liên hệ', { exact: true }); await phone.fill('0901234567');
    await page.getByRole('button', { name: 'Lưu thông tin liên hệ', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Chưa cập nhật được' }).waitFor();
    assert.equal(await phone.inputValue(), '0901234567');
    await page.getByRole('button', { name: 'Lưu thông tin liên hệ', exact: true }).click();
    await page.getByText(/Đã cập nhật thông tin liên hệ/).waitFor();
    await page.getByRole('button', { name: 'Tiếp tục đặt kho', exact: true }).click();
    await page.getByText('Kiểm tra & xác nhận', { exact: true }).waitFor();
    assert.equal(await page.getByText('Cần bổ sung thông tin liên hệ', { exact: true }).count(), 0);
    assert(await page.getByRole('button', { name: 'Gửi yêu cầu đặt kho', exact: true }).isEnabled(), 'Returning from contact correction must preserve the confirmed booking');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + 'px booking overflow');
    // Booking remains in the stack. Its inactive draft must not freeze another screen.
    await page.getByRole('tab', { name: 'Kho thuê', exact: true }).click();
    await page.getByText('Kho trước cập nhật', { exact: true }).waitFor();
    state.version = 2;
    await page.getByRole('button', { name: /^Thông báo,/ }).first().click();
    await page.getByRole('button', { name: 'Kiểm tra mới', exact: true }).click();
    await page.getByRole('button', { name: 'Đóng thông báo', exact: true }).click();
    await page.getByText('Kho sau cập nhật', { exact: true }).waitFor();
    checks.push(width + 'px: stale booking response ignored, profile retry preserves input, booking resumes, inactive stack draft does not block live rental updates');
    await test.context.close();
  }
  const offline = await setup(390, { offline: true });
  await offline.page.goto(base + '/customer', { waitUntil: 'domcontentloaded' });
  await offline.page.getByRole('heading', { name: 'Kết nối lại NestBox', exact: true }).waitFor();
  assert.equal(await offline.page.evaluate(() => localStorage.getItem('wdp-mobile-auth-token')), 'mobile-resilient-session');
  offline.state.offline = false; await offline.page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await offline.page.getByRole('button', { name: 'Tất cả dịch vụ', exact: true }).waitFor();
  assert.equal(offline.state.logins, 0); checks.push('Mobile startup preserves the saved token during an outage and reconnects without another login');
  await offline.context.close();
  const blocked = await setup(320, { blocked: true });
  await blocked.page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await blocked.page.getByLabel('Email', { exact: true }).fill(customer.email);
  await blocked.page.getByLabel('Mật khẩu', { exact: true }).fill('browser-fixture-only');
  await blocked.page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await blocked.page.getByRole('button', { name: 'Tất cả dịch vụ', exact: true }).waitFor();
  assert.equal(blocked.state.logins, 1); checks.push('Expo web can log in when browser storage is blocked, without a red exception overlay');
  await blocked.context.close();
  const tabs = await setup(390);
  await tabs.page.goto(base + '/customer/account', { waitUntil: 'domcontentloaded' });
  await tabs.page.getByRole('heading', { name: tabs.state.user.fullName, exact: true }).waitFor();
  const writer = await tabs.context.newPage();
  await writer.route(base + '/__review/session-control', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>Session test control</title>' }));
  await writer.goto(base + '/__review/session-control');
  await writer.evaluate(() => localStorage.removeItem('wdp-mobile-auth-token'));
  await tabs.page.getByLabel('Email', { exact: true }).waitFor();
  assert.equal(await tabs.page.getByRole('heading', { name: tabs.state.user.fullName, exact: true }).count(), 0, 'Another tab logging out must remove the cached account screen');
  tabs.state.user = { ...tabs.state.user, id: 'another-customer-fixture', fullName: 'Khách hàng vừa đổi tài khoản' };
  await writer.evaluate(() => localStorage.setItem('wdp-mobile-auth-token', 'another-mobile-session'));
  await tabs.page.getByRole('heading', { name: 'Chào ' + tabs.state.user.fullName, exact: true }).waitFor();
  assert.equal(tabs.state.logins, 0);
  checks.push('Expo web clears cached account data on cross-tab logout and validates the new identity on cross-tab account changes');
  await tabs.context.close();
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed: checks, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
