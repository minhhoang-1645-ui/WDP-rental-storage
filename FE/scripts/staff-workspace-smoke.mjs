import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff, customer, unit } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const output = process.env.WDP_STAFF_TEST_ARTIFACTS || 'artifacts/staff-workspace';
const browser = await launchTestBrowser();
const errors = [];
const writes = [];
const scopedRequests = [];
const today = '2026-11-18';
const now = Date.parse(today + 'T10:00:00+07:00');
const appointments = [
  { ...fixture.appointments[0], id: 'handover-today', appointmentCode: 'LONG-HANDOVER-TODAY', status: 'CONFIRMED',
    scheduledAt: `${today}T23:59:59+07:00`, assignedStaff: staff },
  { ...fixture.appointments[0], id: 'handover-late', appointmentCode: 'LONG-HANDOVER-LATE', status: 'CONFIRMED',
    scheduledAt: new Date(now - 2 * 86400000).toISOString(), assignedStaff: staff },
  { ...fixture.appointments[0], id: 'handover-other', appointmentCode: 'OTHER-STAFF-HANDOVER', status: 'CONFIRMED',
    scheduledAt: new Date(now - 3 * 86400000).toISOString(), assignedStaff: { id: 'other-staff' } },
  { ...fixture.appointments[0], id: 'handover-completed', appointmentCode: 'LONG-HANDOVER-COMPLETED', status: 'COMPLETED',
    scheduledAt: new Date(now - 4 * 86400000).toISOString(), assignedStaff: staff },
];
const repairs = [{ ...fixture.maintenance[0], status: 'OPEN', priority: 'HIGH', assignedStaff: staff }];
const reservations = fixture.reservations.map((row, index) => ({
  ...row, quantity: 2, createdAt: new Date(now - index * 1000).toISOString(),
}));
const unitAssignment = { id: 'assignment-1', assignedBy: { fullName: 'Quản lý kiểm thử' }, assignedAt: appointments[1].scheduledAt,
  storageUnit: { ...unit, unitNumber: unit.unitCode, status: 'OCCUPIED' } };
const rental = { ...fixture.rentals[0], contracts: [{ ...fixture.contracts[0], unit }] };
const overdueUnit = { id: 'overstay-1', reservationId: rental.reservationId, endDate: '2026-11-09', overdueDays: 10,
  customer, storageUnit: unitAssignment.storageUnit, returnRequest: null };
const datasets = { ...fixture, appointments, maintenance: repairs, reservations, rentals: [rental],
  'support-requests': [], 'stock-movements': [{ ...fixture['stock-movements'][0], status: 'ASSIGNED', assignedStaff: staff }],
  returns: [], transfers: [], 'damage-claims': [], 'stored-items': [] };
let fail = '';
let assignmentEnabled = true;

function pageOf(items, query) {
  const page = Number(query.get('page')) || 1;
  const limit = Number(query.get('limit')) || 20;
  return { page, limit, total: items.length, items: items.slice((page - 1) * limit, page * limit) };
}

try {
  await mkdir(output, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'staff-ui-fixture'));
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\//, '');
    const query = url.searchParams;
    const send = json => route.fulfill({ json });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (request.method() !== 'GET') { writes.push(path); return route.fulfill({ status: 403 }); }
    if (path === 'auth/me') return send(staff);
    if (path === 'staff/assigned-units') {
      return send({ enabled: assignmentEnabled, items: assignmentEnabled ? [unitAssignment] : [] });
    }
    const [, kind, id] = path.replace('/management/', '/').split('/');
    if (kind === fail) return route.fulfill({ status: 500, json: { message: 'Lỗi tải dữ liệu kiểm thử' } });
    if (kind === 'overstays') {
      scopedRequests.push({ role: path.split('/')[0], assigned: query.get('assigned') });
      return send(pageOf([overdueUnit], query));
    }
    let data = datasets[kind] ?? [];
    if (id) {
      const record = data.find(item => item.id === id || item.reservationId === id);
      if (!record || record.assignedStaff && record.assignedStaff.id !== staff.id) return route.fulfill({ status: 404, json: { message: 'Không tìm thấy hồ sơ' } });
      return send(record);
    }
    const status = query.get('status');
    if (status) data = data.filter(row => row.status === status);
    if (query.has('date')) data = data.filter(row => row.scheduledAt === appointments[0].scheduledAt);
    if (kind === 'appointments' && status) data = data.filter(row => row.assignedStaff.id === staff.id);
    return send(pageOf(data, query));
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(now);
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  const open = path => page.goto(base + '/staff' + path);
  const heading = name => page.getByRole('heading', { name, exact: true });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const shot = name => page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' });
  const work = page.getByRole('table', { name: 'Danh sách công việc' });

  await open('');
  const kpis = page.getByLabel('Chỉ số công việc').getByRole('link');
  await kpis.last().waitFor();
  assert.deepEqual(await kpis.locator('strong').allTextContents(), ['110', '1', '1', '1']);
  assert.deepEqual(await kpis.evaluateAll(links => links.map(link => link.getAttribute('href'))), [
    '/staff/tasks', `/staff/appointments?status=CONFIRMED&date=${today}`,
    '/staff/stock-movements?status=ASSIGNED', '/staff/tasks?type=appointments&status=CONFIRMED&timing=overdue',
  ]);
  const priority = page.getByRole('region', { name: 'Công việc ưu tiên' });
  assert.equal(await priority.getByRole('listitem').count(), 5);
  assert.doesNotMatch(await page.locator('main').innerText(), /LONG-HANDOVER|OTHER-STAFF|RT01|SETTLE/);
  assert.equal(await page.getByRole('region', { name: 'Lịch hôm nay' }).getByRole('listitem').count(), 1);
  await page.getByText(/Quá hạn 10 ngày/).waitFor();
  assert(scopedRequests.every(query => query.role === 'staff' && query.assigned === 'true'));
  assert(!await overflow());
  await shot('dashboard-light');
  await kpis.last().click();
  await work.waitFor();
  assert.equal(await work.locator('tbody tr').count(), 1);
  assert.match(await work.innerText(), /LONG-HANDOVER-LATE/);
  await work.getByRole('button', { name: /Thao tác LONG-HANDOVER-LATE/ }).click();
  await page.getByRole('link', { name: 'Bắt đầu xử lý', exact: true }).click();
  await page.locator('#staff-processing').waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'staff-processing');
  const handover = page.getByRole('button', { name: 'Xác nhận đã bàn giao giấy tờ và chìa khóa', exact: true });
  assert.equal(await handover.evaluate(button => button.form.checkValidity()), false);

  await open('/tasks?limit=10');
  await page.getByText('Trang 1 / 11', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await page.getByText('Trang 2 / 11', { exact: true }).waitFor();
  const search = page.getByRole('searchbox', { name: 'Tìm công việc' });
  await search.fill('RES-104');
  await work.getByText('RES-104', { exact: true }).waitFor();
  assert.equal(await work.locator('tbody tr').count(), 1);
  await search.fill('Khach kiem thu');
  await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Danh sách công việc"] tbody tr').length === 10);
  await page.waitForURL(url => url.searchParams.get('search') === 'Khach kiem thu');
  await page.getByText(/109 bản ghi/).waitFor();
  await search.fill('');
  await page.getByText(/110 bản ghi/).waitFor();
  await page.getByRole('combobox', { name: 'Ưu tiên' }).selectOption('HIGH');
  await page.waitForURL(url => url.searchParams.get('priority') === 'HIGH');
  await page.getByText('Trang 1 / 1', { exact: true }).waitFor();
  assert.equal(await work.locator('tbody tr').count(), 1);
  assert.match(await work.innerText(), /MNT-TEST/);
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await page.getByText('Trang 1 / 11', { exact: true }).waitFor();
  await work.getByRole('button', { name: 'Lịch / cập nhật' }).click();
  await page.waitForURL(url => url.searchParams.get('sort') === 'asc');
  await work.locator('th[aria-sort="ascending"]').waitFor();
  await page.getByRole('button', { name: 'Hiển thị cột' }).click();
  await page.getByRole('checkbox', { name: 'Ưu tiên' }).uncheck();
  await work.getByRole('columnheader', { name: 'Ưu tiên' }).waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  assert.equal(await work.getByRole('columnheader', { name: 'Phân công' }).count(), 0);
  await shot('tasks-light');

  await open('/reservations');
  const booking = page.getByRole('table', { name: 'Yêu cầu đặt kho' });
  await booking.getByText(reservations[0].reference, { exact: true }).waitFor();
  assert.match(await booking.locator('tbody tr').first().innerText(), /Khách kiểm thử[\s\S]*Loại kho kiểm thử[\s\S]*2 kho/);
  await booking.locator('tbody tr').first().getByRole('link', { name: 'Xem chi tiết', exact: true }).click();
  await heading(customer.fullName).waitFor();
  await heading('Kho và thời gian thuê').waitFor();
  await heading('Xử lý hồ sơ').waitFor();
  assert.equal(await page.getByRole('link', { name: 'Về danh sách', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Lưu quyết định' }).isEnabled(), false);

  await open('/assigned-units');
  await page.getByRole('button', { name: `Xem chi tiết kho ${unit.unitCode}` }).click();
  const unitDialog = page.getByRole('dialog', { name: unit.unitCode });
  await unitDialog.getByText(customer.fullName, { exact: true }).waitFor();
  await unitDialog.getByRole('heading', { name: 'Xử lý gần đây' }).waitFor();
  assert.match(await unitDialog.innerText(), /Đang sử dụng|Đang dùng|Có khách thuê/);
  assert.match(await unitDialog.innerText(), /Quản lý kiểm thử/);
  assert(!/Chỉnh sửa|Cấu hình|Sửa kho/.test(await unitDialog.innerText()));
  await shot('assigned-unit-light');
  await page.keyboard.press('Escape');
  await unitDialog.waitFor({ state: 'hidden' });
  await open('/assigned-units?unit=other-unit');
  await page.getByRole('table', { name: 'Kho tôi phụ trách' }).waitFor();
  assert.equal(await page.getByRole('dialog', { name: /chi tiết|A101/i }).count(), 0);

  await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
  const sidebar = page.locator('aside.manager-sidebar');
  assert.equal(await sidebar.getByRole('link', { name: 'Kho tôi phụ trách' }).getAttribute('title'), 'Kho tôi phụ trách');
  await page.reload();
  await page.getByRole('button', { name: 'Mở rộng thanh bên' }).click();
  const operations = sidebar.getByRole('button', { name: 'Vận hành kho' });
  await operations.click();
  assert.equal(await operations.getAttribute('aria-expanded'), 'true');
  await sidebar.getByRole('link', { name: 'Kho đang thuê' }).click();
  await page.waitForURL('**/staff/rentals');
  await sidebar.locator('a.active[aria-current="page"][href="/staff/rentals"]').waitFor();
  await page.setViewportSize({ width: 1440, height: 560 });
  const nav = sidebar.locator('nav');
  assert(await nav.evaluate(element => element.scrollHeight > element.clientHeight));
  const footer = sidebar.locator('.manager-account');
  const beforeScroll = await footer.boundingBox();
  await nav.evaluate(element => { element.scrollTop = element.scrollHeight; });
  assert(await nav.evaluate(element => element.scrollTop > 0));
  assert.deepEqual(await footer.boundingBox(), beforeScroll);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  await open('');
  await kpis.last().waitFor();
  assert.equal(await page.locator('.workspace-themed').getAttribute('data-workspace-theme'), 'dark');
  await shot('dashboard-dark');
  await page.setViewportSize({ width: 1024, height: 768 });
  assert.equal(await page.locator('.staff-metrics').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 2);
  assert(!await overflow());
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('.staff-metrics').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
  await page.getByRole('button', { name: 'Mở điều hướng' }).click();
  const drawer = page.getByRole('dialog', { name: 'Điều hướng nội bộ' });
  await drawer.getByRole('link', { name: 'Công việc của tôi' }).click();
  await work.waitFor();
  assert(!await overflow());
  assert(await work.locator('..').evaluate(element => element.scrollWidth > element.clientWidth));
  await shot('tasks-mobile-dark');
  await page.getByRole('button', { name: /^Thông báo,/ }).click();
  await page.getByRole('heading', { name: 'Thông báo', exact: true }).waitFor();
  await page.getByRole('link', { name: /Xem tất cả thông báo/ }).click();
  await heading('Thông báo').waitFor();
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Bảo mật', exact: true }).click();
  await page.waitForURL('**/staff/settings/security');
  await page.getByText('Mật khẩu hiện tại', { exact: true }).waitFor();

  const routes = [
    ['/inquiries', 'Tư vấn khách hàng'], ['/appointments', 'Lịch bàn giao'], ['/stock-movements', 'Phiếu nhập – xuất'],
    ['/stored-items', 'Hàng đang lưu'], ['/rentals', 'Kho đang thuê'], ['/overstays', 'Kho quá hạn chưa trả'],
    ['/transfers', 'Chuyển kho'], ['/returns', 'Trả kho'], ['/support-requests', 'Hỗ trợ khách hàng'],
    ['/maintenance', 'Bảo trì kho'], ['/damage-claims', 'Sự cố hàng hóa'],
  ];
  for (const [path, title] of routes) {
    await open(path);
    await page.locator('main h1').waitFor();
    await page.locator('main').getByRole('heading', { name: title, exact: true }).waitFor();
    assert(!await overflow(), `${path} overflows mobile`);
  }
  await open('/appointments/handover-other');
  await page.getByRole('alert').getByText('Không tìm thấy hồ sơ', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Xác nhận đã bàn giao giấy tờ và chìa khóa' }).count(), 0);
  fail = 'appointments';
  await open('');
  await page.getByText('Chưa tải được lịch bàn giao.', { exact: true }).waitFor();
  assert.deepEqual((await kpis.locator('strong').allTextContents()).slice(0, 2), ['—', '—']);
  fail = '';
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await page.getByRole('region', { name: 'Lịch hôm nay' }).getByRole('listitem').waitFor();

  assignmentEnabled = false;
  await open('/assigned-units');
  await heading('Phân công theo kho chưa được bật').waitFor();
  await page.goto(base + '/manager');
  await page.waitForURL('**/staff');
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  assert(scopedRequests.length > 0 && scopedRequests.every(query => query.role === 'staff' && query.assigned === 'true'));
  console.log('PASS Staff workspace: scoped dashboard, filters and pagination, detail actions, booking, assigned-unit dialog, sidebar, light/dark, mobile routes, errors and role boundary');
} finally {
  await browser.close();
}
