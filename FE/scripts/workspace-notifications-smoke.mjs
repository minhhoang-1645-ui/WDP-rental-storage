// Browser-only notification fixtures. The Backend suite separately verifies ownership and persistence.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff, customer } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL ?? 'http://localhost:5173';
const output = process.env.WDP_NOTIFICATION_ARTIFACTS ?? 'artifacts/workspace-notifications';
const browser = await launchTestBrowser();
const errors = [];
const otherWrites = [];
const receipts = new Map();
const datasets = new Map();
const flags = new Map();
const reads = new Map();

const normalize = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
function notice(id, kind, title, target, index = 0, actionLabel = '', summary = 'Kho B12') {
  return { token: createHash('sha256').update(id).digest('hex'), kind, title, summary, target, actionLabel,
    at: new Date(Date.UTC(2026, 10, 18, 10, -index)).toISOString(), canOpen: Boolean(target), important: false };
}

async function setup(role, id, { width = 1440, theme = 'light' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const user = { ...staff, id, role, fullName: 'Tài khoản kiểm thử ' + role };
  const root = '/' + role.toLowerCase();
  const immutable = { ...fixture };
  const appointment = { ...fixture.appointments[0], id: 'own-appointment', status: 'COMPLETED', assignedStaff: staff };
  const data = { ...immutable, appointments: [appointment], rentals: [], 'transfer-orders': [], 'damage-claims': [], 'account-notices': [] };
  const record = datasets.get(id) ?? [];
  const flag = flags.get(id) ?? {};
  if (!flags.has(id)) flags.set(id, flag);
  await context.addInitScript(({ id, theme }) => {
    localStorage.setItem('wdp-auth-token-v1', 'test-' + id);
    localStorage.setItem('nestbox-workspace-theme', theme);
  }, { id, theme });

  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\//, '');
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    const send = (json, status = 200) => route.fulfill({ status, json });
    const query = url.searchParams;
    if (path === 'auth/me') return send(user);
    if (path === 'notifications' || path.startsWith('notifications/')) {
      const state = flags.get(id);
      const log = reads.get(id) ?? [];
      reads.set(id, log);
      log.push(method + ' ' + path + url.search);
      const read = receipts.get(id) ?? new Set();
      receipts.set(id, read);
      const active = (datasets.get(id) ?? record).filter(item => item !== state.removed);
      if (method === 'GET') {
        if (state.delay) await state.delay;
        if (state.error) return send({ message: 'Fixture unavailable' }, 503);
        const kind = query.get('kind');
        const search = normalize(query.get('search') ?? '');
        const view = query.get('view');
        const toPublic = ({ target: _target, ...item }) => ({ ...item, unread: !read.has(item.token) });
        const filtered = active.filter(item => (view !== 'unread' || !read.has(item.token))
          && (view !== 'action' || item.actionLabel) && (!kind || item.kind === kind)
          && normalize(item.title + ' ' + item.summary).includes(search));
        const limit = Number(query.get('limit')) || 10;
        const page = Math.min(Number(query.get('page')) || 1, Math.max(1, Math.ceil(filtered.length / limit)));
        return send({ page, limit, total: filtered.length, unreadTotal: active.filter(item => !read.has(item.token)).length,
          kinds: [...new Set(active.map(item => item.kind))].map(value => ({ value, label: value === 'invoices' ? 'Hóa đơn' : value === 'appointments' ? 'Bàn giao' : 'Hỗ trợ' })),
          recent: active.slice(0, 5).map(toPublic), items: filtered.slice((page - 1) * limit, page * limit).map(toPublic) });
      }
      if (state.writeError) return send({ message: 'Cannot write' }, 503);
      if (path === 'notifications/read-all') { active.forEach(item => read.add(item.token)); return send({ updated: active.length }); }
      const [, token, operation] = path.split('/');
      const current = active.find(item => item.token === token);
      if (current && operation === 'open' && state.denyOpen === current.token) {
        state.removed = current;
        return send({ message: 'Hồ sơ không còn khả dụng.' }, 404);
      }
      if (!current || operation === 'open' && !current.target) return send({ message: 'Hồ sơ không còn khả dụng.' }, 404);
      read.add(token);
      return send(operation === 'open' ? { target: current.target } : { read: true });
    }
    if (method !== 'GET') { otherWrites.push(path); return send({}, 403); }
    if (path === 'reservations') return send(data.reservations);
    if (path === 'manager/dashboard/summary') return send({});
    if (path === 'customer/payment-config') return send({ vnpayConfigured: false });
    if (path === 'staff/assigned-units' || path === 'manager/unit-staff-assignments') return send({ enabled: false, items: [] });
    if (path === 'customer/stored-items') return send([]);
    const [, kind, recordId] = path.replace('/management/', '/').split('/');
    if (kind === 'users' && recordId) return send({ ...customer, accountStatus: 'ACTIVE', role: 'CUSTOMER' });
    const items = data[kind] ?? [];
    if (recordId) return send(items.find(item => item.id === recordId) ?? {});
    const limit = Number(query.get('limit')) || 20;
    const page = Number(query.get('page')) || 1;
    return send({ items: items.slice((page - 1) * limit, page * limit), total: items.length, page, limit });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  const open = path => page.goto(base + root + path);
  const inbox = page.locator('.workspace-notification-inbox');
  const rows = inbox.locator('.workspace-notification-row');
  const bell = page.getByRole('button', { name: /^Thông báo,/ });
  const showInbox = () => open('/notifications');
  const tab = name => inbox.getByRole('button', { name, exact: true }).click();
  const current = number => inbox.getByText(new RegExp(`^Trang ${number} / `)).waitFor();
  return { context, page, open, showInbox, rows, bell, tab, current, inbox, flag };
}

async function bounded(page, selector) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (selector) assert(await page.locator(selector).evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
  }));
}

try {
  await mkdir(output, { recursive: true });
  const customerNotices = [
    notice('own-appointment', 'appointments', 'Bàn giao đã hoàn tất', '/customer/appointments?appointment=own-appointment'),
    ...Array.from({ length: 130 }, (_, index) => notice('support-' + index, 'support-requests', 'Yêu cầu hỗ trợ ' + index,
      '/customer/support?request=support-' + index, index + 1, index === 0 ? 'Xem yêu cầu' : '',
      index === 129 ? 'Kho đặc biệt tại Bình Dương' : 'Kho nhỏ ' + index)),
  ];
  datasets.set('customer-owned', customerNotices);
  const app = await setup('CUSTOMER', 'customer-owned');
  await app.showInbox();
  await app.current(1);
  assert.equal(await app.rows.count(), 10);
  await app.page.getByText('1–10 / 131 thông báo', { exact: true }).waitFor();
  assert.equal(await app.inbox.getByRole('button', { name: 'Trang đầu' }).isEnabled(), false);
  assert.equal(await app.inbox.getByRole('button', { name: 'Trang trước' }).isEnabled(), false);
  await app.inbox.getByRole('button', { name: 'Trang cuối' }).click();
  await app.current(14);
  assert.equal(await app.rows.count(), 1);
  assert.equal(await app.inbox.getByRole('button', { name: 'Trang sau' }).isEnabled(), false);
  const limits = app.inbox.getByRole('combobox', { name: 'Số dòng mỗi trang' });
  assert.deepEqual(await limits.locator('option').allTextContents(), ['5', '10']);
  await limits.selectOption('5');
  await app.page.getByText('1–5 / 131 thông báo', { exact: true }).waitFor();
  assert.equal(await app.rows.count(), 5);
  await app.inbox.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await app.current(2);
  const secondPage = await app.rows.locator('strong').allTextContents();
  assert.equal(secondPage.length, 5);
  assert.equal(new Set(secondPage).size, 5);
  await app.inbox.getByRole('combobox', { name: 'Số dòng mỗi trang' }).selectOption('10');
  await app.page.getByText('1–10 / 131 thông báo', { exact: true }).waitFor();
  await app.inbox.getByRole('combobox', { name: 'Loại thông báo' }).selectOption('support-requests');
  await app.page.getByText('1–10 / 130 thông báo', { exact: true }).waitFor();
  const search = app.inbox.getByRole('searchbox', { name: 'Tìm thông báo' });
  await search.fill('dac biet');
  await app.rows.getByText('Yêu cầu hỗ trợ 129', { exact: true }).waitFor();
  assert.equal(await app.rows.count(), 1);
  await search.fill('không có kết quả');
  await app.inbox.getByText('Không tìm thấy thông báo phù hợp.', { exact: true }).waitFor();
  await app.showInbox();
  await app.rows.first().waitFor();

  await app.bell.focus();
  await app.page.keyboard.press('Enter');
  const popover = app.page.getByRole('dialog', { name: 'Thông báo', exact: true });
  await popover.waitFor();
  assert.equal(await popover.locator('.workspace-notification-row').count(), 10);
  assert.equal(await app.bell.locator('.workspace-notification-badge').innerText(), '99+');
  await app.page.waitForFunction(() => document.activeElement?.matches('.workspace-notification-panel'));
  await app.page.keyboard.press('Escape');
  await popover.waitFor({ state: 'hidden' });
  assert(await app.bell.evaluate(el => document.activeElement === el));
  await app.page.screenshot({ path: output + '/customer-desktop.png', fullPage: true });

  await app.tab('Cần xử lý');
  await app.inbox.getByText('1–1 / 1 thông báo', { exact: true }).waitFor();
  await app.rows.getByText('Yêu cầu hỗ trợ 0', { exact: true }).waitFor();
  assert.equal(await app.rows.count(), 1);
  app.flag.writeError = true;
  await app.rows.getByRole('button', { name: /Đánh dấu đã đọc/ }).click();
  await app.inbox.getByRole('alert').getByText('Chưa thể đánh dấu đã đọc. Hãy thử lại.').waitFor();
  assert.equal(await app.rows.locator('[aria-label^="Đánh dấu đã đọc"]').count(), 1);
  app.flag.writeError = false;
  await app.rows.getByRole('button', { name: /Đánh dấu đã đọc/ }).click();
  await app.rows.getByText('Đã đọc', { exact: true }).waitFor();
  await app.bell.getAttribute('aria-label').then(value => assert.match(value, /130 chưa đọc/));
  assert.equal(await app.rows.count(), 1, 'Reading does not finish the task');
  await app.tab('Tất cả');
  await limits.selectOption('5');
  await search.fill('Bàn giao');
  await app.page.waitForURL(url => url.searchParams.get('limit') === '5' && url.searchParams.get('search') === 'Bàn giao');
  await app.rows.getByText('Bàn giao đã hoàn tất', { exact: true }).waitFor();
  await app.rows.first().getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
  await app.page.waitForURL('**/customer/appointments?appointment=own-appointment');
  await app.page.getByText('Xem tất cả lịch').waitFor();
  await app.page.locator('.appointment-request-card').first().waitFor();
  assert.equal(await app.page.locator('.appointment-request-card').count(), 1);
  await app.page.getByRole('link', { name: 'Về thông báo' }).click();
  await app.page.waitForURL(url => url.searchParams.get('limit') === '5' && url.searchParams.get('search') === 'Bàn giao');
  await app.showInbox();
  await app.rows.first().waitFor();
  await app.inbox.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }).click();
  await app.page.getByRole('button', { name: 'Thông báo, 0 chưa đọc', exact: true }).waitFor();
  await app.tab('Chưa đọc');
  await app.inbox.getByText('Bạn đã xem hết thông báo.', { exact: true }).waitFor();
  await app.page.reload();
  await app.inbox.getByText('Bạn đã xem hết thông báo.', { exact: true }).waitFor();
  const customerElse = await setup('CUSTOMER', 'customer-other');
  await customerElse.showInbox();
  await customerElse.inbox.getByText('Bạn chưa có thông báo.', { exact: true }).waitFor();
  await customerElse.context.close();
  await app.context.close();

  const staffNotice = notice('staff-work', 'appointments', 'Bàn giao đã phân công', '/staff/appointments/own-appointment', 0, 'Bàn giao kho');
  const completed = notice('staff-completed', 'appointments', 'Bàn giao đã hoàn tất', '/staff/appointments/own-appointment', 1);
  datasets.set('staff-owned', [staffNotice, completed]);
  const employee = await setup('STAFF', 'staff-owned', { width: 390, theme: 'dark' });
  await employee.showInbox();
  await employee.rows.first().waitFor();
  await bounded(employee.page);
  await employee.page.locator('[data-workspace-role="staff"][data-workspace-theme="dark"]').waitFor();
  await employee.tab('Cần xử lý');
  await employee.inbox.getByText('1–1 / 1 thông báo', { exact: true }).waitFor();
  await employee.rows.getByText('Bàn giao đã phân công', { exact: true }).waitFor();
  assert.equal(await employee.rows.count(), 1);
  await employee.page.screenshot({ path: output + '/staff-mobile-dark.png', fullPage: true });
  await employee.bell.click();
  await employee.page.getByRole('dialog', { name: 'Thông báo', exact: true }).waitFor();
  assert.equal(await employee.page.getByRole('dialog').locator('.workspace-notification-row').count(), 2);
  await bounded(employee.page, '.workspace-notification-panel');
  await employee.page.screenshot({ path: output + '/staff-mobile-bell-dark.png', fullPage: true });
  await employee.page.getByRole('dialog').getByRole('link', { name: 'Xem tất cả thông báo' }).click();
  await employee.page.waitForURL('**/staff/notifications');
  await employee.rows.getByText('Bàn giao đã phân công', { exact: true }).waitFor();
  await employee.rows.getByText('Bàn giao đã hoàn tất', { exact: true }).waitFor();
  employee.flag.denyOpen = staffNotice.token;
  await employee.rows.filter({ hasText: 'Bàn giao đã phân công' }).getByRole('button', { name: 'Bàn giao kho', exact: true }).click();
  await employee.inbox.getByRole('alert').getByText('Hồ sơ không còn khả dụng hoặc bạn không có quyền xem.').waitFor();
  assert.equal(new URL(employee.page.url()).pathname, '/staff/notifications');
  await employee.context.close();

  datasets.set('manager-notices', [notice('decision', 'support-requests', 'Hỗ trợ chờ xem xét', '/manager/operations/support-requests/support-1', 0, 'Xem xét hỗ trợ', 'Tên khách hàng dài '.repeat(35))]);
  const supervisor = await setup('MANAGER', 'manager-notices', { width: 900 });
  let release;
  supervisor.flag.delay = new Promise(resolve => { release = resolve; });
  await supervisor.showInbox();
  await supervisor.inbox.getByText('Đang tải thông báo…', { exact: true }).waitFor();
  release();
  await supervisor.rows.getByText('Hỗ trợ chờ xem xét', { exact: true }).waitFor();
  await bounded(supervisor.page);
  supervisor.flag.error = true;
  await supervisor.inbox.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await supervisor.inbox.getByRole('alert').getByText('Không thể tải thông báo.', { exact: true }).waitFor();
  assert.equal(await supervisor.rows.count(), 0);
  supervisor.flag.error = false;
  await supervisor.inbox.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await supervisor.rows.getByText('Hỗ trợ chờ xem xét', { exact: true }).waitFor();
  await supervisor.context.close();

  datasets.set('admin-notices', [notice('admin-user', 'users', 'Đã vô hiệu hóa tài khoản', '/admin/users/account-id', 0, '', 'Tên tài khoản · Khách hàng')]);
  const admin = await setup('ADMIN', 'admin-notices');
  await admin.showInbox();
  await admin.rows.getByText('Đã vô hiệu hóa tài khoản', { exact: true }).waitFor();
  await admin.tab('Cần xử lý');
  await admin.inbox.getByText('Hiện không có việc cần xử lý.', { exact: true }).waitFor();
  await admin.bell.click();
  const adminBell = admin.page.getByRole('dialog', { name: 'Thông báo', exact: true });
  await adminBell.getByRole('link', { name: 'Xem tất cả thông báo' }).waitFor();
  await adminBell.getByRole('button', { name: 'Đã vô hiệu hóa tài khoản', exact: true }).click();
  await admin.page.waitForURL('**/admin/users/account-id');
  await admin.page.getByRole('link', { name: 'Về thông báo' }).waitFor();
  await admin.context.close();

  assert.deepEqual(errors, []);
  assert.deepEqual(otherWrites, []);
  assert(reads.get('customer-owned').some(path => path.includes('view=action')));
  const requests = reads.get('customer-owned').filter(path => path.startsWith('GET notifications?'));
  assert(requests.some(path => path.includes('limit=5')));
  assert(requests.some(path => path.includes('limit=10')));
  assert(requests.every(path => /limit=(5|10)(?:&|$)/.test(path)));
  console.log('PASS all four Web notification roles, 131 items, 5/10 pagination, search, filters, read and action states, ten-item bell, navigation, reload, stale links, errors, keyboard focus and responsive themes');
} finally {
  await browser.close();
}
