import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const base = new URL(process.env.WDP_FE_URL || 'http://127.0.0.1:5173');
assert(['127.0.0.1', 'localhost'].includes(base.hostname));
const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 930 } });
page.setDefaultTimeout(12000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const manager = { id: 'manager', role: 'FACILITY_MANAGER', fullName: 'Quản lý kiểm thử', email: 'manager@example.test' };
const at = '2026-11-22T08:00:00.000Z';
const unit = { id: 'unit', unitCode: 'LG-03', physicalStatus: 'OCCUPIED', floor: 'Tầng trệt', zone: 'LG', row: 1, position: 3 };
const quote = { billingMode: 'MONTHLY', termMonths: 3, paymentPlan: 'PAY_MONTHLY', monthlyUnitPrice: 5500000, quantity: 2,
  rentalAmount: 33000000, depositAmount: 11000000, quotedTotalAmount: 44000000,
  discountAmount: 0, purchaseAddOnAmount: 0, rentalAddOnAmount: 0,
  initialPaymentBreakdown: { rentalAmount: 11000000, depositAmount: 11000000, totalAmount: 22000000, remainingAmount: 22000000, periodStart: '2026-11-22', periodEnd: '2026-12-22' },
  lineItems: [{ code: 'deposit', label: 'Tiền đặt cọc', amount: 11000000 }] };
const contract = { id: 'contract', contractCode: 'WDP-TEST-C01', status: 'ACTIVE', startDate: '2026-11-22', endDate: '2027-02-22',
  reservation: { id: 'res', reference: 'WDP-TEST', quantity: 2, facility: { name: 'Cơ sở A' }, customer: { fullName: 'Khách kiểm thử' } },
  storageType: { name: 'Kho lớn' }, storageUnit: unit, reservationPricing: quote, terms: { acceptedAt: null }, createdAt: at, updatedAt: at };
let pdfMissing = false, denied = false;
const requests = [];
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
await page.addInitScript(() => {
  localStorage.setItem('wdp-auth-token-v1', 'fixture-manager-contract');
  window.print = () => { document.body.dataset.testPrinted = 'true'; };
});
await page.route('**/api/**', route => {
  const request = route.request(), url = new URL(request.url());
  const path = url.pathname.replace(/^\/api/, '');
  const send = (json, status = 200) => route.fulfill({ json, status });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  requests.push(path);
  if (path === '/auth/me') return send(manager);
  if (path === '/manager/staff/facilities') return send([{ id: 'A', name: 'Cơ sở A' }]);
  if (path === '/manager/contracts/contract') return denied ? send({ message: 'Hợp đồng ngoài phạm vi cơ sở.' }, 404) : send(contract);
  if (path === '/manager/documents/contracts/contract' || path === '/manager/documents/contracts/contract/transfers/trf' || path === '/manager/documents/renewals/ren') {
    assert(!url.searchParams.has('token'));
    return pdfMissing ? send({ message: 'Chưa có tài liệu PDF.' }, 404)
      : route.fulfill({ contentType: 'application/pdf', body: Buffer.from('%PDF-1.4\n% test\n%%EOF') });
  }
  return send({ items: [], total: 0, page: 1, limit: 100 });
});

try {
  const go = () => page.goto(new URL('/manager/operations/contracts/contract', base).href);
  const title = page.getByRole('heading', { name: 'Hợp đồng thuê kho – LG-03' });
  const dashboard = page.locator('.contract-dashboard');
  const document = page.locator('.contract-document');
  const pricing = page.locator('.contract-quote');
  await go();
  await title.waitFor();
  await document.getByText('Bản chưa ký · PDF').waitFor();
  await dashboard.getByText('Đang hoạt động', { exact: true }).waitFor();
  await dashboard.getByText('Đang sử dụng', { exact: true }).waitFor();
  assert.equal(await dashboard.getByText('Chưa cập nhật', { exact: true }).count(), 2);
  await dashboard.getByText('3 tháng · Trả từng tháng').waitFor();
  await pricing.getByText('Áp dụng cho toàn bộ đơn đặt kho · 2 kho.').waitFor();
  assert.deepEqual(await pricing.locator('dt').allTextContents(), ['Thời gian thuê', 'Tiền thuê mỗi tháng / kho', 'Tiền thuê cả kỳ', 'Tiền đặt cọc', 'Tổng cả kỳ (gồm cọc)']);
  assert.match(await pricing.innerText(), /3 tháng[\s\S]*5\.500\.000[\s\S]*11\.000\.000[\s\S]*44\.000\.000/);
  assert.doesNotMatch(await pricing.innerText(), /Dự kiến|Xem chi tiết cách tính|Dịch vụ mua/);
  assert.equal(await pricing.locator('.contract-quote-lines').count(), 1);
  const equation = pricing.locator('.contract-quote-lines > .contract-quote-equation');
  await equation.getByText(/5\.500\.000.*× 3 tháng × 2 kho = 33\.000\.000/).waitFor();
  assert.equal(await dashboard.getByRole('link', { name: 'WDP-TEST', exact: true }).getAttribute('href'), '/manager/reservations/res');
  assert.equal(await dashboard.getByRole('link', { name: 'LG-03', exact: true }).getAttribute('href'), '/manager/units/unit');
  assert.equal(await dashboard.getByRole('link', { name: 'Xem hóa đơn của đơn đặt kho' }).getAttribute('href'), '/manager/operations/invoices?search=WDP-TEST');
  await dashboard.getByRole('button', { name: /Sao chép mã hợp đồng/ }).click();
  await dashboard.getByText('Đã sao chép').waitFor();
  await dashboard.getByText('Lịch sử xử lý', { exact: true }).click();
  await dashboard.getByText('Tạo hồ sơ', { exact: true }).waitFor();
  await dashboard.getByText('Lịch sử xử lý', { exact: true }).click();
  if (process.env.WDP_CONTRACT_SCREENSHOT) await dashboard.screenshot({ path: process.env.WDP_CONTRACT_SCREENSHOT });
  for (const width of [1920, 1440, 1366, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 940 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflow at ' + width);
    assert.equal(await page.locator('.contract-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), width > 900 ? 2 : 1);
  }
  await page.setViewportSize({ width: 1440, height: 930 });
  pdfMissing = true;
  await document.getByRole('button', { name: 'Tải PDF' }).click();
  await document.getByRole('alert').waitFor();
  pdfMissing = false;
  contract.terms.acceptedAt = at;
  contract.status = 'COMPLETED';
  contract.reservationPricing = { billingMode: 'DAILY', billableDays: 7, dailyUnitPrice: '50000', paymentPlan: 'PREPAID', quantity: 2,
    baseRentalAmount: 700000, rentalAmount: 665000, discountAmount: 35000, discountPercent: 5, purchaseAddOnAmount: 25000,
    depositAmount: 0, quotedTotalAmount: 690000, initialPaymentBreakdown: { totalAmount: 690000, remainingAmount: 0 } };
  await dashboard.getByRole('button', { name: 'Làm mới hồ sơ' }).click();
  await document.getByText('Bản đã ký · PDF').waitFor();
  await dashboard.getByText('7 ngày · Trả trước toàn kỳ').waitFor();
  await dashboard.getByText('Đang sử dụng', { exact: true }).waitFor();
  assert.match(await pricing.innerText(), /7 ngày[\s\S]*50\.000[\s\S]*Không cần đặt cọc[\s\S]*Chiết khấu[\s\S]*Dịch vụ mua[\s\S]*690\.000/);
  const opened = page.waitForEvent('popup');
  const pdfResponse = page.waitForResponse(response => response.url().endsWith('/documents/contracts/contract'));
  await document.getByRole('button', { name: 'Xem / in PDF' }).click();
  assert((await pdfResponse).ok());
  await (await opened).close();
  const download = page.waitForEvent('download');
  await document.getByRole('button', { name: 'Tải PDF' }).click();
  assert.equal((await download).suggestedFilename(), 'WDP-TEST-C01.pdf');
  await dashboard.getByRole('button', { name: 'In hồ sơ' }).click();
  assert.equal(await page.locator('body').getAttribute('data-test-printed'), 'true');
  contract.transfers = [{ id: 'trf', transferCode: 'TRF-TEST', status: 'COMPLETED', fromUnit: { unitCode: 'LG-02' }, toUnit: unit, createdAt: at, completedAt: at }];
  contract.renewals = [{ id: 'ren', renewalCode: 'REN-TEST', status: 'COMPLETED', previousEndDate: '2027-02-22', requestedEndDate: '2027-03-22', requestedAt: at,
    appendix: { code: 'REN-TEST-PL', available: true, acceptedAt: at }, quote: { totalAmount: 2500000 } }];
  await go();
  await title.waitFor();
  await dashboard.getByText('Lịch sử xử lý', { exact: true }).click();
  for (const [section, filename] of [['Lịch sử chuyển kho của hợp đồng', 'TRF-TEST-BB.pdf'], ['Lịch sử gia hạn của hợp đồng', 'REN-TEST-PL.pdf']]) {
    const extraDownload = page.waitForEvent('download');
    await page.getByRole('region', { name: section }).getByRole('button', { name: 'Tải PDF' }).click();
    assert.equal((await extraDownload).suggestedFilename(), filename);
  }

  denied = true;
  await go();
  await page.getByRole('alert').filter({ hasText: 'Hợp đồng ngoài phạm vi cơ sở.' }).waitFor();
  assert.equal(await title.count(), 0);
  assert.equal(await document.count(), 0);
  assert.equal(requests.filter(path => path === '/manager/documents/contracts/contract').length, 3);
  assert.deepEqual(errors, []);
  console.log('PASS: contract scope, links, unsigned and signed PDF, pricing, history, error handling and six viewport widths.');
} catch (error) {
  console.error('Browser errors:', errors, 'Last page:', page.url());
  throw error;
} finally {
  await browser.close();
}
