import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, customer } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const output = 'artifacts/closeout-payment';
await mkdir(output, { recursive: true });
const browser = await launchTestBrowser(), writes = [], errors = [];
let approved = false;
const invoice = () => ({ ...fixture.invoices[0], id: 'future-renewal', invoiceCode: 'RENEWAL-FUTURE-TEST', type: 'RENEWAL', renewalCycle: 2, dueAt: '2099-04-17', status: 'OPEN', totalAmount: 1500000, amountPaid: 0, balanceDue: 1500000, closeoutPaymentAllowed: approved, signing: { complete: true }, billingPeriodStart: '2099-04-17', billingPeriodEnd: '2099-05-17' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'closeout-payment-fixture'));
await context.route('**/api/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname.replace(/^\/api\//, '');
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  if (request.method() !== 'GET') { writes.push(path); return route.fulfill({ status: 403, json: { message: 'Unexpected test write' } }); }
  if (path === 'auth/me') return route.fulfill({ json: { ...customer, role: 'CUSTOMER' } });
  if (path === 'customer/invoices/future-renewal') return route.fulfill({ json: invoice() });
  if (path === 'customer/payment-config') return route.fulfill({ json: { configured: true, bankCode: '970436', bankName: 'Ngân hàng kiểm thử', accountNumber: '0000000000', accountName: 'Tài khoản kiểm thử', vnpayConfigured: false } });
  const items = path === 'customer/invoices' ? [invoice()] : [];
  return route.fulfill({ json: { items, total: items.length, page: 1, limit: 100 } });
});
const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(base + '/customer/payments');
  await page.getByText('Chưa có hóa đơn', { exact: true }).waitFor();
  assert.equal(await page.getByText('RENEWAL-FUTURE-TEST', { exact: false }).count(), 0);
  approved = true;
  await page.reload();
  await page.getByText('RENEWAL-FUTURE-TEST', { exact: false }).first().waitFor();
  await page.getByRole('button', { name: 'Chi tiết & chuyển khoản', exact: true }).click();
  await page.getByText('Kho đã được duyệt trả trước hạn.', { exact: false }).waitFor();
  assert.equal(await page.getByText('Hóa đơn gia hạn chưa đến kỳ thanh toán.', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Ngân hàng kiểm thử', { exact: false }).count() > 0, true);
  await page.screenshot({ path: `${output}/approved-future-invoice.png`, fullPage: true, animations: 'disabled' });
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  console.log('PASS: future renewal invoice remains hidden normally and becomes payable after current-period closeout approval. No writes.');
} finally { await browser.close(); }
