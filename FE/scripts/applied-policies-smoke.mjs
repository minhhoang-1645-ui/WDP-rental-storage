import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launchTestBrowser } from './browser-test.mjs';

const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const browser = await launchTestBrowser();
const effectiveFrom = '2026-11-26T04:59:00.000Z';
const errors = [];
const screenshots = process.env.WDP_POLICY_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });

function item(key, title, value, unit) {
  return { key, title, value, ...(unit ? { unit } : {}), effectiveVersion: 0, effectiveFrom: null };
}

async function workspace(role, mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
  await context.addInitScript(isMobile => localStorage.setItem(isMobile ? 'wdp-mobile-auth-token' : 'wdp-auth-token-v1', 'policy-ui-test'), mobile);
  const policyRequests = [];
  let changed = false;
  let responseStatus = 200;
  await context.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const path = url.pathname.split('/api/')[1];
    const send = (json, status = 200) => route.fulfill({ json, status });
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === 'auth/me') return send({ id: role, role, fullName: 'Tài khoản kiểm thử', email: 'policy@example.test', accountStatus: 'ACTIVE' });
    if (['manager/staff/facilities', 'staff/maintenance/facilities'].includes(path)) return send([{ id: 'a', name: 'NestBox Thủ Đức' }]);
    if (path === 'business-policies/applied') {
      policyRequests.push([route.request().method(), url.search]);
      if (role === 'FACILITY_STAFF') return send({ message: 'Forbidden' }, 403);
      if (responseStatus !== 200) return send({ message: 'Unavailable' }, responseStatus);
      return send({
        items: [
          item('reservationHoldMinutes', 'Thời hạn giữ đơn chưa thanh toán', changed ? 95 : 1440, 'phút'),
          item('returnNoticeDays', 'Báo trước khi trả kho', changed ? 11 : 7, 'ngày'),
          item('handoverLeadDays', 'Nhận chìa khóa trước ngày thuê', 3, 'ngày'),
          item('renewalReminderDays', 'Nhắc hợp đồng sắp hết hạn', 7, 'ngày'),
          item('paymentReminderDays', 'Nhắc trước hạn thanh toán', 3, 'ngày'),
        ],
        pricing: [
          item('deposit', 'Đặt cọc khi thuê kho', {
            locker: { method: 'NONE', amount: 0 }, smallDaily: { method: 'RENT_PERCENTAGE', amount: 100 },
            other: { method: 'MONTHLY_RENT', amount: 1 },
          }),
          item('prepaid', 'Giảm giá thanh toán trước', { 3: { enabled: true, percent: 5 }, 6: { enabled: true, percent: 10 }, 12: { enabled: true, percent: 15 } }),
          item('cancellation', 'Hủy đơn đã thanh toán', { farDays: 7, nearDays: 3, farPercent: 100, middlePercent: 90, nearPercent: 70, startedPercent: 50, refundDays: 7 }),
          item('renewal', 'Gia hạn hợp đồng', { opensDaysBefore: 30, closesDaysBefore: 1, priceMode: 'CURRENT_LIST_PRICE' }),
          item('earlyReturn', 'Quyết toán trả kho trước hạn', { feeMethod: 'NONE', feeAmount: 0, refundMode: 'RECALCULATE_DISCOUNT' }),
          { ...item('paymentOverdue', 'Quá hạn thanh toán', { graceDays: changed ? 8 : 5, managerDays: 15, feeMethod: 'FIXED_AMOUNT', feeAmount: 150000 }), effectiveVersion: 1, effectiveFrom },
          item('returnOverdue', 'Quá hạn trả kho', { graceDays: 0, multiplier: 100, managerDays: 15 }),
        ],
      });
    }
    if (path.includes('unread')) return send({ count: 0 });
    return send({ items: [], total: 0, page: 1, limit: 100 });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { page, policyRequests, update: () => { changed = true; }, setStatus: status => { responseStatus = status; } };
}

try {
  const { page: manager, policyRequests } = await workspace('FACILITY_MANAGER');
  await manager.goto(base + '/manager/policies');
  await manager.getByRole('heading', { name: 'Thông tin hiệu lực' }).waitFor();
  assert.equal(await manager.locator('.applied-policy-milestone strong').allTextContents().then(values => values.join('|')), '24 giờ|7 ngày|5 ngày|30 ngày');
  assert.equal(await manager.locator('.applied-policy tbody tr').count(), 12);
  const cards = manager.locator('.applied-policy-groups');
  for (const value of ['1440 phút', 'Không cọc', '100% tiền thuê', '1 tháng tiền thuê/ô', '3 tháng giảm 5%', '6 tháng giảm 10%', '12 tháng giảm 15%', '90%', '70%', '50%', '150.000', 'Phiên bản 1', '11:59', 'UTC+7', 'Giá trị cơ sở']) {
    assert.ok((await cards.innerText()).includes(value), value);
  }
  assert.equal(await manager.getByRole('row', { name: /Hủy đơn đã thanh toán/ }).locator('td').first().locator('div').count(), 5);
  for (const width of [1920, 1440, 1024, 768]) {
    await manager.setViewportSize({ width, height: 1000 });
    if (width === 768) {
      const columns = await manager.locator('.applied-policy-milestones').evaluate(el => getComputedStyle(el).gridTemplateColumns);
      assert.equal(columns.split(' ').length, 2);
    }
    if (screenshots) await manager.screenshot({ path: join(screenshots, 'manager-' + width + '.png'), fullPage: true });
    assert.ok(await manager.locator('.applied-policy').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Layout at ' + width);
  }
  await manager.setViewportSize({ width: 1440, height: 1000 });
  await manager.locator('.applied-policy-aside').getByText('NestBox Thủ Đức').waitFor();
  assert.equal(await manager.getByRole('combobox', { name: 'Cơ sở đang quản lý' }).count(), 0);
  assert.match(manager.url(), /\/manager\/policies$/);
  assert.ok(policyRequests.length >= 1);
  assert.ok(policyRequests.every(([method, query]) => method === 'GET' && !query));

  const staff = await workspace('FACILITY_STAFF');
  await staff.page.goto(base + '/staff');
  await staff.page.getByRole('heading', { name: 'Tổng quan', exact: true }).waitFor();
  await staff.page.getByRole('link', { name: 'Công việc của tôi', exact: true }).click();
  await staff.page.getByRole('link', { name: 'Tra cứu chính sách', exact: true }).click();
  await staff.page.getByRole('alert').getByText(/chưa được cấp quyền đọc chính sách/).waitFor();
  await staff.page.getByRole('link', { name: 'Chính sách áp dụng', exact: true }).waitFor();
  await staff.page.getByText('Chỉ tra cứu – Không có quyền chỉnh sửa', { exact: true }).waitFor();
  await staff.page.goto(base + '/staff/policies?facilityId=outside');
  await staff.page.getByRole('alert').getByText(/chưa được cấp quyền đọc chính sách/).waitFor();
  assert.ok(staff.policyRequests.every(([method, query]) => method === 'GET' && !query));
  if (screenshots) await staff.page.screenshot({ path: join(screenshots, 'staff.png'), fullPage: true });
  assert.equal(await staff.page.locator('.applied-policy table, .applied-policy button, .applied-policy select').count(), 0);

  const customer = await workspace('STORAGE_CUSTOMER');
  customer.setStatus(503);
  await customer.page.goto(base + '/customer/policies');
  await customer.page.getByRole('button', { name: 'Thử lại' }).waitFor();
  customer.setStatus(200);
  await customer.page.getByRole('button', { name: 'Thử lại' }).click();
  await customer.page.locator('.applied-policy-milestone').getByText('24 giờ').waitFor();
  customer.update();
  await customer.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await customer.page.locator('.applied-policy-milestone').getByText('95 phút').waitFor();
  assert.deepEqual(await customer.page.locator('.applied-policy-milestone strong').allTextContents(), ['95 phút', '11 ngày', '8 ngày']);
  assert.equal(await customer.page.getByText(/Chuyển quản lý sau/).count(), 0);
  if (process.env.WDP_MOBILE_URL) {
    const mobile = await workspace('STORAGE_CUSTOMER', true);
    await mobile.page.clock.install();
    await mobile.page.goto(process.env.WDP_MOBILE_URL + '/customer/policies');
    const milestones = mobile.page.getByText('Những mốc quan trọng', { exact: true }).locator('..').locator('..');
    await milestones.getByText('24 giờ', { exact: true }).waitFor();
    await milestones.getByText('7 ngày', { exact: true }).waitFor();
    await milestones.getByText('5 ngày', { exact: true }).waitFor();
    await mobile.page.getByRole('button', { name: 'Hợp đồng và bàn giao', exact: true }).click();
    await mobile.page.getByText('Gia hạn hợp đồng', { exact: true }).waitFor();
    await mobile.page.getByRole('button', { name: 'Quá hạn và nhắc nhở', exact: true }).click();
    await mobile.page.getByText('Quá hạn thanh toán', { exact: true }).waitFor();
    mobile.update();
    await mobile.page.clock.fastForward(61_000);
    for (const value of ['95 phút', '11 ngày', '8 ngày']) await milestones.getByText(value, { exact: true }).waitFor();
    await mobile.page.getByText('Ân hạn 8 ngày', { exact: true }).waitFor();
    if (screenshots) await mobile.page.screenshot({ path: join(screenshots, 'customer-mobile-web.png'), fullPage: true });
    console.log('PASS: Expo Web policy accordion and timed refresh of all three Customer milestones.');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: Manager policy table and responsive layout, single-facility scope, Staff denied read-only flow, and Customer API refresh.');
} finally {
  await browser.close();
}
