import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { selectChoice } from './select-choice.mjs';
import { fixture, staff, customer, unit, when } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const output = 'artifacts/rental-lifecycle-review';
await mkdir(output, { recursive: true });
const browser = await launchTestBrowser();
const pageErrors = [], unexpectedWrites = [], handovers = [];
const newUnit = { ...unit, id: 'new-unit', unitCode: 'SM-C08-004', unitNumber: 'SM-C08-004', floor: 'Tầng 1', zone: 'C08' };
const oldUnit = { ...unit, unitCode: 'SM-C08-003', unitNumber: 'SM-C08-003' };
const goods = [{ id: 'item-id', itemCode: 'ITEM-TEST', name: 'Máy lạnh', unit: 'cái', balance: 1, storageUnit: newUnit, rentalContract: { id: 'contract-id', contractCode: 'CON-TEST' } }];
const summary = { currentUnits: [{ contractId: 'contract-id', contractCode: 'CON-TEST', unitCode: newUnit.unitCode }], totalInvoiced: 9215000, totalPaid: 9215000, renewalPaid: 5415000,
  renewals: [{ id: 'renewal', code: 'REN-TEST', status: 'COMPLETED', months: 3, previousEndDate: '2026-12-17', endDate: '2027-03-17', amount: 5415000, discount: 285000, paid: 5415000 }],
  transfers: [{ id: 'transfer-id', code: 'TRF-TEST', from: oldUnit.unitCode, to: newUnit.unitCode, completedAt: when, handoverReport: null }] };
const reservation = { ...fixture.reservations[0], id: 'RES-TEST', status: 'CONFIRMED', startDate: '2026-11-17', endDateExclusive: '2027-03-17', periodMode: 'duration', durationMonths: 1, rentalSummary: summary,
  product: { ...fixture.reservations[0].product, dimensions: '1,5 × 2,0 × 2,4 m' }, quote: { ...fixture.reservations[0].quote, quotedTotalAmount: 3800000, grandTotal: 3800000, message: 'Báo giá ban đầu' } };
const contract = { ...fixture.contracts[0], storageUnit: newUnit, reservation: { ...fixture.contracts[0].reservation, reference: 'RES-TEST' }, startDate: '2026-11-17', endDate: '2027-03-17' };
const rental = { ...fixture.rentals[0], reservationReference: 'RES-TEST', rentalState: 'ACTIVE', startDate: '2026-11-17', effectiveEndDate: '2027-03-17', quantity: 1, unitCount: 1, historicalPricing: { billingMode: 'MONTHLY' }, pendingRenewal: null,
  contracts: [{ ...contract, unit: newUnit, storedItems: goods, transfers: [{ code: 'TRF-TEST', from: oldUnit.unitCode, to: newUnit.unitCode, completedAt: when }] }], billingSummary: { payableBalance: 0, totalOutstanding: 0 } };
const movement = { ...fixture['stock-movements'][0], status: 'ASSIGNED', storageUnit: oldUnit, currentStorageUnit: newUnit, storageUnitAtCompletion: oldUnit, completedAt: null,
  lines: [{ ...fixture['stock-movements'][0].lines[0], requestedQty: 1, actualQty: null, storedItem: goods[0] }] };

async function setup(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'lifecycle-fixture'));
  let claim = { id: 'claim-id', claimCode: 'CLAIM-TEST', status: 'REPORTED', discoveredOn: '2026-11-17', unitCodeSnapshot: newUnit.unitCode, description: 'Máy lạnh bị hư hỏng cần kiểm tra.', updatedAt: when, estimatedValue: 500000, affectedItems: goods, evidenceLinks: [], staffFacts: null, decisionReason: null, resolutionNote: null, customer };
  let transfer = structuredClone(fixture.transfers[0]);
  transfer.fromUnit = oldUnit;
  await context.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\//, '');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (req.method() === 'PATCH' && path.endsWith('damage-claims/claim-id')) {
      claim = { ...claim, staffFacts: req.postDataJSON().staffFacts, status: 'INVESTIGATING', updatedAt: '2026-11-17T10:00:00Z' };
      return route.fulfill({ json: claim });
    }
    if (req.method() === 'POST' && path === 'staff/transfers/transfer-id/complete') {
      handovers.push(req.postDataJSON()); transfer = { ...transfer, status: 'COMPLETED', updatedAt: '2026-11-17T11:00:00Z', handoverReport: req.postDataJSON() };
      return route.fulfill({ json: transfer });
    }
    if (req.method() !== 'GET') { unexpectedWrites.push(path); return route.fulfill({ status: 403, json: { message: 'Unexpected fixture mutation' } }); }
    if (path === 'auth/me') return route.fulfill({ json: { ...(role === 'CUSTOMER' ? customer : staff), role } });
    if (path.endsWith('/assigned-units') || path === 'manager/unit-staff-assignments') return route.fulfill({ json: { enabled: false, items: [] } });
    if (path === 'reservations') return route.fulfill({ json: [reservation] });
    if (path.startsWith('reservations/')) return route.fulfill({ json: reservation });
    if (path.endsWith('/stored-items')) return route.fulfill({ json: path.startsWith('customer/') ? goods : { items: goods, total: 1 } });
    if (path.endsWith('/destinations')) return route.fulfill({ json: { items: [{ ...newUnit, eligible: true, checkedFrom: '2026-11-17', checkedUntil: '2027-03-17', conflicts: [] }], total: 1, page: 1, limit: 100 } });
    if (path.includes('/transfers/transfer-id')) return route.fulfill({ json: transfer });
    if (path.endsWith('/stock-movements/movement-id')) return route.fulfill({ json: movement });
    if (path.endsWith('/returns/return-id')) return route.fulfill({ json: { ...fixture.returns[0], status: 'INSPECTION_IN_PROGRESS', inventory: { remainingItemTypes: 1, pendingMovements: 0 } } });
    const kind = path.split('/').at(-1);
    const sources = { contracts: [contract], rentals: [rental], 'stock-movements': [movement], 'support-requests': [], maintenance: [], 'damage-claims': [claim], transfers: [transfer], returns: [], 'deposit-settlements': [], invoices: [] };
    return route.fulfill({ json: { items: sources[kind] ?? [], total: (sources[kind] ?? []).length, page: 1, limit: 100 } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => pageErrors.push(error.message));
  return { context, page, approve: () => { transfer = { ...transfer, status: 'APPROVED', toUnit: newUnit, updatedAt: '2026-11-17T09:00:00Z' }; } };
}

async function shot(page, name) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: page overflows`);
}

try {
  const app = await setup('CUSTOMER'), page = app.page;
  await page.goto(base + '/customer/reservations');
  await page.getByText('Đã thu:', { exact: false }).first().waitFor();
  assert.match(await page.locator('main').innerText(), /9\.215\.000/);
  await shot(page, 'customer-reservations');
  await page.goto(base + '/customer/reservations/RES-TEST');
  await page.getByRole('heading', { name: 'Kho và thanh toán' }).waitFor();
  await page.getByText('Xem chi tiết thanh toán và thay đổi', { exact: true }).click();
  assert.match(await page.locator('main').innerText(), /5\.415\.000/);
  await shot(page, 'customer-reservation-detail');
  await page.goto(base + '/customer/booking-history');
  const historyCard = page.locator('.booking-history-card').first();
  await historyCard.getByRole('button', { name: 'Xem chi tiết', exact: true }).waitFor();
  assert.equal(await historyCard.locator('.booking-history-details').isVisible(), false);
  await shot(page, 'customer-booking-history-collapsed');
  await historyCard.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
  await historyCard.getByText('Xem chi tiết thanh toán và thay đổi', { exact: true }).click();
  await page.getByRole('heading', { name: 'Lịch sử gia hạn' }).waitFor();
  await shot(page, 'customer-booking-history');
  await historyCard.getByRole('button', { name: 'Ẩn chi tiết', exact: true }).click();
  assert.equal(await historyCard.locator('.booking-history-details').isVisible(), false);
  await page.goto(base + '/customer/rentals');
  await page.getByRole('heading', { name: 'Hàng đang lưu · 1 mặt hàng' }).waitFor();
  await page.locator('.rental-goods li').filter({ hasText: 'Máy lạnh' }).waitFor();
  await shot(page, 'customer-rental-goods');
  await page.goto(base + '/customer/stock-movements/movement-id');
  await page.getByRole('heading', { name: 'Đối chiếu hàng hóa' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: /Nhập hàng · SM-C08-004/ }).count(), 1);
  await shot(page, 'customer-stock-reconciliation');
  await page.goto(base + '/customer/returns');
  await page.getByRole('heading', { name: 'Xuất hết hàng trước khi trả kho' }).waitFor();
  await shot(page, 'customer-return-guidance');
  await page.goto(base + '/customer/damage-claims');
  await page.getByRole('button', { name: 'Báo sự cố', exact: true }).click();
  await selectChoice(page.getByRole('combobox', { name: 'Kho/hợp đồng', exact: true }), 'contract-id');
  const affected = page.locator('.claim-affected-items').getByRole('checkbox');
  await affected.waitFor();
  const box = await affected.boundingBox(); assert(box.width <= 24 && box.height <= 24);
  await shot(page, 'customer-damage-form');
  await page.setViewportSize({ width: 390, height: 844 }); await shot(page, 'customer-damage-form-mobile');
  await app.context.close();

  const staffApp = await setup('STAFF'), sp = staffApp.page;
  await sp.goto(base + '/staff/stock-movements/movement-id');
  await sp.getByLabel('Số lượng thực tế · Máy lạnh', { exact: true }).fill('1');
  await sp.getByText('Khớp với số lượng yêu cầu.', { exact: true }).waitFor();
  await shot(sp, 'staff-stock-reconciliation');
  await sp.goto(base + '/staff/damage-claims');
  await sp.getByLabel('Những gì đã kiểm tra tại kho').fill('Đã kiểm tra máy lạnh và đối chiếu tình trạng tại kho.');
  await sp.getByRole('button', { name: 'Lưu ghi nhận để quản lý xem xét' }).click();
  await sp.getByRole('button', { name: 'Chỉnh sửa ghi nhận' }).waitFor();
  assert.equal(await sp.getByRole('button', { name: 'Lưu ghi nhận để quản lý xem xét' }).count(), 0);
  await sp.getByRole('button', { name: 'Chỉnh sửa ghi nhận' }).click();
  assert.match(await sp.getByLabel('Những gì đã kiểm tra tại kho').inputValue(), /Đã kiểm tra máy lạnh/);
  await sp.getByRole('button', { name: 'Hủy chỉnh sửa' }).click();
  await shot(sp, 'staff-damage-saved');
  await sp.goto(base + '/staff/returns/return-id');
  await sp.getByRole('heading', { name: 'Chưa thể hoàn tất nhận trả kho' }).waitFor();
  assert(await sp.getByRole('button', { name: 'Hoàn tất nhận kho trả' }).isDisabled());
  await shot(sp, 'staff-return-blocked');
  await sp.goto(base + '/staff/transfers/transfer-id');
  await sp.getByLabel('Chọn kho đích').getByText(newUnit.unitCode, { exact: true }).waitFor();
  await shot(sp, 'staff-transfer-destination');
  staffApp.approve(); await sp.reload();
  await sp.getByLabel('Người nhận kho mới', { exact: true }).fill('Khách kiểm thử');
  await sp.getByLabel('Số chìa khóa/thẻ kho cũ đã thu').fill('1');
  await sp.getByLabel('Số chìa khóa/thẻ kho mới đã giao').fill('1');
  for (const name of ['Đã chuyển toàn bộ hàng và kiểm tra kho cũ', 'Đã thu lại chìa khóa/thẻ hoặc thu hồi mã truy cập kho cũ', 'Đã giao chìa khóa/thẻ hoặc cấp mã truy cập kho mới cho khách']) await sp.getByRole('checkbox', { name, exact: true }).check();
  await shot(sp, 'staff-transfer-key-handover');
  await sp.getByRole('button', { name: 'Hoàn tất chuyển kho', exact: true }).click();
  await sp.getByText('Đã hoàn tất chuyển kho thực tế. Hợp đồng hiện dùng kho đích.').waitFor();
  assert.deepEqual(handovers.map(input => [input.returnedKeyCount, input.deliveredKeyCount, input.oldKeysReturned, input.newKeysDelivered]), [[1, 1, true, true]]);
  await staffApp.context.close();

  const managerApp = await setup('MANAGER'), mp = managerApp.page;
  await mp.goto(base + '/manager/assignments?kind=stock-movements&record=movement-id');
  const dialog = mp.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'Hàng hóa cần giao nhận' }).waitFor();
  assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await shot(mp, 'manager-stock-assignment');
  await mp.setViewportSize({ width: 390, height: 844 });
  assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await shot(mp, 'manager-stock-assignment-mobile');
  await managerApp.context.close();
  assert.deepEqual(pageErrors, []); assert.deepEqual(unexpectedWrites, []);
  console.log('PASS customer renewal/transfer history, per-unit goods, stock reconciliation, claim save/edit, return guidance, transfer keys and responsive assignment dialog. All writes mocked.');
} finally { await browser.close(); }
