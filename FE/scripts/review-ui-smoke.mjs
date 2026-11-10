// All business API calls intercepted; no shared database reads or writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { customer, staff, fixture } from './fixtures/workspace.mjs';
const browser = await launchTestBrowser(), errors = [], writes = [], checks = [];
const now = new Date().toISOString();
const small = { id: 'small', name: 'Kho nhỏ B12' }, medium = { id: 'medium', name: 'Kho vừa D04' };
const inv = (id, type, rent) => ({ id, invoiceCode: id, status: 'OPEN', type: 'INITIAL', issuedAt: now, reservation: { customer, storageType: type }, rentalAmount: rent, depositAmount: rent, serviceAmount: 0, chargeAmount: 0, totalAmount: rent * 2, amountPaid: rent, balanceDue: rent });
const invoices = [inv('INV-S', small, 1500000), inv('INV-M', medium, 2900000), { ...inv('VOID', small, 9000000), status: 'VOID' }];
const bookings = [small, small, medium].map((storageType, i) => ({ id: 'booking-' + i, product: storageType, createdAt: now, status: 'CONFIRMED', quantity: i + 1 }));
const inventory = [small, medium].map((storageType, i) => ({ id: 'unit-' + i, unitNumber: 'UNIT-' + i, storageType, status: i ? 'AVAILABLE' : 'OCCUPIED' }));
const goods = ['A', 'B'].map((id, i) => ({ id, itemCode: 'ITEM-' + id, name: i ? 'Sách' : 'Hồ sơ', balance: i ? 8 : 12, unit: 'thùng', rentalContract: { id: 'contract-' + id, contractCode: 'HD-' + id }, storageUnit: { id: 'unit-' + id, unitNumber: 'KHO-' + id, floor: 'Ground', zone: id } }));
await mkdir('artifacts/review-20261110', { recursive: true });
async function setup(role, width, mobile = false) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  await context.addInitScript(mobile => localStorage.setItem(mobile ? 'wdp-mobile-auth-token' : 'wdp-auth-token-v1', 'review-fixture'), mobile);
  await context.route(/\/api\//, async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace(/^\/api\//, '');
    const send = json => route.fulfill({ json });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (request.method() !== 'GET') { writes.push(path); return route.abort(); }
    if (path === 'auth/me') return send({ ...staff, ...customer, id: role === 'CUSTOMER' ? customer.id : staff.id, role, accountStatus: 'ACTIVE' });
    if (path === 'reservations') return send([]);
    if (path === 'customer/stored-items') return send(goods);
    if (path.endsWith('dashboard/summary')) return send({});
    if (path.endsWith('appointments/appointment-id')) return send({ ...fixture.appointments[0], customer, assignedStaff: staff, status: 'CONFIRMED', scheduledAt: now });
    const resource = path.split('/').at(-1);
    const items = resource === 'invoices' ? invoices : resource === 'payments' ? [{ id: 'payment', amount: 1500000, receivedAt: now, invoice: { id: 'INV-S' } }] : resource === 'reservations' ? bookings : resource === 'units' ? inventory : [];
    return send({ items, page: 1, limit: 100, total: items.length });
  });
  const page = await context.newPage(); page.setDefaultTimeout(45000); page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  return { context, page, base: `http://127.0.0.1:${mobile ? 8081 : 5173}` };
}
try {
  for (const width of [1440, 390, 320]) {
    const app = await setup('MANAGER', width), { page } = app;
    await page.goto(app.base + '/manager/reports');
    await page.getByRole('heading', { name: 'Báo cáo vận hành', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Loại kho nào được đặt nhiều? Tiền thuê bao nhiêu?' }).waitFor();
    assert.equal(await page.getByRole('img', { name: /^Biểu đồ tròn/ }).count(), 3);
    const popularityPie = page.locator('.report-pie').filter({ has: page.getByRole('heading', { name: 'Lượt đặt theo loại kho', exact: true }) });
    await popularityPie.getByText('66,7%', { exact: true }).waitFor();
    const legend = popularityPie.getByRole('button').filter({ hasText: 'Kho nhỏ B12' });
    await legend.click(); assert.equal(await legend.getAttribute('aria-pressed'), 'true');
    for (const title of ['Hôm nay', 'Tuần này', 'Tháng này', 'Năm nay', 'Tất cả']) {
      await page.getByRole('button', { name: title, exact: true }).click();
      await page.getByRole('button', { name: title, exact: true, pressed: true }).waitFor();
    }
    await page.getByLabel('Lọc loại kho báo cáo').selectOption('small');
    await popularityPie.getByText('100%', { exact: true }).last().waitFor();
    const category = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Kho nhỏ B12', exact: true }) }).first();
    assert.match(await category.innerText(), /2/);
    assert.match(await category.innerText(), /1\.500\.000/);
    assert(!/9\.000\.000/.test(await page.locator('section').last().innerText()), 'VOID invoice must not enter reports');
    await page.getByLabel('Gom biểu đồ theo').selectOption('week');
    await page.getByText(/Tuần từ/).first().waitFor();
    await page.getByLabel('Sắp xếp loại kho').selectOption('rent');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Reports must fit viewport');
    await page.screenshot({ path: `artifacts/review-20261110/reports-${width}.png`, fullPage: true });
    if (width === 1440) {
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Xuất hóa đơn CSV', exact: true }).click();
      const stream = await (await download).createReadStream(), chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const csv = Buffer.concat(chunks).toString('utf8');
      assert.match(csv, /Tiền thuê VND/); assert.match(csv, /Tiền cọc VND/);
      assert.match(csv, /INV-S/); assert(!csv.includes('INV-M')); assert(!csv.includes('VOID'));
      await page.getByLabel('Từ ngày', { exact: true }).fill('2026-12-02');
      await page.getByLabel('Đến ngày', { exact: true }).fill('2026-11-02');
      await page.getByRole('alert').filter({ hasText: 'Ngày bắt đầu phải trước' }).waitFor();
      assert.equal(await page.locator('.portal-metrics').count(), 0);
      assert(await page.getByRole('button', { name: 'Xuất hóa đơn CSV', exact: true }).isDisabled());
    }
    await app.context.close(); checks.push(`Web ${width}px: period/type/group/sort filters, charts, VOID and money`);
  }
  for (const mobile of [false, true]) {
    const app = await setup('CUSTOMER', 390, mobile), { page } = app;
    await page.goto(app.base + '/customer/stored-items');
    await page.getByText(mobile ? /^KHO-A ·/ : /Kho hiện tại: KHO-A/).waitFor();
    await page.getByText(mobile ? /^KHO-B ·/ : /Kho hiện tại: KHO-B/).waitFor();
    const search = mobile ? page.getByLabel('Tìm hàng, mã kho hoặc hợp đồng') : page.getByLabel('Tìm hàng / mã kho / hợp đồng');
    await search.fill('KHO-B');
    await page.getByText(mobile ? /^KHO-B ·/ : /Kho hiện tại: KHO-B/).waitFor();
    assert.equal(await page.getByText(mobile ? /^KHO-A ·/ : /Kho hiện tại: KHO-A/).count(), 0);
    await page.screenshot({ path: `artifacts/review-20261110/stored-items-${mobile ? 'expo' : 'web'}.png`, fullPage: true });
    await app.context.close(); checks.push(`${mobile ? 'Expo' : 'Web'}: stock location and warehouse search`);
  }
  const app = await setup('STAFF', 1440), { page } = app;
  await page.goto(app.base + '/staff/appointments/appointment-id');
  const recipient = page.getByLabel('Người nhận kho', { exact: true });
  await recipient.waitFor(); assert.equal(await recipient.inputValue(), customer.fullName);
  await recipient.fill('Người nhận được ủy quyền'); assert.equal(await recipient.inputValue(), 'Người nhận được ủy quyền');
  assert.equal(await page.getByLabel('Đã đối chiếu người nhận kho', { exact: true }).isChecked(), false);
  assert.equal(await page.getByLabel('Hiện trạng cửa, khóa, tường, sàn và thiết bị', { exact: true }).inputValue(), '');
  await app.context.close(); checks.push('Staff handover: customer prefill editable, observed checks remain manual');
  const mobileHandover = await setup('STAFF', 390, true);
  await mobileHandover.page.goto(mobileHandover.base + '/staff/appointments/appointment-id');
  await mobileHandover.page.getByRole('button', { name: 'Hoàn tất bàn giao', exact: true }).click();
  const mobileRecipient = mobileHandover.page.getByLabel('Người nhận kho', { exact: true });
  assert.equal(await mobileRecipient.inputValue(), customer.fullName);
  await mobileRecipient.fill('Người nhận được ủy quyền');
  assert.equal(await mobileHandover.page.getByRole('checkbox', { name: 'Đã đối chiếu người nhận kho', exact: true }).getAttribute('aria-checked'), 'false');
  await mobileHandover.context.close(); checks.push('Expo handover uses customer data without asserting physical checks');
  const mobileReport = await setup('MANAGER', 390, true);
  await mobileReport.page.goto(mobileReport.base + '/manager/reports');
  await mobileReport.page.getByText('Tiền thuê và lượt đặt theo loại kho', { exact: true }).waitFor();
  assert.equal(await mobileReport.page.getByRole('img', { name: /^Biểu đồ tròn/ }).count(), 3);
  await mobileReport.page.getByRole('button', { name: 'Hôm nay', exact: true }).click();
  await mobileReport.page.getByText('2 lượt gửi · 2 đã xác nhận', { exact: true }).waitFor();
  await mobileReport.page.getByRole('button', { name: 'Tuần', exact: true }).click();
  await mobileReport.page.getByText(/Tuần từ/).first().waitFor();
  await mobileReport.page.screenshot({ path: 'artifacts/review-20261110/reports-expo.png', fullPage: true });
  await mobileReport.context.close(); checks.push('Expo manager report filters/charts');
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  console.log(JSON.stringify({ checks, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
