// All API and gateway calls are intercepted. No real accounts, emails, payments or database writes.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, customer, staff, reservation } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser(), checks = [], errors = [], writes = [];
const hash = 'a'.repeat(64);
async function setup(role, mobile = false) {
  const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: 960 } });
  const data = structuredClone(fixture);
  const actor = { ...(role === 'CUSTOMER' ? customer : staff), id: `${role.toLowerCase()}-id`, role };
  const contract = { ...data.contracts[0], id: 'contract-sign', contractCode: 'CON-SIGN', status: 'PENDING_PAYMENT', reservation: { ...reservation, quantity: 1 }, terms: { version: 'TEST-V1', acceptedAt: null, acceptanceName: null, signatureImage: null, document: { contractCode: 'CON-SIGN', customer: { fullName: actor.fullName }, startDate: '2026-11-01', endDate: '2027-02-01', quantity: 1, rentalAmount: 1000000 }, snapshotHash: hash } };
  const invoice = { ...data.invoices[0], id: 'invoice-sign', invoiceCode: 'INV-SIGN', type: 'INITIAL', status: 'OPEN', balanceDue: 1000000, rentalAmount: 1000000, depositAmount: 0, totalAmount: 1000000, reservation: { ...reservation, quantity: 1, status: 'CONFIRMED', expiresAt: '2099-12-01T00:00:00Z' }, signing: { required: true, complete: false, contracts: [{ id: 'contract-sign', code: 'CON-SIGN' }], renewalId: null } };
  const renewal = { ...data.renewals[0], id: 'renewal-sign', status: 'APPROVED_PENDING_PAYMENT', appendix: { code: 'APP-SIGN', version: 'TEST-V1', acceptedAt: null, snapshot: { renewalCode: 'REN-SIGN', rentalAmount: 1000000 }, snapshotHash: hash }, invoices: [{ ...invoice, id: 'renewal-invoice', renewalCycle: 1 }] };
  data.contracts = [contract]; data.invoices = [invoice]; data.renewals = [renewal];
  data['support-requests'][0].status = 'ESCALATED';
  data.maintenance[0].status = 'AWAITING_VERIFICATION';
  let paid = false;
  await context.addInitScript(({ mobile }) => localStorage.setItem(mobile ? 'wdp-mobile-auth-token' : 'wdp-auth-token-v1', 'isolated-session'), { mobile });
  await context.route(/\/api\//, async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace(/^\/api\//, ''), method = request.method();
    const send = (json, status = 200) => route.fulfill({ status, json });
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === 'auth/me') return send(actor);
    if (path === 'auth/login') return send({ token: 'isolated-session', user: actor });
    if (path === 'customer/payment-config') return send({ vnpayConfigured: true, configured: true, bankName: 'Ngân hàng kiểm thử', bankCode: '970422', accountNumber: '123456789', accountName: 'Tai khoan kiem thu' });
    if (path === 'manager/dashboard/summary') return send({ availableUnits: 1, activeRentals: 1 });
    if (path === 'manager/staff') return send({ page: 1, limit: 100, total: 1, items: [staff] });
    if (path === 'manager/unit-staff-assignments' || path === 'staff/assigned-units') return send({ enabled: false, items: [] });
    if (path === 'booking/catalog') return send({ products: [{ id: 'real-type', code: 'SM-A', name: 'Kho nhỏ A', sizeId: 'small', dimensions: '1,5 × 2 × 2,4 m', monthlyPrice: 1000000, minRentalDays: 1, condition: 'standard' }], sizes: [{ id: 'small', name: 'Kho nhỏ', dimensions: '1,5 × 2 × 2,4 m', floorArea: '3 m²' }] });
    if (path === 'additional-services') return send([{ id: 'service-buy', code: 'BOX', name: 'Thùng carton', kind: 'PURCHASE', billingUnit: 'ONE_TIME', unitPrice: 10000 }]);
    if (path.includes('/online-payments/')) return send({ transactionId: 'tx', status: paid ? 'SUCCESS' : 'PENDING', providerStatus: paid ? 'SUCCESS' : 'PENDING', invoice: { status: paid ? 'PAID' : 'OPEN', type: 'INITIAL' }, expiresAt: '2099-01-01T00:00:00Z' });
    if (method !== 'GET') {
      const body = request.postDataJSON(); writes.push({ role, mobile, path, body, key: request.headers()['idempotency-key'] });
      if (path === 'customer/contracts/contract-sign/accept' || path === 'customer/renewals/renewal-sign/appendix/accept') {
        assert.equal(body.agreed, true); assert.equal(body.snapshotHash, hash);
        assert.match(body.signatureImage, /^data:image\/png;base64,/);
        const png = Buffer.from(body.signatureImage.split(',')[1], 'base64'); assert.deepEqual([...png.subarray(0, 8)], [137,80,78,71,13,10,26,10]); assert(png.length > 100);
        const document = path.includes('/appendix/') ? renewal.appendix : contract.terms;
        Object.assign(document, { acceptedAt: new Date().toISOString(), acceptanceName: actor.fullName, signatureImage: body.signatureImage });
        if (!path.includes('/appendix/')) invoice.signing.complete = true;
        return send(path.includes('/appendix/') ? renewal : contract);
      }
      if (path.endsWith('/online-payment')) {
        assert.equal(invoice.signing.complete, true, 'Unsigned invoice must never create a session');
        return send({ transactionId: 'tx', expiresAt: '2099-01-01T00:00:00Z', paymentUrl: 'https://sandbox.vnpayment.vn/isolated-gateway' });
      }
      if (path.endsWith('/payment-submissions')) { assert.equal(invoice.signing.complete, true); assert.equal(body.amount, 1000000); assert.ok(request.headers()['idempotency-key']); return send({ id: 'submission', status: 'PENDING_VERIFICATION' }); }
      return send({ id: 'saved', ...body });
    }
    if (path === 'reservations') return send([]);
    const parts = path.split('/'), offset = parts[1] === 'management' ? 2 : 1, kind = parts[offset], id = parts[offset + 1];
    if (parts[0] === 'admin' && kind === 'users') return send({ page: 1, limit: 100, total: 0, items: [] });
    const items = data[kind] || [];
    if (id) return send(items.find(row => row.id === id) || {});
    return send({ page: 1, limit: 100, total: items.length, items });
  });
  await context.route('https://sandbox.vnpayment.vn/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Isolated gateway fixture</p>' }));
  const page = await context.newPage(); page.setDefaultTimeout(mobile ? 25000 : 15000); page.on('pageerror', error => errors.push(error.message));
  return { context, page, data, invoice, goto: path => page.goto(`http://127.0.0.1:${mobile ? 8081 : 5173}${path}`), paid: () => { paid = true; invoice.status = 'PAID'; invoice.balanceDue = 0; } };
}
async function draw(page) {
  const canvas = page.locator('canvas[aria-label="Khung vẽ chữ ký"]');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox(); assert(box);
  await page.mouse.move(box.x + 20, box.y + 70); await page.mouse.down();
  await page.mouse.move(box.x + 65, box.y + 30, { steps: 8 }); await page.mouse.move(box.x + 100, box.y + 90, { steps: 8 }); await page.mouse.up();
}
try {
  const mobile = await setup('CUSTOMER', true);
  console.log('CHECK mobile invoice'); await mobile.goto('/customer/invoices/invoice-sign');
  await mobile.page.getByText('Bạn cần ký tài liệu trước khi thanh toán.', { exact: true }).waitFor();
  assert.equal(await mobile.page.getByRole('button', { name: 'Thanh toán VNPay', exact: true }).count(), 0);
  console.log('CHECK mobile contract'); await mobile.goto('/customer/contracts/contract-sign'); await mobile.page.getByRole('button', { name: 'Ký và xác nhận tài liệu', exact: true }).waitFor();
  console.log('CHECK mobile drawing'); await draw(mobile.page); await mobile.page.getByRole('checkbox', { name: 'Tôi đã đọc và đồng ý nội dung tài liệu' }).click();
  await mobile.page.getByRole('button', { name: 'Ký và xác nhận tài liệu', exact: true }).click(); await mobile.page.getByText('Đã ký', { exact: true }).first().waitFor();
  await mobile.goto('/customer/invoices/invoice-sign'); await mobile.page.getByRole('button', { name: 'Thanh toán VNPay', exact: true }).waitFor();
  await mobile.goto('/customer/renewals/renewal-sign'); await draw(mobile.page); await mobile.page.getByRole('checkbox', { name: 'Tôi đã đọc và đồng ý nội dung tài liệu' }).click(); await mobile.page.getByRole('button', { name: 'Ký và xác nhận tài liệu', exact: true }).click(); await mobile.page.getByText('Đã ký', { exact: true }).first().waitFor();
  checks.push('Mobile: INITIAL blocked until signature; real canvas PNG accepted with matching hash; contract and appendix signing work');
  await mobile.context.close();

  const web = await setup('CUSTOMER');
  await web.goto('/customer/payments'); await web.page.getByText('Bạn cần ký tài liệu trước khi thanh toán.', { exact: true }).waitFor();
  assert.equal(await web.page.getByRole('button', { name: 'Thanh toán VNPay', exact: true }).count(), 0);
  web.invoice.signing.complete = true;
  await web.goto('/customer/payments'); await web.page.getByRole('button', { name: 'Chi tiết & chuyển khoản', exact: true }).click();
  await web.page.getByRole('img', { name: 'QR chuyển khoản INV-SIGN' }).waitFor();
  await web.page.getByLabel('Tôi đã chuyển khoản thực tế cho hóa đơn này').check(); await web.page.getByRole('button', { name: 'Gửi thông báo đã chuyển khoản', exact: true }).click();
  await web.page.getByText('Thông báo đã được gửi và đang chờ NestBox đối chiếu tiền thực nhận.', { exact: false }).waitFor();
  checks.push('Web: unsigned invoice routes to signing; VietQR details and transfer notice do not mark invoice paid');
  await web.context.close();

  const manager = await setup('MANAGER', true);
  await manager.goto('/manager/maintenance/maintenance-id'); await manager.page.getByRole('button', { name: 'Nghiệm thu bảo trì', exact: true }).waitFor();
  await manager.goto('/manager/support-requests/support-id'); await manager.page.getByRole('button', { name: 'Giải quyết hỗ trợ', exact: true }).waitFor();
  await manager.goto('/manager/deposit-settlements/settlement-id'); await manager.page.getByRole('button', { name: 'Duyệt quyết toán cọc', exact: true }).waitFor();
  checks.push('Manager mobile: support review, maintenance verification and restored settlement are reachable'); await manager.context.close();
  const employee = await setup('STAFF', true);
  await employee.goto('/staff/maintenance/maintenance-id'); await employee.page.getByText('MNT-TEST', { exact: true }).first().waitFor();
  assert.equal(await employee.page.getByRole('button', { name: 'Nghiệm thu bảo trì', exact: true }).count(), 0);
  await employee.goto('/staff/assigned-units'); await employee.page.getByText('Phân công cố định theo kho chưa được bật.', { exact: false }).waitFor();
  checks.push('Staff mobile cannot verify maintenance; prepared unit assignments stay disabled before migration'); await employee.context.close();
  const webEmployee = await setup('STAFF');
  await webEmployee.goto('/staff/assigned-units');
  await webEmployee.page.getByRole('heading', { name: 'Kho tôi phụ trách', exact: true }).waitFor();
  await webEmployee.page.getByText('Phân công cố định theo kho chưa được bật.', { exact: false }).waitFor();
  assert.equal(await webEmployee.page.getByRole('button', { name: 'Lưu người phụ trách kho', exact: true }).count(), 0);
  await webEmployee.context.close(); checks.push('Staff web sees own-unit entry without Manager assignment controls; database migration remains disabled');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, mockedWrites: writes.length, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} catch (error) { console.error('Browser errors:', errors); for (const ctx of browser.contexts()) for (const p of ctx.pages()) console.error('Visible state:', p.url(), (await p.locator('body').innerText()).slice(-6500)); console.error('Writes:', writes.map(w => ({path:w.path, agreed:w.body.agreed, hash:w.body.snapshotHash, signatureLength:w.body.signatureImage?.length}))); throw error; } finally { await browser.close(); }
