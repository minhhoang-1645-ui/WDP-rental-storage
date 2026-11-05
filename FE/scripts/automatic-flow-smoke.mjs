// All API calls and VNPay navigation are intercepted. No database or bank writes.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, customer } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser();
const errors = [], unexpected = [], checks = [], writes = [];
async function setup(mobile, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  console.log(`Checking ${mobile ? 'mobile' : 'web'} ${JSON.stringify(options)}`);
  const state = { status: 'PENDING', providerStatus: 'PENDING', type: 'INITIAL', ...options };
  const invoice = { ...fixture.invoices[0], id: 'invoice-auto', invoiceCode: 'INV-AUTO', type: state.type, status: options.void ? 'VOID' : 'OPEN', balanceDue: options.void ? 0 : 2000000, amountPaid: 0, totalAmount: 2000000, reservation: { ...fixture.reservations[0], status: options.expired ? 'EXPIRED' : 'CONFIRMED', expiresAt: new Date(Date.now() + (options.expired ? -10000 : 86400000)).toISOString() } };
  const session = { transactionId: 'transaction-auto', merchantOrderRef: 'WDP-AUTO', status: 'PENDING', amount: 2000000, expiresAt: new Date(Date.now() + 900000).toISOString(), paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?fixture=automatic' };
  await context.addInitScript(({ mobile, legacy, session }) => {
    localStorage.setItem(mobile ? 'wdp-mobile-auth-token' : 'wdp-auth-token-v1', 'automatic-customer');
    if (legacy) {
      const key = 'wdp-vnpay-pending-v1:customer-id:invoice-auto';
      if (!sessionStorage.getItem('fixture-legacy-seeded')) { localStorage.setItem(key, JSON.stringify({ ...session, expiresAt: undefined, createdAt: new Date().toISOString(), customerId: 'customer-id', invoiceId: 'invoice-auto', invoiceCode: 'INV-AUTO', mode: 'VNPAY' })); sessionStorage.setItem('fixture-legacy-seeded', 'true'); }
    }
  }, { mobile, legacy: options.legacy, session });
  await context.route(/\/api\//, async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace(/^\/api/, ''), method = req.method();
    const send = (json, status = 200) => route.fulfill({ status, json });
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/auth/me') return send({ ...customer, role: 'CUSTOMER', accountStatus: 'ACTIVE' });
    if (path.startsWith('/customer/online-payments/')) { state.statusReads = (state.statusReads ?? 0) + 1; return send({ ...session, status: state.status, providerStatus: state.providerStatus, invoice: { ...invoice, status: state.invoicePaid || state.status === 'SUCCESS' ? 'PAID' : invoice.status, amountPaid: state.status === 'SUCCESS' ? 2000000 : 0, balanceDue: state.status === 'SUCCESS' ? 0 : invoice.balanceDue }, payment: null, reconciliation: state.reconciliation ?? null }); }
    if (method !== 'GET') {
      writes.push({ mobile, path, key: req.headers()['idempotency-key'], body: req.postDataJSON() });
      if (path === '/customer/invoices/invoice-auto/online-payment') return send(session, 201);
      unexpected.push(`${method} ${path}`); return send({ message: 'Unexpected write' }, 500);
    }
    if (path === '/customer/payment-config') return send({ vnpayConfigured: !options.unconfigured, configured: false });
    if (path === '/reservations') return send([]);
    const match = path.match(/^\/customer\/([^/]+)(?:\/(.+))?$/);
    if (match) {
      const [, resource, id] = match;
      const items = resource === 'invoices' ? [{ ...invoice, ...(state.invoicePaid || state.status === 'SUCCESS' ? { status: 'PAID', balanceDue: 0, amountPaid: 2000000 } : {}) }] : resource === 'contracts' ? [] : resource === 'payments' ? [] : (fixture[resource] ?? []);
      if (resource === 'invoices' && options.otherInvoice) items.push({ ...invoice, id: 'invoice-other', invoiceCode: 'INV-OTHER', status: 'OPEN', balanceDue: 2000000 });
      return id ? send(items.find(row => row.id === id) ?? items[0] ?? {}) : send({ items, total: items.length, page: 1, limit: 100 });
    }
    unexpected.push(`${method} ${path}`); return send({ message: path }, 404);
  });
  await context.route('https://sandbox.vnpayment.vn/**', route => route.fulfill({ status: 200, body: '<title>Intercepted VNPay</title>' }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(mobile ? 'http://127.0.0.1:8081/customer/invoices/invoice-auto' : 'http://127.0.0.1:5173/customer/payments', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByText('INV-AUTO', { exact: true }).first().waitFor({ timeout: 90000 });
  return { context, page, state };
}
try {
  for (const mobile of [false, true]) {
    const unavailable = await setup(mobile, { unconfigured: true });
    await unavailable.page.getByText(/Thanh toán trực tuyến hiện chưa khả dụng/).waitFor();
    assert.equal(await unavailable.page.getByRole('button', { name: 'Thanh toán VNPay', exact: true }).count(), 0);
    assert.equal(await unavailable.page.getByRole('button', { name: 'Thanh toán VNPay QR', exact: true }).count(), 0);
    await unavailable.page.getByRole(mobile ? 'button' : 'link', { name: 'Hỗ trợ về hóa đơn', exact: true }).first().waitFor();
    await unavailable.context.close();
    checks.push(`${mobile ? 'Mobile' : 'Web'}: unconfigured online channels offer help and in-person payment without a fake gateway`);
    for (const options of [{ expired: true }, { void: true }]) {
      const test = await setup(mobile, options);
      await test.page.waitForTimeout(600);
      assert.equal(await test.page.getByRole('button', { name: 'Thanh toán VNPay', exact: true }).count(), 0);
      assert(!/NaN|undefined/.test(await test.page.locator('body').innerText()));
      await test.context.close();
    }
    checks.push(`${mobile ? 'Mobile' : 'Web'}: expired hold and VOID invoice cannot start payment`);
    for (const type of ['INITIAL', 'RENEWAL']) {
      const test = await setup(mobile, { type });
      await test.page.getByRole('button', { name: 'Thanh toán VNPay', exact: true }).click();
      await test.page.waitForTimeout(300);
      for (const popup of test.context.pages()) if (popup !== test.page) await popup.close();
      await test.page.bringToFront();
      await test.page.getByText(/Đang chờ VNPay xác nhận/).first().waitFor();
      await test.page.reload({ waitUntil: 'domcontentloaded' });
      await test.page.getByText(/Đang chờ VNPay xác nhận/).first().waitFor({ timeout: 90000 });
      assert(!/NaN|undefined/.test(await test.page.locator('body').innerText()));
      test.state.status = 'FAILED'; test.state.providerStatus = 'EXPIRED';
      await test.page.getByText(/Phiên thanh toán đã hết hạn/).first().waitFor();
      if (!mobile) await test.page.getByRole('button', { name: 'Thử thanh toán lại' }).click();
      test.state.status = 'PENDING'; test.state.providerStatus = 'PENDING';
      await test.page.getByRole('button', { name: 'Thanh toán VNPay', exact: true }).click();
      await test.page.waitForTimeout(300);
      for (const popup of test.context.pages()) if (popup !== test.page) await popup.close();
      await test.page.bringToFront();
      test.state.status = 'SUCCESS'; test.state.providerStatus = 'SUCCESS';
      if (mobile) {
        await test.page.getByText('Thanh toán đã được xác nhận.', { exact: true }).waitFor();
        await test.page.getByRole('button', { name: type === 'INITIAL' ? 'Đặt lịch nhận kho' : 'Xem gia hạn và thời hạn mới', exact: true }).waitFor();
      } else { await test.page.waitForURL(url => url.pathname === '/customer/payments/vnpay-return'); await test.page.getByRole('link', { name: type === 'INITIAL' ? 'Đặt lịch nhận kho' : 'Xem gia hạn', exact: false }).click(); await test.page.waitForURL(url => url.pathname === (type === 'INITIAL' ? '/customer/appointments' : '/customer/renewals')); }
      await test.context.close();
    }
    checks.push(`${mobile ? 'Mobile' : 'Web'}: pending session survives reload, expiry permits retry, confirmed INITIAL/RENEWAL payment leads to correct next step`);
  }
  const pendingKey = 'wdp-vnpay-pending-v1:customer-id:invoice-auto';
  const disputed = await setup(false, { legacy: true, void: true, otherInvoice: true, status: 'FAILED', providerStatus: 'SUCCESS', reconciliation: { reconciliationCode: 'REC-TEST', status: 'PENDING_REVIEW' } });
  await disputed.page.getByText('Giao dịch đang được đối soát', { exact: true }).waitFor();
  assert.equal(await disputed.page.getByRole('button', { name: 'Thử thanh toán lại', exact: true }).count(), 0);
  await disputed.page.getByText(/vui lòng không thanh toán lại/).waitFor();
  const otherInvoice = disputed.page.getByRole('row').filter({ hasText: 'INV-OTHER' });
  assert(await otherInvoice.getByRole('button', { name: 'Thanh toán VNPay', exact: true }).isDisabled());
  const writesBeforeResolution = writes.length;
  disputed.state.reconciliation = { reconciliationCode: 'REC-TEST', status: 'REFUND_REQUIRED', resolutionNote: 'Đã đối chiếu, cần hoàn tiền.' };
  await disputed.page.getByText('Đang chờ hoàn tiền', { exact: true }).waitFor();
  await disputed.page.getByText(/Đã đối chiếu, cần hoàn tiền/).waitFor();
  assert.equal(await disputed.page.getByRole('button', { name: 'Đã xem kết quả đối soát', exact: true }).count(), 0);
  assert(await otherInvoice.getByRole('button', { name: 'Thanh toán VNPay', exact: true }).isDisabled());
  disputed.state.reconciliation = { reconciliationCode: 'REC-TEST', status: 'RECONCILED', resolutionNote: 'Đã hoàn tiền thực tế. Tham chiếu REF-ONLY-TEST.' };
  await disputed.page.getByText('Đã hoàn tất đối soát', { exact: true }).waitFor();
  await disputed.page.getByText(/REF-ONLY-TEST/).waitFor();
  assert(disputed.state.statusReads >= 3, 'Must keep refreshing non-terminal reconciliation states');
  assert(await disputed.page.evaluate(key => Boolean(localStorage.getItem(key)), pendingKey));
  await disputed.page.getByRole('button', { name: 'Đã xem kết quả đối soát', exact: true }).click();
  assert.equal(await disputed.page.evaluate(key => localStorage.getItem(key), pendingKey), null);
  assert(!(await otherInvoice.getByRole('button', { name: 'Thanh toán VNPay', exact: true }).isDisabled()));
  assert.equal(writes.length, writesBeforeResolution, 'Acknowledging reconciliation must not create or retry a payment');
  await disputed.context.close();
  const returned = await setup(false, { legacy: true, void: true, status: 'FAILED', providerStatus: 'SUCCESS', reconciliation: { reconciliationCode: 'REC-RETURN', status: 'PENDING_REVIEW' } });
  await returned.page.goto('http://127.0.0.1:5173/customer/payments/vnpay-return?transactionId=transaction-auto');
  await returned.page.getByRole('heading', { name: 'Giao dịch đang được đối soát', exact: true }).waitFor();
  const returnWrites = writes.length;
  returned.state.reconciliation = { reconciliationCode: 'REC-RETURN', status: 'REFUND_REQUIRED', resolutionNote: 'Cơ sở đang xử lý hoàn tiền.' };
  await returned.page.getByRole('heading', { name: 'Đang chờ hoàn tiền', exact: true }).waitFor();
  returned.state.reconciliation = { reconciliationCode: 'REC-RETURN', status: 'RECONCILED', resolutionNote: 'Đã xác nhận hoàn tiền REF-RETURN.' };
  await returned.page.getByRole('heading', { name: 'Đã hoàn tất đối soát', exact: true }).waitFor();
  await returned.page.getByText(/REF-RETURN/).waitFor();
  await returned.page.getByRole('link', { name: 'Đã xem kết quả · về hóa đơn', exact: true }).click();
  await returned.page.waitForURL(url => url.pathname === '/customer/payments');
  assert.equal(await returned.page.evaluate(key => localStorage.getItem(key), pendingKey), null);
  assert.equal(await returned.page.getByText('Giao dịch đang được đối soát', { exact: true }).count(), 0);
  assert.equal(writes.length, returnWrites, 'Return result acknowledgement must not send a payment write');
  await returned.context.close();
  checks.push('Web: reconciliation remains observable through pending review/refund and unlocks only after acknowledged terminal result, without duplicate payment');
  const legacy = await setup(false, { legacy: true });
  await legacy.page.getByText(/Đang chờ VNPay xác nhận/).first().waitFor();
  assert(!/NaN|undefined/.test(await legacy.page.locator('body').innerText()));
  assert.equal(writes.filter(write => !write.mobile && write.path.endsWith('online-payment')).length, 4);
  await legacy.context.close();
  for (const mobile of [false, true]) {
    const test = await setup(mobile);
    await test.page.getByRole('button', { name: 'Thanh toán VNPay', exact: true }).click();
    await test.page.waitForTimeout(300);
    for (const popup of test.context.pages()) if (popup !== test.page) await popup.close();
    await test.page.bringToFront();
    test.state.status = 'FAILED'; test.state.providerStatus = 'EXPIRED';
    await test.page.getByText(/Phiên thanh toán đã hết hạn/).first().waitFor();
    test.state.invoicePaid = true;
    await test.page.getByRole('button', { name: mobile ? 'Làm mới hồ sơ' : 'Làm mới', exact: true }).click();
    await test.page.getByText(mobile ? 'Thanh toán đã được xác nhận.' : 'Đã thanh toán', { exact: true }).first().waitFor();
    await test.page.waitForTimeout(300);
    assert.equal(await test.page.getByText(/Phiên thanh toán đã hết hạn/).count(), 0);
    assert.equal(await test.page.getByRole('button', { name: 'Thanh toán VNPay', exact: true }).count(), 0);
    await test.context.close();
  }
  checks.push('Late invoice confirmation removes stale expiry warnings and never requests another payment');
  assert.equal(unexpected.length, 0, JSON.stringify(unexpected));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify({ checks, mockedWrites: writes.length, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
