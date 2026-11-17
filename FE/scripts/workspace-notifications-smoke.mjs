import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser();
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const date = minute => new Date(Date.UTC(2026, 10, 12, 3, minute)).toISOString();
const output = 'artifacts/workspace-notifications';
await mkdir(output, { recursive: true });

function support(id, assignee, minute, status = 'ASSIGNED', subject = 'Cần hỗ trợ') {
  return { ...fixture['support-requests'][0], id, supportCode: id.toUpperCase(), assignedStaff: assignee, status, subject, createdAt: date(minute), updatedAt: date(minute) };
}
async function setup(role, data, dark = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const user = { ...staff, id: role === 'STAFF' ? staff.id : `${role.toLowerCase()}-id`, role };
  const writes = [], calls = [], errors = [];
  let failSupport = false;
  await context.addInitScript(({ role, dark }) => {
    localStorage.setItem('wdp-auth-token-v1', `notice-fixture-${role}`);
    localStorage.setItem('nestbox-workspace-theme', dark ? 'dark' : 'light');
  }, { role, dark });
  await context.route('**/*', async route => {
    const request = route.request();
    if (!['fetch', 'xhr', 'eventsource'].includes(request.resourceType())) return route.continue();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/(?:api\/)?/, '');
    calls.push({ path, token: request.headers().authorization });
    if (request.method() !== 'GET') { writes.push(path); return route.fulfill({ status: 403, json: {} }); }
    if (path === 'auth/me') return route.fulfill({ json: user });
    if (path === 'reservations' || path === 'customer/stored-items') return route.fulfill({ json: [] });
    if (path === 'manager/dashboard/analytics') return route.fulfill({ json: { units: { total: 0, occupied: 0, available: 0, reserved: 0, maintenance: 0 }, finance: {}, queue: {} } });
    const [, kind, id] = path.replace('/management/', '/').split('/');
    const category = url.searchParams.get('category');
    const eventId = url.searchParams.get('event');
    const items = path === 'admin/audit-events'
      ? category === 'ACCOUNT_NOTICES' ? data['account-notices'] ?? [] : (data['audit-events'] ?? []).filter(item => item.category === category && (!eventId || item.id === eventId))
      : data[kind] ?? [];
    if (failSupport && !id && kind === 'support-requests') return route.fulfill({ status: 503, json: { message: 'Fixture outage' } });
    if (id) {
      const row = items.find(item => item.id === id);
      return route.fulfill({ status: row ? 200 : 404, json: row ?? { message: 'Fixture not found' } });
    }
    const page = Number(url.searchParams.get('page')) || 1;
    const limit = Number(url.searchParams.get('limit')) || 100;
    return route.fulfill({ json: { page, limit, total: items.length, items: items.slice((page - 1) * limit, page * limit) } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, calls, writes, errors, setSupportFailure: value => { failSupport = value; } };
}

const bell = page => page.locator('.workspace-notification-trigger');
const popup = page => page.getByRole('region', { name: 'Thông báo', exact: true });
const count = (page, value) => page.getByRole('button', { name: `Thông báo, ${value} chưa đọc trên trình duyệt`, exact: true }).waitFor();
const pulse = page => page.evaluate(() => window.dispatchEvent(new CustomEvent('wdp-data-changed')));

try {
  const staffData = { 'support-requests': [
    ...Array.from({ length: 102 }, (_, i) => support(`staff-${i}`, staff, i)),
    support('other-staff', { id: 'other-user', fullName: 'Nhân viên khác' }, 300),
    support('needs-manager', null, 310, 'ESCALATED'),
    support('early-return-review', staff, 311, 'OPEN', 'Đề nghị trả kho trước hạn'),
  ],
    appointments: [{ id: 'unassigned-handover', status: 'CONFIRMED', updatedAt: date(312) }],
    returns: [{ id: 'other-return', status: 'REQUESTED', assignedStaff: { id: 'other-user' }, updatedAt: date(313) }],
    transfers: [{ id: 'pending-transfer', status: 'REQUESTED', assignedStaff: staff, updatedAt: date(314) }],
  };
  const employee = await setup('STAFF', staffData);
  const page = employee.page;
  await page.goto(`${base}/staff`);
  await count(page, 102);
  assert.equal(await bell(page).locator('.workspace-notification-badge').innerText(), '99+');
  await bell(page).focus();
  await bell(page).press('Enter');
  await popup(page).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('.workspace-notification-panel'));
  await page.keyboard.press('Tab');
  const latest = popup(page).locator('li').first().getByRole('link');
  assert(await latest.evaluate(element => element === document.activeElement));
  assert.equal(await popup(page).locator('li').count(), 5);
  assert.deepEqual(await popup(page).locator('li a').evaluateAll(links => links.map(link => link.getAttribute('href'))),
    [101, 100, 99, 98, 97].map(i => `/staff/support-requests/staff-${i}`));
  assert.equal(await popup(page).getByRole('button', { name: /Đánh dấu/ }).count(), 0);
  await page.screenshot({ path: `${output}/staff-light.png` });
  await page.keyboard.press('Escape');
  await popup(page).waitFor({ state: 'hidden' });
  assert(await bell(page).evaluate(element => element === document.activeElement));
  await count(page, 102);
  await bell(page).click();
  await page.getByRole('heading', { name: 'Bàn làm việc' }).click();
  await popup(page).waitFor({ state: 'hidden' });
  await bell(page).click();
  await latest.click();
  await page.waitForURL('**/staff/support-requests/staff-101');
  await page.getByRole('link', { name: 'Về thông báo' }).waitFor();
  await count(page, 101);
  await bell(page).click();
  assert.equal(await latest.getAttribute('data-unread'), 'false');
  await popup(page).getByRole('link', { name: 'Xem tất cả thông báo' }).click();
  await page.waitForURL('**/staff/notifications');
  await page.getByRole('button', { name: 'Chưa đọc (101)' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Đánh dấu đã đọc' }).count(), 0);
  await page.reload();
  await count(page, 101);
  await page.getByRole('button', { name: 'Cần thực hiện (102)' }).waitFor();

  employee.setSupportFailure(true);
  await pulse(page);
  await page.getByText(/Chưa tải được Hỗ trợ/).waitFor();
  await bell(page).click();
  await popup(page).getByText('Chưa tải đủ thông báo.').waitFor();
  await count(page, 101);
  employee.setSupportFailure(false);
  staffData['support-requests'] = [support('staff-101', staff, 101), support('other-staff', { id: 'other-user' }, 305)];
  await popup(page).getByRole('button', { name: 'Thử lại' }).click();
  await count(page, 0);
  assert.equal(await bell(page).locator('.workspace-notification-badge').count(), 0);
  await page.getByRole('button', { name: 'Chưa đọc (0)' }).waitFor();
  await page.keyboard.press('Escape');
  staffData['support-requests'][0] = support('staff-101', staff, 350, 'RESOLVED', 'Hỗ trợ đã có kết quả');
  await pulse(page);
  await count(page, 1);
  staffData['support-requests'].push(support('removed-record', staff, 380));
  await pulse(page);
  await count(page, 2);
  await bell(page).click();
  await popup(page).locator('li a').first().waitFor();
  staffData['support-requests'] = [];
  const missing = page.waitForResponse(response => response.url().endsWith('/support-requests/removed-record'));
  await popup(page).locator('li a').first().click();
  await page.waitForURL('**/staff/support-requests/removed-record');
  assert.equal((await missing).status(), 404);
  await page.getByRole('link', { name: 'Về thông báo' }).click();
  await page.waitForURL('**/staff/notifications');
  assert(employee.calls.every(call => call.token === 'Bearer notice-fixture-STAFF'));
  assert(employee.calls.every(call => !call.path.startsWith('manager/')));
  assert.deepEqual(employee.writes, []);
  assert.deepEqual(employee.errors, []);
  await employee.context.close();

  const bank = { id: 'bank', submissionCode: 'BANK-TEST', status: 'PENDING_VERIFICATION', amount: 600000, customer: fixture.reservations[0].customer,
    submittedAt: date(30), invoice: { invoiceCode: 'INV-TEST', balanceDue: 600000, status: 'OPEN', currency: 'VND' } };
  const manager = await setup('MANAGER', {
    'payment-submissions': [bank],
    'online-payment-reconciliations': [{ id: 'recon', reconciliationCode: 'RECON', status: 'PENDING_REVIEW', createdAt: date(20) }],
    'support-requests': [support('escalated', staff, 10, 'ESCALATED'), support('routine', staff, 500), support('early', null, 5, 'OPEN', 'Đề nghị trả kho trước hạn')],
  }, true);
  const managerPage = manager.page;
  await managerPage.goto(`${base}/manager`);
  await count(managerPage, 2);
  await bell(managerPage).click();
  const managerPopup = popup(managerPage);
  await managerPopup.waitFor();
  assert.equal(await managerPopup.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(30, 39, 51)');
  for (const width of [1440, 768, 390, 320]) {
    await managerPage.setViewportSize({ width, height: 740 });
    await managerPage.waitForFunction(() => {
      const rect = document.querySelector('.workspace-notification-panel').getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth;
    });
  }
  await managerPage.screenshot({ path: `${output}/manager-dark-320.png` });
  assert.deepEqual(await managerPopup.locator('li a').evaluateAll(links => links.map(link => link.getAttribute('href'))),
    ['/manager/operations/support-requests/escalated', '/manager/early-returns?record=early']);
  await managerPopup.locator('li a').first().click();
  await managerPage.waitForURL('**/manager/operations/support-requests/escalated');
  await count(managerPage, 1);
  await managerPage.getByRole('link', { name: 'Về thông báo' }).click();
  await managerPage.getByRole('button', { name: 'Chưa đọc (1)' }).waitFor();
  await managerPage.locator('.activity-item[href*="/manager/early-returns"]').click();
  await managerPage.waitForURL('**/manager/early-returns?record=early');
  await count(managerPage, 0);
  assert(manager.calls.every(call => call.token === 'Bearer notice-fixture-MANAGER'));
  assert(manager.calls.every(call => !call.path.startsWith('staff/')));
  assert(manager.calls.every(call => !/manager\/(payment-submissions|online-payment-reconciliations)/.test(call.path)));
  assert.deepEqual(manager.writes, []);
  assert.deepEqual(manager.errors, []);
  await manager.context.close();
  for (const role of ['ADMIN', 'CUSTOMER']) {
    const users = Array.from({ length: 7 }, (_, index) => ({ id: `own-account-${index}`, fullName: `Tài khoản thử ${index}`,
      email: `hidden-${index}@example.test`, phone: '', role: 'CUSTOMER', accountStatus: index === 6 ? 'DISABLED' : 'ACTIVE', updatedAt: date(index) }));
    const owns = { id: 'customer-id' }, other = { id: 'other-customer' };
    const invoices = Array.from({ length: 7 }, (_, index) => ({ ...fixture.invoices[0], id: `own-invoice-${index}`,
      invoiceCode: `PRIVATE-INVOICE-CODE-${index}`, customer: owns, reservation: { customer: owns }, updatedAt: date(index) }));
    const notices = users.map((user, index) => ({
      id: `account-event-${index}`, category: 'ACTIVITY', resource: 'users', resourceId: user.id, outcome: 'SUCCESS',
      action: index === 6 ? 'DISABLE_ACCOUNT' : index === 5 ? 'REACTIVATE_ACCOUNT' : 'CREATE',
      createdAt: date(index), actorName: 'Fixture Admin', actorRole: 'ADMIN',
      targetAccount: index === 0 ? null : { fullName: user.fullName, role: user.role },
    })).reverse();
    const app = await setup(role, { users, 'account-notices': notices, 'audit-events': notices,
      invoices: [...invoices, { ...invoices[0], id: 'other-invoice', customer: other }] });
    const { page } = app;
    const root = `/${role.toLowerCase()}`;
    await page.goto(`${base}${root}/settings/profile`);
    const profileName = page.getByRole('form', { name: 'Cập nhật hồ sơ' }).getByLabel('Họ và tên');
    await profileName.fill('Nội dung hồ sơ đang nhập');
    const compactCount = number => page.getByRole('button', { name: `Thông báo, ${number} chưa đọc`, exact: true }).waitFor();
    const dialog = page.getByRole('dialog', { name: 'Thông báo', exact: true });
    await compactCount(7);
    await bell(page).click(); await dialog.waitFor();
    assert.equal(await dialog.locator('li').count(), 6);
    assert.equal(await dialog.getByRole('searchbox').count(), 0);
    assert.equal(await dialog.getByRole('button', { name: 'Cần xử lý', exact: true }).count(), 0);
    assert.doesNotMatch(await dialog.innerText(), /PRIVATE-INVOICE-CODE|hidden-\d@example|Tự kiểm tra|được lưu/);
    if (role === 'ADMIN') {
      const contents = await dialog.innerText();
      assert.match(contents, /Đã vô hiệu hóa tài khoản/);
      assert.match(contents, /Đã kích hoạt lại tài khoản/);
      assert.match(contents, /Tài khoản đã được tạo/);
      assert.doesNotMatch(contents, /Tài khoản đang hoạt động/);
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { localStorage.setItem('nestbox-workspace-theme', theme); window.dispatchEvent(new Event('nestbox-workspace-theme-change')); }, theme);
      await page.waitForFunction(theme => {
        const element = document.querySelector('.workspace-notification-panel');
        return getComputedStyle(element).backgroundColor === (theme === 'dark' ? 'rgb(30, 39, 51)' : 'rgb(255, 255, 255)');
      }, theme);
      for (const width of [1920, 1366, 768, 390]) {
        await page.setViewportSize({ width, height: 800 });
        await page.waitForFunction(() => {
          const box = document.querySelector('.workspace-notification-panel').getBoundingClientRect();
          return box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth + 1;
        });
        assert(await dialog.getByRole('button', { name: 'Đóng thông báo' }).isVisible());
      }
    }
    await dialog.getByRole('button', { name: 'Sau', exact: true }).click();
    await dialog.getByText(/Trang 2\/2/).waitFor();
    if (role === 'ADMIN') await dialog.getByText(/7 thông báo/).waitFor();
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await bell(page).click(); await dialog.waitFor();
    await page.mouse.click(4, 200);
    await dialog.waitFor({ state: 'hidden' });
    await bell(page).click();
    await dialog.getByRole('button', { name: 'Đóng thông báo' }).click(); await dialog.waitFor({ state: 'hidden' });
    const refreshed = page.waitForResponse(response => {
      const url = new URL(response.url());
      return role === 'ADMIN'
        ? url.pathname.endsWith('/admin/audit-events') && url.searchParams.get('category') === 'ACCOUNT_NOTICES'
        : url.pathname.endsWith('/customer/invoices');
    });
    await pulse(page); await refreshed; await compactCount(7);
    assert.equal(await profileName.inputValue(), 'Nội dung hồ sơ đang nhập');
    await bell(page).click();
    const link = dialog.locator('li a').first();
    const expectedPath = role === 'ADMIN' ? '/admin/users/own-account-6' : '/customer/payments?invoice=own-invoice-6';
    assert.equal(await link.getAttribute('href'), expectedPath);
    await link.click(); await page.waitForURL(`${base}${expectedPath}`);
    await compactCount(6);
    await bell(page).click();
    await dialog.getByRole('button', { name: 'Tất cả', exact: true }).click();
    assert.equal(await dialog.locator('li a').first().getAttribute('data-unread'), 'false');
    await dialog.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }).click(); await compactCount(0);
    await dialog.getByRole('button', { name: 'Chưa đọc', exact: true }).click();
    await dialog.getByText('Không có thông báo chưa đọc.').waitFor();
    if (role === 'CUSTOMER') {
      await dialog.getByRole('link', { name: 'Xem tất cả thông báo' }).click();
      await page.waitForURL('**/customer/notifications');
      await page.locator('.workspace-notification-inbox').getByRole('heading', { name: 'Thông báo', exact: true }).waitFor();
    } else {
      await dialog.getByRole('link', { name: 'Lịch sử đăng nhập' }).click();
      await page.waitForURL('**/admin/login-history');
      await bell(page).click();
      await dialog.getByRole('link', { name: 'Nhật ký hoạt động' }).click();
      await page.waitForURL('**/admin/activity');
      await bell(page).click();
      await dialog.getByRole('button', { name: 'Tất cả', exact: true }).click();
      await dialog.getByRole('button', { name: 'Sau', exact: true }).click();
      await dialog.getByRole('link', { name: /Xem sự kiện/ }).click();
      await page.waitForURL('**/admin/activity?event=account-event-0');
      await page.getByRole('table').getByText('Tạo tài khoản', { exact: true }).waitFor();
      assert.equal(await page.getByRole('table').getByRole('row').count(), 2);
      notices.unshift({ ...notices[0], id: 'new-account-event', action: 'UPDATE', createdAt: date(12) });
      await pulse(page);
      await compactCount(1);
      const polled = page.waitForResponse(response => new URL(response.url()).searchParams.get('category') === 'ACCOUNT_NOTICES');
      await pulse(page);
      await polled;
      await bell(page).click();
      await dialog.getByRole('button', { name: 'Chưa đọc', exact: true }).click();
      assert.equal(await dialog.locator('li').count(), 1);
      const updatedAccount = dialog.getByRole('link', { name: /Đã cập nhật thông tin tài khoản/ });
      await updatedAccount.waitFor();
      assert.equal(await updatedAccount.getAttribute('href'), '/admin/users/own-account-6');
    }
    assert(app.calls.every(call => call.token === `Bearer notice-fixture-${role}`));
    assert(app.calls.every(call => !/^(staff|manager)\//.test(call.path) && (role === 'ADMIN' || !call.path.startsWith('admin/'))));
    assert.deepEqual(app.errors, []);
    assert.deepEqual(app.writes, []);
    await app.context.close();
  }
  console.log('PASS all four notification roles, account scope, read state, navigation, refresh, and responsive themes. APIs mocked.');
} finally { await browser.close(); }
