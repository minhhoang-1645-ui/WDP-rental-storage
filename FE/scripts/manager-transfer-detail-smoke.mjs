import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { selectChoice } from './select-choice.mjs';

const base = new URL(process.env.WDP_FE_URL || 'http://127.0.0.1:5173');
assert(['127.0.0.1', 'localhost'].includes(base.hostname));
const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.setDefaultTimeout(12000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const manager = { id: 'manager', role: 'FACILITY_MANAGER', fullName: 'Quản lý thử nghiệm', email: 'manager@example.test' };
const staff = { id: 'staff-a', fullName: 'Nguyễn Nhân Viên', email: 'staff-a@example.test' };
const at = '2026-10-01T10:00:00.000Z';
const source = { id: 'u0', unitCode: 'SM-02', storageType: { name: 'Kho nhỏ' }, facility: { id: 'fac-a', name: 'Cơ sở A' } };
const original = {
  id: 'transfer', transferCode: 'WDP-TRF-TEST', status: 'REQUESTED', reason: 'UNIT_ISSUE', fromUnit: source,
  customer: { fullName: 'Khách thử nghiệm' }, reservation: { id: 'res', reference: 'WDP-TEST', startDate: '2026-09-01', endDate: '2027-01-01' },
  contract: { id: 'contract', contractCode: 'WDP-TEST-C01', startDate: '2026-09-01', endDate: '2027-02-01' },
  createdAt: at, updatedAt: at, requestedBy: { fullName: 'Khách thử nghiệm' }, requestDescription: 'Cần chuyển trong cùng cơ sở',
  transferRequestedSchedule: { startAt: '2026-10-02T08:00:00Z', endAt: '2026-10-02T10:00:00Z' },
};
const candidates = Array.from({ length: 8 }, (_, index) => ({
  id: 'unit-' + index, unitCode: 'SM-' + String(index + 3).padStart(2, '0'),
  floor: index === 1 ? 'Tầng 2' : 'Tầng trệt', zone: index === 1 ? 'B' : 'A', row: 1, position: index + 3,
  storageType: { name: 'Kho nhỏ' }, eligible: true, checkedFrom: '2026-10-05', checkedUntil: '2027-02-01',
}));
const unavailable = { ...candidates[0], id: 'busy-unit', unitCode: 'SM-99', eligible: false, unavailableReason: 'Kho có lịch đặt trùng thời gian thuê còn lại.' };
const writes = [];
let row = structuredClone(original), blocked = '', appendix = false, empty = false, listError = false, deny = false, noStaff = false, rejectError = false, approveConflict = false;
const pageOf = items => ({ items, page: 1, limit: 100, total: items.length });
await page.addInitScript(() => {
  localStorage.setItem('wdp-auth-token-v1', 'fixture-manager-transfer');
  window.print = () => { document.body.dataset.testPrinted = 'true'; };
});
await page.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace(/^\/api/, '');
  const send = (json, status = 200) => route.fulfill({ json, status });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  if (path === '/auth/me') return send(manager);
  if (path === '/manager/transfers/transfer') return deny ? send({ message: 'Không tìm thấy hồ sơ tại cơ sở.' }, 404) : send(row);
  if (path.startsWith('/manager/units/')) return send(candidates.find(unit => unit.id === path.split('/').at(-1)) ?? {});
  if (path === '/manager/transfers/transfer/destinations') {
    if (listError) return send({ message: 'Không tải được danh sách kho.' }, 500);
    return send(pageOf(empty ? [] : [...candidates.map(unit => unit.id === blocked ? { ...unit, eligible: false, unavailableReason: unavailable.unavailableReason } : unit), unavailable]));
  }
  if (path === '/manager/transfers/transfer/commercial-preview') {
    assert(candidates.some(unit => unit.id === url.searchParams.get('destination')));
    return send(appendix ? { sameType: false, reviewHash: 'review-fixture', snapshot: { currentRate: 100000, newRate: 100000, effectiveFrom: '2026-10-05', smaller: false } } : { sameType: true });
  }
  if (path === '/manager/staff') {
    assert.equal(url.searchParams.get('taskId'), 'transfer');
    assert.equal(url.searchParams.get('taskType'), 'transfers');
    return send(pageOf(noStaff ? [] : [staff]));
  }
  if (path === '/manager/staff/facilities') return send([{ id: 'fac-a', name: 'Cơ sở A' }]);
  if (request.method() === 'POST' && path.startsWith('/manager/transfers/transfer/')) {
    const body = request.postDataJSON();
    writes.push({ path, body });
    if (path.endsWith('/approve')) {
      if (approveConflict) return send({ message: 'Kho đích vừa được giữ.' }, 409);
      if (body.staffUserId && body.staffUserId !== staff.id) return send({ message: 'Nhân viên ngoài cơ sở.' }, 403);
      const { id, unitCode, storageType } = candidates.find(unit => unit.id === body.toStorageUnitId);
      row = { ...row, status: 'APPROVED', commercial: appendix ? { acceptedAt: null } : null,
        toUnit: { id, unitCode, storageType }, approvedAt: at, approvedBy: manager, assignedStaff: body.staffUserId ? staff : null };
    }
    if (path.endsWith('/reject')) {
      if (rejectError) return send({ message: 'Tạm thời chưa thể từ chối.' }, 409);
      row = { ...row, status: 'REJECTED', rejectionReason: body.reason, approvedAt: at, approvedBy: manager };
    }
    if (path.endsWith('/review-problem')) {
      const review = { ...body, problemCount: 1, reviewedAt: at, managerName: manager.fullName };
      row = { ...row, handoverReport: { ...row.handoverReport, problemReview: review, problemReviewHistory: [review] } };
    }
    if (path.endsWith('/commercial-refund')) row = { ...row, commercialSettlement: { ...row.commercialSettlement, refundState: 'REFUNDED', refundedAt: at } };
    return send(row);
  }
  return send(pageOf([]));
});

try {
  const go = () => page.goto(new URL('/manager/operations/transfers/transfer', base).href);
  const title = page.getByRole('heading', { name: 'Chi tiết chuyển kho' });
  const choose = code => page.getByRole('radio', { name: 'Chọn kho ' + code, exact: true });
  const target = page.locator('.transfer-target');
  const approve = page.getByRole('button', { name: 'Duyệt vào hàng chờ' });
  const container = page.locator('.manager-transfer-dashboard');
  const reload = async () => { await go(); await title.waitFor(); };
  await reload();
  await page.getByText('8 kho có thể chọn').waitFor();
  assert(await approve.isDisabled());
  assert.match(await target.innerText(), /Chưa chọn kho đích/);
  assert.equal(await page.getByRole('radio').count(), 6);
  if (process.env.WDP_TRANSFER_SCREENSHOT) await container.screenshot({ path: process.env.WDP_TRANSFER_SCREENSHOT });
  for (const width of [1920, 1440, 1366, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 930 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflow at ' + width);
    assert.equal(await page.locator('.transfer-grid').evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length), width > 1000 ? 2 : 1);
    assert(await approve.isVisible());
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: 'Xem thêm kho' }).click();
  await choose('SM-10').waitFor();
  const search = page.getByRole('searchbox', { name: 'Tìm kho đích' });
  await search.fill('sm-04');
  await choose('SM-04').waitFor();
  assert.equal(await page.getByRole('radio').count(), 1);
  await search.fill('không khớp');
  await page.getByText('Không có kho khớp bộ lọc.').waitFor();
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  const filters = page.locator('.transfer-filters');
  await selectChoice(filters.getByRole('combobox').nth(1), 'Tầng 2');
  assert.equal(await page.getByRole('radio').count(), 1);
  await selectChoice(filters.getByRole('combobox').nth(2), 'B');
  assert.equal(await page.getByRole('radio').count(), 1);
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await selectChoice(filters.getByRole('combobox').nth(0), 'all');
  await page.getByRole('button', { name: 'Xem thêm kho' }).click();
  assert(await choose('SM-99').isDisabled());
  await page.getByText(unavailable.unavailableReason, { exact: true }).waitFor();
  await page.getByRole('row').filter({ has: choose('SM-03') }).getByText('SM-03', { exact: true }).click();
  assert(await choose('SM-03').isChecked());
  await choose('SM-04').check();
  assert.match(await target.innerText(), /Đang chọn[\s\S]*SM-04[\s\S]*Tầng 2/);
  assert.equal(writes.length, 0);
  await page.getByText('Lịch sử xử lý', { exact: true }).click();
  await page.getByText('Gửi yêu cầu', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'In hồ sơ' }).click();
  assert.equal(await page.locator('body').getAttribute('data-test-printed'), 'true');

  await page.waitForFunction(() => !document.querySelector('.transfer-action-buttons .button-primary')?.disabled);
  blocked = 'unit-1';
  await approve.click();
  await container.getByRole('alert').filter({ hasText: unavailable.unavailableReason }).waitFor();
  assert.equal(writes.length, 0);
  await page.getByText('7 kho có thể chọn').waitFor();
  await choose('SM-03').check();
  await page.waitForFunction(() => !document.querySelector('.transfer-action-buttons .button-primary')?.disabled);
  approveConflict = true;
  await approve.click();
  await container.getByRole('alert').filter({ hasText: 'Kho đích vừa được giữ.' }).waitFor();
  approveConflict = false;
  await choose('SM-03').check();
  await page.waitForFunction(() => !document.querySelector('.transfer-action-buttons .button-primary')?.disabled);
  await approve.evaluate(button => { button.click(); button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.getByRole('heading', { name: 'Kết quả xử lý' }).waitFor();
  assert.equal(writes.length, 2);
  assert.equal(writes.at(-1).body.staffUserId, '');
  assert.match(await target.innerText(), /Đã xác nhận[\s\S]*SM-03/);
  await target.getByText(/Tầng trệt · Khu A/).waitFor();
  await page.getByRole('link', { name: 'Phân công hồ sơ cũ' }).waitFor();
  assert.equal(await approve.count(), 0);

  row = structuredClone(original);
  appendix = true;
  blocked = '';
  await reload();
  await choose('SM-05').check();
  await page.getByText('Hồ sơ có phụ lục cần người phụ trách.').waitFor();
  assert(await approve.isDisabled());
  await page.locator('.transfer-staff-picker summary').click();
  const staffSearch = page.getByRole('searchbox', { name: 'Tìm nhân viên' });
  await staffSearch.fill('outside@example.test');
  await page.getByText('Không có nhân viên khớp tìm kiếm.').waitFor();
  await staffSearch.fill(staff.email);
  await page.getByRole('button', { name: new RegExp(staff.fullName) }).click();
  await page.getByRole('button', { name: 'Duyệt và phân công' }).click();
  await page.getByText('Chờ ký phụ lục', { exact: true }).waitFor();
  assert.deepEqual(writes.at(-1).body, { toStorageUnitId: 'unit-2', staffUserId: staff.id, commercialReviewHash: 'review-fixture' });
  row = { ...row, commercial: { acceptedAt: at }, handoverReport: { problems: [{ reportedAt: at, staffName: staff.fullName, note: 'Cần kiểm tra quyền truy cập' }] } };
  await page.getByRole('button', { name: 'Làm mới hồ sơ' }).click();
  await page.getByLabel('Kết quả xử lý', { exact: true }).fill('Đã xác minh quyền truy cập');
  await page.getByRole('button', { name: 'Lưu quyết định' }).click();
  await page.getByText('Đã lưu thao tác thành công.').waitFor();
  assert.equal(writes.at(-1).body.decision, 'CONTINUE');
  await page.getByText('Lịch sử xử lý', { exact: true }).click();
  await page.getByText('Đã xác minh quyền truy cập', { exact: true }).waitFor();
  row = { ...row, status: 'COMPLETED', completedAt: at, completedBy: staff,
    commercialSettlement: { refundState: 'PENDING', refundAmount: 20000, rentalAdjustment: 0, depositAdjustment: 0, fee: 0, amountDue: 0 },
    handoverReport: { ...row.handoverReport, photos: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWioAAAAASUVORK5CYII='] } };
  await page.getByRole('button', { name: 'Làm mới hồ sơ' }).click();
  await page.getByText('Đã hoàn tất chuyển kho thực tế. Hợp đồng hiện dùng kho đích.').waitFor();
  await page.getByText('Lịch sử xử lý', { exact: true }).click();
  await page.getByText('Hoàn tất bàn giao', { exact: true }).waitFor();
  await page.getByRole('img', { name: 'Ảnh bàn giao chuyển kho 1' }).waitFor();
  await page.getByLabel('Mã giao dịch hoàn tiền').fill('REFUND-TEST');
  await page.getByRole('checkbox', { name: /Đã chuyển đúng/ }).check();
  await page.getByRole('button', { name: 'Ghi nhận đã hoàn tiền' }).click();
  await page.getByText(/Đã hoàn 17:00/).waitFor();

  row = structuredClone(original);
  noStaff = true;
  empty = true;
  await reload();
  await page.getByText('Chưa có kho cùng loại trống suốt thời gian thuê còn lại.').waitFor();
  await page.getByText(/Chưa có nhân viên được cấp quyền/).waitFor();
  listError = true;
  await page.getByRole('button', { name: 'Làm mới danh sách kho' }).click();
  await container.getByRole('alert').filter({ hasText: 'Không tải được danh sách kho.' }).waitFor();
  listError = false;
  await page.getByRole('button', { name: 'Làm mới danh sách kho' }).click();
  await page.getByText('Chưa có kho cùng loại trống suốt thời gian thuê còn lại.').waitFor();
  const reject = page.getByRole('button', { name: 'Từ chối chuyển kho', exact: true });
  await reject.click();
  const dialog = page.getByRole('dialog', { name: 'Từ chối yêu cầu chuyển kho' });
  const reason = dialog.getByLabel('Lý do từ chối');
  const confirm = dialog.getByRole('button', { name: 'Xác nhận từ chối' });
  await reason.fill(' a ');
  assert(await confirm.isDisabled());
  await dialog.getByRole('button', { name: 'Hủy' }).click();
  await reject.click();
  assert.equal(await reason.inputValue(), '');
  await reason.fill('  Không có kho phù hợp  ');
  rejectError = true;
  await confirm.click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await reason.inputValue(), '  Không có kho phù hợp  ');
  rejectError = false;
  await confirm.click();
  await page.getByRole('heading', { name: 'Kết quả xử lý' }).waitFor();
  assert.deepEqual(writes.at(-1).body, { reason: 'Không có kho phù hợp' });
  await page.getByText('Lịch sử xử lý', { exact: true }).click();
  await page.locator('.transfer-history').getByText('Từ chối chuyển kho', { exact: true }).waitFor();
  assert.equal(await reject.count(), 0);
  deny = true;
  await go();
  await page.getByRole('alert').filter({ hasText: 'Không tìm thấy hồ sơ tại cơ sở.' }).waitFor();
  assert.equal(await title.count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: destination filters, availability and conflict, staff and appendix, approve/reject, history, print, access and six viewport widths.');
} catch (error) {
  console.error('Browser errors:', errors, 'Last page:', page.url());
  throw error;
} finally {
  await browser.close();
}
