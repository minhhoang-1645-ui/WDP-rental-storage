import { selectChoice } from './select-choice.mjs';
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff, customer, unit, reservation, when } from './fixtures/workspace.mjs';

// Each browser session intercepts API traffic, including all writes.
const browser = await launchTestBrowser();
const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const destination = { ...unit, id: 'destination-id', unitCode: 'A102', status: 'AVAILABLE', eligible: true, checkedFrom: '2026-11-19', checkedUntil: '2027-01-01', conflicts: [] };
const manager = { id: 'manager-id', role: 'MANAGER', fullName: 'Quản lý thử nghiệm', email: 'manager@example.test' };
const otherStaff = { ...staff, id: 'other-staff', fullName: 'Nhân viên ca khác', email: 'other-staff@example.test' };
const data = structuredClone(fixture);
const contract = data.contracts[0];
data.rentals = [{ ...data.rentals[0], quantity: 1, isOverdue: false, rentalState: 'ACTIVE', contracts: [{ ...contract, unit }] }];
const errors = [], writes = [];
let support, transfer;
let currentPage;

async function pageFor(role, actor, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'transfer-smoke'));
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\//, '').replace('/management/', '/');
    const [, kind, id, action] = path.split('/');
    const method = request.method();
    const send = (json, status = 200) => route.fulfill({ json, status });
    const page = items => send({ items, total: items.length, page: 1, limit: 100 });
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === 'auth/me') return send({ ...actor, role });
    if (path === 'manager/staff') return page([staff, otherStaff]);
    if (path === 'reservations') return send(data.reservations);
    if (method === 'GET') {
      if (kind === 'support-requests') {
        const linked = support && { ...support, transfers: transfer ? [transfer] : [] };
        return page(linked && (role === 'CUSTOMER' || role === 'MANAGER' && !url.searchParams.has('legacyTransfer')) ? [linked].filter(row => !url.searchParams.has('status') || row.status === url.searchParams.get('status')) : []);
      }
      if (kind === 'transfers') {
        if (action === 'destinations') return page([destination, { ...destination, id: 'taken', unitCode: 'A103', eligible: false, unavailableReason: 'Kho có lịch trùng.' }]);
        if (action === 'commercial-preview') return send({ sameType: false, reviewHash: 'reviewed-fixture', snapshot: {
          currentRate: 1000000, newRate: 1200000, differencePerMonth: 200000, effectiveFrom: '2027-01-01', financialReview: {
            leaseStart: '2026-10-01', leaseEnd: '2027-01-01', renewals: [{ code: 'RN', appendixCode: 'RN-PL01', start: '2026-12-01', end: '2027-01-01' }],
            paidAmount: 2000000, outstandingAmount: 0, dueAmount: 0, depositAmount: 1000000, futureRentIncrease: 0, futureRentReduction: 0,
          },
        } });
        const visible = transfer && (role === 'MANAGER' || role === 'STAFF' && transfer.assignedStaff?.id === actor.id
          && (transfer.status === 'COMPLETED' || transfer.status === 'APPROVED' && !transfer.requiresAcceptance && !transfer.commercialPayment?.dueInvoices.length));
        return id ? visible ? send(transfer) : send({ message: 'Không tìm thấy lệnh chuyển kho dành cho Staff.' }, 404) : page(visible && (!url.searchParams.has('status') || transfer.status === url.searchParams.get('status')) ? [transfer] : []);
      }
      return page(Array.isArray(data[kind]) ? data[kind] : []);
    }
    const body = request.postDataJSON();
    writes.push({ role, path, body });
    if (role === 'CUSTOMER' && path === 'customer/support-requests') {
      assert.equal(body.rentalContractId, contract.id);
      assert.equal(body.storageUnitId, unit.id);
      assert.equal(body.subject, 'Yêu cầu chuyển kho');
      support = { ...body, id: 'support-transfer', supportCode: 'SUP-TRANSFER', status: 'OPEN', customer, reservation, contract, unit, createdAt: when };
      transfer = { id: 'transfer', transferCode: 'TRF-MVP', status: 'REQUESTED', reason: 'UNIT_ISSUE', requestDescription: body.description, reservation, contract, fromUnit: { ...unit, status: 'OCCUPIED' }, toUnit: null, customer, createdAt: when, updatedAt: when,
        transferRequestedSchedule: width === 390 ? { startAt: '2026-11-20T01:00:00.000Z', endAt: '2026-11-20T03:00:00.000Z' } : null,
      };
      return send({ ...support, transfers: [transfer] }, 201);
    }
    if (role === 'MANAGER' && action === 'approve') {
      assert.deepEqual(body, { toStorageUnitId: destination.id, staffUserId: staff.id, ...(width === 390 ? { commercialReviewHash: 'reviewed-fixture' } : {}) });
      Object.assign(transfer, { status: 'APPROVED', toUnit: { ...destination, status: 'RESERVED' }, assignedStaff: staff, approvedBy: manager, approvedAt: when, updatedAt: '2026-11-20T00:00:00Z', ...(width === 390 ? { commercial: { acceptedAt: null }, requiresAcceptance: true, commercialPayment: { dueInvoices: [{ id: 'due', code: 'INV-DUE', balanceDue: 1000000 }] } } : {}) });
      return send(transfer);
    }
    if (role === 'MANAGER' && action === 'reject') {
      Object.assign(transfer, { status: 'REJECTED', rejectionReason: body.reason, updatedAt: '2026-11-20T00:00:00Z' });
      return send(transfer);
    }
    if (role === 'STAFF' && action === 'complete') {
      assert.equal(actor.id, staff.id);
      assert.equal(body.goodsMoved, true);
      assert.equal(transfer.status, 'APPROVED');
      Object.assign(transfer, { status: 'COMPLETED', fromUnit: { ...unit, status: 'MAINTENANCE' }, toUnit: { ...destination, status: 'OCCUPIED' }, completedAt: when, completedBy: staff, handoverReport: body, updatedAt: '2026-11-21T00:00:00Z' });
      support.status = 'RESOLVED';
      return send(transfer);
    }
    return send({ message: 'Unexpected mutation' }, 500);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(12000);
  return { page, context };
}

async function submit(page) {
  await page.goto(base + '/customer/transfers');
  await selectChoice(page.getByLabel('Yêu cầu đặt kho', { exact: true }), reservation.reference);
  await selectChoice(page.getByLabel('Hợp đồng liên quan', { exact: true }), contract.id);
  await page.getByLabel('Chi tiết', { exact: true }).fill('Tôi muốn chuyển kho để tiện lấy hàng.');
  await page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
  await page.getByText(/Đã gửi yêu cầu chuyển kho/).waitFor();
}

try {
  for (const width of [1440, 390]) {
    support = transfer = undefined;
    const customerApp = await pageFor('CUSTOMER', customer, width);
    const managerApp = await pageFor('MANAGER', manager, width);
    const staffApp = await pageFor('STAFF', staff, width);
    const otherApp = await pageFor('STAFF', otherStaff, width);
    await submit(customerApp.page);
    await staffApp.page.goto(base + '/staff/transfers');
    await staffApp.page.getByRole('heading', { name: 'Chuyển kho', exact: true }).waitFor();
    assert.equal(await staffApp.page.getByText('TRF-MVP', { exact: true }).count(), 0);
    assert.equal(await staffApp.page.getByRole('button', { name: /Đề xuất|Gửi đề nghị/ }).count(), 0);
    const page = managerApp.page;
    currentPage = page;
    await page.goto(base + '/manager/reviews?view=decision&kind=transfers');
    const reviews = page.getByRole('table', { name: 'Hồ sơ cần xử lý' });
    await reviews.getByText('TRF-MVP', { exact: true }).waitFor();
    assert.equal(await reviews.locator('tbody tr').count(), 1);
    await reviews.getByRole('link', { name: 'Xem chi tiết hồ sơ TRF-MVP' }).press('Enter');
    const approve = page.getByRole('button', { name: 'Duyệt và phân công', exact: true });
    const managerTransfer = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Điều chuyển', exact: true }) });
    await managerTransfer.getByText(width === 390 ? '20/11/2026 · 08:00–10:00' : 'Chưa có lịch hẹn', { exact: true }).waitFor();
    if (width === 390) await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Tất cả loại kho' }) }).selectOption('all');
    await page.getByRole('radio', { name: /A102/ }).check();
    assert(await approve.isDisabled());
    if (width === 390) {
      await page.getByText('Giá nếu gia hạn tiếp').waitFor();
      assert.equal(await page.getByText(/RN-PL01/).isVisible(), false);
      await page.getByText('Chi tiết thanh toán và gia hạn', { exact: true }).click();
      await page.getByText(/RN-PL01/).waitFor();
    }
    await page.getByRole('radio', { name: new RegExp(staff.fullName) }).check();
    await approve.click();
    await page.getByText('Đã duyệt kho đích.', { exact: false }).waitFor();
    await page.getByRole('link', { name: 'Về hồ sơ cần xử lý' }).click();
    await page.getByText('Không có hồ sơ cần xử lý', { exact: true }).waitFor();
    currentPage = otherApp.page;
    await otherApp.page.goto(base + '/staff/transfers/transfer');
    await otherApp.page.getByRole('alert').filter({ hasText: 'Không tìm thấy lệnh chuyển kho' }).waitFor();
    const operation = staffApp.page;
    currentPage = operation;
    await operation.goto(base + '/staff/transfers/transfer');
    const complete = operation.getByRole('button', { name: 'Hoàn tất chuyển kho', exact: true });
    if (width === 390) {
      await operation.getByRole('alert').filter({ hasText: 'Không tìm thấy lệnh chuyển kho' }).waitFor();
      assert.equal(await complete.count(), 0);
      transfer.commercial.acceptedAt = when;
      transfer.requiresAcceptance = false;
      await operation.reload();
      await operation.getByRole('alert').filter({ hasText: 'Không tìm thấy lệnh chuyển kho' }).waitFor();
      assert.equal(await complete.count(), 0);
      transfer.commercialPayment.dueInvoices = [];
      await operation.reload();
    }
    if (width === 390) {
      await operation.getByText('20/11/2026 · 08:00–10:00', { exact: false }).waitFor();
      assert.equal(await operation.getByText('Khách đề xuất · Chưa xác nhận', { exact: false }).count(), 0);
    } else {
      await operation.getByText('Chưa có lịch hẹn', { exact: true }).waitFor();
    }
    transfer.storedItemCount = 2;
    await operation.reload();
    await operation.getByText('2 mặt hàng', { exact: true }).waitFor();
    assert(await complete.isDisabled());
    transfer.storedItemCount = 0;
    await operation.reload();
    await operation.getByLabel('Người nhận kho mới', { exact: true }).fill(customer.fullName);
    await operation.getByLabel(/Số chìa khóa\/thẻ kho cũ/).fill('1');
    await operation.getByLabel(/Số chìa khóa\/thẻ kho mới/).fill('1');
    for (const checkbox of ['goodsMoved', 'oldKeysReturned', 'newKeysDelivered']) await operation.locator(`input[name="${checkbox}"]`).check();
    await complete.click();
    await operation.getByText('Kết quả chuyển kho', { exact: true }).waitFor();
    assert(await operation.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    currentPage = customerApp.page;
    await customerApp.page.reload();
    await customerApp.page.getByText('Đã chuyển kho', { exact: true }).waitFor();
    await Promise.all([customerApp, managerApp, staffApp, otherApp].map(app => app.context.close()));
  }
  const client = await pageFor('CUSTOMER', customer, 1440);
  const reviewer = await pageFor('MANAGER', manager, 1440);
  await submit(client.page);
  await reviewer.page.goto(base + '/manager/operations/transfers/transfer');
  currentPage = reviewer.page;
  await reviewer.page.getByLabel('Lý do từ chối chuyển kho', { exact: true }).fill('Kho đích chưa phù hợp với hàng đang lưu.');
  await reviewer.page.getByRole('button', { name: 'Từ chối chuyển kho', exact: true }).click();
  await reviewer.page.getByText(/Lệnh chuyển đã bị từ chối/).waitFor();
  await client.page.reload();
  currentPage = client.page;
  await client.page.getByText('Chi tiết và phản hồi', { exact: true }).click();
  await client.page.getByText('Kho đích chưa phù hợp với hàng đang lưu.', { exact: false }).waitFor();
  assert.equal(transfer.toUnit, null);
  assert.equal(transfer.assignedStaff, undefined);
  assert.deepEqual(writes.filter(write => write.role === 'STAFF').map(write => write.path), ['staff/transfers/transfer/complete', 'staff/transfers/transfer/complete']);
  assert.deepEqual(errors, []);
  console.log('PASS Customer request, single Manager review and assignment, Staff scope and completion, rejection and appendix gate at desktop and mobile widths. API mocked.');
} catch (error) {
  if (currentPage && !currentPage.isClosed()) console.error(currentPage.url(), (await currentPage.locator('body').innerText()).slice(0, 3000), errors);
  throw error;
} finally { await browser.close(); }
