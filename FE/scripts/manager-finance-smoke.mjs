import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const browser = await launchTestBrowser();
const time = '2026-11-26T08:00:00Z';
const customer = { fullName: 'Khách kiểm thử' };
const invoice = { id: 'invoice', invoiceCode: 'INV-01', type: 'INITIAL', status: 'OPEN', totalAmount: 3000000,
  amountPaid: 0, balanceDue: 3000000, issuedAt: time, reservation: { id: 'reservation', reference: 'R-01', customer } };
const otherInvoice = { ...invoice, id: 'other', invoiceCode: 'INV-02' };
const submissions = ['verify', 'reject', 'other', 'late'].map(id => ({
  id, submissionCode: 'BANK-' + id, status: 'PENDING_VERIFICATION', amount: 500000, transferReference: 'REF-' + id,
  submittedAt: time, customer, invoice: id === 'other' ? otherInvoice : invoice,
}));
const reconciliation = { id: 'exception', reconciliationCode: 'RC-01', status: 'PENDING_REVIEW', source: 'VNPAY',
  amount: 500000, providerTransactionId: 'VN-01', createdAt: time, reason: 'Hóa đơn đã được thanh toán',
  transaction: { merchantOrderRef: 'TX-01', invoice } };
const reconciliations = [reconciliation];
const payments = [{ id: 'payment', paymentCode: 'PAY-01', amount: 1000000, method: 'CASH', receivedAt: time, invoice }];
const notice = { token: 'legacy-finance-notice', kind: 'payment-submissions', title: 'Thông báo cũ',
  summary: '', at: time, unread: true, important: true, canOpen: true, actionLabel: 'Mở giao dịch' };
const writes = [];
const errors = [];

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'manager-finance-fixture'));
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.slice(5);
    const send = json => route.fulfill({ json });
    const list = items => send({ page: 1, limit: 100, total: items.length, items });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === 'auth/me') return send({ id: 'manager', fullName: 'Quản lý', email: 'manager@example.test', role: 'FACILITY_MANAGER' });
    if (path === 'manager/staff/facilities') return send([{ id: 'site', code: 'NB', name: 'Kho kiểm thử' }]);
    if (path === 'notifications') return send({ page: 1, limit: 20, total: 1, unreadTotal: 1, items: [notice], recent: [notice], kinds: [] });
    if (path === 'notifications/legacy-finance-notice/open') return send({ target: '/manager/payment-submissions?record=verify' });
    if (path === 'manager/invoices/invoice') return send(invoice);
    if (path === 'manager/invoices') return list([invoice, otherInvoice]);
    if (path === 'manager/payments') return list(payments);
    if (path === 'manager/payment-submissions') return list(submissions.filter(row =>
      (!url.searchParams.get('status') || row.status === url.searchParams.get('status')) &&
      (!url.searchParams.get('invoiceCode') || row.invoice.invoiceCode === url.searchParams.get('invoiceCode'))));
    if (path === 'manager/online-payment-reconciliations') return list(reconciliations);
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      writes.push({ path, body });
      if (path === 'manager/payment-submissions/verify/verify') {
        submissions[0].status = 'VERIFIED';
        invoice.amountPaid = 500000;
        invoice.balanceDue = 2500000;
        return send(submissions[0]);
      }
      if (path === 'manager/payment-submissions/reject/reject') {
        submissions[1].status = 'REJECTED';
        return send(submissions[1]);
      }
      if (path === 'manager/payment-submissions/late/verify') {
        const exception = { ...reconciliation, id: 'bank-exception', reconciliationCode: 'RC-LATE',
          status: 'PENDING_REVIEW', source: 'BANK_TRANSFER', providerTransactionId: body.reference };
        reconciliations.push(exception);
        submissions[3].status = 'REJECTED';
        return send({ ...submissions[3], reconciliation: exception });
      }
      if (path === 'manager/online-payment-reconciliations/exception/resolve') {
        reconciliation.status = body.resolution;
        return send(reconciliation);
      }
      return route.fulfill({ status: 404, json: { message: 'Unsupported fixture action' } });
    }
    return list([]);
  });

  const finance = page.getByRole('region', { name: 'Giao dịch cần xử lý' });
  const dialog = name => page.getByRole('dialog', { name, exact: true });
  const confirm = async name => dialog(name).getByRole('button', { name, exact: true }).click();
  const openRow = code => finance.getByRole('row', { name: new RegExp(code) }).getByText(code, { exact: true }).click();

  await page.goto(base + '/manager/operations/invoices/invoice');
  await finance.getByText('BANK-verify', { exact: true }).waitFor();
  assert.equal(await finance.getByText('BANK-other', { exact: true }).count(), 0);
  const nav = page.locator('.manager-sidebar');
  for (const item of ['Hóa đơn', 'Khoản thu', 'Hoàn tiền']) await nav.getByRole('link', { name: item, exact: true }).waitFor();
  assert.equal(await nav.getByText('Thanh toán và đối soát', { exact: true }).count(), 0);

  await page.goto(base + '/manager/reviews?kind=payments');
  await page.getByRole('row', { name: /BANK-verify/ }).getByText('BANK-verify', { exact: true }).click();
  await page.waitForURL(url => url.pathname === '/manager/operations/invoices/invoice' && url.searchParams.get('record') === 'verify');
  const bank = dialog('BANK-verify');
  await bank.getByLabel('Mã giao dịch ngân hàng đã kiểm tra').fill('BANK-CONFIRMED');
  await bank.getByLabel('Ghi chú / Lý do').fill('Đã nhận tiền tại ngân hàng');
  await bank.getByRole('checkbox').check();
  await bank.getByRole('button', { name: 'Xác minh đã nhận tiền' }).click();
  await confirm('Xác minh đã nhận tiền');
  await finance.getByText('Đã lưu kết quả xử lý giao dịch.').waitFor();
  assert.equal(writes[0].body.reference, 'BANK-CONFIRMED');
  await page.getByText(/2\.500\.000/).first().waitFor();

  await page.goto(base + '/manager/notifications');
  await page.getByRole('button', { name: 'Mở giao dịch' }).click();
  await page.waitForURL('**/manager/operations/payments?review=submissions&record=verify');
  await dialog('BANK-verify').waitFor();
  await page.keyboard.press('Escape');
  await finance.getByText('BANK-other', { exact: true }).waitFor();
  await page.getByText('PAY-01', { exact: true }).waitFor();
  await openRow('BANK-reject');
  await dialog('BANK-reject').getByLabel('Ghi chú / Lý do').fill('Không tìm thấy giao dịch');
  await dialog('BANK-reject').getByRole('button', { name: 'Từ chối yêu cầu' }).click();
  await confirm('Từ chối thông báo chuyển khoản');
  await dialog('BANK-reject').waitFor({ state: 'hidden' });
  assert.equal(writes[1].body.reason, 'Không tìm thấy giao dịch');

  await page.goto(base + '/manager/online-payment-reconciliations/exception');
  await page.waitForURL('**/manager/operations/payments?review=reconciliation&record=exception');
  const problem = dialog('RC-01');
  await problem.getByLabel('Ghi chú / Lý do').fill('Cần hoàn khoản nộp dư');
  await problem.getByRole('button', { name: 'Yêu cầu hoàn tiền' }).click();
  await confirm('Yêu cầu hoàn tiền');
  await problem.waitFor({ state: 'hidden' });
  await openRow('RC-01');
  await problem.getByLabel('Mã giao dịch hoàn tiền').fill('REFUND-01');
  await problem.getByLabel('Ghi chú / Lý do').fill('Đã hoàn ngoài hệ thống');
  await problem.getByRole('checkbox').check();
  await problem.getByRole('button', { name: 'Ghi nhận đã hoàn tiền' }).click();
  await confirm('Ghi nhận đã hoàn tiền');
  await problem.waitFor({ state: 'hidden' });
  assert.deepEqual(writes.slice(2).map(item => item.body.resolution), ['REFUND_REQUIRED', 'RECONCILED']);
  assert.equal(writes.at(-1).body.refundReference, 'REFUND-01');
  await finance.getByLabel('Trạng thái giao dịch').selectOption('all');
  await finance.getByText('RC-01', { exact: true }).waitFor();

  await page.goto(base + '/manager/operations/invoices/invoice?review=submissions&record=late');
  const late = dialog('BANK-late');
  await late.getByLabel('Mã giao dịch ngân hàng đã kiểm tra').fill('BANK-LATE');
  await late.getByLabel('Ghi chú / Lý do').fill('Xác nhận nhận chuyển khoản trễ');
  await late.getByRole('checkbox').check();
  await late.getByRole('button', { name: 'Xác minh đã nhận tiền' }).click();
  await confirm('Xác minh đã nhận tiền');
  await finance.getByText(/Hóa đơn chưa nhận khoản tiền này/).waitFor();
  await finance.getByRole('button', { name: 'Xem hồ sơ đối soát', exact: true }).click();
  await dialog('RC-LATE').getByText('Chuyển khoản ngân hàng', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS Manager finance: scoped invoice, receipts, legacy notice, verification, rejection, reconciliation and refund evidence.');
} finally {
  await browser.close();
}
