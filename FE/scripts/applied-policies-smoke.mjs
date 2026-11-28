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
  return { key, title, value, ...(unit ? { unit } : {}), effectiveVersion: 0, isDefault: true, effectiveFrom: null };
}

async function workspace(role, mobile = false, theme = 'light') {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
  await context.addInitScript(({ mobile, theme }) => {
    localStorage.setItem(mobile ? 'wdp-mobile-auth-token' : 'wdp-auth-token-v1', 'policy-ui-test');
    localStorage.setItem('nestbox-workspace-theme', theme);
  }, { mobile, theme });
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
    if (path === (mobile ? 'business-policies/applied/customer' : 'business-policies/applied')) {
      policyRequests.push([route.request().method(), url.search]);

      if (responseStatus !== 200) return send({ message: 'Unavailable' }, responseStatus);
      if (role === 'FACILITY_STAFF') return send({
        facilities: [],
        entries: [
          item('handoverLeadDays', 'Nhận chìa khóa trước ngày thuê', 3),
          item('returnNoticeDays', 'Báo trước khi trả kho', 7),
          item('renewal', 'Gia hạn hợp đồng', { opensDaysBefore: 30, closesDaysBefore: 1 }),
          item('renewalReminderDays', 'Nhắc hợp đồng sắp hết hạn', 7),
          item('paymentReminderDays', 'Nhắc trước hạn thanh toán', 3),
          item('returnOverdue', 'Quá hạn trả kho', { graceDays: 0, managerDays: 8 }),
          { ...item('paymentOverdue', 'Quá hạn thanh toán', { graceDays: 5, managerDays: 15 }), effectiveVersion: 1, isDefault: false, effectiveFrom },
        ],
        updates: [{ key: 'returnNoticeDays', title: 'Báo trước khi trả kho', version: 2,
          effectiveFrom, scheduled: true, oldValue: 7, value: 11 }],
      });
      const catalog = {
        depositRefundDays: 7,
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
          { ...item('paymentOverdue', 'Quá hạn thanh toán', { graceDays: changed ? 8 : 5, ...(!mobile ? { managerDays: 15 } : {}), feeMethod: 'FIXED_AMOUNT', feeAmount: 150000 }), effectiveVersion: 1, isDefault: false, effectiveFrom },
          item('returnOverdue', 'Quá hạn trả kho', { graceDays: 0, multiplier: 100, ...(!mobile ? { managerDays: 15 } : {}) }),
        ],
      };
      if (mobile) {
        const customerFields = ({ key, value, unit, isDefault, effectiveFrom }) => ({ key, value, unit, isDefault, effectiveFrom });
        return send({ ...catalog, items: catalog.items.map(customerFields), pricing: catalog.pricing.map(customerFields) });
      }
      return send(catalog);
    }
    if (path.includes('unread')) return send({ count: 0 });
    return send({ items: [], total: 0, page: 1, limit: 100 });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { page, policyRequests, update: () => { changed = true; }, setStatus: status => { responseStatus = status; } };
}

try {
  for (const theme of ['light', 'dark']) {
    const { page: manager, policyRequests } = await workspace('FACILITY_MANAGER', false, theme);
    await manager.goto(base + '/manager/policies');
    const tabs = manager.getByRole('tablist', { name: 'Nhóm chính sách' });
    const table = manager.locator('.internal-applied-policy table');
    await table.waitFor();
    assert.equal(await manager.locator('.applied-policy-milestone').count(), 0);
    for (const [group, count, value] of [
      ['Đặt kho và thanh toán', 4, 'Không cọc'],
      ['Hợp đồng và bàn giao', 5, 'Hạn xử lý hoàn cọc'],
      ['Quá hạn và nhắc nhở', 4, '150.000'],
    ]) {
      await tabs.getByRole('tab', { name: group, exact: true }).click();
      assert.equal(await table.locator('tbody tr').count(), count);
      assert.equal(await table.getByRole('columnheader').count(), 3);
      assert.ok((await table.innerText()).includes(value));
    }
    await table.getByText(/Áp dụng từ.*11:59.*UTC\+7/).waitFor();
    await table.getByText('Phiên bản 1', { exact: true }).waitFor();
    assert.ok(await table.getByText('Mặc định', { exact: true }).count() > 0);
    await tabs.getByRole('tab', { name: 'Quá hạn và nhắc nhở' }).press('Home');
    assert.equal(await tabs.getByRole('tab', { name: 'Đặt kho và thanh toán' }).getAttribute('aria-selected'), 'true');
    await table.getByText('24 giờ', { exact: true }).waitFor();
    assert.match(await table.innerText(), /Giảm giá thanh toán trước/);
    assert.ok(policyRequests.every(([method, query]) => method === 'GET' && !query));
    await manager.setViewportSize({ width: 390, height: 844 });
    assert.ok(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (screenshots) await manager.screenshot({ path: join(screenshots, 'manager-' + theme + '.png'), fullPage: true });
    await manager.close();

    const staff = await workspace('FACILITY_STAFF', false, theme);
    await staff.page.goto(base + '/staff/policies#returnNoticeDays');
    const staffTable = staff.page.locator('.internal-applied-policy table');
    await staffTable.getByText('Báo trước khi trả kho', { exact: false }).first().waitFor();
    await staff.page.getByRole('tab', { name: 'Nhận kho và bàn giao', exact: true }).click();
    await staffTable.getByText(/sử dụng kho từ ngày bắt đầu thuê/).waitFor();
    await staff.page.getByRole('tab', { name: 'Quá hạn và xử lý', exact: true }).click();
    await staffTable.getByText(/Báo Manager khi quá hạn 15 ngày/).waitFor();
    await staffTable.getByText(/Áp dụng từ.*11:59.*UTC\+7/).waitFor();
    assert.equal(await staffTable.getByText(/Phiên bản|Đặt cọc|Chỉnh sửa|150.000/).count(), 0);
    assert.ok(staff.policyRequests.every(([method, query]) => method === 'GET' && !query));
    staff.setStatus(403);
    await staff.page.reload();
    await staff.page.getByRole('alert').getByText(/Tài khoản hiện không có quyền tra cứu chính sách/).waitFor();
    await staff.page.close();
  }

  const customer = await workspace('STORAGE_CUSTOMER');
  customer.setStatus(503);
  await customer.page.goto(base + '/customer/policies');
  await customer.page.getByRole('button', { name: 'Thử lại' }).waitFor();
  customer.setStatus(200);
  await customer.page.getByRole('button', { name: 'Thử lại' }).click();
  await customer.page.locator('.applied-policy-milestone').getByText('24 giờ').waitFor();
  assert.equal(await customer.page.locator('.applied-policy').getByText(/1440 phút/).count(), 0);
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
    for (const label of ['Báo trước khi trả kho', 'Xử lý hoàn tiền hủy đơn sau duyệt']) {
      await milestones.getByText(label, { exact: true }).locator('..').getByText('7 ngày', { exact: true }).waitFor();
    }
    await mobile.page.getByText('Mặc định', { exact: true }).first().waitFor();
    for (const title of ['Hủy đơn và hoàn tiền', 'Nhận kho và sử dụng kho', 'Gia hạn hợp đồng', 'Trả kho và quyết toán', 'Quá hạn và các khoản phí']) {
      await mobile.page.getByRole('button', { name: title, exact: true }).click();
    }
    await mobile.page.getByText(/90% tiền thuê/).waitFor();
    await mobile.page.getByText(/Hạn xử lý hoàn tiền.*ngày từ ngày yêu cầu được duyệt/).waitFor();
    await mobile.page.getByText(/Khi nào tiền cọc được xử lý/).waitFor();
    await mobile.page.getByText(/Áp dụng từ.*11:59.*UTC\+7/).waitFor();
    assert.equal(await mobile.page.getByText(/Phiên bản 1|Chuyển quản lý sau|managerDays/).count(), 0);
    mobile.update();
    await mobile.page.clock.fastForward(61_000);
    for (const value of ['95 phút', '11 ngày']) await milestones.getByText(value, { exact: true }).waitFor();
    await mobile.page.getByText('Cho phép quá hạn 8 ngày', { exact: true }).waitFor();
    for (const width of [320, 390]) {
      await mobile.page.setViewportSize({ width, height: 844 });
      assert.ok(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile layout at ' + width);
    }
    if (screenshots) await mobile.page.screenshot({ path: join(screenshots, 'customer-mobile-web.png'), fullPage: true });
    console.log('PASS: Expo Web policy accordion and timed refresh, role-specific copy and narrow viewport.');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: Manager policy table and responsive layout, global policy scope, Staff scoped read-only flow, and Customer API refresh.');
} finally {
  await browser.close();
}
