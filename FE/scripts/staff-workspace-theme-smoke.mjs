import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff, customer } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser();
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const output = 'artifacts/staff-workspace';
const now = '2026-11-12T03:00:00Z';
const today = '2026-11-12';
const appointment = { ...fixture.appointments[0], status: 'CONFIRMED', scheduledAt: '2026-11-12T05:00:00Z' };
const movement = {
  ...fixture['stock-movements'][0],
  status: 'ASSIGNED',
  currentStorageUnit: { id: 'unit-id', unitNumber: 'A101', floor: 'Tầng trệt', zone: 'A' },
  lines: fixture['stock-movements'][0].lines.map(line => ({ ...line, actualQty: null })),
};
const records = {
  reservations: fixture.reservations.slice(0, 12),
  appointments: [
    appointment,
    { ...appointment, id: 'earlier-appointment', scheduledAt: '2026-11-12T02:00:00Z' },
    { ...appointment, id: 'tomorrow-appointment', scheduledAt: '2026-11-13T03:00:00Z' },
    { ...appointment, id: 'completed-appointment', status: 'COMPLETED' },
  ],
  'stock-movements': [movement, { ...movement, id: 'other-movement', assignedStaff: { id: 'other-staff', fullName: 'Nhân viên khác' } }],
};
const errors = [];
const writes = [];
const completedMovements = [];
const logoutRequests = [];
let showTransferFixture = false;
let showTaskFixtures = false;
const escalations = [];
const supportTask = { ...fixture['support-requests'][0], status: 'IN_PROGRESS', priority: 'HIGH' };

async function setup(role) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addInitScript(role => {
    if (!sessionStorage.getItem('fixture-started')) {
      localStorage.setItem('wdp-auth-token-v1', 'staff-theme-fixture');
      if (role !== 'STAFF') localStorage.setItem('nestbox-workspace-theme', 'dark');
      sessionStorage.setItem('fixture-started', '1');
    }
  }, role);
  await context.route('**/*', async route => {
    const request = route.request();
    if (!['fetch', 'xhr', 'eventsource'].includes(request.resourceType())) return route.continue();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\//, '').split('/');
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (request.method() === 'POST' && path.join('/') === 'auth/logout') {
      logoutRequests.push(role);
      return route.fulfill({ status: 204 });
    }
    if (role === 'STAFF' && request.method() === 'POST' && path.join('/') === 'staff/stock-movements/movement-id/complete') {
      completedMovements.push(request.postDataJSON());
      return route.fulfill({ json: { ...movement, status: 'COMPLETED' } });
    }
    if (role === 'STAFF' && request.method() === 'POST' && path.join('/') === 'staff/support-requests/support-id/escalate') {
      escalations.push(request.postDataJSON());
      return route.fulfill({ json: { ...supportTask, status: 'ESCALATED' } });
    }
    if (request.method() !== 'GET') {
      writes.push(url.pathname);
      return route.fulfill({ status: 403, json: { message: 'Read-only browser fixture' } });
    }
    if (path.join('/') === 'auth/me') return route.fulfill({ json: { ...staff, role } });
    if (path.join('/') === 'manager/dashboard/analytics') return route.fulfill({ json: {
      asOf: now, units: { total: 0, occupied: 0, available: 0, reserved: 0, maintenance: 0 },
      finance: { outstandingAmount: 0, unpaidInvoices: 0 },
      queue: { escalatedSupport: 0, maintenanceReview: 0, depositReview: 0, unassignedStock: 0, unassignedSupport: 0, unassignedMaintenance: 0, paymentVerification: 0 },
    } });
    if (path.at(-1) === 'assigned-units') return route.fulfill({ json: { enabled: true, items: [] } });
    if (path.join('/') === 'reservations') return route.fulfill({ json: [] });
    const segments = path.filter(part => !['staff', 'management', 'manager', 'customer', 'admin'].includes(part));
    const [resource, id] = segments;
    const source = showTransferFixture && resource === 'support-requests'
      ? [{ ...fixture['support-requests'][0], subject: 'Yêu cầu chuyển kho', description: 'Khách cần đổi vị trí kho.' }]
      : showTaskFixtures && resource === 'support-requests' ? [escalations.length ? { ...supportTask, status: 'ESCALATED' } : supportTask]
      : showTaskFixtures && resource === 'maintenance' ? fixture.maintenance
      : records[resource] ?? [];
    if (id && source.length) {
      const row = source.find(item => item.id === id || item.reference === id);
      return route.fulfill({ status: row ? 200 : 404, json: row ?? { message: 'Fixture not found' } });
    }
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search')?.toLowerCase();
    const priority = url.searchParams.get('priority');
    const type = url.searchParams.get('type');
    const scheduledDay = url.searchParams.get('date');
    const mine = url.searchParams.get('assignedToMe') === 'true';
    const items = source.filter(row =>
      (!status || row.status === status) && (!search || JSON.stringify(row).toLowerCase().includes(search)) &&
      (!priority || row.priority === priority) && (!type || row.type === type) &&
      (!mine || row.assignedStaff?.id === staff.id) && (!scheduledDay || row.scheduledAt?.startsWith(scheduledDay)));
    const page = Number(url.searchParams.get('page')) || 1;
    const limit = Number(url.searchParams.get('limit')) || 100;
    return route.fulfill({ json: { page, limit, total: items.length, items: items.slice((page - 1) * limit, page * limit) } });
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(now));
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}

const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

async function checkProfile(page, roleLabel, dark) {
  const trigger = page.getByRole('button', { name: 'Menu tài khoản' });
  const panel = page.locator('.workspace-profile-panel');
  const originalUrl = page.url();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await panel.waitFor();
  await panel.getByText(staff.fullName, { exact: true }).waitFor();
  await panel.getByText(staff.email, { exact: true }).waitFor();
  await panel.getByText(roleLabel, { exact: true }).waitFor();
  assert.equal(await panel.getByText('Đổi mật khẩu', { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Thông tin cá nhân');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Cài đặt giao diện');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true);

  await trigger.click();
  await page.locator('main h1').click();
  await panel.waitFor({ state: 'hidden' });
  await trigger.click();
  await panel.getByRole('button', { name: 'Thông tin cá nhân' }).click();
  await page.getByRole('heading', { name: 'Cài đặt tài khoản' }).waitFor();
  assert.equal(await page.getByLabel('Email đăng nhập').inputValue(), staff.email);
  await page.goto(originalUrl);

  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 740 });
  await trigger.click();
  const bounds = await panel.boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 360);
  await page.screenshot({ path: `${output}/profile-${dark ? 'dark' : 'light'}.png` });
  await page.keyboard.press('Escape');
  await page.setViewportSize(viewport);
}

async function checkLogout(page, home, role) {
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.locator('.workspace-profile-panel').getByRole('button', { name: 'Đăng xuất' }).click();
  await page.waitForURL('**/portal/login');
  assert.equal(await page.evaluate(() => localStorage.getItem('wdp-auth-token-v1')), null);
  await page.locator('.workspace-profile').waitFor({ state: 'detached' });
  await page.goto(base + home);
  await page.waitForURL(url => url.pathname === '/portal/login');
  assert(logoutRequests.includes(role));
}

try {
  await mkdir(output, { recursive: true });
  const { context, page } = await setup('STAFF');
  const shell = page.locator('.workspace-themed');
  const sidebar = page.locator('.manager-sidebar');
  await page.goto(base + '/staff');
  await page.locator('.staff-metric strong').first().getByText('16', { exact: true }).waitFor();
  assert.deepEqual(await page.locator('.staff-metric strong').allTextContents(), ['16', '2', '1', '1']);
  assert.equal(await shell.getAttribute('data-workspace-theme'), 'light');
  assert.equal(await page.getByRole('region', { name: 'Công việc của tôi' }).locator('li').count(), 5);
  await page.screenshot({ path: `${output}/staff-light.png`, fullPage: true });
  await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
  assert.equal(await page.getByRole('button', { name: 'Mở rộng thanh bên' }).getAttribute('aria-expanded'), 'false');
  await sidebar.getByRole('link', { name: 'Kho tôi phụ trách' }).click();
  await page.getByRole('heading', { name: 'Kho tôi phụ trách' }).waitFor();
  await page.getByRole('button', { name: 'Mở rộng thanh bên' }).click();
  await checkProfile(page, 'Nhân viên', false);
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('heading', { name: 'Kho tôi phụ trách' }).waitFor();
  assert.equal(await shell.getAttribute('data-workspace-theme'), 'dark');
  await page.getByRole('button', { name: 'Tài khoản cá nhân' }).click();
  await page.getByRole('heading', { name: 'Cài đặt tài khoản' }).waitFor();
  assert.equal(await page.getByLabel('Email đăng nhập').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(25, 31, 42)');
  await page.goto(base + '/staff');
  await page.locator('.staff-task-list li').first().waitFor();
  await page.getByRole('button', { name: /^Thông báo,/ }).click();
  const notifications = page.getByRole('dialog', { name: 'Trung tâm thông báo' });
  assert.equal(await notifications.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(30, 39, 51)');
  await page.getByRole('button', { name: 'Đóng thông báo' }).click();
  for (const width of [1920, 1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await fits(page), `Dashboard overflows at ${width}px`);
    await page.screenshot({ path: `${output}/staff-dark-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Mở điều hướng' }).click();
  await page.getByRole('dialog', { name: 'Điều hướng nội bộ' }).getByRole('link', { name: 'Lịch bàn giao' }).click();
  await page.getByRole('heading', { name: 'Lịch bàn giao', exact: true }).waitFor();
  assert(await fits(page));

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(base + '/staff');
  const todayLink = page.getByRole('link', { name: /Bàn giao hôm nay/ });
  await page.locator('.staff-metric strong').first().getByText('16', { exact: true }).waitFor();
  await todayLink.click();
  assert.equal(new URL(page.url()).searchParams.get('date'), today);
  assert.equal(new URL(page.url()).searchParams.get('status'), 'CONFIRMED');
  await page.goto(base + '/staff/reservations');
  await page.getByText('1–10 / 12 bản ghi', { exact: true }).waitFor();
  const hoveredReservation = page.locator('.manager-table tbody tr').nth(1);
  await hoveredReservation.hover();
  const hoverColors = await hoveredReservation.evaluate(row => ({
    row: getComputedStyle(row).backgroundColor,
    cells: Array.from(row.cells, cell => getComputedStyle(cell).backgroundColor),
  }));
  assert.equal(hoverColors.row, 'rgb(34, 46, 59)');
  assert(hoverColors.cells.every(color => color === hoverColors.row), 'Hovered cells must use the dark workspace row background');
  await page.getByRole('button', { name: 'Trang sau' }).click();
  await page.getByText('11–12 / 12 bản ghi', { exact: true }).waitFor();
  await page.getByRole('searchbox', { name: 'Tìm kiếm' }).fill('RES-11');
  await page.getByText('1–1 / 1 bản ghi', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 1);

  showTransferFixture = true;
  await page.goto(base + '/staff/transfers');
  const transferRequest = page.locator('.transfer-request-cards article').filter({ hasText: 'Khách cần đổi vị trí kho.' });
  await transferRequest.getByRole('button', { name: 'Tiếp nhận chuyển kho' }).waitFor();
  assert.equal(await transferRequest.evaluate(card => getComputedStyle(card).backgroundColor), 'rgb(33, 43, 55)');
  await transferRequest.getByRole('button', { name: 'Tiếp nhận chuyển kho' }).click();
  const transferSummary = page.locator('.transfer-source-summary');
  await transferSummary.getByText('Khách cần đổi vị trí kho.').waitFor();
  assert.equal(await transferSummary.evaluate(card => getComputedStyle(card).backgroundColor), 'rgb(33, 43, 55)');
  await page.keyboard.press('Escape');
  showTransferFixture = false;

  await page.goto(base + '/staff/stock-movements?status=ASSIGNED');
  await page.getByRole('table', { name: 'Danh sách phiếu nhập – xuất' }).getByText('MOV-TEST', { exact: true }).first().waitFor();
  await page.getByRole('link', { name: 'Xem phiếu' }).first().click();
  const quantity = page.getByRole('spinbutton', { name: /Số lượng thực tế/ });
  await quantity.waitFor();
  assert.equal(await quantity.inputValue(), '');
  assert(await page.getByRole('button', { name: 'Hoàn tất phiếu' }).isDisabled());
  await quantity.fill('3');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('wdp-live-refresh')));
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  assert.equal(await quantity.inputValue(), '3');
  assert(await page.getByRole('button', { name: 'Hoàn tất phiếu' }).isDisabled());
  await page.screenshot({ path: `${output}/stock-detail-dark.png`, fullPage: true });
  await page.getByLabel(/Ghi chú kiểm đếm/).fill('Khách giao thực tế 3 thùng');
  await page.getByRole('checkbox', { name: /Tôi đã kiểm đếm/ }).check();
  await page.getByRole('button', { name: 'Hoàn tất phiếu' }).click();
  await page.getByText('Đã hoàn tất phiếu và cập nhật số lượng hàng.', { exact: true }).waitFor();
  assert.deepEqual(completedMovements[0].lines, [{ lineId: 'line-id', actualQty: 3 }]);
  await page.getByRole('link', { name: 'Về danh sách' }).click();
  assert.equal(new URL(page.url()).searchParams.get('status'), 'ASSIGNED');

  await page.goto(base + '/staff/appointments/appointment-id');
  const recipient = page.getByLabel('Người nhận kho', { exact: true });
  await recipient.waitFor();
  assert.equal(await recipient.inputValue(), customer.fullName);
  await page.getByRole('combobox', { name: /Người nhận bàn giao/ }).selectOption('AUTHORIZED');
  const representative = page.getByLabel('Tên người được ủy quyền', { exact: true });
  await representative.fill('Người nhận được ủy quyền');
  assert.equal(await representative.inputValue(), 'Người nhận được ủy quyền');
  assert.equal(await page.getByLabel('Đã đối chiếu người nhận kho', { exact: true }).isChecked(), false);
  const handoverSubmit = page.getByRole('button', { name: 'Xác nhận đã bàn giao giấy tờ và chìa khóa' });
  assert.equal(await handoverSubmit.evaluate(button => button.form.checkValidity()), false);

  showTaskFixtures = true;
  await page.goto(base + '/staff/tasks');
  const tasks = page.getByRole('table', { name: 'Danh sách công việc' });
  await tasks.getByText('SUP-TEST', { exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Số dòng mỗi trang' }).inputValue(), '20');
  await page.getByRole('combobox', { name: 'Số dòng mỗi trang' }).selectOption('10');
  await page.getByRole('button', { name: 'Trang sau' }).click();
  await page.getByText('Trang 2 / 2', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Loại công việc' }).selectOption('appointments');
  await page.waitForURL(url => url.searchParams.get('type') === 'appointments');
  await page.getByRole('combobox', { name: 'Trạng thái' }).selectOption('CONFIRMED');
  await page.waitForURL(url => url.searchParams.get('status') === 'CONFIRMED');
  await page.getByRole('button', { name: 'Lịch / cập nhật' }).click();
  await tasks.locator('th[aria-sort="ascending"]').waitFor();
  assert.match(await tasks.locator('tbody tr').first().innerText(), /Đã qua giờ/);
  await page.getByRole('searchbox', { name: 'Tìm công việc' }).fill('không khớp');
  await page.getByText('Không có công việc phù hợp', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await page.getByRole('button', { name: 'Hiển thị cột' }).click();
  await page.locator('.staff-table-popover:popover-open').getByRole('checkbox', { name: 'Ưu tiên' }).uncheck();
  assert.equal(await tasks.getByRole('columnheader', { name: 'Ưu tiên' }).count(), 0);
  await page.keyboard.press('Escape');
  const taskActions = page.getByRole('button', { name: 'Thao tác SUP-TEST' });
  await taskActions.focus();
  await page.keyboard.press('Enter');
  await page.locator('.staff-table-popover:popover-open').getByRole('link', { name: 'Xem chi tiết' }).waitFor();
  await page.screenshot({ path: `${output}/tasks-dark.png` });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.staff-table-popover:popover-open').count(), 0);
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).click();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${output}/tasks-light.png` });

  await page.goto(base + '/staff/support-requests');
  await page.getByRole('combobox', { name: 'Ưu tiên' }).selectOption('HIGH');
  await page.waitForURL(url => url.searchParams.get('priority') === 'HIGH');
  await page.getByRole('checkbox', { name: 'Việc được giao cho tôi' }).click();
  await page.waitForURL(url => url.searchParams.get('mine') === 'true');
  await page.getByRole('link', { name: 'Mở xử lý' }).click();
  await page.waitForURL('**/staff/support-requests/support-id');
  await page.getByLabel('Lý do chuyển bộ phận phụ trách').fill('Kiểm tra tình trạng khóa tại cơ sở.');
  await page.getByRole('button', { name: 'Chuyển bộ phận phụ trách xem xét' }).click();
  await page.getByText('Đã chuyển đến bộ phận phụ trách xem xét.').waitFor();
  assert.equal(escalations[0]?.reason, 'Kiểm tra tình trạng khóa tại cơ sở.');

  await page.goto(base + '/staff/maintenance');
  await page.getByRole('combobox', { name: 'Trạng thái' }).selectOption('AWAITING_VERIFICATION');
  await page.getByRole('button', { name: 'Thao tác MNT-TEST' }).click();
  await page.locator('.staff-table-popover:popover-open').getByRole('link', { name: 'Xem chi tiết' }).click();
  await page.getByText('Đang chờ quản lý nghiệm thu. Kho vẫn ở trạng thái bảo trì.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Nghiệm thu hoàn tất' }).count(), 0);
  await page.goto(base + '/staff/appointments');
  await page.getByRole('button', { name: 'Hôm nay', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('date') === today);
  await page.getByRole('table', { name: 'Lịch bàn giao' }).waitFor();
  await page.goto(base + '/staff/stock-movements');
  await page.getByRole('combobox', { name: 'Loại phiếu' }).selectOption('OUT');
  await page.getByText('Chưa có phiếu phù hợp').waitFor();
  await page.getByRole('combobox', { name: 'Loại phiếu' }).selectOption('IN');
  await page.getByRole('table', { name: 'Danh sách phiếu nhập – xuất' }).getByText('Thùng hồ sơ', { exact: true }).first().waitFor();
  assert(await fits(page));
  await page.goto(base + '/staff/stock-movements/other-movement');
  await page.getByText('Nhân viên khác', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Hoàn tất phiếu' }).count(), 0);
  showTaskFixtures = false;
  for (const resource of ['inquiries', 'appointments', 'stored-items', 'assigned-units', 'renewals', 'transfers', 'returns', 'support-requests', 'maintenance', 'rentals', 'damage-claims', 'notifications']) {
    await page.goto(`${base}/staff/${resource}`);
    await page.locator('main h1').waitFor();
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await fits(page), `${resource} overflows at ${width}px`);
    }
  }
  for (const path of ['/manager/assignments', '/admin/users']) {
    await page.goto(base + path);
    await page.waitForURL(url => url.pathname === '/staff');
  }
  await checkLogout(page, '/staff', 'STAFF');
  await context.close();

  for (const role of ['CUSTOMER', 'MANAGER', 'ADMIN']) {
    const app = await setup(role);
    await app.page.goto(`${base}/${role.toLowerCase()}`);
    await app.page.locator('main h1').waitFor();
    assert.equal(await app.page.locator('[data-workspace-theme]').count(), 1);
    assert.equal(await app.page.locator('.workspace-profile').count(), 1);
    if (role === 'MANAGER') {
      assert.equal(await app.page.locator('[data-workspace-role="manager"]').getAttribute('data-workspace-theme'), 'dark');
      await checkProfile(app.page, 'Quản lý', true);
      await checkLogout(app.page, '/manager', 'MANAGER');
    }
    assert(await fits(app.page));
    await app.context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log('PASS Staff theme persistence, sidebar and mobile navigation, KPI data, inner routes, pagination, draft safety and role boundaries. All APIs mocked.');
} finally {
  await browser.close();
}
