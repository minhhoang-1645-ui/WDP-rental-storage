import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, customer, unit, when } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const output = 'artifacts/customer-account';
await mkdir(output, { recursive: true });
const browser = await launchTestBrowser();
const errors = [], writes = [];
let active = true;
const invoice = (id, type, rental, deposit, paid, start, end) => ({ id, code: id, type, status: paid === rental + deposit ? 'PAID' : 'OPEN', renewalId: type === 'RENEWAL' ? 'renewal' : null,
  periodStart: start, periodEnd: end, dueAt: start, rental, deposit, services: 0, charges: 0, total: rental + deposit, paid, balance: rental + deposit - paid, dueState: paid === rental + deposit ? 'PAID' : 'UPCOMING' });
const initial = invoice('I01-ACCOUNT', 'INITIAL', 1500000, 1500000, 3000000, '2026-11-17', '2026-12-17');
const recurring = [invoice('I02-ACCOUNT', 'RECURRING', 1500000, 0, 0, '2026-12-17', '2027-01-17'), invoice('I03-ACCOUNT', 'RECURRING', 1500000, 0, 0, '2027-01-17', '2027-02-17')];
const renewalInvoice = invoice('REN-I01-ACCOUNT', 'RENEWAL', 4275000, 0, 4275000, '2027-02-17', '2027-05-17');
const paymentDetails = { totalInvoiced: 10275000, totalPaid: 7275000, totalOutstanding: 3000000, groups: [
  { type: 'INITIAL', title: 'Lần thanh toán đầu tiên', total: 3000000, paid: 3000000, balance: 0, invoices: [initial] },
  { type: 'RECURRING', title: 'Các kỳ còn lại của đơn thuê ban đầu', total: 3000000, paid: 0, balance: 3000000, invoices: recurring },
  { type: 'RENEWAL', title: 'Tiền gia hạn', total: 4275000, paid: 4275000, balance: 0, invoices: [renewalInvoice] },
] };
const rentalPeriod = { originalStartDate: '2026-11-17', originalEndDate: '2027-02-17', originalMonths: 3, extendedMonths: 3, totalMonths: 6, currentStartDate: '2026-11-17', currentEndDate: '2027-05-17' };
const summary = { paymentDetails, rentalPeriod, currentUnits: [{ contractId: 'contract-id', contractCode: 'CON-ACCOUNT', unitCode: 'RV10-SM-04' }], totalInvoiced: 10275000, totalPaid: 7275000, renewalPaid: 4275000,
  renewals: [{ id: 'renewal', code: 'REN-ACCOUNT', status: 'COMPLETED', months: 3, previousEndDate: '2027-02-17', endDate: '2027-05-17', amount: 4275000, paid: 4275000, discount: 225000 }], transfers: [] };
const reservation = { ...fixture.reservations[0], id: 'RES-ACCOUNT', status: 'CONFIRMED', startDate: '2026-11-17', endDate: '2027-05-17', endDateExclusive: '2027-05-17', periodMode: 'duration', durationMonths: 3, quantity: 1, rentalSummary: summary,
  quote: { ...fixture.reservations[0].quote, quotedTotalAmount: 6000000, grandTotal: 6000000, estimatedInitialAmountDue: 3000000, lineItems: [{ code: 'rent', label: 'Tiền thuê kho', basis: '3 tháng × 1 kho', amount: 4500000 }, { code: 'deposit', label: 'Tiền cọc', basis: 'Tiền cọc', amount: 1500000 }] } };
const contract = { ...fixture.contracts[0], contractCode: 'CON-ACCOUNT', status: 'ACTIVE', startDate: '2026-11-17', endDate: '2027-05-17', reservation: { ...fixture.contracts[0].reservation, id: 'reservation-id', reference: reservation.id }, storageUnit: { ...unit, unitCode: 'RV10-SM-04' } };
const returned = { ...contract, id: 'returned-contract', contractCode: 'CON-RETURNED', status: 'COMPLETED', storageUnit: { ...unit, id: 'returned-unit', unitCode: 'SM-C08-004' } };
const goods = [{ id: 'item', name: 'Trực thăng mô hình', itemCode: 'ITEM-ACCOUNT', unit: 'thùng', balance: 1 }];
const rental = { ...fixture.rentals[0], reservationReference: reservation.id, rentalState: 'ACTIVE', startDate: '2026-11-17', effectiveEndDate: '2027-05-17', unitCount: 1, quantity: 1, paymentDetails, rentalPeriod,
  contracts: [{ ...contract, unit: contract.storageUnit, storedItems: goods }], billingSummary: { totalInvoiced: 10275000, totalPaid: 7275000, totalOutstanding: 3000000 }, pendingRenewal: null };
const movement = { ...fixture['stock-movements'][0], status: 'COMPLETED', completedAt: when, storageUnit: { ...unit, unitNumber: 'OLD-UNIT' }, currentStorageUnit: { ...unit, unitNumber: 'RV10-SM-04', floor: 'Ground', zone: 'RV10' }, lines: [{ id: 'line', storedItem: goods[0], requestedQty: 1, actualQty: 1, note: null }] };
const appointments = [0, 1].map(index => ({ ...fixture.appointments[0], id: `appointment-${index}`, appointmentCode: `APP-${index}`, status: 'COMPLETED', assignedStaff: null, completedAt: when }));
const renewals = [0, 1].map(index => ({ ...fixture.renewals[0], id: `renewal-${index}`, renewalCode: `REN-${index}`, status: 'COMPLETED', reservation: { ...fixture.renewals[0].reservation, storageType: reservation.product }, appendix: null }));
const support = [0, 1].map(index => ({ ...fixture['support-requests'][0], id: `support-${index}`, supportCode: `SUP-${index}`, status: 'RESOLVED', resolutionNote: 'Đã kiểm tra và xử lý yêu cầu của bạn.' }));
const claims = [0, 1].map(index => ({ id: `claim-${index}`, claimCode: `CLAIM-${index}`, status: 'RESOLVED', discoveredOn: '2026-11-17', unitCodeSnapshot: index ? 'SM-C08-004' : 'RV10-SM-04', description: 'Hàng hóa cần kiểm tra tình trạng tại kho.', updatedAt: when, estimatedValue: 500000, affectedItems: [{ id: 'item', name: 'Trực thăng mô hình', unit: 'thùng' }], evidenceLinks: [], staffFacts: 'Đã kiểm tra hàng tại kho.', decisionReason: 'Đã đối chiếu thông tin.', resolutionNote: 'Đã thông báo kết quả cho bạn.', decision: 'APPROVED' }));

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'customer-account-fixture'));
await context.route('**/api/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname.replace(/^\/api\//, '');
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  if (request.method() !== 'GET') { writes.push(path); return route.fulfill({ status: 403, json: { message: 'Unexpected write in read-only test' } }); }
  if (path === 'auth/me') return route.fulfill({ json: { ...customer, role: 'CUSTOMER' } });
  if (path === 'reservations') return route.fulfill({ json: [reservation] });
  if (path.startsWith('reservations/')) return route.fulfill({ json: reservation });
  if (path.endsWith('/stored-items')) return route.fulfill({ json: goods });
  const kind = path.split('/').at(-1), sources = { rentals: [rental], contracts: [active ? contract : { ...contract, status: 'COMPLETED' }, returned], 'stock-movements': [movement], 'damage-claims': claims, appointments, renewals, 'support-requests': support };
  const items = sources[kind] ?? [];
  return route.fulfill({ json: { items, total: items.length, page: 1, limit: 100 } });
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on('pageerror', error => errors.push(error.message));
async function shot(name) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: page overflows`);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' });
}
try {
  await page.goto(base + '/customer/reservations');
  const payment = page.locator('.reservation-payment-summary').first();
  await payment.getByText('Đã thu:', { exact: false }).waitFor();
  assert.match(await payment.innerText(), /7\.275\.000/);
  assert.match(await payment.innerText(), /Chưa thanh toán:[\s\S]*3\.000\.000/);
  assert.equal(await payment.locator('span').count(), 2);
  assert.doesNotMatch(await payment.innerText(), /6\.000\.000/);
  assert.match(await page.locator('main').innerText(), /3 tháng ban đầu \+ 3 tháng gia hạn = 6 tháng/);
  await shot('reservation-payment-summary');

  await page.goto(base + '/customer/reservations/RES-ACCOUNT');
  await page.getByText('Xem chi tiết thanh toán và thay đổi', { exact: true }).click();
  const account = page.getByRole('region', { name: 'Chi tiết các khoản thanh toán' });
  await account.waitFor();
  assert.match(await account.innerText(), /7\.275\.000/);
  const initialGroup = account.getByRole('region', { name: 'Lần thanh toán đầu tiên' });
  await initialGroup.locator('summary').click();
  assert.match(await initialGroup.innerText(), /tiền thuê 1\.500\.000.*tiền cọc 1\.500\.000/);
  const recurringGroup = account.getByRole('region', { name: 'Các kỳ còn lại của đơn thuê ban đầu' });
  await recurringGroup.locator('summary').click();
  assert.equal(await recurringGroup.locator('li').count(), 2);
  assert.match(await recurringGroup.innerText(), /17\/12\/2026 – 17\/01\/2027/);
  assert.match(await recurringGroup.innerText(), /17\/01\/2027 – 17\/02\/2027/);
  await page.getByText('Toàn bộ thời gian thuê hiện tại · 6 tháng', { exact: true }).waitFor();
  await shot('reservation-account-details');
  await page.setViewportSize({ width: 390, height: 844 }); await shot('reservation-account-details-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(base + '/customer/rentals');
  await page.getByRole('heading', { name: 'Hàng đang lưu · 1 mặt hàng' }).waitFor();
  assert.equal(await page.locator('.customer-unit-inventory').count(), 1);
  await page.getByText('Xem thanh toán', { exact: true }).click();
  await account.waitFor();
  assert.match(await account.innerText(), /4\.275\.000/);
  await shot('rental-account-details');

  await page.goto(base + '/customer/stock-movements');
  const items = page.getByRole('region', { name: 'Hàng hóa trong phiếu' });
  await items.getByText('Trực thăng mô hình', { exact: true }).waitFor();
  assert(await page.locator('.stock-card').first().evaluate(card => card.firstElementChild?.classList.contains('stock-movement-items')));
  assert.equal(await page.locator('.stock-card .record-identity').count(), 0);
  assert.doesNotMatch(await items.innerText(), /ITEM-ACCOUNT|Số lượng yêu cầu|Hàng hóa trong phiếu/);
  assert.match(await page.locator('.stock-card').first().innerText(), /RV10-SM-04 · Tầng trệt · Khu RV10/);
  assert.doesNotMatch(await page.locator('.stock-card').first().innerText(), /OLD-UNIT/);
  assert.match(await items.innerText(), /1 thùng/);
  await shot('customer-stock-item-names');
  await page.setViewportSize({ width: 390, height: 844 }); await shot('customer-stock-item-names-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const [path, selector, summary, name] of [
    ['/customer/appointments', '.appointment-request-card', 'Chi tiết yêu cầu', 'appointment-cards'],
    ['/customer/renewals', '.customer-request-card', 'Chi tiết gia hạn', 'renewal-cards'],
    ['/customer/support', '.customer-request-card', 'Chi tiết và phản hồi', 'support-cards'],
    ['/customer/damage-claims', '.customer-claim-card', 'Chi tiết sự cố', 'claim-cards'],
  ]) {
    await page.goto(base + path);
    if (path.endsWith('appointments')) await page.getByRole('tab', { name: 'Đã hoàn tất / hủy' }).click();
    const cards = page.locator(selector);
    await cards.nth(1).waitFor();
    assert.equal(await cards.count(), 2);
    const disclosure = cards.first().locator('details').filter({ has: page.locator('summary').getByText(summary, { exact: true }) }).first();
    assert.equal(await disclosure.getAttribute('open'), null);
    await cards.first().getByText(summary, { exact: true }).click();
    assert.notEqual(await disclosure.getAttribute('open'), null);
    await cards.first().getByText(summary, { exact: true }).click();
    assert.equal(await disclosure.getAttribute('open'), null);
    await shot(name);
    await page.setViewportSize({ width: 390, height: 844 }); await shot(`${name}-mobile`);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

  await page.goto(base + '/customer/damage-claims');
  await page.getByRole('button', { name: 'Báo sự cố', exact: true }).click();
  const picker = page.getByRole('combobox', { name: 'Kho/hợp đồng', exact: true });
  await picker.click();
  await page.getByRole('option', { name: /RV10-SM-04/ }).waitFor();
  assert.equal(await page.getByRole('option', { name: /SM-C08-004/ }).count(), 0);
  await shot('claim-active-rental-only');
  await page.getByRole('option', { name: /RV10-SM-04/ }).click();
  active = false;
  await page.reload();
  await page.getByRole('button', { name: 'Báo sự cố', exact: true }).click();
  await page.getByText('Bạn chưa có kho đang thuê để gửi báo cáo sự cố mới.', { exact: false }).waitFor();
  assert(await page.getByRole('button', { name: 'Gửi báo sự cố', exact: true }).isDisabled());
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log('PASS: accurate initial receipts, outstanding original periods, renewal duration, one current unit, stock item names and active-only incident picker. No database writes.');
} finally { await browser.close(); }
