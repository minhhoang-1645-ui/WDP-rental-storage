import { chooseDate, openCalendar } from './browser-test.mjs';
// Browser regression: every API/SSE request is mocked, no shared database access.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { selectChoice } from './select-choice.mjs';
import { mkdir } from 'node:fs/promises';
const browser = await launchTestBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const base = process.env.WDP_FE_URL || 'http://localhost:5173';
let failed = false, snapshotFailed = false, releaseReport;
const reportDate = '2026-11-10';
const queries = [], writes = [], errors = [], listQueries = [];
const retiredFinance = ['payment-submissions', 'online-payment-reconciliations'];
const retiredRequests = [];
const reportCategories = [
  { id: 'small', code: 'SM-B12', name: 'Kho nhỏ B12', requests: 2, confirmed: 1, physicalUnits: 5, occupied: 3, rent: 7500000 },
  { id: 'medium', code: 'MD-D04', name: 'Kho vừa D04', requests: 1, confirmed: 1, physicalUnits: 10, occupied: 5, rent: 3000000 },
  ...['AP-001', 'AP-002', 'RN-001', 'RT-001', 'BP-001'].map((code, index) => ({
    id: code, code, name: ['Appointment product', 'Appointment product', 'Renewal product', 'Return product', 'Billing product'][index],
    requests: 0, confirmed: 0, physicalUnits: 3, occupied: 0, rent: index === 0 ? 2000000 : 0,
  })),
];
const report = {
  asOf: '2026-11-10T09:00:00Z', period: { from: null, to: null, timeZone: 'Asia/Ho_Chi_Minh' }, units: { total: 120, occupied: 30, available: 75, reserved: 5, maintenance: 10, utilizationPercent: 25 }, activeContracts: 31,
  finance: { unpaidInvoices: 2, outstandingAmount: 600000, collectedAmount: 3000000, paymentCount: 1, depositOnFullyPaidInvoices: 1500000, approvedRefundOutstanding: 1000000 },
  queue: { unassignedStock: 1, unassignedSupport: 0, unassignedMaintenance: 0,
    unassignedAppointments: 0, unassignedReturns: 0, unassignedTransfers: 0, unassignedClaims: 0,
    escalatedSupport: 0, maintenanceReview: 0, earlyReturnReview: 1, transferReview: 0, renewalReview: 0, damageReview: 0,
    paymentVerification: 1, depositReview: 0, onlineReconciliation: 1 },
  workload: [{ id: 'staff', fullName: 'Nhân viên kiểm thử', accountStatus: 'ACTIVE', stock: 3, support: 0, maintenance: 0 }],
};
const addon = { id: 'addon', code: 'SHELF', name: 'Kệ kiểm thử', physicalUnit: 'bộ', billingUnit: 'MONTH', kind: 'RENTAL', unitPrice: 150000, isActive: true };
const customer = { fullName: 'Khách kiểm thử', email: 'customer@example.test' };
const refund = { id: 'refund', settlementCode: 'DEP-REFUND', status: 'APPROVED', depositAmount: 500000, refundAmount: 500000, outstandingAmount: 0, refundedAt: null, issues: [], physicalInspections: [{ unit: { unitCode: 'MD-D04-002' } }], updatedAt: report.asOf, reservation: { id: 'r', reference: 'R-TEST', customer } };
const settlements = [refund,
  { ...refund, id: 'no-refund', settlementCode: 'DEP-NO-REFUND', refundAmount: 0 },
  { ...refund, id: 'already-refunded', settlementCode: 'DEP-REFUNDED', refundedAt: report.asOf },
  { ...refund, id: 'settled', settlementCode: 'DEP-SETTLED', status: 'SETTLED' },
];
const pendingMovement = { id: 'needs-assignment', movementCode: 'MOV-ASSIGN', type: 'IN', status: 'REQUESTED', customer, currentStorageUnit: { unitNumber: 'MD-D04-002' }, createdAt: report.asOf };
const earlyReturn = { id: 'early', supportCode: 'SUP-EARLY', subject: 'Đề nghị trả kho trước hạn', status: 'OPEN', customer, createdAt: report.asOf };
let units = report.units;
let extraDeposits = false;
const invoice = { id: 'invoice', invoiceCode: 'INV-TEST', type: 'INITIAL', status: 'OPEN', totalAmount: 3000000, balanceDue: 2000000, amountPaid: 1000000, rentalAmount: 1500000, depositAmount: 1500000, serviceAmount: 0, chargeAmount: 0, issuedAt: report.asOf, reservation: { id: 'r', reference: 'R-TEST', customer }, contracts: [{ id: 'contract', contractCode: 'C-TEST' }] };
const payment = { id: 'pay', paymentCode: 'PAY-TEST', method: 'VNPAY', amount: 1000000, receivedAt: report.asOf, invoice: { id: invoice.id, invoiceCode: invoice.invoiceCode, reservation: invoice.reservation } };
const physicalUnit = { id: 'unit', unitCode: 'MD-D04-002', status: 'OCCUPIED', floor: 'Tầng 1', zone: 'D04', storageType: { name: 'Kho vừa' }, allocationSummary: { current: { customer } } };
const staff = [{ id: 'staff', fullName: 'Nhân viên kiểm thử', email: 'staff@example.test' }, { id: 'staff2', fullName: 'Nhân viên thay ca', email: 'ca2@example.test' }];
let unitAssignments = [];
let transferStatus;
const earlyReturnHistory = { ...earlyReturn, id: 'past-early', supportCode: 'SUP-EARLY-PAST', status: 'RESOLVED', decision: 'APPROVED' };
const pendingSettlement = { ...refund, id: 'pending-deposit', settlementCode: 'DEP-PENDING', status: 'PENDING_REVIEW', createdAt: report.asOf };
const depositHistory = Array.from({ length: 21 }, (_, index) => ({ ...refund, id: `deposit-${index}`, settlementCode: `DEP-HISTORY-${String(index).padStart(2, '0')}`, status: 'SETTLED' }));

const quote = { paymentPlan: 'PAY_MONTHLY', billingMode: 'MONTHLY', termMonths: 3, monthlyUnitPrice: 1500000, baseRentalAmount: 4500000, discountPercent: 0, discountAmount: 0, rentalAmount: 4500000, depositAmount: 1500000, purchaseAddOnAmount: 0, rentalAddOnAmount: 0, quotedTotalAmount: 6000000, initialPaymentBreakdown: { rentalAmount: 1500000, depositAmount: 1500000, purchaseAddOnAmount: 0, rentalAddOnAmount: 0, totalAmount: 3000000, remainingAmount: 3000000 } };
const contract = { ...invoice.contracts[0], status: 'ACTIVE', reservation: invoice.reservation, storageUnit: physicalUnit, reservationPricing: quote };
await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'fixture-MANAGER'));
await context.route('**/*', async route => {
  const request = route.request();
  if (!['fetch', 'xhr', 'eventsource'].includes(request.resourceType())) return route.continue();
  const url = new URL(request.url()), path = url.pathname.replace(/^\/(?:api\/)?/, '');
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  if (path.startsWith('manager/') && retiredFinance.includes(path.split('/')[1])) {
    retiredRequests.push(path);
    return route.fulfill({ status: 404, json: { message: 'Nghiệp vụ đã bỏ khỏi Manager Web.' } });
  }
  if (request.method() !== 'GET') {
    const body = request.postDataJSON();
    writes.push({ path, body });
    if (path.endsWith('/needs-assignment/assign')) pendingMovement.assignedStaff = { id: body.staffUserId, fullName: body.staffUserId === 'staff' ? 'Nhân viên kiểm thử' : 'Nhân viên thay ca' };
    if (path === 'manager/units/unit/staff-assignment') {
      unitAssignments = [{ id: `unit-assignment-${body.staffUserId}`, storageUnitId: 'unit', storageUnit: { unitNumber: physicalUnit.unitCode }, staff: { ...staff.find(person => person.id === body.staffUserId), accountStatus: 'ACTIVE' }, assignedBy: { fullName: 'Quản lý kiểm thử' } }];
    }
    return route.fulfill({ json: addon });
  }
  const sendPage = rows => {
    const page = Number(url.searchParams.get('page') || 1);
    const limit = Number(url.searchParams.get('limit') || 20);
    const status = url.searchParams.get('status');
    const term = url.searchParams.get('search')?.toLowerCase();
    const items = rows.filter(row => (!status || row.status === status) && (!term || JSON.stringify(row).toLowerCase().includes(term)));
    listQueries.push({ path, page, limit, status });
    return route.fulfill({ json: { page, limit, total: items.length, items: items.slice((page - 1) * limit, page * limit) } });
  };
  if (path === 'auth/me') return route.fulfill({ json: { id: 'manager', fullName: 'Quản lý kiểm thử', email: 'manager@example.test', role: 'FACILITY_MANAGER' } });
  if (path === 'manager/dashboard/analytics') {
    queries.push(Object.fromEntries(url.searchParams));
    if (snapshotFailed) return route.fulfill({ status: 503, json: { message: 'Không thể tải tổng hợp hiện tại.' } });
    return route.fulfill({ json: { ...report, units } });
  }
  if (path === 'manager/reports') {
    const dates = Object.fromEntries(url.searchParams);
    queries.push({ report: true, ...dates });
    if (failed) return route.fulfill({ status: 503, json: { message: 'Không thể tải số liệu báo cáo.' } });
    const single = dates.from === reportDate && dates.to === reportDate;
    const empty = dates.from === '2026-01-01' && dates.to === '2026-01-01';
    if (empty && releaseReport) await releaseReport;
    const dateKey = date => {
      if (dates.group === 'year') return date.slice(0, 4);
      if (dates.group === 'month') return date.slice(0, 7);
      if (dates.group !== 'week') return date;
      const day = new Date(date);
      day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
      return day.toISOString().slice(0, 10);
    };
    const amounts = new Map();
    const add = (date, received) => { const key = dateKey(date); amounts.set(key, (amounts.get(key) ?? 0) + received); };
    if (!empty) {
      if (single || dates.from === dates.to) add(dates.to, single ? 1000000 : 3000000);
      else { add(dates.from, 2000000); add(dates.to, 1000000); }
    }
    const times = [...amounts].map(([date, received]) => ({ date, received }));
    const categories = empty ? [] : reportCategories.filter(item => !dates.typeId || dates.typeId === item.id);
    return route.fulfill({ json: {
      asOf: report.asOf, filters: dates, received: empty ? 0 : single ? 1000000 : 3000000, bookingCount: empty ? 0 : single ? 2 : 3,
      allocatedUnits: empty ? 0 : 3, debt: empty ? 0 : 9900000, rent: empty ? 0 : 12500000, deposit: empty ? 0 : 1500000, paid: empty ? 0 : 4000000, total: empty ? 0 : 14000000,
      overdue: empty ? 0 : 800000, invoiceCount: empty ? 0 : 3, paymentCount: empty ? 0 : 3,
      confirmedCount: empty ? 0 : 2, voidCount: empty ? 0 : 1, categories, unitSummary: [], times,
    } });
  }
  if (path === 'manager/reports/invoices.csv') {
    queries.push({ invoiceCsv: true, ...Object.fromEntries(url.searchParams) });
    return route.fulfill({ contentType: 'text/csv; charset=utf-8', body: '"Mã hóa đơn","Cọc VND"\r\n"INV-TEST","1500000"' });
  }
  if (path === 'manager/storage-types') return route.fulfill({ json: { items: reportCategories.map(({ id, code, name }) => ({ id, code, name })) } });
  if (path === 'manager/additional-services') return route.fulfill({ json: [addon] });
  if (path === 'manager/staff') return sendPage(staff);
  if (path === 'manager/unit-staff-assignments') return route.fulfill({ json: { enabled: true, items: unitAssignments } });
  if (path === 'manager/deposit-settlements') return sendPage(extraDeposits ? [pendingSettlement, ...settlements, ...depositHistory] : settlements);
  if (path === 'manager/deposit-settlements/pending-deposit') return route.fulfill({ json: pendingSettlement });
  if (path === 'manager/deposit-settlements/refund') return route.fulfill({ json: refund });
  if (path === 'manager/support-requests') return sendPage([{ ...earlyReturn, status: 'ESCALATED' }, ...(transferStatus ? [{
    id: 'linked-transfer-support', supportCode: 'SUP-TRANSFER', subject: 'Yêu cầu chuyển kho', status: 'ESCALATED', customer, createdAt: report.asOf, transfers: [{ id: 'transfer', status: transferStatus }],
  }] : [])]);
  if (path === 'manager/transfers') return sendPage(transferStatus ? [{
    id: 'transfer', transferCode: 'TRF-TEST', status: transferStatus, customer, fromUnit: { unitCode: physicalUnit.unitCode }, createdAt: report.asOf,
    ...(transferStatus === 'APPROVED' ? { assignedStaff: staff[0] } : {}),
  }] : []);
  if (path === 'manager/early-return-requests') return sendPage([earlyReturn, earlyReturnHistory]);
  if (path === 'manager/invoices') return sendPage([invoice]);
  if (path === 'manager/contracts') return sendPage([contract]);
  if (path === 'manager/contracts/contract') return route.fulfill({ json: contract });
  if (path === 'manager/payments') return sendPage([payment]);
  if (path === 'manager/units') return sendPage([physicalUnit]);
  if (path === 'manager/additional-services/inventory') return route.fulfill({ json: [{ serviceId: 'addon', rentalCapacity: 5 }] });
  if (path === 'manager/invoices/invoice') return route.fulfill({ json: { id: 'invoice', invoiceCode: 'INV-TEST', type: 'INITIAL', status: 'OPEN', totalAmount: 3000000, balanceDue: 3000000, amountPaid: 0, rentalAmount: 1500000, depositAmount: 1500000, serviceAmount: 0, chargeAmount: 0, historicalPricing: quote, reservation: { id: 'r', reference: 'R-TEST' } } });
  if (path === 'manager/stored-items') return route.fulfill({ json: { page: 1, limit: 20, total: 1, items: [{ id: 'item', itemCode: 'ITEM-TEST', name: 'Thùng hồ sơ', unit: 'thùng', balance: 2, customer: { fullName: 'Khách kiểm thử' }, rentalContract: { id: 'contract', contractCode: 'C-TEST' }, currentStorageUnit: { id: 'unit', unitNumber: 'MD-D04-002', floor: 'Tầng 1', zone: 'D04' } }] } });
  const completedMovement = { id: 'movement', movementCode: 'MOV-TEST', type: 'IN', status: 'COMPLETED', assignedStaff: { id: 'staff', fullName: 'Nhân viên kiểm thử' }, completedBy: { fullName: 'Nhân viên kiểm thử' }, completedAt: report.asOf, completionNote: 'Khách mang thiếu một thùng', currentStorageUnit: { unitNumber: 'MD-D04-002' }, lines: [{ id: 'line', requestedQty: 3, actualQty: 2, storedItem: { name: 'Thùng hồ sơ', unit: 'thùng', balance: 2 } }] };
  if (path === 'manager/stock-movements') return sendPage([pendingMovement, completedMovement]);
  if (path === 'manager/stock-movements/movement') return route.fulfill({ json: completedMovement });
  return route.fulfill({ json: { page: 1, limit: 20, total: 0, items: [] } });
});
const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${base}/manager/reports`);
  await page.getByRole('heading', { name: 'Báo cáo', exact: true }).waitFor();
  const metrics = page.locator('.manager-report-metric');
  const metric = name => metrics.filter({ has: page.getByText(name, { exact: true }) }).locator('strong');
  const tabs = name => page.getByRole('tab', { name, exact: true });
  const period = page.getByLabel('Khoảng thời gian báo cáo');
  await metric('Công nợ hiện tại').getByText(/600\.000/).waitFor();
  await metric('Tiền thuê trên hóa đơn').getByText(/12\.500\.000/).waitFor();
  assert.deepEqual(await metrics.locator('strong').allTextContents().then(values => values.map(value => value.replace(/\s/g, ' '))), ['3.000.000 ₫', '12.500.000 ₫', '600.000 ₫']);
  assert.equal(await page.locator('.manager-report-chart').count(), 1);
  assert.equal(await page.getByLabel('Từ ngày', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('table').count(), 0);
  const paymentChart = page.getByRole('region', { name: 'Tiền đã nhận theo thời gian' });
  const bars = paymentChart.locator('.manager-report-bars li');
  assert(await bars.count() >= 4);
  await paymentChart.getByRole('button', { name: /2\.000\.000/ }).focus();
  await paymentChart.locator('.manager-report-point').getByText(/2\.000\.000/).waitFor();
  assert(await paymentChart.locator('[data-zero="true"]').count() > 0);
  await tabs('Tài chính').press('ArrowRight');
  await tabs('Kho & vận hành').waitFor();
  await metric('Kho đang dùng').getByText('30 / 120 kho').waitFor();
  assert.deepEqual(await metrics.locator('strong').allTextContents(), ['30 / 120 kho', '75', '3']);
  const storageChart = page.getByRole('region', { name: 'Tình trạng kho hiện tại' });
  assert.equal(await storageChart.getByRole('listitem').locator('strong').allTextContents().then(items => items.reduce((sum, value) => sum + Number(value), 0)), 120);
  await storageChart.getByText('Kho đang giữ').waitFor();
  const operationsDetails = page.getByText('Chi tiết vận hành', { exact: true });
  assert.equal(await page.getByRole('table').count(), 0);
  await operationsDetails.click();
  await page.getByRole('rowheader', { name: 'Kho vừa D04' }).waitFor();
  const operationalDetails = page.locator('.manager-report-operational-metrics');
  assert.deepEqual(await operationalDetails.locator('strong').allTextContents(), ['2', '3', '31']);
  await operationalDetails.getByText('Hợp đồng đang thuê', { exact: true }).waitFor();
  await operationalDetails.getByRole('button', { name: 'Cách tính kho từng được phân bổ' }).focus();
  await operationalDetails.getByRole('tooltip').filter({ hasText: 'kho đã trả hoặc đã chuyển đi' }).waitFor();
  const bookingsByType = page.getByRole('region', { name: 'Đơn đặt theo loại kho' });
  await verifyReportTable(bookingsByType);
  await bookingsByType.getByLabel('Sắp xếp').selectOption('confirmed');
  assert.match(await bookingsByType.getByRole('rowheader').first().innerText(), /Kho nhỏ B12/);
  await bookingsByType.getByRole('rowheader', { name: 'Kho nhỏ B12' }).click();
  const categoryDialog = page.getByRole('dialog', { name: 'Đơn đặt theo loại kho · Kho nhỏ B12' });
  await categoryDialog.getByText('Đơn đã xác nhận trong kỳ', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await categoryDialog.waitFor({ state: 'hidden' });
  await page.getByLabel('Lọc loại kho báo cáo').selectOption('small');
  await page.getByRole('rowheader', { name: 'Kho vừa D04' }).waitFor({ state: 'hidden' });
  await page.getByRole('rowheader', { name: 'Kho nhỏ B12' }).waitFor();
  assert.equal(await metric('Kho đang dùng').innerText(), '30 / 120 kho');
  await operationsDetails.click();
  await page.getByRole('table').waitFor({ state: 'hidden' });
  await tabs('Tài chính').click();
  await paymentChart.waitFor();
  const snapshotCalls = queries.filter(query => !query.report).length;
  for (const [key, group, days] of [['today', 'day', 1], ['week', 'day', 7], ['month', 'week', 30], ['quarter', 'week', null]]) {
    const response = page.waitForResponse(result => new URL(result.url()).pathname.endsWith('/manager/reports'));
    await period.selectOption(key);
    await response;
    await paymentChart.getByRole('button', { name: /₫/ }).first().waitFor();
    const query = queries.findLast(query => query.report && !query.typeId);
    assert.equal(query.group, group);
    if (days !== null) assert.equal((Date.parse(query.to) - Date.parse(query.from)) / 86400000 + 1, days);
  }
  assert.equal(queries.filter(query => !query.report).length, snapshotCalls, 'Changing period must not refetch filtered current balances');
  await period.selectOption('custom');
  await chooseDate(page, 'Từ ngày', reportDate);
  const endCalendar = await openCalendar(page, 'Đến ngày', reportDate);
  assert(await endCalendar.getByRole('button', { name: '09/11/2026' }).isDisabled());
  await endCalendar.getByRole('button', { name: '10/11/2026' }).click();
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await metric('Tiền đã nhận').getByText(/1\.000\.000/).waitFor();
  assert.match(await metric('Công nợ hiện tại').innerText(), /600\.000/);
  assert.equal(await paymentChart.locator('.manager-report-bars li').count(), 1);
  await page.getByText('Chi tiết tài chính', { exact: true }).click();
  const financePanel = page.getByRole('tabpanel', { name: 'Tài chính' });
  const financialDetails = financePanel.locator('.manager-financial-details');
  const financialCards = financialDetails.locator('.manager-financial-card');
  const financialValues = () => financialCards.locator('dd').allInnerTexts().then(values => values.map(value => value.replace(/\s/g, ' ')));
  assert.deepEqual(await financialCards.locator('h3').allTextContents(), ['Khoản thu', 'Hóa đơn', 'Tiền cọc']);
  assert.deepEqual(await financialValues(), ['3', '2', '800.000 ₫', '1', '1.500.000 ₫', '1.000.000 ₫']);
  await financialDetails.getByRole('button', { name: 'Cách tính tiền quá hạn' }).focus();
  await financialDetails.getByRole('tooltip').filter({ hasText: 'Số dư còn phải thu' }).waitFor();
  const rentByType = page.getByRole('region', { name: 'Tiền thuê theo loại kho' });
  await rentByType.getByRole('rowheader', { name: /SM-B12/ }).waitFor();
  assert.match(await rentByType.getByRole('rowheader').first().innerText(), /SM-B12/);
  await verifyReportTable(rentByType);
  await Promise.all([
    page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/manager/reports') && url.searchParams.get('group') === 'week'
        && url.searchParams.get('from') === reportDate && !url.searchParams.get('typeId') && response.ok();
    }),
    page.getByLabel('Gom biểu đồ theo').selectOption('week'),
  ]);
  await page.waitForURL(url => url.searchParams.get('group') === 'week');
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Xuất KPI tài chính CSV', exact: true }).click(),
  ]);
  const chunks = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.match(file.suggestedFilename(), /2026-11-10-2026-11-10\.csv$/);
  assert.match(csv, /Cọc trên hóa đơn trả đủ trong kỳ/);
  assert.match(csv, /Hoàn cọc đã duyệt/);
  assert(queries.some(query => !query.report && query.from === reportDate && query.to === reportDate));
  await mkdir('artifacts/manager-workspace', { recursive: true });
  const captureFinance = async (width, theme, columns) => {
    await page.setViewportSize({ width, height: 1000 });
    const bounds = await financialCards.evaluateAll(cards => cards.map(card => card.getBoundingClientRect().top));
    assert.equal(bounds.filter(top => top === bounds[0]).length, columns, `Financial columns at ${width}px`);
    assert(await financialCards.locator('dd strong').evaluateAll(values => values.every(value => {
      const card = value.closest('section').getBoundingClientRect();
      const rect = value.getBoundingClientRect();
      const line = Number.parseFloat(getComputedStyle(value).lineHeight);
      return rect.left >= card.left && rect.right <= card.right && rect.height <= line + 1;
    })), `Financial amounts fit in one line at ${width}px`);
    await financePanel.locator('.manager-report-finance-accordion').screenshot({ path: `artifacts/manager-workspace/report-details-${theme}-${width}.png` });
  };
  for (const width of [1366, 1920]) await captureFinance(width, 'light', 3);
  await page.getByText('Chi tiết tài chính', { exact: true }).click();
  await period.selectOption('month');
  await metric('Tiền đã nhận').getByText(/3\.000\.000/).waitFor();
  await page.screenshot({ path: 'artifacts/manager-workspace/report-mocked.png', fullPage: true });
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-workspace-role="manager"]').getAttribute('data-workspace-theme'), 'dark');
  await page.screenshot({ path: 'artifacts/manager-workspace/report-dark.png', fullPage: true });
  for (const [width, columns] of [[1920, 3], [1366, 3], [768, 2], [390, 1], [320, 1]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByText('Chi tiết tài chính', { exact: true }).click();
    await rentByType.getByRole('rowheader', { name: /SM-B12/ }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Reports overflow at ${width}px`);
    await captureFinance(width, 'dark', columns);
    await page.getByText('Chi tiết tài chính', { exact: true }).click();
    await tabs('Kho & vận hành').click();
    await storageChart.waitFor();
    await operationsDetails.click();
    await page.getByLabel('Lọc loại kho báo cáo').selectOption('');
    await bookingsByType.getByRole('rowheader', { name: /SM-B12/ }).waitFor();
    await bookingsByType.getByRole('rowheader', { name: /MD-D04/ }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Storage report overflows at ${width}px`);
    if (width === 390) await page.screenshot({ path: 'artifacts/manager-workspace/report-storage-390.png', fullPage: true });
    await operationsDetails.click();
    await tabs('Tài chính').click();
    await paymentChart.waitFor();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).click();
  await page.keyboard.press('Escape');
  await page.goto(`${base}/manager/reports/details?from=${reportDate}&to=${reportDate}&group=day&typeId=small`);
  await page.waitForURL(url => url.pathname === '/manager/reports' && url.searchParams.get('tab') === 'operations');
  await page.getByRole('rowheader', { name: 'Kho nhỏ B12' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Từ ngày', exact: true }).innerText(), '10/11/2026');
  assert.equal(await page.getByLabel('Lọc loại kho báo cáo').inputValue(), 'small');
  await tabs('Tài chính').click();
  await page.getByText('Chi tiết tài chính', { exact: true }).click();
  const invoiceCsv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất hóa đơn CSV', exact: true }).click();
  const invoiceFile = await invoiceCsv;
  assert.match(invoiceFile.suggestedFilename(), /nestbox-hoa-don/);
  const invoiceChunks = [];
  for await (const chunk of await invoiceFile.createReadStream()) invoiceChunks.push(chunk);
  assert.match(Buffer.concat(invoiceChunks).toString('utf8'), /INV-TEST/);
  assert(queries.some(query => query.invoiceCsv && query.typeId === 'small' && query.from === reportDate && query.to === reportDate));
  await chooseDate(page, 'Từ ngày', '2026-01-01');
  await chooseDate(page, 'Đến ngày', '2026-01-01');
  let finishReport;
  releaseReport = new Promise(resolve => { finishReport = resolve; });
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  try {
    await financialDetails.locator('.loading-skeleton__bone').first().waitFor();
    assert.equal(await financialDetails.locator('.loading-skeleton__bone').count(), 4);
    assert.deepEqual((await financialValues()).filter(Boolean), ['2', '1.000.000 ₫']);
  } finally { finishReport(); releaseReport = null; }
  await paymentChart.getByText('Chưa có khoản thu trong kỳ này.').waitFor();
  await financialDetails.getByText('Kỳ này chưa có khoản thu hoặc hóa đơn phát sinh.').waitFor();
  assert.deepEqual(await financialValues(), ['0', '2', '0 ₫', '0', '0 ₫', '1.000.000 ₫']);
  await tabs('Kho & vận hành').click();
  assert.equal(await metric('Đơn đặt trong kỳ').innerText(), '0');
  await tabs('Tài chính').click();
  failed = true;
  await page.getByText('Chi tiết tài chính', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Không thể tải số liệu báo cáo.' }).waitFor();
  assert.equal(await metric('Tiền đã nhận').innerText(), '—');
  assert.match(await metric('Công nợ hiện tại').innerText(), /600\.000/);
  await financialDetails.getByText('Chưa tải được số liệu trong kỳ.').waitFor();
  assert.deepEqual((await financialValues()).filter(value => !value.includes('—')), ['2', '1.000.000 ₫']);
  failed = false;
  snapshotFailed = true;
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await financialDetails.getByText('Chưa tải được số liệu còn nợ và chờ hoàn.').waitFor();
  assert.deepEqual((await financialValues()).filter(value => !value.includes('—')), ['0', '0 ₫', '0', '0 ₫']);
  snapshotFailed = false;
  assert.deepEqual(errors, []);
  console.log('PASS Manager report KPIs, date presets, current snapshot, expandable details, sorting, pagination, both CSV exports, loading errors and responsive themes. All APIs mocked.');
  if (!process.argv.includes('--reports-only')) await verifyManagerWorkspace();
} catch (error) {
  console.error(page.url(), (await page.locator('body').innerText()).slice(-4500));
  throw error;
} finally { await context.close(); await browser.close(); }

async function verifyReportTable(table) {
  const headings = table.getByRole('rowheader');
  await headings.filter({ hasText: 'SM-B12' }).waitFor();
  assert.equal(await headings.count(), 7);
  const limit = table.getByLabel('Số dòng mỗi trang');
  assert.deepEqual(await limit.locator('option').allTextContents(), ['5', '10']);
  await limit.selectOption('5');
  assert.equal(await headings.count(), 5);
  const firstPage = await headings.locator('small').allTextContents();
  await table.getByRole('button', { name: 'Trang sau' }).click();
  assert.equal(await headings.count(), 2);
  const lastPage = await headings.locator('small').allTextContents();
  assert.deepEqual([...firstPage, ...lastPage].sort(), reportCategories.map(row => row.code).sort());
  assert(await table.getByRole('button', { name: 'Trang sau' }).isDisabled());
  await table.getByLabel('Sắp xếp').selectOption('name');
  assert.equal(await headings.count(), 5);
  assert(await table.getByRole('button', { name: 'Trang trước' }).isDisabled());
  assert.deepEqual(await headings.filter({ hasText: 'Appointment product' }).locator('small').allTextContents(), ['AP-001', 'AP-002']);
}

async function verifyManagerWorkspace() {
  await page.goto(`${base}/manager`);
  await page.locator('.manager-dashboard-kpi').filter({ hasText: 'Kho đang sử dụng' }).getByText('30 / 120', { exact: true }).waitFor();
  assert.deepEqual(await page.locator('.manager-dashboard-kpi strong').allTextContents().then(values => values.map(value => value.replace(/\s/g, ' '))), ['1', '1', '30 / 120', '600.000 ₫']);
  const chart = page.getByRole('region', { name: 'Tình trạng kho' });
  await chart.getByText('120 kho', { exact: true }).waitFor();
  assert.equal(await page.locator('.manager-sidebar a[href="/manager"] .navigation-work-count').count(), 0);
  assert.equal(await page.locator('.manager-dashboard-kpi').filter({ hasText: 'Hồ sơ cần xử lý' }).getAttribute('href'), '/manager/reviews?view=decision');
  const legend = chart.locator('.manager-storage-legend li');
  const values = await legend.evaluateAll(items => items.map(item => [
    Number.parseInt(item.querySelector('strong').textContent),
    Number.parseFloat(item.lastElementChild.textContent.replace(',', '.')),
  ]));
  assert.deepEqual(values, [[30, 25], [75, 62.5], [5, 4.2], [10, 8.3]]);
  assert.equal(values.reduce((sum, [count]) => sum + count, 0), report.units.total);
  assert(Math.abs(values.reduce((sum, [, share]) => sum + share, 0) - 100) < 0.2);
  assert.deepEqual(await chart.locator('.manager-storage-segment').evaluateAll(bars => bars.map(bar => Number(bar.style.flexGrow))), [30, 75, 5, 10]);
  const work = page.locator('.manager-work-list');
  await work.getByRole('link', { name: /Ghi nhận hoàn cọc/ }).waitFor();
  await work.getByRole('link', { name: /Duyệt trả trước hạn/ }).waitFor();
  assert.equal(await work.getByRole('link').count(), 3);
  assert.equal(await page.locator('a[href*="payment-submissions"], a[href*="online-payment-reconciliations"]').count(), 0);
  assert.doesNotMatch(await work.innerText(), /DEP-NO-REFUND|DEP-REFUNDED|DEP-SETTLED|MOV-TEST/);
  assert.match(await work.getByRole('link', { name: /Ghi nhận hoàn cọc/ }).innerText(), /Chờ hoàn cọc/);
  await page.screenshot({ path: 'artifacts/manager-workspace/dashboard-light.png' });
  const shell = page.locator('[data-workspace-role="manager"]');
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  await page.keyboard.press('Escape');
  assert.equal(await shell.getAttribute('data-workspace-theme'), 'dark');
  await page.reload();
  await page.getByText('30 / 120', { exact: true }).waitFor();
  assert.equal(await shell.getAttribute('data-workspace-theme'), 'dark');
  await work.getByRole('link', { name: /Ghi nhận hoàn cọc/ }).waitFor();
  await page.screenshot({ path: 'artifacts/manager-workspace/dashboard-dark.png' });
  await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
  const expandSidebar = page.getByRole('button', { name: 'Mở rộng thanh bên' });
  assert.equal(await expandSidebar.getAttribute('aria-expanded'), 'false');
  await page.locator('.manager-sidebar').getByRole('link', { name: 'Khoản thu' }).waitFor();
  await expandSidebar.click();
  for (const resource of retiredFinance) {
    await page.goto(`${base}/manager/${resource}?record=old`);
    await page.waitForURL(url => url.pathname === '/manager/finance' && !url.search);
    await page.getByRole('heading', { name: 'Tài chính' }).waitFor();
    assert.equal(await page.locator('main a[href*="payment-submissions"], main a[href*="online-payment-reconciliations"]').count(), 0);
  }
  await page.goto(`${base}/manager`);
  await work.getByRole('link', { name: /Phân công nhân viên/ }).click();
  await page.waitForURL('**/manager/assignments?kind=stock-movements&record=needs-assignment');
  await page.getByRole('dialog', { name: 'Phân công nhân viên', exact: true }).waitFor();
  await page.goto(`${base}/manager`);
  await work.getByRole('link', { name: /Duyệt trả trước hạn/ }).click();
  await page.waitForURL('**/manager/early-returns?record=early');
  await page.getByRole('heading', { name: /SUP-EARLY/ }).waitFor();
  await page.goto(`${base}/manager`);
  await work.getByRole('link', { name: /Ghi nhận hoàn cọc/ }).click();
  await page.waitForURL('**/manager/operations/deposit-settlements/refund');
  await page.getByRole('button', { name: 'Ghi nhận hoàn tiền', exact: true }).waitFor();
  await page.goto(`${base}/manager`);
  extraDeposits = true;
  await page.locator('.manager-dashboard-kpi').filter({ hasText: 'Hồ sơ cần xử lý' }).click();
  await page.waitForURL('**/manager/reviews?view=decision');
  await page.getByRole('heading', { name: 'Hồ sơ cần xử lý', exact: true }).waitFor();
  const reviewLink = page.getByRole('navigation', { name: 'Điều hướng Quản lý cơ sở' }).getByRole('link', { name: 'Hồ sơ cần xử lý', exact: true });
  assert.equal(await reviewLink.getAttribute('href'), '/manager/reviews');
  assert.equal(await reviewLink.getAttribute('aria-current'), 'page');
  assert.equal(await page.getByRole('navigation', { name: 'Đường dẫn' }).locator('[aria-current="page"]').innerText(), 'Hồ sơ cần xử lý');
  const reviews = page.getByRole('table', { name: 'Hồ sơ cần xử lý' });
  await reviews.getByRole('columnheader', { name: 'Loại hồ sơ', exact: true }).waitFor();
  await reviews.getByText('DEP-PENDING', { exact: true }).waitFor();
  await reviews.getByText('SUP-EARLY', { exact: true }).waitFor();
  assert.equal(await reviews.locator('tbody tr').count(), 2);
  assert.equal(await reviews.getByText('SUP-EARLY-PAST', { exact: true }).count(), 0);
  assert.equal(await reviews.getByText('DEP-SETTLED', { exact: true }).count(), 0);
  await reviews.getByRole('button', { name: 'Ngày tạo' }).click();
  await reviews.locator('th[aria-sort="ascending"]').waitFor();
  const kindFilter = page.getByRole('combobox', { name: 'Loại hồ sơ' });
  assert.deepEqual(await kindFilter.locator('option[value="bank"], option[value="vnpay"]').allTextContents(), []);
  await kindFilter.selectOption('deposits');
  await page.waitForURL(url => url.searchParams.get('kind') === 'deposits');
  await reviews.getByText('SUP-EARLY', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('searchbox', { name: 'Tìm kiếm', exact: true }).fill('DEP-PENDING');
  await page.waitForURL(url => url.searchParams.get('kind') === 'deposits' && url.searchParams.get('search') === 'DEP-PENDING');
  assert.equal(await reviews.getByRole('button', { name: 'Thao tác DEP-PENDING' }).count(), 0);
  const depositDetail = reviews.getByRole('link', { name: 'Xem chi tiết hồ sơ DEP-PENDING' });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.detail-row-control')).some(link => new URL(link.href).searchParams.get('from')?.includes('search=DEP-PENDING')));
  assert.match(new URL(await depositDetail.getAttribute('href'), base).searchParams.get('from'), /search=DEP-PENDING/);
  await depositDetail.press('Enter');
  await page.getByRole('button', { name: 'Duyệt quyết toán', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Về hồ sơ cần xử lý' }).click();
  assert.equal(await page.getByRole('searchbox', { name: 'Tìm kiếm', exact: true }).inputValue(), 'DEP-PENDING');
  await page.getByRole('combobox', { name: 'Loại hồ sơ' }).selectOption('');
  await page.waitForURL(url => !url.searchParams.has('kind'));
  await page.waitForFunction(() => [...document.querySelectorAll('select')].find(el => el.labels[0]?.textContent.startsWith('Loại hồ sơ'))?.value === '');
  await page.getByRole('searchbox', { name: 'Tìm kiếm', exact: true }).fill('');
  await page.waitForURL(url => !url.searchParams.has('search'));
  await reviews.getByRole('row').filter({ hasText: 'DEP-PENDING' }).getByText('Chờ duyệt', { exact: true }).click();
  await page.waitForURL(url => url.pathname.endsWith('/deposit-settlements/pending-deposit'));
  await page.getByRole('button', { name: 'Duyệt quyết toán', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Ghi nhận hoàn tiền', exact: true }).count(), 0);
  await page.getByRole('link', { name: 'Về hồ sơ cần xử lý' }).click();
  await reviews.getByText('SUP-EARLY', { exact: true }).waitFor();
  const pageColors = async () => reviews.locator('tbody tr').first().locator('td').first().evaluate(cell => {
    const style = getComputedStyle(cell);
    const row = getComputedStyle(cell.parentElement);
    const table = getComputedStyle(cell.closest('table'));
    const toolbar = cell.closest('.manager-task-list').querySelector('input[type="search"]');
    return [style.color, style.backgroundColor, row.backgroundColor, table.backgroundColor, getComputedStyle(toolbar).backgroundColor];
  });
  const dark = await pageColors();
  await page.screenshot({ path: 'artifacts/manager-workspace/review-table-dark.png' });
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.manager-task-list input[type="search"]')).backgroundColor === 'rgb(255, 255, 255)');
  assert.notDeepEqual(await pageColors(), dark);
  await page.screenshot({ path: 'artifacts/manager-workspace/review-table-light.png' });
  await page.setViewportSize({ width: 390, height: 800 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert(await reviews.evaluate(table => table.parentElement.scrollWidth > table.parentElement.clientWidth));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/manager`);
  await page.locator('.manager-dashboard-kpi').filter({ hasText: 'Chờ phân công' }).click();
  await page.waitForURL('**/manager/assignments?assignment=attention');
  await page.goto(`${base}/manager`);
  for (const width of [1920, 1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Dashboard overflows at ${width}px`);
  }
  await page.getByRole('button', { name: 'Mở điều hướng' }).click();
  await page.locator('.portal-mobile-nav').getByRole('link', { name: 'Phân công', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'artifacts/manager-workspace/dashboard-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  units = { ...report.units, total: 123, disabled: 2 };
  await page.reload();
  await chart.getByText('Trạng thái khác (disabled)', { exact: true }).waitFor();
  await chart.getByText('Chưa có chi tiết trạng thái', { exact: true }).waitFor();
  assert.equal(await legend.evaluateAll(items => items.reduce((total, item) => total + Number.parseInt(item.querySelector('strong').textContent), 0)), 123);
  units = { ...report.units, total: 119 };
  await page.reload();
  await chart.getByText('Số liệu trạng thái kho chưa khớp với tổng kho.').waitFor();
  assert.equal(await chart.locator('.manager-storage-segment').count(), 0);
  units = { total: 0, occupied: 0, available: 0, reserved: 0, maintenance: 0, utilizationPercent: null };
  await page.reload();
  await chart.getByText('Chưa có kho vật lý trong hệ thống.').waitFor();
  assert.equal(await legend.count(), 0);
  assert.equal(await chart.locator('.manager-storage-segment').count(), 0);
  units = report.units;
  transferStatus = 'REQUESTED';
  await page.reload();
  await work.getByRole('link', { name: /Duyệt chuyển kho/ }).waitFor();
  assert.equal(await work.getByRole('link', { name: /Xử lý hỗ trợ chuyển cấp/ }).count(), 0);
  transferStatus = 'APPROVED';
  await page.reload();
  await work.getByRole('link', { name: /Duyệt trả trước hạn/ }).waitFor();
  assert.equal(await work.getByRole('link', { name: /Duyệt chuyển kho|Xử lý hỗ trợ chuyển cấp/ }).count(), 0);
  transferStatus = undefined;
  for (const path of ['/staff', '/admin/users']) {
    await page.goto(base + path);
    await page.waitForURL(url => url.pathname === '/manager');
  }
  await page.goto(`${base}/manager/catalog/additional-services`);
  await page.getByText('/bộ/tháng', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Tạo dịch vụ', exact: true }).click();
  await page.getByLabel('Mã dịch vụ', { exact: true }).fill('BOX_TEST');
  await page.getByLabel('Tên dịch vụ', { exact: true }).fill('Thùng kiểm thử');
  await page.getByLabel('Đơn vị vật lý', { exact: true }).selectOption('cái');
  await page.getByLabel('Giá đã duyệt (VND)', { exact: true }).fill('20000');
  await page.getByRole('button', { name: 'Lưu dịch vụ', exact: true }).click();
  await page.getByText('Đã lưu dịch vụ. Báo giá lịch sử được giữ nguyên.', { exact: true }).waitFor();
  assert(writes.some(write => write.body.physicalUnit === 'cái' && write.body.billingUnit === 'ONE_TIME'));
  await page.goto(`${base}/manager/stored-items`);
  await page.getByRole('button', { name: 'MD-D04-002', exact: true }).waitFor();
  assert.match(await page.locator('body').innerText(), /Tầng 1 · D04/);
  await page.getByRole('button', { name: 'Thao tác ITEM-TEST' }).click();
  assert.match(await page.getByRole('link', { name: 'Xem phiếu nhập – xuất', exact: true }).getAttribute('href'), /rentalContractId=contract/);
  await page.goto(`${base}/manager/units`);
  await page.getByRole('table', { name: 'Danh sách kho' }).getByText('Khách kiểm thử', { exact: true }).waitFor();
  await page.goto(`${base}/manager/assignments?scope=all&kind=stock-movements`);
  await page.getByRole('table', { name: 'Phân công nhân viên' }).getByRole('row', { name: /MOV-TEST/ }).getByText('Hoàn tất', { exact: true }).click();
  await page.waitForURL('**/manager/operations/stock-movements/movement');
  await page.getByText('Khách mang thiếu một thùng', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Hoàn tất phiếu', exact: true }).count(), 0);
  await page.goto(`${base}/manager/assignments?kind=stock-movements&assignment=unassigned`);
  const movement = page.getByRole('row').filter({ hasText: 'MOV-ASSIGN' });
  await movement.getByRole('button', { name: 'Phân công', exact: true }).click();
  await page.getByRole('radio', { name: /Nhân viên kiểm thử/ }).check();
  await page.getByRole('button', { name: 'Xác nhận phân công', exact: true }).click();
  await page.getByText('Đã cập nhật nhân viên phụ trách.').waitFor();
  assert(writes.some(write => write.path === 'manager/stock-movements/needs-assignment/assign' && write.body.staffUserId === 'staff'));
  await page.getByRole('combobox', { name: 'Phân công', exact: true }).selectOption('assigned');
  await movement.getByRole('button', { name: 'Đổi nhân viên' }).waitFor();
  await page.getByRole('combobox', { name: 'Nhân viên', exact: true }).selectOption('staff');
  await page.waitForURL(url => url.searchParams.get('assignee') === 'staff');
  await movement.getByRole('button', { name: 'Đổi nhân viên' }).click();
  await page.getByRole('radio', { name: /Nhân viên kiểm thử/ }).check();
  assert.equal(await page.getByRole('button', { name: 'Xác nhận đổi nhân viên', exact: true }).isDisabled(), true);
  await page.getByRole('radio', { name: /Nhân viên thay ca/ }).check();
  await page.getByRole('button', { name: 'Xác nhận đổi nhân viên', exact: true }).click();
  await page.getByText('Đã cập nhật nhân viên phụ trách.').waitFor();
  assert(writes.some(write => write.path === 'manager/stock-movements/needs-assignment/assign' && write.body.staffUserId === 'staff2'));
  await page.getByRole('button', { name: 'Phụ trách kho', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('tab') === 'units');
  await page.reload();
  await page.getByRole('button', { name: 'Phân công kho', exact: true }).click();
  const unitDialog = page.getByRole('dialog', { name: 'Phân công phụ trách kho' });
  await selectChoice(unitDialog.getByLabel('Kho', { exact: true }), 'unit');
  await unitDialog.getByRole('searchbox', { name: 'Tìm nhân viên' }).fill('staff@example.test');
  assert.equal(await unitDialog.getByRole('radio').count(), 1);
  await unitDialog.getByRole('radio', { name: /Nhân viên kiểm thử/ }).check();
  await unitDialog.getByRole('button', { name: 'Xác nhận phân công' }).click();
  await unitDialog.waitFor({ state: 'hidden' });
  const unitRow = page.getByRole('row').filter({ hasText: physicalUnit.unitCode });
  await unitRow.getByText('Nhân viên kiểm thử', { exact: true }).waitFor();
  await unitRow.getByText(physicalUnit.unitCode, { exact: true }).click();
  await unitDialog.getByText('Đang phụ trách', { exact: false }).waitFor();
  await unitDialog.getByRole('radio', { name: /Nhân viên thay ca/ }).check();
  await unitDialog.getByRole('button', { name: 'Xác nhận đổi nhân viên' }).click();
  await unitRow.getByText('Nhân viên thay ca', { exact: true }).waitFor();
  assert.deepEqual(writes.filter(write => write.path === 'manager/units/unit/staff-assignment').map(write => write.body), [
    { staffUserId: 'staff', expectedAssignmentId: null },
    { staffUserId: 'staff2', expectedAssignmentId: 'unit-assignment-staff' },
  ]);
  assert.equal(pendingMovement.assignedStaff.id, 'staff2');

  await page.goto(`${base}/manager/operations/deposit-settlements?status=SETTLED&limit=10`);
  await page.getByRole('button', { name: 'Ngày tạo', exact: false }).click();
  const depositTable = page.getByRole('table');
  await depositTable.getByText('DEP-HISTORY-20', { exact: true }).waitFor();
  assert.equal(await depositTable.getByRole('row').count(), 11);
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await depositTable.getByText('DEP-HISTORY-10', { exact: true }).waitFor();
  assert.equal(await depositTable.getByText('DEP-HISTORY-20', { exact: true }).count(), 0);

  await page.goto(`${base}/manager/operations/payments`);
  const paymentRow = page.getByRole('row', { name: /PAY-TEST/ });
  await paymentRow.getByText('VNPay', { exact: true }).waitFor();
  assert.match(await paymentRow.innerText(), /1\.000\.000/);
  await page.goto(`${base}/manager/operations/invoices?type=INITIAL`);
  const invoiceRow = page.getByRole('row', { name: /INV-TEST/ });
  await invoiceRow.getByText('C-TEST', { exact: true }).waitFor();
  assert.match(await invoiceRow.innerText(), /3\.000\.000.*1\.000\.000.*2\.000\.000/s);
  await invoiceRow.getByRole('cell', { name: /3\.000\.000/ }).click();
  await page.getByRole('heading', { name: 'Báo giá kỳ thuê', exact: true }).waitFor();
  await page.getByText('Tổng báo giá (gồm cọc)', { exact: true }).waitFor();
  const quoteDetails = page.locator('.saved-quote-details');
  assert.equal(await quoteDetails.getAttribute('open'), null);
  await page.getByText('Xem chi tiết báo giá', { exact: true }).click();
  await page.getByText('Dự kiến các kỳ tiếp theo', { exact: true }).waitFor();
  await page.getByText('Xem chi tiết báo giá', { exact: true }).click();
  assert.equal(await quoteDetails.getAttribute('open'), null);
  await page.goto(`${base}/manager/operations/contracts`);
  const contractRow = page.getByRole('row').filter({ hasText: contract.contractCode });
  await contractRow.getByText(contract.contractCode, { exact: true }).waitFor();
  assert.equal(await contractRow.getByText('Xem chi tiết', { exact: true }).count(), 0);
  await contractRow.getByRole('button', { name: /Sao chép/ }).click();
  assert.equal(new URL(page.url()).pathname, '/manager/operations/contracts');
  await contractRow.getByRole('link', { name: /Xem chi tiết hồ sơ/ }).press('Enter');
  await page.waitForURL('**/manager/operations/contracts/contract');
  await page.getByText('Dự kiến thanh toán lần đầu', { exact: true }).waitFor();
  await page.getByText('Hóa đơn theo kỳ', { exact: true }).click();
  await page.getByRole('link', { name: /Xem hóa đơn của đơn R-TEST/ }).click();
  await page.waitForURL(url => url.pathname === '/manager/operations/invoices' && url.searchParams.get('search') === 'R-TEST');
  await invoiceRow.waitFor();
  assert(listQueries.some(query => query.path === 'manager/deposit-settlements' && query.page === 2 && query.limit === 10 && query.status === 'SETTLED'));
  assert.deepEqual(retiredRequests, []);
  assert.deepEqual(errors, []);
  console.log('PASS Manager review inbox, retired finance routes and API calls, staff assignment, deposit review and pagination, invoice/payment amounts and inventory links. All APIs mocked.');
}
