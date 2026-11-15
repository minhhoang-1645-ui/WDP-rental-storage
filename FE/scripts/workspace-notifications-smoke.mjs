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
    if (path === 'manager/dashboard/analytics') return route.fulfill({ json: { units: { total: 0, occupied: 0, available: 0, reserved: 0, maintenance: 0 }, finance: {}, queue: {} } });
    const [, kind, id] = path.replace('/management/', '/').split('/');
    const items = data[kind] ?? [];
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
  ] };
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
  await page.getByText(/Chưa tải được: Hỗ trợ/).waitFor();
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
  console.log('PASS Staff and Manager notification preview, role/account scope, read state, navigation, refresh and responsive themes. APIs mocked.');
} finally { await browser.close(); }
