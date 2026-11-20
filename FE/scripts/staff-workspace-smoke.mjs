import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff, customer, unit } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const output = process.env.WDP_STAFF_TEST_ARTIFACTS || 'artifacts/staff-workspace';
const browser = await launchTestBrowser();
const errors = [];
const writes = [];
const serviceWrites = [];
const handoverWrites = [];
const unitHandoverWrites = [];
const stockWrites = [];
const transferProposalWrites = [];
const stockItemHistory = new Map();
let stockHistoryReads = 0;
let rejectEscalation = true;
const scopedRequests = [];
const unitCheckRequests = [];
const today = '2026-11-18';
const now = Date.parse(today + 'T10:00:00+07:00');
const localDay = day => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(day));
const appointments = [
  { ...fixture.appointments[0], id: 'handover-today', appointmentCode: 'LONG-HANDOVER-TODAY', status: 'CONFIRMED',
    scheduledAt: `${today}T23:59:59+07:00`, assignedStaff: staff },
  { ...fixture.appointments[0], id: 'handover-late', appointmentCode: 'LONG-HANDOVER-LATE', status: 'CONFIRMED',
    scheduledAt: new Date(now - 2 * 86400000).toISOString(), assignedStaff: staff },
  { ...fixture.appointments[0], id: 'handover-other', appointmentCode: 'OTHER-STAFF-HANDOVER', status: 'CONFIRMED',
    scheduledAt: new Date(now - 3 * 86400000).toISOString(), assignedStaff: { id: 'other-staff' } },
  { ...fixture.appointments[0], id: 'handover-completed', appointmentCode: 'LONG-HANDOVER-COMPLETED', status: 'COMPLETED',
    scheduledAt: '2026-11-13T04:08:00Z', completedAt: '2026-11-13T03:09:26Z', completedBy: staff,
    handoverNote: 'Ghi chú bàn giao cũ', assignedStaff: staff },
];
for (const [id, scheduledAt, status, assignedStaff] of [
  ['tomorrow', '2026-11-19T00:00:00+07:00', 'CONFIRMED', staff],
  ['seventh', '2026-11-25T20:00:00+07:00', 'CONFIRMED', staff],
  ['eighth', '2026-11-26T00:00:00+07:00', 'CONFIRMED', staff],
  ['unassigned', '2026-11-18T11:00:00+07:00', 'CONFIRMED', null],
  ['cancelled', '2026-11-18T01:00:00+07:00', 'CANCELLED', staff],
]) appointments.push({ ...appointments[0], id, scheduledAt, status, assignedStaff, appointmentCode: id });
const repairs = [{ ...fixture.maintenance[0], status: 'OPEN', priority: 'HIGH', assignedStaff: staff }];
const reservations = fixture.reservations.map((row, index) => ({
  ...row, quantity: 2, createdAt: new Date(now - index * 1000).toISOString(),
}));
const allocated = [
  { id: 'allocation-1', unitNumber: 'MD-E06-002', floor: 'Tầng 1', zone: 'E06', physicalStatus: 'AVAILABLE', releasedAt: null },
  { id: 'allocation-2', unitNumber: 'MD-E06-004', floor: 'Tầng 1', zone: 'E06', physicalStatus: 'MAINTENANCE', releasedAt: null },
];
const invoice = {
  code: 'TEST-I01', status: 'OPEN', total: 14400000, paid: 0, balance: 14400000, currency: 'VND',
  breakdown: { units: allocated.map((unit, index) => ({
    unitCode: unit.unitNumber, contractId: 'contract-' + index, contractCode: 'TEST-C0' + (index + 1), storageTypeName: 'Kho vừa E06',
    monthlyRate: 3600000, rentalAmount: 3600000, depositAmount: 3600000,
  })), sharedServices: [] },
};
const confirmed = {
  ...reservations[0], id: 'confirmed-booking', reference: 'CONFIRMED-BOOKING', status: 'CONFIRMED', allocatedUnits: allocated,
  product: { ...reservations[0].product, name: 'Kho vừa E06' },
  availability: { result: { message: 'Kết quả kiểm tra này chưa giữ kho.' } },
  quote: { rentalAmount: 21600000, depositAmount: 7200000, quotedTotalAmount: 28800000, estimatedInitialAmountDue: 14400000,
    monthlyUnitPrice: 3600000, termMonths: 3, billingMode: 'MONTHLY', paymentPlan: 'PAY_MONTHLY', addOnTotalAmount: 0,
    initialPaymentBreakdown: { rentalAmount: 7200000, remainingAmount: 14400000 } },
  workflow: {
    allocationComplete: true, contractsSigned: true, handoverReady: false, paymentStatus: invoice.status, appointment: null,
    contracts: allocated.map((unit, index) => ({
      code: 'TEST-C0' + (index + 1), status: 'PENDING_PAYMENT', allocationId: unit.id, acceptedAt: new Date(now).toISOString(),
    })),
    history: [{ at: new Date(now).toISOString(), action: 'Lập hóa đơn ban đầu', actor: null, result: invoice.code }],
  },
};
reservations.push(confirmed);
const unitAssignment = { id: 'assignment-1', assignedBy: { fullName: 'Quản lý kiểm thử' }, assignedAt: appointments[1].scheduledAt,
  storageUnit: { ...unit, unitNumber: unit.unitCode, status: 'OCCUPIED' } };
const firstContract = { ...fixture.contracts[0], startDate: '2026-10-09', endDate: '2026-11-09', unit };
const rental = { ...fixture.rentals[0], contracts: [firstContract] };
const overdueUnit = { id: firstContract.id, reservationId: rental.reservationId, endDate: '2026-11-09', overdueDays: 10,
  customer, storageUnit: unitAssignment.storageUnit, returnRequest: null };
const datasets = { ...fixture, appointments, maintenance: repairs, reservations, rentals: [rental],
  'support-requests': [], 'stock-movements': [{ ...fixture['stock-movements'][0], status: 'ASSIGNED', assignedStaff: staff }],
  returns: [], transfers: [], 'damage-claims': [], 'stored-items': [] };
let fail = '';
let assignmentEnabled = true;
let assignedUnitRows = [unitAssignment];
let bookingDelay;
let rentalDelay;
const operatingLists = ['transfers', 'returns', 'support-requests', 'maintenance', 'damage-claims'];

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
    if (path === 'staff/management/unit-checks') unitCheckRequests.push(path);
    const send = json => route.fulfill({ json });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (request.method() === 'POST' && path === 'staff/management/transfers') {
      transferProposalWrites.push(request.postDataJSON());
      datasets['support-requests'][0].hasTransferOrder = true;
      return route.fulfill({ status: 201, json: { id: 'linked-transfer-created' } });
    }
    if (request.method() === 'POST' && path === 'staff/support-requests/support-id/escalate') {
      const body = request.postDataJSON();
      serviceWrites.push(body);
      if (rejectEscalation) {
        rejectEscalation = false;
        return route.fulfill({status: 503, json: {message: 'Chưa lưu được hỗ trợ kiểm thử'}});
      }
      Object.assign(datasets['support-requests'][0], {status: 'ESCALATED', escalationReason: body.reason, escalatedAt: new Date(now).toISOString(), escalatedBy: staff});
      return send(datasets['support-requests'][0]);
    }
    if (request.method() === 'PATCH' && /^staff\/appointments\/handover-multi\/units\/[^/]+\/handover$/.test(path)) {
      const body = request.postDataJSON();
      const record = datasets.appointments.find(row => row.id === 'handover-multi');
      const unitId = decodeURIComponent(path.split('/').at(-2));
      unitHandoverWrites.push({ unitId, body });
      record.unitHandoverProgress.push({ unitId, unitCode: record.allocatedUnits.find(unit => unit.unitId === unitId).unitCode,
        condition: body.condition, completedAt: new Date(now + unitHandoverWrites.length * 60000).toISOString() });
      return send(record);
    }
    if (request.method() === 'POST' && path === 'staff/appointments/handover-multi/complete-handover') {
      const body = request.postDataJSON();
      handoverWrites.push(body);
      const record = datasets.appointments.find(row => row.id === 'handover-multi');
      const unitChecks = record.unitHandoverProgress.map(check => ({ ...check, inspected: true }));
      Object.assign(record, { status: 'COMPLETED', completedAt: new Date(now).toISOString(), completedBy: staff,
        handoverReport: { ...body.handoverReport, note: body.note, unitChecks } });
      return send(record);
    }
    if (request.method() === 'POST' && path === 'staff/stock-movements/stock-waiting/complete') {
      const body = request.postDataJSON();
      stockWrites.push(body);
      const row = datasets['stock-movements'].find(record => record.id === 'stock-waiting');
      Object.assign(row, {
        status: 'COMPLETED', completedAt: new Date(now).toISOString(), completedBy: staff, completionNote: body.note,
        storageUnitAtCompletion: row.currentStorageUnit,
        lines: row.lines.map(line => ({ ...line, actualQty: body.lines.find(item => item.lineId === line.id)?.actualQty })),
      });
      return send(row);
    }
    if (request.method() !== 'GET') { writes.push(path); return route.fulfill({ status: 403 }); }
    if (path === 'auth/me') return send(staff);
    if (path === 'staff/management/documents/contracts/return-contract/transfers/finished-transfer') {
      return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4' });
    }
    if (path === 'staff/assigned-units') {
      if (fail === 'assigned-units') return route.fulfill({ status: 500, json: { message: 'Lỗi tải danh sách kho kiểm thử' } });
      return send({ enabled: assignmentEnabled, items: assignmentEnabled ? assignedUnitRows : [] });
    }
    const [, kind, id] = path.replace('/management/', '/').split('/');
    if (kind === fail) return route.fulfill({ status: 500, json: { message: 'Lỗi tải dữ liệu kiểm thử' } });
    if (kind === 'overstays') {
      scopedRequests.push({ role: path.split('/')[0], assigned: query.get('assigned') });
      return send(pageOf([overdueUnit], query));
    }
    let data = datasets[kind] ?? [];
    if (kind === 'rentals' && !id) {
      if (rentalDelay) await rentalDelay;
      if (!assignmentEnabled) return send({ ...pageOf([], query), assignmentsEnabled: false });
      const search = query.get('search')?.toLowerCase();
      if (search) data = data.filter(row => [row.reservationReference, row.customer.fullName, ...row.contracts.map(contract => contract.unit.unitCode)].some(value => value.toLowerCase().includes(search)));
      if (query.has('overdue')) data = data.filter(row => row.isOverdue === (query.get('overdue') === 'true'));
      const rentalPage = new URLSearchParams(query);
      rentalPage.set('limit', String(Math.min(2, Number(query.get('limit')) || 20)));
      return send({ ...pageOf(data, rentalPage), assignmentsEnabled: true });
    }
    if (kind === 'stored-items' && id && path.endsWith('/history')) {
      stockHistoryReads++;
      const history = stockItemHistory.get(id);
      return history ? send(pageOf(history, query)) : route.fulfill({ status: 404 });
    }
    if (kind === 'stored-items' && !id) {
      const storageUnitId = query.get('storageUnitId');
      const selectedStorageUnit = data.find(item => item.currentStorageUnit.id === storageUnitId)?.currentStorageUnit;
      if (storageUnitId && !selectedStorageUnit) return route.fulfill({ status: 403, json: { message: 'Kho không được phân công' } });
      const search = query.get('search')?.toLowerCase();
      if (storageUnitId) data = data.filter(item => item.currentStorageUnit.id === storageUnitId);
      if (search) data = data.filter(item => [item.name, item.itemCode, item.customer.fullName, item.currentStorageUnit.unitNumber].some(value => value.toLowerCase().includes(search)));
      return send({ ...pageOf(data, query), selectedStorageUnit });
    }
    if (kind === 'appointments') data = data.filter(row => row.assignedStaff?.id === staff.id || !row.assignedStaff && row.status === 'COMPLETED' && row.completedBy?.id === staff.id);
    if (kind === 'stock-movements') data = data.filter(row => row.assignedStaff?.id === staff.id);
    if (operatingLists.includes(kind)) data = data.filter(row => row.assignedStaff?.id === staff.id);
    if (id) {
      if (id === 'forbidden-booking') return route.fulfill({ status: 403, json: { message: 'Bạn không có quyền xem hồ sơ này.' } });
      if (id === 'confirmed-booking' && bookingDelay) await bookingDelay;
      const record = data.find(item => item.id === id || item.reservationId === id);
      if (!record || record.assignedStaff && record.assignedStaff.id !== staff.id) return route.fulfill({ status: 404, json: { message: 'Không tìm thấy hồ sơ' } });
      return send(record);
    }
    const status = query.get('status');
    if (status) data = data.filter(row => row.status === status);
    if (operatingLists.includes(kind)) {
      const search = query.get('search')?.toLowerCase();
      const claimId = query.get('id');
      const stage = { reported: 'REPORTED', investigating: 'INVESTIGATING', resolved: 'RESOLVED' }[query.get('stage')];
      const priority = query.get('priority');
      if (search) data = data.filter(row => JSON.stringify(row).toLowerCase().includes(search));
      if (claimId) data = data.filter(row => row.id === claimId);
      if (stage) data = data.filter(row => row.status === stage);
      if (priority) data = data.filter(row => row.priority === priority);
    }
    if (kind === 'stock-movements') {
      const type = query.get('type');
      const search = query.get('search')?.toLowerCase();
      if (type) data = data.filter(row => row.type === type);
      if (search) data = data.filter(row => [row.movementCode, row.rentalContract.contractCode, row.customer.fullName].some(value => value?.toLowerCase().includes(search)));
    }
    if (kind === 'appointments' && query.has('date')) data = data.filter(row => localDay(row.scheduledAt) === query.get('date'));
    if (kind === 'appointments' && query.has('from')) data = data.filter(row => localDay(row.scheduledAt) >= query.get('from') && localDay(row.scheduledAt) <= query.get('through'));
    if (kind === 'appointments') {
      const search = query.get('search');
      if (search) data = data.filter(row => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
      const rank = row => row.status === 'COMPLETED' ? 2 : row.status === 'CANCELLED' ? 3 : Date.parse(row.scheduledAt) >= now ? 0 : 1;
      if (query.get('agenda') === 'upcoming') data = data.filter(row => rank(row) === 0);
      if (query.has('agenda')) data = [...data].sort((a, b) => rank(a) - rank(b)
        || (rank(a) === 0 ? Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)
          : Date.parse(b.completedAt ?? b.scheduledAt) - Date.parse(a.completedAt ?? a.scheduledAt)));
    }
    return send(pageOf(data, query));
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(now);
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  const open = path => page.goto(base + '/staff' + path, { waitUntil: 'domcontentloaded' });
  const heading = name => page.getByRole('heading', { name, exact: true });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const shot = name => page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' });
  const work = page.getByRole('table', { name: 'Danh sách công việc' });

  await open('');
  const kpis = page.getByLabel('Chỉ số công việc').getByRole('link');
  await kpis.last().waitFor();
  assert.deepEqual(await kpis.locator('strong').allTextContents(), ['7', '1', '1', '1']);
  assert.deepEqual(await kpis.evaluateAll(links => links.map(link => link.getAttribute('href'))), [
    '/staff/tasks', `/staff/appointments?status=CONFIRMED&date=${today}`,
    '/staff/stock-movements?status=ASSIGNED', '/staff/tasks?type=appointments&status=CONFIRMED&timing=overdue',
  ]);
  const priority = page.getByRole('region', { name: 'Công việc ưu tiên' });
  assert.equal(await priority.getByRole('listitem').count(), 4);
  await priority.getByRole('link').filter({ hasText: 'Thực hiện bảo trì' }).waitFor();
  assert.doesNotMatch(await page.locator('main').innerText(), /LONG-HANDOVER|OTHER-STAFF|RT01|SETTLE/);
  assert.equal(await page.getByRole('region', { name: 'Lịch sắp tới' }).getByRole('listitem').count(), 3);
  assert.equal(await page.getByRole('region', { name: 'Kho cần kiểm tra' }).count(), 0);
  const calendar = page.getByRole('region', { name: 'Lịch sắp tới' });
  assert.deepEqual(await calendar.getByRole('link', { name: /Xem lịch/ }).evaluateAll(links => links.map(link => link.getAttribute('href'))),
    ['/staff/appointments/handover-today', '/staff/appointments/tomorrow', '/staff/appointments/seventh']);
  await kpis.nth(1).click();
  const handovers = page.getByRole('table', { name: 'Lịch bàn giao' });
  await handovers.getByText('LONG-HANDOVER-TODAY', { exact: true }).waitFor();
  assert.equal(await handovers.locator('tbody tr').count(), 1);
  await open('');
  await calendar.getByRole('link', { name: /Xem tất cả/ }).click();
  await handovers.getByText('seventh', { exact: true }).waitFor();
  assert.equal(await handovers.locator('tbody tr').count(), 3);
  await open('');
  await kpis.last().waitFor();
  assert(!await overflow());
  await shot('dashboard-light');
  await kpis.last().click();
  await work.waitFor();
  assert.equal(await work.locator('tbody tr').count(), 1);
  assert.match(await work.innerText(), /LONG-HANDOVER-LATE/);
  const handoverRow = work.locator('tbody tr').filter({ hasText: 'LONG-HANDOVER-LATE' });
  const handoverLink = handoverRow.getByRole('link', { name: /Xem chi tiết.*LONG-HANDOVER-LATE/ });
  const handoverPath = await handoverLink.getAttribute('href');
  const handoverList = page.url();
  await work.getByRole('button', { name: /Thao tác LONG-HANDOVER-LATE/ }).click();
  assert.equal(new URL(page.url()).pathname, '/staff/tasks');
  await page.getByRole('link', { name: 'Bắt đầu xử lý', exact: true }).click();
  await page.locator('#staff-processing').waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'staff-processing');
  const handover = page.getByRole('button', { name: 'Xác nhận đã bàn giao giấy tờ và chìa khóa', exact: true });
  assert.equal(await handover.evaluate(button => button.form.checkValidity()), false);
  await page.goto(handoverList);
  await handoverRow.locator('td').nth(1).click();
  await page.waitForURL(url => url.pathname === handoverPath);
  await handover.waitFor();

  const stock = [...datasets['stock-movements']];
  datasets['stock-movements'].push(...Array.from({ length: 102 }, (_, index) => ({
    ...stock[0], id: 'bulk-' + index, movementCode: 'BULK-MOV-' + index, customer,
  })));
  await open('/tasks');
  await page.getByLabel('Số dòng mỗi trang').waitFor();
  assert.deepEqual(await page.getByLabel('Số dòng mỗi trang').locator('option').allTextContents(), ['5', '10']);
  await page.getByText('Trang 1 / 11', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await page.getByText('Trang 2 / 11', { exact: true }).waitFor();
  const search = page.getByRole('searchbox', { name: 'Tìm công việc' });
  await page.getByLabel('Số dòng mỗi trang').selectOption('5');
  await page.getByText('Trang 1 / 22', { exact: true }).waitFor();
  assert.equal(await work.locator('tbody tr').count(), 5);
  await page.getByLabel('Số dòng mỗi trang').selectOption('10');
  await search.fill('BULK-MOV-101');
  await page.waitForURL(url => url.searchParams.get('search') === 'BULK-MOV-101');
  await page.getByText('1–1 / 1 bản ghi', { exact: true }).waitFor();
  await work.getByText('BULK-MOV-101', { exact: true }).waitFor();
  assert.equal(await work.locator('tbody tr').count(), 1);
  await search.fill('Khach kiem thu');
  await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Danh sách công việc"] tbody tr').length === 10);
  await page.waitForURL(url => url.searchParams.get('search') === 'Khach kiem thu');
  assert(await work.locator('tbody tr').count() <= 10);
  await search.fill('');
  await page.getByText(/109 bản ghi/).waitFor();
  await page.getByRole('combobox', { name: 'Ưu tiên' }).selectOption('HIGH');
  await page.waitForURL(url => url.searchParams.get('priority') === 'HIGH');
  await page.getByText('Trang 1 / 1', { exact: true }).waitFor();
  assert.equal(await work.locator('tbody tr').count(), 1);
  assert.match(await work.innerText(), /MNT-TEST/);
  const repair = work.locator('tbody tr').filter({ hasText: 'MNT-TEST' });
  await repair.getByRole('link', { name: /Xem chi tiết.*MNT-TEST/ }).press('Enter');
  await page.waitForURL('**/staff/maintenance/maintenance-id');
  assert.notEqual(handoverPath, '/staff/maintenance/maintenance-id');
  await page.getByRole('link', { name: 'Về danh sách', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/staff/tasks' && url.searchParams.get('limit') === '10' && url.searchParams.get('priority') === 'HIGH');
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await page.getByText('Trang 1 / 11', { exact: true }).waitFor();
  for (const width of [1920, 1366, 768, 390]) {
    await page.setViewportSize({ width, height: 920 });
    assert(!await overflow(), `Staff pagination overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await work.getByRole('button', { name: 'Lịch / cập nhật' }).click();
  await page.waitForURL(url => url.searchParams.get('sort') === 'asc');
  await work.locator('th[aria-sort="ascending"]').waitFor();
  assert.equal(await work.getByRole('columnheader', { name: 'Ưu tiên', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Hiển thị cột' }).count(), 0);
  assert.equal(await work.getByRole('columnheader', { name: 'Phân công' }).count(), 0);
  await shot('tasks-light');
  datasets['stock-movements'] = stock;

  assert.equal(await page.getByRole('link', { name: 'Yêu cầu đặt kho', exact: true }).count(), 0);
  await open('/reservations');
  await page.waitForURL('**/staff/appointments');
  await open('/tasks?view=completed');
  await work.getByText('LONG-HANDOVER-COMPLETED', { exact: true }).waitFor();
  assert.equal(await work.getByRole('button', { name: /^Thao tác/ }).count(), 0);
  await open('/reservations/confirmed-booking');
  await heading('Kho vừa E06 · ' + customer.fullName).waitFor();
  const checkUnits = page.getByRole('region', { name: 'Kho được phân bổ' });
  await checkUnits.getByText('2 / 2 kho', { exact: true }).waitFor();
  assert.equal(await checkUnits.getByText('Đã phân bổ', { exact: true }).count(), 2);
  await checkUnits.getByText('Tình trạng vật lý · Đang bảo trì', { exact: true }).waitFor();
  await page.getByText('Chờ khách thanh toán đủ hóa đơn ban đầu.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: /^Xem lịch bàn giao/ }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Lưu quyết định' }).count(), 0);
  const historical = page.getByText('Kết quả kiểm tra này chưa giữ kho.', { exact: true });
  assert.equal(await historical.isVisible(), false);
  await page.locator('summary').getByText('Lịch sử xử lý', { exact: true }).click();
  await historical.waitFor();
  assert.equal(await page.getByRole('region', { name: 'Thanh toán', exact: true }).count(), 0);
  assert(!/14\.400\.000|21\.600\.000|7\.200\.000|28\.800\.000/.test(await page.locator('main').innerText()));
  await page.evaluate(() => scrollTo(0, 0));
  await shot('reservation-confirmed-light');
  await page.getByRole('link', { name: 'Về danh sách' }).click();
  await page.waitForURL(url => url.pathname === '/staff/appointments');

  confirmed.workflow.paymentStatus = 'PARTIALLY_PAID';
  await open('/reservations/confirmed-booking');
  await page.getByText('Chờ khách thanh toán đủ hóa đơn ban đầu.', { exact: true }).waitFor();

  Object.assign(confirmed.workflow, {
    handoverReady: true, paymentStatus: 'PAID',
    contracts: confirmed.workflow.contracts.map(contract => ({ ...contract, status: 'READY_FOR_HANDOVER' })),
    appointment: { id: 'handover-today', status: 'CONFIRMED', assignment: 'SELF', scheduledAt: appointments[0].scheduledAt },
  });
  await open('/reservations/confirmed-booking');
  const appointmentLink = page.getByRole('link', { name: /^Xem lịch bàn giao/ });
  await appointmentLink.waitFor();
  assert.equal(await appointmentLink.getAttribute('href'), '/staff/appointments/handover-today');
  await page.getByText('Kiểm tra lại kho đang sử dụng hoặc bảo trì trước khi bàn giao.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 768, height: 900 });
  assert(!await overflow());
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('[data-workspace-role="staff"]').getAttribute('data-workspace-theme'), 'dark');
  assert(!await overflow());
  await shot('reservation-paid-mobile-dark');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).click();
  await page.keyboard.press('Escape');
  confirmed.workflow.appointment = { status: 'CONFIRMED', assignment: 'OTHER' };
  await open('/reservations/confirmed-booking');
  await page.getByText('Lịch bàn giao đã giao cho nhân viên phụ trách.', { exact: true }).waitFor();
  assert.equal(await appointmentLink.count(), 0);
  await open('/reservations/forbidden-booking');
  await page.getByRole('alert').getByText('Bạn không có quyền xem hồ sơ này.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Lưu quyết định' }).count(), 0);
  let finishBooking;
  bookingDelay = new Promise(resolve => { finishBooking = resolve; });
  try {
    await open('/reservations/confirmed-booking');
    const placeholder = page.locator('.workspace-skeleton--detail');
    await placeholder.waitFor();
    assert.match(await placeholder.innerText(), /Đang tải chi tiết hồ sơ/);
  } finally {
    finishBooking();
    bookingDelay = undefined;
  }
  await heading('Kho vừa E06 · ' + customer.fullName).waitFor();
  fail = 'reservations';
  await open('/reservations/confirmed-booking');
  await page.getByRole('alert').getByText('Lỗi tải dữ liệu kiểm thử').waitFor();
  fail = '';
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await heading('Kho vừa E06 · ' + customer.fullName).waitFor();

  const originalMaintenance = datasets.maintenance;
  const outsideWork = { ...repairs[0], id: 'work-at-other-unit', maintenanceCode: 'MNT-KHO-KHAC', unit: { ...unit, id: 'other-unit', unitCode: 'OTHER-01' } };
  datasets.maintenance = [
    { ...repairs[0], status: 'IN_PROGRESS' },
    outsideWork,
    { ...repairs[0], id: 'work-of-other-staff', maintenanceCode: 'MNT-NGUOI-KHAC', assignedStaff: { id: 'other-staff' } },
  ];
  assignedUnitRows = [{ ...unitAssignment, storageUnit: { ...unitAssignment.storageUnit, status: 'MAINTENANCE' } }];
  fail = 'assigned-units';
  await open('/assigned-units');
  await page.getByRole('alert').getByText('Lỗi tải danh sách kho kiểm thử').waitFor();
  fail = '';
  await page.getByRole('button', { name: 'Thử lại' }).click();
  const unitsTable = page.getByRole('table', { name: 'Kho tôi phụ trách', exact: true });
  const unitRow = unitsTable.getByRole('row').filter({ hasText: unit.unitCode });
  const unitSearch = page.getByPlaceholder('Tìm mã kho, loại kho hoặc vị trí...');
  await unitRow.waitFor();
  assert.deepEqual(await unitsTable.getByRole('columnheader').allTextContents(), ['Mã kho', 'Loại kho', 'Vị trí', 'Trạng thái']);
  for (const query of [unit.unitCode, unit.storageType.name, 'Tang 1']) {
    await unitSearch.fill(query);
    await unitRow.waitFor();
    assert.equal(await unitsTable.locator('tbody tr').count(), 1);
  }
  await unitSearch.fill('không có mã này');
  await heading('Không tìm thấy kho phù hợp').waitFor();
  await unitSearch.clear();
  const locationCell = unitRow.locator('td').nth(1);
  assert.equal(await locationCell.evaluate(element => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return selection.type;
  }), 'Range');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await locationCell.click();
  const unitDialog = page.getByRole('dialog', { name: unit.unitCode });
  await unitDialog.getByRole('heading', { name: 'Công việc tại kho' }).waitFor();
  await unitDialog.locator('header').getByText('Bảo trì', { exact: true }).waitFor();
  await unitDialog.getByText('Đang xử lý', { exact: true }).waitFor();
  const unitWorkLink = unitDialog.getByRole('link', { name: /MNT-TEST/ });
  assert.equal(await unitWorkLink.getAttribute('href'), '/staff/maintenance/maintenance-id');
  assert.equal(await unitDialog.getByRole('link', { name: /MNT-KHO-KHAC|MNT-NGUOI-KHAC/ }).count(), 0);
  assert.match(await unitDialog.innerText(), /Quản lý kiểm thử/);
  assert(!/Chỉnh sửa|Cấu hình|Sửa kho/.test(await unitDialog.innerText()));
  await shot('assigned-unit-light');
  await page.keyboard.press('Escape');
  await unitDialog.waitFor({ state: 'hidden' });
  const keyboardRow = unitRow.getByRole('button', { name: `Mở hồ sơ kho ${unit.unitCode}` });
  for (const key of ['Enter', 'Space']) {
    await keyboardRow.press(key);
    await unitDialog.waitFor();
    await page.keyboard.press('Escape');
    await unitDialog.waitFor({ state: 'hidden' });
  }
  await keyboardRow.press('Enter');
  await unitWorkLink.click();
  await page.waitForURL('**/staff/maintenance/maintenance-id');
  await page.getByRole('link', { name: 'Về danh sách' }).click();
  await unitDialog.waitFor();
  await page.keyboard.press('Escape');
  await open('/tasks?type=maintenance&search=MNT-KHO-KHAC');
  await work.getByText('MNT-KHO-KHAC', { exact: true }).waitFor();
  await work.getByText('Theo phân công nhiệm vụ', { exact: true }).waitFor();
  await open('/maintenance/work-of-other-staff');
  await page.getByRole('alert').getByText('Không tìm thấy hồ sơ').waitFor();

  assignedUnitRows.push(...Array.from({ length: 5 }, (_, index) => ({
    ...unitAssignment, id: `assignment-more-${index}`,
    storageUnit: { ...unitAssignment.storageUnit, id: `unit-more-${index}`, unitNumber: `EXTRA-0${index}` },
  })));
  await open('/assigned-units?limit=5');
  await page.getByText('1–5 / 6 bản ghi', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await page.getByText('6–6 / 6 bản ghi', { exact: true }).waitFor();
  await unitsTable.getByText('EXTRA-04', { exact: true }).click();
  await page.getByRole('dialog', { name: 'EXTRA-04' }).getByText('Chưa có công việc cần xử lý.', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assignedUnitRows = [unitAssignment];
  datasets.maintenance = originalMaintenance;
  await open('/assigned-units?unit=other-unit');
  await page.getByRole('status').filter({ hasText: 'Kho không thuộc danh sách bạn phụ trách.' }).waitFor();
  await unitsTable.waitFor();
  assert.equal(await page.getByRole('dialog', { name: /chi tiết|A101/i }).count(), 0);

  const secondUnit = { ...unit, id: 'unit-upcoming', unitCode: 'TEST-UPCOMING' };
  const secondContract = { ...firstContract, id: 'contract-second', contractCode: 'CON-SECOND', endDate: '2026-11-25', unit: secondUnit };
  rental.contracts.push(secondContract);
  const extraRentals = Array.from({ length: 5 }, (_, i) => ({
    ...rental, reservationId: 'extra-rental-' + i, customer: { fullName: i === 4 ? 'Nguyễn Hải' : customer.fullName },
    contracts: [{ ...firstContract, id: 'extra-contract-' + i, contractCode: 'CON-EXTRA-' + i, endDate: '2026-11-26',
      unit: { ...unit, id: 'extra-unit-' + i, unitCode: 'RENTAL-EXTRA-' + i } }],
  }));
  datasets.rentals.push(...extraRentals);
  datasets.maintenance = [...originalMaintenance,
    { ...repairs[0], id: 'unrelated-rental-work', maintenanceCode: 'MNT-SECOND', unit: secondUnit },
    { ...repairs[0], id: 'outside-staff-rental', maintenanceCode: 'MNT-OUTSIDE', unit: { ...unit, id: 'other-unit', unitCode: 'OTHER-01' } },
  ];
  await open('/rentals?limit=5');
  const rentalTable = page.getByRole('table', { name: 'Kho đang thuê', exact: true });
  const rentalRow = number => rentalTable.locator('tbody tr').filter({ hasText: number });
  const rentalSearch = page.getByRole('searchbox', { name: 'Tìm kho' });
  const periodFilter = page.getByLabel('Hạn thuê');
  await rentalTable.getByText(unit.unitCode, { exact: true }).waitFor();
  assert.deepEqual(await rentalTable.getByRole('columnheader').allTextContents(), ['Khách hàng / Kho', 'Bắt đầu thuê', 'Hết hạn', 'Trạng thái']);
  assert.equal(await page.getByRole('main').getByRole('link', { name: 'Kho cần kiểm tra', exact: true }).count(), 0);
  await rentalRow(unit.unitCode).getByText('09/11/2026', { exact: true }).waitFor();
  await rentalRow(secondUnit.unitCode).getByText('25/11/2026', { exact: true }).waitFor();
  await rentalRow(secondUnit.unitCode).getByText('Sắp hết hạn', { exact: true }).waitFor();
  await shot('rentals-light');
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await page.getByText('6–7 / 7 bản ghi', { exact: true }).waitFor();
  assert.equal(await rentalRow(unit.unitCode).count(), 0);
  await rentalRow('RENTAL-EXTRA-4').getByText('Đang thuê', { exact: true }).waitFor();
  await rentalSearch.fill('nguyen hai');
  await rentalRow('RENTAL-EXTRA-4').waitFor();
  await page.waitForURL(url => url.searchParams.get('search') === 'nguyen hai' && !url.searchParams.has('page'));
  await rentalRow('RENTAL-EXTRA-3').waitFor({ state: 'hidden' });
  assert.equal(await rentalTable.locator('tbody tr').count(), 1);
  await rentalSearch.fill('CON-SECOND');
  await rentalRow(secondUnit.unitCode).waitFor();
  assert.equal(await rentalTable.locator('tbody tr').count(), 1);
  await rentalSearch.fill('OTHER-01');
  await heading('Không tìm thấy kho phù hợp.').waitFor();
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await page.getByRole('combobox', { name: 'Số dòng' }).selectOption('10');
  await page.getByText('1–7 / 7 bản ghi', { exact: true }).waitFor();
  await periodFilter.selectOption('EXPIRING');
  await rentalRow(secondUnit.unitCode).waitFor();
  await rentalRow(unit.unitCode).waitFor({ state: 'hidden' });
  assert.equal(await rentalTable.locator('tbody tr').count(), 1);
  await rentalTable.getByRole('link', { name: 'Xem kho ' + secondUnit.unitCode }).press('Space');
  await heading(secondUnit.unitCode).waitFor();
  await heading('Thông tin thuê').waitFor();
  assert.equal(await page.getByText(firstContract.contractCode, { exact: true }).count(), 0);
  await page.getByRole('link', { name: /Xem công việc.*MNT-SECOND/ }).waitFor();
  assert.equal(await page.getByRole('link', { name: /Xem công việc.*MNT-OUTSIDE/ }).count(), 0);
  const detailUrl = page.url();
  await page.getByRole('button', { name: 'Sao chép mã hợp đồng ' + secondContract.contractCode }).click();
  assert.equal(page.url(), detailUrl);
  await page.getByRole('link', { name: 'Về danh sách' }).click();
  await page.waitForURL(url => url.searchParams.get('status') === 'EXPIRING');
  await periodFilter.selectOption('OVERDUE');
  await rentalTable.getByRole('link', { name: 'Xem kho ' + unit.unitCode }).press('Enter');
  await heading(unit.unitCode).waitFor();
  await page.getByRole('link', { name: /Xem công việc.*MNT-TEST/ }).click();
  await page.waitForURL('**/staff/maintenance/maintenance-id');
  await open('/unit-checks');
  await page.waitForURL('**/staff/tasks');
  await heading('Công việc của tôi').waitFor();
  await open('/rentals/' + rental.reservationId);
  await heading('Chọn kho để xem').waitFor();
  await page.getByRole('link', { name: secondUnit.unitCode, exact: true }).click();
  await heading(secondUnit.unitCode).waitFor();
  await open('/rentals/' + rental.reservationId + '?contract=other-contract');
  await page.getByRole('alert').getByText(/Không tìm thấy hồ sơ/).waitFor();
  assert.equal(await heading('Thông tin thuê').count(), 0);
  await open('/rentals/out-of-scope');
  await page.getByRole('alert').getByText(/Không tìm thấy hồ sơ/).waitFor();
  await open('/rentals/forbidden-booking');
  await page.getByRole('alert').getByText(/Không tìm thấy hồ sơ/).waitFor();
  firstContract.status = 'COMPLETED';
  secondContract.endDate = '2027-02-25';
  datasets.rentals = [rental];
  await open('/rentals');
  await rentalRow(secondUnit.unitCode).getByText('25/02/2027', { exact: true }).waitFor();
  await rentalRow(secondUnit.unitCode).getByText('Đang thuê', { exact: true }).waitFor();
  assert.equal(await rentalTable.locator('tbody tr').count(), 1);
  await rentalRow(secondUnit.unitCode).getByText(secondUnit.unitCode, { exact: true }).click();
  await heading(secondUnit.unitCode).waitFor();
  await page.getByText('25/02/2027', { exact: true }).waitFor();
  assert.equal(await page.getByText('Sắp hết hạn', { exact: true }).count(), 0);
  fail = 'rentals';
  await open('/rentals');
  await page.getByRole('alert').getByText('Lỗi tải dữ liệu kiểm thử').waitFor();
  assert.equal(await heading('Bạn chưa được phân công phụ trách kho đang thuê nào.').count(), 0);
  fail = '';
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await rentalTable.waitFor();
  let resolveRentals;
  rentalDelay = new Promise(resolve => { resolveRentals = resolve; });
  datasets.rentals = [];
  await open('/rentals');
  await page.locator('.workspace-skeleton--table').waitFor();
  resolveRentals();
  rentalDelay = undefined;
  await heading('Bạn chưa được phân công phụ trách kho đang thuê nào.').waitFor();
  firstContract.status = 'ACTIVE';
  datasets.rentals = [rental];
  datasets.maintenance = originalMaintenance;
  await open('/assigned-units');

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
  assert.equal(await sidebar.getByRole('link', { name: 'Kho cần kiểm tra' }).count(), 0);
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
  await open('/rentals');
  await rentalTable.waitFor();
  assert(!await overflow());
  assert(await rentalTable.locator('..').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
  await shot('rentals-dark-mobile');
  await rentalRow(secondUnit.unitCode).getByText(secondUnit.unitCode, { exact: true }).click();
  await heading(secondUnit.unitCode).waitFor();
  assert(!await overflow());
  await shot('rental-detail-dark-mobile');
  await open('/assigned-units?unit=' + unit.id);
  await unitDialog.waitFor();
  assert.equal(await unitDialog.locator('.manager-facts').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
  assert(await unitDialog.locator('.portal-dialog-body').evaluate(body => body.scrollWidth <= body.clientWidth + 1));
  await shot('assigned-unit-dark-mobile');
  await page.keyboard.press('Escape');
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
    ['/appointments', 'Lịch bàn giao'], ['/stock-movements', 'Phiếu nhập – xuất'],
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
  datasets['support-requests'] = [{
    ...fixture['support-requests'][0], subject: 'Yêu cầu chuyển kho', assignedStaff: staff,
    contract: { id: 'transfer-support-contract', contractCode: 'CON-FROM-SUPPORT', status: 'ACTIVE' },
    unit: { id: 'transfer-unit', unitCode: 'TRANSFER-01', status: 'OCCUPIED' },
  }];
  const previousContracts = datasets.contracts;
  datasets.contracts = [];
  await open('/transfers');
  const transferInbox = page.getByRole('region', { name: 'Yêu cầu chuyển kho từ khách hàng' });
  const sendFromRequest = transferInbox.getByRole('button', { name: 'Đề xuất chuyển kho', exact: true });
  await sendFromRequest.waitFor();
  assert.equal(await page.getByRole('button', { name: 'Gửi đề nghị chuyển kho', exact: true }).count(), 0);
  await sendFromRequest.click();
  const transferDialog = page.getByRole('dialog', { name: 'Gửi đề nghị chuyển kho' });
  await transferDialog.waitFor();
  assert.equal(await transferDialog.getByLabel('Hợp đồng gắn với yêu cầu').inputValue(), 'CON-FROM-SUPPORT');
  assert.equal(await transferDialog.getByRole('combobox', { name: 'Hợp đồng đang thuê' }).count(), 0);
  await transferDialog.getByRole('button', { name: 'Tạo yêu cầu', exact: true }).click();
  await transferDialog.waitFor({ state: 'hidden' });
  assert.deepEqual(transferProposalWrites, [{ rentalContractId: 'transfer-support-contract', reason: 'UNIT_ISSUE', supportRequestId: fixture['support-requests'][0].id }]);
  datasets.contracts = previousContracts;
  for (const retired of ['/inquiries', '/inquiries/inquiry-id', '/operations/inquiries/inquiry-id']) {
    await open(retired);
    await page.waitForURL('**/staff/appointments');
    assert.equal(await page.getByRole('link', { name: 'Tư vấn khách hàng', exact: true }).count(), 0);
  }
  const support = { ...fixture['support-requests'][0], status: 'IN_PROGRESS', assignedStaff: staff, description: 'Khách mô tả thiết bị gặp sự cố.\nNội dung cần giữ nguyên.' };
  datasets['support-requests'] = [support];
  await open('/support-requests/support-id');
  await page.getByRole('heading', { level: 1, name: /Hỗ trợ khách/ }).waitFor();
  await page.getByText('Nội dung cần giữ nguyên.', {exact: false}).waitFor();
  await page.getByRole('heading', { name: 'Kết quả hỗ trợ', exact: true }).waitFor();
  const how = page.getByRole('combobox', { name: 'Hướng xử lý' });
  const result = page.getByLabel('Mô tả kết quả xử lý');
  await result.fill('Dự thảo kết quả tại kho');
  await how.selectOption('escalate');
  const reason = page.getByLabel('Lý do chuyển quản lý');
  const sendEscalation = page.getByRole('button', { name: 'Chuyển quản lý xem xét' });
  assert.equal(await reason.evaluate(field => field.form.checkValidity()), false);
  await reason.fill('Cần xác nhận tình trạng thiết bị.');
  await how.selectOption('ON_SITE_RESOLVED');
  assert.equal(await result.inputValue(), 'Dự thảo kết quả tại kho');
  await how.selectOption('escalate');
  assert.equal(await reason.inputValue(), 'Cần xác nhận tình trạng thiết bị.');
  await shot('support-processing-mobile-dark');
  await sendEscalation.click();
  await page.getByRole('alert').getByText('Chưa lưu được hỗ trợ kiểm thử').waitFor();
  assert.equal(await reason.inputValue(), 'Cần xác nhận tình trạng thiết bị.');
  await sendEscalation.click();
  await page.getByRole('heading', { name: 'Kết quả xử lý', exact: true }).waitFor();
  assert.equal(await how.count(), 0);
  assert.equal(await page.getByText('Lịch sử xử lý', {exact: true}).evaluate(node => node.parentElement.open), false);
  assert.deepEqual(serviceWrites, [{reason:'Cần xác nhận tình trạng thiết bị.'}, {reason:'Cần xác nhận tình trạng thiết bị.'}]);
  assert(!await overflow());
  const stamp = new Date(now).toISOString();
  const customerName = 'Khách đọc hồ sơ';
  const customerRecord = { fullName: customerName };
  const contract = { id: 'return-contract', contractCode: 'C-HD-RIÊNG', startDate: '2026-02-01', endDate: '2026-11-18' };
  const sourceUnit = { id: 'source-unit', unitCode: 'SRC-01', status: 'MAINTENANCE' };
  const targetUnit = { id: 'target-unit', unitCode: 'DST-01', status: 'OCCUPIED' };
  const linkedRepair = { ...repairs[0], id: 'linked-repair', maintenanceCode: 'MNT-LINK', unit: sourceUnit, source: 'RETURN_INSPECTION',
    status: 'AWAITING_VERIFICATION', workCompletedAt: stamp, workNote: 'Đã sửa bản lề',
    returnContext: { returnRequest: { id: 'scoped-return', returnCode: 'RT-SCOPED' } } };
  const transfer = { id: 'finished-transfer', transferCode: 'TRF-SCOPED', status: 'COMPLETED', reason: 'UNIT_ISSUE',
    customer: customerRecord, assignedStaff: staff, fromUnit: sourceUnit, toUnit: targetUnit, contract,
    createdAt: new Date(now - 120000).toISOString(), approvedAt: new Date(now - 60000).toISOString(),
    requestedBy: staff, approvedBy: staff, completedBy: staff,
    completedAt: stamp, updatedAt: stamp, handoverReport: { goodsMoved: true, recipientName: customerName },
    supportRequest: { id: 'support-id', supportCode: support.supportCode, status: 'RESOLVED', resolutionType: 'ON_SITE_RESOLVED' } };
  const returnCase = { id: 'scoped-return', returnCode: 'RT-SCOPED', status: 'PENDING_SETTLEMENT', timing: 'ON_OR_AFTER_END',
    requestedAt: stamp, physicallyReturnedAt: stamp, settlementStatus: 'PENDING_REVIEW', updatedAt: stamp, assignedStaff: staff,
    reservation: { reference: 'RES-MULTI', effectiveEndDate: '2026-11-18', customer: customerRecord },
    inspections: [{ id: 'scoped-inspection', contract, unit: sourceUnit, result: 'ISSUE_FOUND', issueType: 'NORMAL_WEAR',
      conditionNote: 'Vết xước nhẹ ở bản lề', inspectedAt: stamp, inspectedBy: staff,
      maintenance: { id: linkedRepair.id, maintenanceCode: linkedRepair.maintenanceCode } }] };
  const claim = { id: 'claim-scoped', claimCode: 'CLM-SCOPED', description: 'Palet bị ướt', discoveredOn: '2026-11-17', unitCodeSnapshot: 'DST-01',
    createdAt: stamp, updatedAt: stamp, customer: customerRecord, assignedStaff: staff, status: 'RESOLVED',
    affectedItems: [], evidenceLinks: [], staffFacts: 'Kiểm tra bao bì', factsRecordedAt: stamp,
    estimatedValue: 1500000, decision: 'REJECTED', decisionReason: 'Kết quả đã được đối chiếu',
    rentalContract: contract, history: [{ role: 'STAFF', action: 'INSPECTED', actorName: staff.fullName, at: stamp },
      { role: 'MANAGER', action: 'DECIDED', actorName: 'Quản lý quyết định', at: new Date(now + 60000).toISOString() }] };
  const savedRepairs = datasets.maintenance;
  datasets.maintenance = [linkedRepair];
  datasets['support-requests'] = [{ ...support, status: 'RESOLVED', priority: 'HIGH', subject: 'Đã xử lý hỗ trợ',
    description: 'Ghi nhận ban đầu', resolutionNote: 'Đã xử lý tại chỗ', resolutionType: 'ON_SITE_RESOLVED', resolvedBy: staff, resolvedAt: stamp }];
  datasets.transfers = [transfer, ...Array.from({ length: 5 }, (_, i) => ({
    ...transfer, id: 'tr-' + i, transferCode: 'TRF-PAGE-' + i, customer: { fullName: 'Khách trang sau ' + i },
  })), { ...transfer, id: 'other-transfer', assignedStaff: { id: 'other-staff' }, transferCode: 'TRF-OTHER' }];
  datasets.returns = [returnCase];
  datasets['damage-claims'] = [claim];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).click();
  await open('/transfers?limit=5');
  const transferTable = page.getByRole('table', { name: 'Chuyển kho' });
  await transferTable.getByText(customerName, { exact: true }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Yêu cầu chuyển kho từ khách hàng' }).count(), 0);
  assert.equal(await transferTable.getByRole('columnheader', { name: 'Thao tác' }).count(), 0);
  await transferTable.getByRole('button', { name: 'Sao chép mã hồ sơ TRF-SCOPED' }).click();
  assert.match(page.url(), /\/staff\/transfers\?limit=5$/);
  const transferPage = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === '/api/staff/management/transfers' && url.searchParams.get('limit') === '5' && url.searchParams.get('page') === '2';
  });
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await transferPage;
  await transferTable.getByText('TRF-PAGE-4', { exact: true }).waitFor();
  await page.getByRole('searchbox', { name: 'Tìm kiếm' }).fill(customerName);
  await transferTable.getByText('TRF-SCOPED', { exact: true }).waitFor();
  await transferTable.getByRole('link', { name: /Xem chi tiết hồ sơ TRF-SCOPED/ }).press('Space');
  await page.waitForURL('**/staff/transfers/finished-transfer');
  await heading('Kết quả chuyển kho').waitFor();
  assert.equal(await page.getByText('Bước tiếp theo', { exact: false }).count(), 0);
  await heading('Chuyển kho · SRC-01 → DST-01').waitFor();
  await page.getByText('Đã xác nhận di chuyển hàng', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Tải PDF', exact: true }).waitFor();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải PDF', exact: true }).click();
  assert.equal((await download).suggestedFilename(), 'TRF-SCOPED-BB.pdf');
  assert.equal(await page.getByText('Trạng thái hiện tại', { exact: true }).count(), 2);
  const transferHistory = page.getByText('Lịch sử xử lý', { exact: true });
  assert.equal(await transferHistory.evaluate(node => node.parentElement.open), false);
  await transferHistory.press('Enter');
  assert.equal(await page.locator('.record-event-list li').count(), 3);
  await page.locator('.record-event-list li').filter({ hasText: 'Phê duyệt' }).getByText(staff.fullName).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Hoàn tất chuyển kho', exact: true }).count(), 0);
  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.testPrinted = 'true'; }; });
  await page.getByRole('button', { name: 'In hồ sơ' }).click();
  assert.equal(await page.locator('html').getAttribute('data-test-printed'), 'true');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('details').filter({ hasText: 'Hồ sơ liên quan' }).evaluate(node => getComputedStyle(node, '::details-content').contentVisibility), 'visible');
  assert((await page.pdf()).subarray(0, 5).equals(Buffer.from('%PDF-')));
  await page.emulateMedia({ media: null });
  assert.equal(await page.getByText('Hồ sơ liên quan', { exact: true }).evaluate(node => node.parentElement.open), false);
  await page.getByText('Hồ sơ liên quan', { exact: true }).click();
  await page.getByRole('link', { name: support.supportCode, exact: true }).click();
  await page.waitForURL('**/staff/support-requests/support-id');
  await heading('Kết quả xử lý').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Hoàn tất hỗ trợ' }).count(), 0);
  await open('/support-requests');
  await page.getByRole('combobox', { name: 'Ưu tiên' }).selectOption('LOW');
  await heading('Không tìm thấy hồ sơ phù hợp').waitFor();
  await page.getByRole('combobox', { name: 'Ưu tiên' }).selectOption('HIGH');
  await page.getByRole('table').getByText('Đã xử lý hỗ trợ').waitFor();
  await open('/returns?status=PENDING_SETTLEMENT');
  const returnTable = page.getByRole('table', { name: 'Trả kho' });
  await returnTable.getByText('RT-SCOPED', { exact: true }).click();
  await page.waitForURL('**/staff/returns/scoped-return');
  await heading('Kết quả tiếp nhận kho').waitFor();
  await page.getByText('Ghi nhận hao mòn', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Hoàn tất nhận kho trả' }).count(), 0);
  assert.equal(await page.getByText('Đã quyết toán', { exact: true }).count(), 0);
  await page.getByRole('link', { name: 'MNT-LINK', exact: true }).click();
  await page.waitForURL('**/staff/maintenance/linked-repair');
  await heading('Kết quả bảo trì').waitFor();
  await page.getByText('Chờ quản lý nghiệm thu', { exact: true }).waitFor();
  await page.getByText('Hồ sơ liên quan', { exact: true }).click();
  await page.getByRole('link', { name: 'RT-SCOPED', exact: true }).click();
  await page.waitForURL('**/staff/returns/scoped-return');
  await shot('return-inspection-and-settlement-light');
  await open('/maintenance');
  const maintenanceTable = page.getByRole('table', { name: 'Bảo trì kho' });
  await maintenanceTable.getByText('MNT-LINK').waitFor();
  assert.equal(await page.getByText('Hướng dẫn xử lý bảo trì', { exact: true }).evaluate(node => node.parentElement.open), false);
  await maintenanceTable.getByRole('link', { name: /MNT-LINK/ }).press('Enter');
  await page.waitForURL('**/staff/maintenance/linked-repair');
  await open('/damage-claims?stage=resolved');
  const claimTable = page.getByRole('table', { name: 'Danh sách sự cố hàng hóa' });
  await claimTable.getByText('CLM-SCOPED').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Trang cuối' }).count(), 0);
  await claimTable.getByRole('link', { name: /CLM-SCOPED/ }).press('Enter');
  await page.waitForURL(/claim=claim-scoped/);
  await heading('Quyết định của quản lý').waitFor();
  await page.getByText('Chưa ghi nhận danh sách hàng bị ảnh hưởng.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /bồi thường|Ghi kết quả kiểm tra/i }).count(), 0);
  const refreshClaims = page.waitForRequest(request => request.method() === 'GET' && new URL(request.url()).searchParams.get('id') === claim.id);
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await refreshClaims;
  await page.getByText('Quản lý quyết định', { exact: true }).filter({ visible: true }).waitFor();
  assert.equal(await page.getByText('Bồi thường được duyệt', { exact: true }).count(), 0);
  await page.getByText('Lịch sử xử lý', { exact: true }).press('Enter');
  assert.equal(await page.locator('.record-event-list li').count(), 3);
  await page.getByText('Hồ sơ liên quan', { exact: true }).press('Enter');
  await page.getByText(contract.contractCode, { exact: true }).waitFor();

  datasets['damage-claims'].push({ ...claim, id: 'claim-needs-inspection', status: 'REPORTED', staffFacts: null,
    factsRecordedAt: null, decision: null, decisionReason: null, rentalContract: undefined, history: [],
    affectedItems: [{ id: 'affected', name: 'Thùng giấy', itemCode: 'ITEM-01', unit: 'thùng' }] });
  await open('/damage-claims?claim=claim-needs-inspection');
  await page.getByRole('button', { name: 'Ghi kết quả kiểm tra' }).waitFor();
  await page.getByText('Chờ quyết định xử lý.', { exact: true }).waitFor();
  await page.getByText('ITEM-01', { exact: false }).waitFor();
  assert.equal(await page.getByText('Hồ sơ liên quan', { exact: true }).count(), 0);

  datasets.transfers.push({ ...transfer, id: 'transfer-awaiting-handover', status: 'APPROVED', handoverReport: null,
    completedAt: null, completedBy: null, reservation: null, supportRequest: null });
  datasets.transfers.push({ ...transfer, id: 'transfer-historical', handoverReport: null, reservation: null, supportRequest: null });
  await open('/transfers/transfer-historical');
  await page.getByText('Chưa ghi nhận biên bản', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Tải PDF' }).count(), 0);
  assert.equal(await page.getByText('Hồ sơ liên quan', { exact: true }).count(), 0);
  await open('/transfers/transfer-awaiting-handover');
  await page.getByText('Chờ bàn giao', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Hoàn tất chuyển kho', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Duyệt chuyển kho' }).count(), 0);
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 850 });
    for (const path of ['/transfers', '/returns', '/support-requests', '/maintenance', '/damage-claims', '/damage-claims?claim=claim-scoped']) {
      await open(path);
      await (path.includes('?') ? heading('Quyết định của quản lý') : page.locator('main table')).waitFor();
      assert(!await overflow(), `${path} overflows at ${width}px`);
    }
  }
  await shot('damage-claim-detail-dark-mobile');
  await open('/transfers/other-transfer');
  await page.getByRole('alert').getByText('Không tìm thấy hồ sơ', { exact: false }).waitFor();
  datasets.maintenance = savedRepairs;
  for (const kind of ['transfers', 'returns', 'support-requests', 'damage-claims']) datasets[kind] = [];
  await open('/appointments/handover-other');
  await page.getByRole('alert').getByText('Không tìm thấy hồ sơ', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Xác nhận đã bàn giao giấy tờ và chìa khóa' }).count(), 0);
  fail = 'appointments';
  await open('');
  await page.getByText('Chưa tải được lịch bàn giao.', { exact: true }).waitFor();
  assert.deepEqual((await kpis.locator('strong').allTextContents()).slice(0, 2), ['—', '—']);
  fail = '';
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await page.getByRole('region', { name: 'Lịch sắp tới' }).getByRole('listitem').first().waitFor();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await open('/appointments?limit=5');
  const agenda = page.getByRole('group', { name: 'Xem lịch bàn giao' });
  await handovers.getByText('LONG-HANDOVER-TODAY', { exact: true }).waitFor();
  assert.deepEqual(await handovers.getByRole('columnheader').allTextContents(), [
    'Khách hàng / Kho', 'Ngày giờ hẹn', 'Người nhận', 'Trạng thái', 'Thao tác',
  ]);
  assert.equal(await handovers.locator('tbody tr').count(), 5);
  const searchAppointments = page.getByPlaceholder('Mã lịch, mã đặt kho, khách hàng…');
  await searchAppointments.fill('LONG-HANDOVER-LATE');
  await page.getByText('1–1 / 1 bản ghi', { exact: true }).waitFor();
  await handovers.getByText('Đã quá giờ', { exact: true }).waitFor();
  assert.equal(await handovers.locator('tbody tr').count(), 1);
  await searchAppointments.clear();
  await handovers.getByText('LONG-HANDOVER-TODAY', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Trang sau' }).click();
  await handovers.getByText('LONG-HANDOVER-COMPLETED', { exact: true }).waitFor();
  assert.equal(await handovers.locator('tbody tr').count(), 2);
  await agenda.getByRole('button', { name: 'Sắp tới', exact: true }).click();
  await handovers.getByText('tomorrow', { exact: true }).waitFor();
  assert.equal(await handovers.locator('tbody tr').count(), 4);
  await agenda.getByRole('button', { name: 'Hôm nay', exact: true }).click();
  await handovers.getByText('cancelled', { exact: true }).waitFor();
  assert.equal(await handovers.locator('tbody tr').count(), 2);
  await handovers.getByRole('row').filter({ hasText: 'cancelled' }).getByRole('link', { name: 'Xem chi tiết', exact: true }).click();
  await page.waitForURL('**/staff/appointments/cancelled');
  await page.locator('.staff-appointment-detail header').getByText('Đã hủy', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Xác nhận đã bàn giao/ }).count(), 0);
  await page.getByRole('link', { name: 'Về danh sách' }).click();
  await agenda.getByRole('button', { name: 'Đã hoàn tất', exact: true }).click();
  await handovers.getByText('LONG-HANDOVER-COMPLETED', { exact: true }).waitFor();
  await handovers.getByRole('link', { name: 'Xem chi tiết', exact: true }).click();
  await heading('Kết quả bàn giao').waitFor();
  for (const time of ['11:08 13/11/2026', '10:09 13/11/2026']) await page.getByText(time, { exact: true }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: /Xác nhận đã bàn giao/ }).count(), 0);
  const history = page.getByText('Lịch sử xử lý', { exact: true });
  assert.equal(await history.evaluate(element => element.parentElement.open), false);
  await page.getByText('Biên bản và ghi chú', { exact: true }).click();
  await page.getByText('Ghi chú bàn giao cũ', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.workspace-themed').getAttribute('data-workspace-theme'), 'light');
  await shot('handover-completed-desktop');

  const multi = {
    ...appointments[0], id: 'handover-multi', appointmentCode: 'MULTI-HANDOVER',
    reservation: { ...appointments[0].reservation, quantity: 2 },
    allocatedUnits: allocated.map(item => ({ unitId: item.id, unitCode: item.unitNumber, floor: item.floor, zone: item.zone })),
    unitHandoverProgress: [],
    handoverReadiness: { allowed: false, reason: 'Hóa đơn ban đầu phải được thanh toán đầy đủ trước khi bàn giao.', leadDays: 3 },
  };
  const requested = { ...multi, id: 'handover-requested', status: 'REQUESTED', handoverReadiness: { allowed: true, leadDays: 3 } };
  appointments.push(requested);
  await open('/appointments/handover-requested');
  await heading('Xác nhận lịch').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Xác nhận lịch bàn giao', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: /Xác nhận đã bàn giao/ }).count(), 0);
  appointments.push(multi);
  await open('/appointments/handover-multi#staff-processing');
  await heading('Chưa thể xử lý bàn giao').waitFor();
  assert.equal(await page.getByRole('button', { name: /Xác nhận đã bàn giao/ }).count(), 0);
  multi.handoverReadiness.allowed = true;
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await heading('Bàn giao kho').waitFor();
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 768, height: 900 });
  assert(!await overflow());
  await page.setViewportSize({ width: 390, height: 840 });
  await page.getByLabel('Hiện trạng kho MD-E06-002').fill('Khóa hoạt động tốt');
  await page.getByLabel('Xác nhận bàn giao kho MD-E06-002').check();
  await page.getByRole('button', { name: 'Ghi nhận bàn giao MD-E06-002' }).click();
  await page.getByText('Đã ghi nhận 1/2 kho.', { exact: true }).waitFor();
  const finishHandover = page.getByRole('button', { name: /Xác nhận đã bàn giao/ });
  assert.equal(await finishHandover.isEnabled(), false);
  await page.reload();
  await page.getByText('Đã ghi nhận 1/2 kho.', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Người nhận bàn giao' }).selectOption('AUTHORIZED');
  await page.getByLabel('Tên người được ủy quyền').fill('Đại diện nhận kho');
  await page.getByLabel('Căn cứ ủy quyền').fill('Đã đối chiếu giấy ủy quyền');
  await page.getByLabel('Hiện trạng kho MD-E06-004').fill('Có vết xước nhẹ');
  await page.getByLabel('Xác nhận bàn giao kho MD-E06-004').check();
  await page.getByRole('button', { name: 'Ghi nhận bàn giao MD-E06-004' }).click();
  await page.getByRole('button', { name: 'Ghi nhận bàn giao MD-E06-004' }).waitFor({ state: 'detached' });
  for (const name of ['Đã đối chiếu người nhận kho', 'Đã bàn giao chìa khóa/thẻ hoặc hướng dẫn truy cập', 'Đã giao giấy tờ bàn giao cho khách']) {
    await page.getByLabel(name).check();
  }
  await page.getByLabel('Số chìa khóa/thẻ đã giao').fill('2');
  assert.equal(await finishHandover.evaluate(button => button.form.checkValidity()), true);
  assert(!await overflow());
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('handover-multi-mobile');
  await finishHandover.click();
  await heading('Kết quả bàn giao').waitFor();
  await page.getByText('Đại diện nhận kho · Được ủy quyền', { exact: true }).waitFor();
  await page.getByRole('list', { name: 'Kết quả kiểm tra từng kho' }).getByText('Có vết xước nhẹ').waitFor();
  assert.equal(await finishHandover.count(), 0);
  assert.equal(handoverWrites.length, 1);
  assert.deepEqual(unitHandoverWrites.map(check => check.unitId), allocated.map(item => item.id));
  assert.equal(handoverWrites[0].handoverReport.unitInspected, true);

  const stockUnit = { id: 'stock-verified-unit', unitNumber: 'KHO-A101', floor: 'Tầng 1', zone: 'A' };
  const stockFixture = fixture['stock-movements'][0];
  const receivedStock = {
    ...stockFixture, id: 'stock-early', movementCode: 'MOV-NHAP-SOM',
    scheduledAt: '2026-12-14T05:12:00Z', completedAt: '2026-11-14T03:44:36Z',
    assignedAt: '2026-11-13T03:00:00Z', assignedBy: { fullName: 'Quản lý kiểm thử' },
    currentStorageUnit: stockUnit, storageUnitAtCompletion: stockUnit,
    rentalContract: { ...stockFixture.rentalContract, reservation: { id: confirmed.id, reservationCode: confirmed.reference } },
    lines: [
      { ...stockFixture.lines[0], storedItem: { ...stockFixture.lines[0].storedItem, balance: 1 } },
      { ...stockFixture.lines[0], id: 'line-2', requestedQty: 2, actualQty: 2, storedItem: { ...stockFixture.lines[0].storedItem, name: 'Hộp tài liệu', balance: 0 } },
      { ...stockFixture.lines[0], id: 'line-3', requestedQty: 2, actualQty: 2, storedItem: { ...stockFixture.lines[0].storedItem, name: 'Hộp phụ kiện', balance: 3 } },
    ],
  };
  const deliveredStock = {
    ...receivedStock, id: 'stock-on-time', movementCode: 'MOV-XUAT', type: 'OUT',
    completedAt: receivedStock.scheduledAt, storageUnitAtCompletion: null,
    completionNote: 'Khách chỉ nhận hai thùng.',
    lines: [{ ...receivedStock.lines[0], requestedQty: 3, actualQty: 2 }],
  };
  const waitingStock = {
    ...receivedStock, id: 'stock-waiting', movementCode: 'MOV-CHO', status: 'ASSIGNED',
    scheduledAt: null, completedAt: null, completedBy: null, storageUnitAtCompletion: null,
    lines: [{ ...receivedStock.lines[0], actualQty: null }],
  };
  datasets['stock-movements'] = [receivedStock, deliveredStock, waitingStock,
    ...Array.from({length: 4}, (_, index) => ({ ...deliveredStock, id: 'stock-completed-' + index, movementCode: 'MOV-XUAT-' + index })),
    { ...waitingStock, id: 'stock-other', movementCode: 'MOV-KHAC', assignedStaff: { id: 'other-staff' } }];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open('/stock-movements?limit=5');
  const stockTable = page.getByRole('table', { name: 'Danh sách phiếu nhập – xuất' });
  const receivedRow = stockTable.getByRole('row').filter({ hasText: 'MOV-NHAP-SOM' });
  await receivedRow.getByText('12:12 14/12/2026', { exact: true }).waitFor();
  assert.deepEqual(await stockTable.getByRole('columnheader').allTextContents(), ['Khách hàng / Kho', 'Loại phiếu', 'Hàng hóa', 'Lịch hẹn', 'Trạng thái']);
  await receivedRow.getByText('3 mặt hàng · 8 thùng', { exact: true }).waitFor();
  await stockTable.getByText('Chưa hẹn', { exact: true }).waitFor();
  assert.equal(await receivedRow.evaluate(row => getComputedStyle(row).cursor), 'pointer');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await receivedRow.getByRole('button', { name: /Sao chép.*MOV-NHAP-SOM/i }).click();
  await receivedRow.getByText('Đã sao chép').waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'MOV-NHAP-SOM');
  assert.equal(new URL(page.url()).pathname, '/staff/stock-movements');
  const rowLink = receivedRow.getByRole('link', { name: 'Xem chi tiết phiếu MOV-NHAP-SOM', exact: true });
  await rowLink.focus();
  await rowLink.press('Space');
  await heading('Nhập hàng · KHO-A101').waitFor();
  await page.getByText('Hoàn tất sớm', { exact: true }).waitFor();
  await page.getByText('10:44 14/11/2026', { exact: true }).first().waitFor();
  await page.getByText('Đã nhập đủ số lượng.', { exact: true }).waitFor();
  const stockResults = page.getByRole('table', { name: 'Số lượng hàng giao nhận' });
  await stockResults.getByRole('columnheader', { name: 'Còn trong kho', exact: true }).waitFor();
  assert.deepEqual(await stockResults.getByRole('row').filter({hasText:'Thùng hồ sơ'}).getByRole('cell').allTextContents(), ['4 thùng','4 thùng','1 thùng']);
  assert.equal(await page.getByRole('button', { name: 'Hoàn tất phiếu', exact: true }).count(), 0);
  const relatedStock = page.getByText('Hồ sơ liên quan', { exact: true });
  assert.equal(await relatedStock.evaluate(summary => summary.parentElement.open), false);
  const stockHistory = page.getByText('Lịch sử xử lý', { exact: true });
  assert.equal(await stockHistory.evaluate(summary => summary.parentElement.open), false);
  await stockHistory.click();
  await page.getByText('Hoàn tất giao nhận', { exact: true }).waitFor();
  await relatedStock.click();
  assert.equal(await page.getByRole('link', { name: confirmed.reference, exact: true }).count(), 0);
  await shot('stock-completed-desktop');
  await page.getByRole('link', { name: 'Về danh sách' }).click();
  await stockTable.getByText('MOV-XUAT', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await stockTable.getByText('MOV-XUAT-3', { exact: true }).waitFor();
  await page.getByLabel('Loại phiếu', { exact: true }).selectOption('OUT');
  await stockTable.getByText('MOV-XUAT', { exact: true }).waitFor();
  assert.equal(await stockTable.locator('tbody tr').count(), 5);
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('ASSIGNED');
  await heading('Chưa có phiếu phù hợp').waitFor();
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('COMPLETED');
  await page.getByRole('searchbox', { name: 'Tìm phiếu' }).fill('MOV-XUAT-2');
  await stockTable.getByText('MOV-XUAT-2', { exact: true }).waitFor();
  await page.getByText('1–1 / 1 bản ghi', { exact: true }).waitFor();
  await stockTable.locator('tbody tr td').first().click();
  await page.waitForURL('**/staff/stock-movements/stock-completed-2');
  await page.getByText('Chênh lệch 1 thùng (thiếu).', { exact: true }).waitFor();
  await page.getByText('Khách chỉ nhận hai thùng.', { exact: true }).waitFor();
  assert.equal(await page.getByText('Hoàn tất sớm', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).click();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(!await overflow());
  assert(await page.locator('.staff-stock-results .stock-result-table').evaluate(table => table.scrollWidth <= table.clientWidth + 1));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('stock-completed-mobile-light');
  await open('/stock-movements/stock-other');
  await page.getByRole('alert').getByText('Không tìm thấy hồ sơ').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Hoàn tất phiếu' }).count(), 0);
  await open('/stock-movements/stock-waiting#staff-processing');
  await page.getByRole('spinbutton', { name: /Số lượng thực tế/ }).fill('3');
  await page.getByRole('checkbox', { name: /Tôi đã kiểm đếm/ }).check();
  const completeStock = page.getByRole('button', { name: 'Hoàn tất phiếu', exact: true });
  assert.equal(await completeStock.evaluate(button => button.form.checkValidity()), false);
  await page.getByLabel(/Ghi chú kiểm đếm/).fill('Khách giao 3 thùng.');
  await completeStock.click();
  await heading('Kết quả nhập – xuất').waitFor();
  await page.getByText('Chênh lệch 1 thùng (thiếu).', { exact: true }).waitFor();
  assert.equal(await completeStock.count(), 0);
  assert.deepEqual(stockWrites, [{ note: 'Khách giao 3 thùng.', lines: [{ lineId: 'line-id', actualQty: 3 }] }]);
  await open('/stock-movements?status=ASSIGNED');
  await heading('Chưa có phiếu phù hợp').waitFor();

  const stored = {
    ...receivedStock.lines[0].storedItem, id: 'staff-stored-item', itemCode: 'STORED-01', name: 'Thùng chứng từ',
    currentStorageUnit: stockUnit, customer, rentalContract: receivedStock.rentalContract,
  };
  datasets['stored-items'] = [stored, ...Array.from({ length: 6 }, (_, index) => ({
    ...stored, id: `more-stock-${index}`, itemCode: `STORED-MORE-${index}`, name: `Thùng lưu trữ ${index}`,
  }))];
  stockItemHistory.set(stored.id, [
    { id: 'history-in', type: 'IN', actualQty: 4, unit: 'thùng', movementCode: receivedStock.movementCode, movementId: receivedStock.id, completedAt: receivedStock.completedAt },
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `history-out-${index}`, type: 'OUT', actualQty: 1, unit: 'thùng', movementCode: `REF-${index}`, movementId: null, completedAt: receivedStock.completedAt,
    })),
  ]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open('/stored-items?limit=5');
  const storedTable = page.getByRole('table', { name: 'Hàng đang lưu', exact: true });
  const storedRow = storedTable.getByRole('row').filter({ hasText: 'STORED-01' });
  await storedRow.waitFor();
  assert.deepEqual(await storedTable.getByRole('columnheader').allTextContents(), ['Mặt hàng', 'Kho hiện tại', 'Khách thuê', 'Đang lưu']);
  await storedRow.getByRole('button', { name: /Sao chép.*STORED-01/i }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'STORED-01');
  assert.equal(await page.getByRole('dialog').count(), 0);
  const storedSearch = page.getByPlaceholder('Tìm mặt hàng, kho hoặc khách hàng...');
  await storedSearch.fill('STORED');
  await storedRow.getByRole('button', { name: stockUnit.unitNumber, exact: true }).click();
  await page.getByText(`Kho ${stockUnit.unitNumber}`, { exact: true }).waitFor();
  await page.getByText('1–5 / 7 bản ghi', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await page.getByText('6–7 / 7 bản ghi', { exact: true }).waitFor();
  await storedSearch.fill('STORED-01');
  await page.getByText('1–1 / 1 bản ghi', { exact: true }).waitFor();
  await page.reload();
  await storedRow.waitFor();
  assert.equal(new URL(page.url()).searchParams.get('storageUnitId'), stockUnit.id);
  await storedRow.getByRole('button', { name: /Xem mặt hàng Thùng chứng từ/ }).press('Enter');
  const inventoryDialog = page.getByRole('dialog', { name: stored.name });
  await inventoryDialog.getByText('1 thùng', { exact: true }).waitFor();
  assert.equal(stockHistoryReads, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await inventoryDialog.getByText('Lịch sử nhập – xuất', { exact: true }).click();
  const historyTable = inventoryDialog.getByRole('table', { name: 'Giao dịch của mặt hàng' });
  await historyTable.getByText('+4 thùng', { exact: true }).waitFor();
  assert.equal(await historyTable.getByRole('link', { name: 'REF-0' }).count(), 0);
  assert(await inventoryDialog.locator('.portal-dialog-body').evaluate(body => body.scrollWidth <= body.clientWidth + 1));
  await inventoryDialog.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await historyTable.getByText('REF-4', { exact: true }).waitFor();
  await inventoryDialog.getByRole('button', { name: 'Trang trước', exact: true }).click();
  await historyTable.getByRole('link', { name: receivedStock.movementCode }).click();
  await heading('Nhập hàng · KHO-A101').waitFor();
  await page.getByRole('link', { name: 'Về danh sách' }).click();
  await storedRow.waitFor();
  assert.equal(new URL(page.url()).searchParams.get('search'), 'STORED-01');
  await page.getByRole('button', { name: 'Bỏ lọc', exact: true }).click();
  await storedRow.waitFor();
  assert(!new URL(page.url()).searchParams.has('storageUnitId'));
  await open('/stored-items?storageUnitId=outside');
  await page.getByRole('alert').getByText('Bạn không có quyền xem hàng tại kho này.').waitFor();

  datasets.appointments = [];
  datasets['stock-movements'] = [];
  datasets.maintenance = [];
  await open('');
  await page.getByText('Không có việc cần xử lý.', { exact: true }).waitFor();
  await page.getByText('Không có lịch bàn giao trong khoảng này.', { exact: true }).waitFor();
  assert.deepEqual(await kpis.locator('strong').allTextContents(), ['0', '0', '0', '0']);
  await open('/appointments?agenda=today');
  await page.getByText('Không có lịch bàn giao hôm nay.', { exact: true }).waitFor();

  assignmentEnabled = false;
  await open('/assigned-units');
  await heading('Phân công theo kho chưa được bật').waitFor();
  await open('/rentals');
  await heading('Phân công theo kho chưa được bật').waitFor();
  await page.goto(base + '/manager');
  await page.waitForURL('**/staff');
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(unitCheckRequests, []);
  assert(scopedRequests.length > 0 && scopedRequests.every(query => query.role === 'staff' && query.assigned === 'true'));
  console.log('PASS Staff workspace: dashboard, booking, handover, stock, five operational routes, print, permissions and responsive themes');
} finally {
  await browser.close();
}
