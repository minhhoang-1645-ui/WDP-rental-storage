import { selectChoice } from './select-choice.mjs';
// Fully intercepted API traffic: this test never writes to the development/shared DB.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const browser = await launchTestBrowser();
const context = await browser.newContext();
const writes = [], errors = [];
const version = '2026-11-03T00:00:00.000Z';
const type = { id: 'real-type', facilityId: 'facility', code: 'SM-A', name: 'Kho nhỏ A', sizeId: 'small', sizeName: 'Kho nhỏ', condition: 'STANDARD', widthCm: 150, lengthCm: 200, heightCm: 240, monthlyRate: 1500000, allowDailyRental: false, minRentalDays: null, updatedAt: version };
const unit = { id: 'unit', unitCode: 'SM-A-001', storageType: { id: type.id, code: type.code, name: type.name }, floor: 'Trệt', zone: 'A', row: 1, position: 1, status: 'AVAILABLE', updatedAt: version, allocations: [], futureAllocations: [] };
await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'fixture-MANAGER'));
await context.route('**/*', async route => {
  if (!['fetch', 'xhr', 'eventsource'].includes(route.request().resourceType())) return route.continue();
  const request = route.request(), path = new URL(request.url()).pathname.replace(/^\/(?:api\/)?/, '');
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  const send = json => route.fulfill({ json });
  if (path === 'auth/me') return send({ id: 'manager-id', role: 'MANAGER', fullName: 'Quản lý', email: 'manager@example.test' });
  if (request.method() !== 'GET') {
    writes.push({ path, method: request.method(), body: request.postDataJSON() });
    if (path === 'manager/storage-types/real-type') Object.assign(type, request.postDataJSON());
    return send(path.includes('storage-types') ? type : unit);
  }
  if (path === 'booking/catalog') return send({ products: [{ ...type, monthlyPrice: type.monthlyRate, dimensions: '1,5 × 2 × 2,4 m', status: 'available' }], sizes: [{ id: 'small', name: 'Kho nhỏ' }], approvedDurations: [1, 3, 6, 12] });
  if (path === 'manager/storage-types') return send({ items: [type], facilities: [{ id: 'facility', code: 'FAC', name: 'Cơ sở chính' }], total: 1, page: 1, limit: 1 });
  if (path === 'manager/units/unit') return send(unit);
  return send({ items: path === 'manager/units' ? [unit] : [], total: path === 'manager/units' ? 1 : 0, page: 1, limit: 20 });
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on('pageerror', error => errors.push(error.message));
const base = process.env.WDP_FE_URL || 'http://localhost:5173';
try {
  await page.goto(`${base}/manager/catalog`);
  await page.getByRole('button', { name: 'Sửa loại kho & giá', exact: true }).click();
  await page.getByLabel('Giá tháng (VND)', { exact: true }).fill('1800000');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(writes.at(-1).path, 'manager/storage-types/real-type');
  assert.equal(writes.at(-1).body.monthlyRate, 1800000);
  assert.equal(writes.at(-1).body.allowDailyRental, false);
  assert.equal(writes.at(-1).body.expectedUpdatedAt, version);

  await page.getByRole('button', { name: 'Thêm loại kho', exact: true }).click();
  await selectChoice(page.getByLabel('Cơ sở', { exact: true }), 'facility');
  for (const [label, value] of [['Mã loại kho', 'NEW'], ['Tên loại kho', 'Kho mới'], ['Rộng (cm)', '200'], ['Dài (cm)', '300'], ['Cao (cm)', '240'], ['Giá tháng (VND)', '2000000']]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Cho thuê theo ngày', { exact: true }).check();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  assert.equal(writes.length, 1, 'No API write without required daily minimum');
  await page.getByLabel('Số ngày tối thiểu khi thuê ngày', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(writes.at(-1).path, 'manager/storage-types');
  assert.equal(writes.at(-1).method, 'POST');
  assert.equal(writes.at(-1).body.widthCm, 200);
  assert.equal(writes.at(-1).body.minRentalDays, 3);
  assert.equal(writes.at(-1).body.allowDailyRental, true);

  await page.goto(`${base}/manager/units`);
  await page.getByRole('button', { name: 'Thêm kho', exact: true }).click();
  await selectChoice(page.getByLabel('Loại kho', { exact: true }), 'real-type');
  await page.getByLabel('Mã kho', { exact: true }).fill('SM-A-002');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(writes.at(-1).path, 'manager/units');
  assert.equal(writes.at(-1).body.storageTypeId, 'real-type');
  assert(!Object.hasOwn(writes.at(-1).body, 'status'));

  await page.goto(`${base}/manager/units/unit`);
  await page.getByRole('button', { name: 'Sửa thông tin kho', exact: true }).click();
  await page.getByLabel('Khu', { exact: true }).fill('B');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(writes.at(-1).path, 'manager/units/unit');
  assert.equal(writes.at(-1).body.zone, 'B');
  assert.equal(writes.at(-1).body.expectedUpdatedAt, version);
  assert.deepEqual(errors, []);
  console.log('PASS: Manager web create/edit type, price and physical unit; version payload; no manual status writes. All APIs mocked.');
} catch (error) {
  console.error('Inventory UI test failure:', page.url(), (await page.locator('body').innerText()).slice(0, 3000), errors);
  console.error('Invalid fields:', await page.locator('dialog input:invalid, dialog select:invalid').evaluateAll(fields => fields.map(field => ({ name: field.name, value: field.value, message: field.validationMessage }))));
  throw error;
} finally { await context.close(); await browser.close(); }
