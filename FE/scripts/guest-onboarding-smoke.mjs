import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
const browser = await launchTestBrowser(), base = process.env.WDP_FE_URL || 'http://127.0.0.1:5187';
try {
  for (const existingAccount of [false, true]) {
    const context = await browser.newContext(); const writes = [], errors = [];
    const user = { id: 'customer', role: 'CUSTOMER', fullName: 'Guest', email: 'guest@example.test', phone: '0900000000' };
    await context.route('**/*', async route => {
      const req = route.request(); if (!['fetch', 'xhr', 'eventsource'].includes(req.resourceType())) return route.continue();
      const path = new URL(req.url()).pathname.replace(/^\/(?:api\/)?/, '');
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      if (req.method() === 'POST') writes.push({ path, body: req.postDataJSON() });
      let json = { items: [], total: 0, page: 1, limit: 20 };
      if (path === 'guest/booking-requests/verify') json = { continuationToken: 'p'.repeat(40), bookingCode: 'WDPG-fixture' };
      if (path === 'guest/account/context') json = { email: user.email, existingAccount, bookingCode: 'WDPG-fixture', storage: 'Kho nhỏ', startDate: '2026-12-01', endDate: '2027-01-01', quantity: 2, quote: { quotedTotalAmount: 3000000 } };
      if (path === 'guest/account/setup' || path === 'auth/login') json = { token: 'fixture-session', user };
      if (path === 'auth/me') json = user;
      if (path === 'customer/booking-requests/WDPG-fixture/claim') json = { reservationCode: 'WDP-fixture' };
      if (path === 'guest/account/forgot-password') json = { message: 'Nếu email phù hợp, hướng dẫn đã được gửi.' };
      return route.fulfill({ json });
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/claim-booking?token=' + 'v'.repeat(40));
    await page.getByRole('heading', { name: 'Email đã xác minh thành công', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Email đã xác minh').inputValue(), user.email);
    assert.equal(await page.getByLabel('Email đã xác minh').getAttribute('readonly'), '');
    await page.reload();
    await page.getByRole('heading', { name: existingAccount ? 'Đăng nhập để tiếp tục' : 'Tạo mật khẩu để tiếp tục', exact: true }).waitFor();
    await page.getByLabel(existingAccount ? 'Mật khẩu' : 'Mật khẩu mới', { exact: true }).fill('fixture-password');
    if (!existingAccount) await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: 'Tiếp tục đặt kho', exact: true }).click();
    await page.waitForURL('**/customer/reservations/WDP-fixture');
    assert.equal(writes.filter(item => item.path.endsWith('/claim')).length, 1);
    if (!existingAccount) assert(!Object.hasOwn(writes.find(item => item.path === 'guest/account/setup').body, 'email'));
    else assert(!writes.some(item => item.path === 'guest/account/setup'));
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: new/existing customer, verified readonly email, refresh persistence, automatic claim and reservation redirect; APIs mocked.');
} finally { await browser.close(); }
