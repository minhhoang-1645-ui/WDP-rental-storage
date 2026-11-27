import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { selectChoice } from './select-choice.mjs';

const base = new URL(process.env.WDP_FE_URL || 'http://127.0.0.1:5173');
assert(['127.0.0.1', 'localhost'].includes(base.hostname));
const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const manager = { id: 'manager', role: 'FACILITY_MANAGER', fullName: 'Quản lý kiểm thử', email: 'manager@example.test' };
const at = '2027-01-22T08:00:00.000Z';
const invoice = {
  id: 'inv', invoiceCode: 'INV-TEST', type: 'RECURRING', status: 'PARTIALLY_PAID', currency: 'VND',
  billingPeriodStart: '2027-01-22', billingPeriodEnd: '2027-02-22', dueAt: '2027-01-22', issuedAt: at,
  rentalAmount: 5500000, depositAmount: 0, serviceAmount: 0, chargeAmount: 0, totalAmount: 5500000, amountPaid: 2000000, balanceDue: 3500000,
  reservation: { reference: 'WDP-TEST', quantity: 1, facility: { id: 'A', name: 'Cơ sở A' }, storageType: { name: 'Kho lớn' }, customer: { fullName: 'Khách kiểm thử' } },
  contracts: [{ id: 'C1', contractCode: 'HĐ-01', status: 'ACTIVE', storageUnit: { id: 'U1', unitCode: 'LG-03' } }],
  breakdown: { units: [{ contractId: 'C1', contractCode: 'HĐ-01', unitCode: 'LG-03', storageTypeName: 'Kho lớn', rentalAmount: 5500000, monthlyRate: 5500000, depositAmount: 0 }], sharedServices: [] },
  historicalPricing: { termMonths: 3, quantity: 1, monthlyUnitPrice: 5500000, paymentPlan: 'PAY_MONTHLY', rentalAmount: 16500000, depositAmount: 5500000, quotedTotalAmount: 22000000, initialPaymentBreakdown: { totalAmount: 11000000, remainingAmount: 11000000 } },
  payments: [{ id: 'p1', paymentCode: 'WDP-2026-D91D76A2-I03-P01', receivedAt: at, method: 'VNPAY', reference: 'ONLINE-1', amount: 2000000, recordedBy: manager }],
};
const original = structuredClone(invoice);
const writes = [], reads = [];
let submissions = [], reconciliation = [], forbidden = false, reviewError = false;
const pdf = Buffer.from('%PDF-1.4\n% isolated test fixture\n%%EOF');
const pageOf = items => ({ items, page: 1, limit: 100, total: items.length });

await page.addInitScript(() => {
  localStorage.setItem('wdp-auth-token-v1', 'fixture-manager-invoice');
  window.print = () => { document.body.dataset.testPrinted = 'true'; };
});
await page.route('**/api/**', async route => {
  const request = route.request(), url = new URL(request.url());
  const endpoint = url.pathname.replace(/^\/api/, '');
  const send = (json, status = 200) => route.fulfill({ json, status });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  if (endpoint === '/auth/me') return send(manager);
  if (endpoint === '/manager/staff/facilities') return send([{ id: 'A', name: 'Cơ sở A' }]);
  if (request.method() === 'GET') {
    reads.push(endpoint);
    if (endpoint === '/manager/invoices/inv') return forbidden ? send({ message: 'Không tìm thấy hóa đơn tại cơ sở.' }, 404) : send(invoice);
    if (endpoint === '/manager/payment-submissions') return reviewError ? send({ message: 'Không tải được giao dịch.' }, 500) : send(pageOf(submissions));
    if (endpoint === '/manager/online-payment-reconciliations') return send(pageOf(reconciliation));
    if (endpoint === '/manager/documents/invoices/inv') {
      assert(!url.searchParams.has('token'));
      return route.fulfill({ contentType: 'application/pdf', body: pdf });
    }
    return send(pageOf([]));
  }
  const body = request.postDataJSON();
  writes.push({ endpoint, body, key: request.headers()['idempotency-key'] });
  if (endpoint === '/manager/invoices/inv/payments') {
    if (body.reference === 'ONLINE-1') return send({ message: 'Mã giao dịch đã được ghi nhận.' }, 409);
    invoice.amountPaid += body.amount;
    invoice.balanceDue -= body.amount;
    invoice.status = invoice.balanceDue === 0 ? 'PAID' : 'PARTIALLY_PAID';
    invoice.updatedAt = '2027-01-22T09:00:00.000Z';
    invoice.payments.push({ id: 'p2', paymentCode: 'PAY-02', method: body.method, receivedAt: at, amount: body.amount, reference: body.reference, recordedBy: manager });
    return send({ invoice }, 201);
  }
  if (endpoint === '/manager/payment-submissions/sub/verify') {
    submissions[0].status = 'VERIFIED';
    return send({ id: 'sub' }, 201);
  }
  if (endpoint === '/manager/online-payment-reconciliations/rec/resolve') {
    reconciliation[0].status = 'RECONCILED';
    return send({ id: 'rec' }, 201);
  }
  return send({ message: 'Unexpected operation' }, 405);
});

try {
  const go = (query = '') => page.goto(new URL('/manager/operations/invoices/inv' + query, base).href);
  const tab = name => page.getByRole('tab', { name, exact: true });
  const panel = name => page.getByRole('tabpanel', { name, exact: true });
  const progress = page.getByRole('progressbar', { name: 'Tiến độ thanh toán' });
  const waitProgress = value => page.waitForFunction(expected => document.querySelector('progress[aria-label="Tiến độ thanh toán"]')?.value === expected, value);
  await go();
  await page.getByRole('heading', { name: 'Hóa đơn – LG-03' }).waitFor();
  assert.match(await page.locator('.invoice-dashboard-metrics').innerText(), /5\.500\.000[\s\S]*2\.000\.000[\s\S]*3\.500\.000/);
  await waitProgress(36);
  for (const width of [1920, 1440, 1366, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 950 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflow at ' + width);
    assert(await progress.isVisible());
    const columns = await page.locator('.invoice-dashboard-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns, width > 1100 ? 2 : 1);
  }
  await page.setViewportSize({ width: 1440, height: 980 });
  if (process.env.WDP_INVOICE_SCREENSHOT) await page.screenshot({ path: process.env.WDP_INVOICE_SCREENSHOT, fullPage: true });
  assert.equal(await panel('Tổng quan').getByText('Báo giá toàn kỳ thuê', { exact: true }).count(), 0);
  await tab('Tổng quan').press('ArrowRight');
  await panel('Khoản thu').getByRole('link', { name: 'WDP-2026-D91D76A2-I03-P01' }).waitFor();
  const paymentTable = panel('Khoản thu').locator('.invoice-payments-table');
  for (const width of [1920, 1440, 1366, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 950 });
    assert(await paymentTable.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Payment table overflow at ' + width);
    assert(await paymentTable.locator('time').evaluate(el => getComputedStyle(el).whiteSpace === 'nowrap'));
    assert(await paymentTable.locator('.invoice-numeric strong').evaluate(el => getComputedStyle(el).whiteSpace === 'nowrap'));
  }
  await page.setViewportSize({ width: 1440, height: 980 });
  if (process.env.WDP_PAYMENTS_SCREENSHOT) await paymentTable.screenshot({ path: process.env.WDP_PAYMENTS_SCREENSHOT });
  await tab('Nhật ký').click();
  await panel('Nhật ký').getByText('Phát hành hóa đơn').waitFor();
  await panel('Nhật ký').getByText('Ghi nhận khoản thu').waitFor();
  await tab('Giao dịch').click();
  await panel('Giao dịch').getByText('Thông báo chuyển khoản (0)').waitFor();
  const review = panel('Giao dịch').locator('.invoice-review');
  await review.getByText('0 giao dịch', { exact: true }).waitFor();
  assert.equal(await review.getByText('Số dòng').count(), 0);
  if (process.env.WDP_REVIEW_SCREENSHOT) await review.screenshot({ path: process.env.WDP_REVIEW_SCREENSHOT });
  reviewError = true;
  await review.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await review.getByRole('alert').waitFor();
  assert.equal(await review.getByText('Không có giao dịch', { exact: true }).count(), 0);
  reviewError = false;
  await review.getByRole('button', { name: 'Thử lại' }).click();
  await review.getByText('0 giao dịch', { exact: true }).waitFor();
  const pdfRead = page.waitForResponse(response => response.url().endsWith('/documents/invoices/inv'));
  const popupEvent = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Xem PDF', exact: true }).click();
  assert((await pdfRead).ok());
  await (await popupEvent).close();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải PDF', exact: true }).click();
  assert.equal((await download).suggestedFilename(), 'INV-TEST.pdf');
  await page.getByRole('button', { name: 'In hóa đơn', exact: true }).click();
  assert.equal(await page.locator('body').getAttribute('data-test-printed'), 'true');

  const amount = page.getByLabel('Số tiền nhận (VND)');
  const submit = page.getByRole('button', { name: 'Ghi nhận thanh toán', exact: true });
  const bank = page.getByLabel('Mã giao dịch ngân hàng đã kiểm tra', { exact: true });
  const method = page.locator('.invoice-record-payment').getByRole('combobox');
  await selectChoice(method, 'CASH');
  assert.equal(await bank.count(), 0);
  await selectChoice(method, 'BANK_TRANSFER');
  await amount.fill('4000000'); await bank.fill('BANK-NEW');
  assert(await submit.isDisabled());
  await amount.fill('1000000'); await bank.fill('ONLINE-1');
  await submit.click();
  const confirm = page.getByRole('dialog', { name: 'Xác nhận ghi nhận thanh toán' });
  await confirm.getByRole('button', { name: 'Hủy', exact: true }).click();
  assert.equal(writes.length, 0);
  await submit.click();
  await confirm.getByRole('button', { name: 'Xác nhận ghi nhận' }).evaluate(button => { button.click(); button.click(); });
  await page.getByText('Mã giao dịch đã được ghi nhận.', { exact: true }).waitFor();
  await bank.fill('BANK-NEW');
  await page.getByRole('button', { name: 'Điền số còn thu' }).click();
  assert.equal(await amount.inputValue(), '3500000');
  await submit.click();
  await confirm.getByRole('button', { name: 'Xác nhận ghi nhận' }).click();
  await waitProgress(100);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].body.amount, 3500000);
  assert(writes[1].key);
  assert.equal(await amount.count(), 0);
  await tab('Khoản thu').click();
  await panel('Khoản thu').getByRole('link', { name: 'PAY-02' }).waitFor();

  Object.assign(invoice, structuredClone(original), { status: 'OPEN', amountPaid: 0, balanceDue: 6850000, totalAmount: 6850000, isPastDue: true, depositAmount: 1000000, serviceAmount: 350000, payments: [] });
  invoice.contracts.push({ id: 'C2', contractCode: 'HĐ-02', status: 'ACTIVE', storageUnit: { id: 'U2', unitCode: 'LG-04' } });
  invoice.breakdown.units[0].depositAmount = 1000000;
  invoice.breakdown.units.push({ ...invoice.breakdown.units[0], unitCode: 'LG-04', contractId: 'C2' });
  invoice.historicalPricing = { billingMode: 'DAILY', billableDays: 7, quantity: 2, dailyUnitPrice: '50000', paymentPlan: 'PREPAID', baseRentalAmount: 700000, rentalAmount: 665000, discountAmount: 35000, discountPercent: 5, depositAmount: 0, purchaseAddOnAmount: 25000, quotedTotalAmount: 690000, initialPaymentBreakdown: { totalAmount: 690000, remainingAmount: 0 } };
  const linked = { id: invoice.id, invoiceCode: invoice.invoiceCode, status: invoice.status, balanceDue: invoice.balanceDue };
  submissions = [{ id: 'sub', submissionCode: 'SUB-01', invoice: linked, status: 'PENDING_VERIFICATION', amount: 350000, submittedAt: at, transferReference: 'TR-TEST' }];
  submissions.push(...Array.from({ length: 11 }, (_, index) => ({ ...submissions[0], id: `extra-${index}`, submissionCode: `EXTRA-${index}` })), { ...submissions[0], id: 'done', submissionCode: 'SUB-DONE', status: 'VERIFIED' }, { ...submissions[0], id: 'other', submissionCode: 'OTHER', invoice: { id: 'other' } });
  reconciliation = [{ id: 'rec', reconciliationCode: 'REC-01', invoice: linked, status: 'PENDING_REVIEW', source: 'VNPAY', amount: 350000, createdAt: at }];
  await go();
  await waitProgress(0);
  await panel('Tổng quan').getByRole('link', { name: 'HĐ-02' }).waitFor();
  await panel('Tổng quan').getByText('Hóa đơn đã quá hạn thanh toán.').waitFor();
  assert.match(await panel('Tổng quan').locator('.invoice-charge-lines').innerText(), /1\.000\.000[\s\S]*350\.000/);
  await tab('Giao dịch').click();
  await review.getByText('Thông báo chuyển khoản (12)').waitFor();
  await review.getByRole('button', { name: 'Trang sau' }).click();
  await review.getByText('11–12 trên 12 giao dịch').waitFor();
  await review.getByRole('button', { name: 'Trang trước' }).click();
  await review.getByRole('textbox', { name: 'Tìm kiếm' }).fill('missing');
  await review.getByText('Không có giao dịch phù hợp với bộ lọc hiện tại.').waitFor();
  await review.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await selectChoice(review.locator('.invoice-review-filters').getByRole('combobox'), 'VERIFIED');
  await review.getByRole('button', { name: 'SUB-DONE', exact: true }).waitFor();
  for (const width of [1920, 1440, 1366, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 950 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Transaction page overflow at ' + width);
    await tab('Tổng quan').click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Quote page overflow at ' + width);
    await tab('Giao dịch').click();
  }
  await page.setViewportSize({ width: 1440, height: 980 });
  await tab('Khoản thu').click();
  await panel('Khoản thu').getByText('Hóa đơn này chưa có khoản thu.').waitFor();
  await go('?review=submissions&record=sub');
  const sub = page.getByRole('dialog', { name: 'SUB-01' });
  await sub.getByLabel('Mã giao dịch ngân hàng đã kiểm tra').fill('TR-TEST');
  await sub.getByLabel('Ghi chú / Lý do').fill('Đã đối chiếu khoản thu.');
  await sub.getByRole('checkbox').check();
  await sub.getByRole('button', { name: 'Xác minh đã nhận tiền' }).click();
  await page.getByRole('dialog', { name: 'Xác minh đã nhận tiền' }).getByRole('button', { name: 'Xác minh đã nhận tiền', exact: true }).click();
  await page.getByText('Đã lưu kết quả xử lý giao dịch.').waitFor();
  await go('?review=reconciliation&record=rec');
  const rec = page.getByRole('dialog', { name: 'REC-01' });
  await rec.getByLabel('Ghi chú / Lý do').fill('Đã kiểm tra giao dịch.');
  await rec.getByRole('checkbox').check();
  await rec.getByRole('button', { name: 'Xác nhận đã xử lý' }).click();
  await page.getByRole('dialog', { name: 'Kết thúc đối soát' }).getByRole('button', { name: 'Kết thúc đối soát', exact: true }).click();
  await page.getByText('Đã lưu kết quả xử lý giao dịch.').waitFor();
  assert(writes.some(write => write.endpoint.endsWith('/sub/verify')));
  assert(writes.some(write => write.endpoint.endsWith('/rec/resolve')));
  assert(reads.includes('/manager/payment-submissions') && reads.includes('/manager/online-payment-reconciliations'));
  forbidden = true;
  await go();
  await page.getByRole('alert').filter({ hasText: 'Không tìm thấy hóa đơn tại cơ sở.' }).waitFor();
  assert.equal(await page.locator('.invoice-dashboard').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: statuses, six breakpoints, tabs, validation, confirmation, duplicate response, PDF, transaction actions and facility denial.');
} finally {
  await browser.close();
}
