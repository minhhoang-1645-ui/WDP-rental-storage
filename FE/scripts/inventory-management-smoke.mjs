import { selectChoice } from './select-choice.mjs';
// Fully intercepted API traffic: this test never writes to the development/shared DB.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
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
    if (path === 'manager/units' && request.postDataJSON().position === 1) {
      return route.fulfill({ status: 409, json: { message: 'Vị trí này đã có kho SM-A-001.' } });
    }
    if (path === 'manager/units') return send({ ...unit, unitNumber: 'SM-A-AUTO' });
    return send(path.includes('storage-types') ? type : unit);
  }
  if (path === 'booking/catalog') return send({ products: [{ ...type, monthlyPrice: type.monthlyRate, dimensions: '1,5 × 2 × 2,4 m', status: 'available' }], sizes: [{ id: 'small', name: 'Kho nhỏ' }], approvedDurations: [1, 3, 6, 12] });
  if (path === 'manager/storage-types') return send({ items: [type], facilities: [{ id: 'facility', code: 'FAC', name: 'Cơ sở chính' }], total: 1, page: 1, limit: 1 });
  if (path === 'manager/additional-services' || path === 'manager/additional-services/inventory') return send([]);
  if (path === 'manager/unit-locations') return send({ floors: ['Tầng trệt', 'Tầng 1'], zones: ['A', 'B'] });
  if (path === 'manager/units/unit') return send(unit);
  return send({ items: path === 'manager/units' ? [unit] : [], total: path === 'manager/units' ? 1 : 0, page: 1, limit: 20 });
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on('pageerror', error => errors.push(error.message));
const base = process.env.WDP_FE_URL || 'http://localhost:5173';
try {
  await page.goto(`${base}/manager/catalog`);
  const sidebar = page.getByRole('navigation', { name: 'Điều hướng Quản lý cơ sở' });
  const breadcrumb = page.locator('.portal-topbar [aria-current="page"]');
  const catalogGroup = sidebar.getByRole('button', { name: 'Danh mục & bảng giá' });
  const inventoryGroup = sidebar.getByRole('button', { name: 'Kho & khách hàng' });
  const catalogLink = sidebar.locator('a[href="/manager/catalog"]');
  const unitLink = sidebar.getByRole('link', { name: 'Danh sách kho', exact: true });
  const groupLinks = group => group.locator('..').locator('a > span').allTextContents();
  await page.getByRole('heading', { name: 'Loại kho & đơn giá', exact: true }).waitFor();
  assert.equal(await breadcrumb.innerText(), 'Loại kho & đơn giá');
  assert.equal(await catalogLink.getAttribute('aria-current'), 'page');
  assert.deepEqual(await groupLinks(catalogGroup), ['Loại kho & đơn giá', 'Dịch vụ bổ sung']);
  assert.deepEqual(await groupLinks(inventoryGroup), ['Danh sách kho', 'Hàng đang lưu', 'Khách hàng', 'Hợp đồng', 'Kho đang thuê']);
  assert.deepEqual(await groupLinks(sidebar.getByRole('button', { name: 'Phân tích' })), ['Báo cáo']);
  await catalogGroup.click();
  assert.equal(await catalogGroup.getAttribute('aria-expanded'), 'false');
  await catalogLink.waitFor({ state: 'hidden' });
  await catalogGroup.click();
  assert.equal(await catalogGroup.getAttribute('aria-expanded'), 'true');
  await catalogLink.waitFor();
  const catalogTable = page.getByRole('table', { name: 'Loại kho và đơn giá' });
  await catalogTable.getByRole('cell', { name: '1.500.000 ₫', exact: false }).waitFor();
  assert.equal(await catalogTable.locator('tbody tr').count(), 1);
  assert.equal(await page.locator('.portal-catalog-grid').count(), 0);
  assert.equal(await page.locator('.catalog-availability').getAttribute('open'), null);
  await mkdir('artifacts/catalog-table', { recursive: true });
  await page.screenshot({ path: 'artifacts/catalog-table/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Catalog overflows viewport');
  await page.screenshot({ path: 'artifacts/catalog-table/mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
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

  await unitLink.click();
  await page.waitForURL('**/manager/units');
  await page.getByRole('heading', { name: 'Danh sách kho', exact: true }).waitFor();
  await page.getByText('Quản lý vị trí và trạng thái từng kho.', { exact: true }).waitFor();
  assert.equal(await breadcrumb.innerText(), 'Danh sách kho');
  assert.equal(await unitLink.getAttribute('aria-current'), 'page');
  assert.equal(await catalogLink.getAttribute('aria-current'), null);
  const unitTable = page.getByRole('table', { name: 'Danh sách kho' });
  await unitTable.getByText('SM-A-001', { exact: true }).waitFor();
  for (const width of [1920, 1366, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 740 });
    assert(await page.locator('.manager-unit-list').evaluate(section => {
      const region = section.querySelector('.manager-table-wrap').getBoundingClientRect();
      const footer = section.querySelector('.portal-pagination').getBoundingClientRect();
      return Math.abs(region.width - section.clientWidth) <= 2 && footer.top >= region.bottom && document.documentElement.scrollWidth <= innerWidth + 1;
    }), 'Unit table and pagination must stack at ' + width);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /Sao chép mã kho SM-A-001/ }).click();
  assert.equal(new URL(page.url()).pathname, '/manager/units');
  const size = page.getByRole('combobox', { name: 'Số dòng mỗi trang' });
  assert.deepEqual(await size.locator('option').allTextContents(), ['5', '10']);
  assert.equal(await size.inputValue(), '10');
  await size.selectOption('5');
  await page.waitForURL(url => url.searchParams.get('limit') === '5');

  const filteredUnits = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/manager/units') && ['search', 'status', 'floor', 'zone'].map(key => url.searchParams.get(key)).join('|') === 'SM-A|AVAILABLE|Trệt|A';
  });
  await page.getByRole('searchbox', { name: 'Tìm kiếm' }).fill('SM-A');
  await page.getByRole('combobox', { name: 'Trạng thái' }).selectOption('AVAILABLE');
  await page.getByLabel('Tầng', { exact: true }).fill('Trệt');
  await page.getByLabel('Khu vực', { exact: true }).fill('A');
  await filteredUnits;
  assert.equal(await page.getByRole('button', { name: 'Thêm loại kho', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Thêm kho', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const addUnit = dialog.getByRole('button', { name: 'Thêm kho', exact: true });
  await selectChoice(dialog.getByLabel('Loại kho áp dụng', { exact: true }), 'real-type');
  assert.equal(await dialog.locator('input[name="unitNumber"]').count(), 0);
  await dialog.getByLabel('Tầng', { exact: true }).selectOption('Tầng trệt');
  await dialog.getByLabel('Khu', { exact: true }).selectOption('A');
  await dialog.getByLabel('Hàng', { exact: true }).fill('1');
  await dialog.getByLabel('Vị trí trong hàng', { exact: true }).fill('1');
  await addUnit.click();
  await dialog.getByRole('alert').getByText('Vị trí này đã có kho SM-A-001.').waitFor();
  await dialog.getByLabel('Vị trí trong hàng', { exact: true }).fill('2');
  await addUnit.click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(writes.at(-1).path, 'manager/units');
  assert.equal(writes.at(-1).body.storageTypeId, 'real-type');
  assert(!Object.hasOwn(writes.at(-1).body, 'unitNumber'));
  await page.getByText('Đã thêm kho SM-A-AUTO.', { exact: true }).waitFor();
  assert(!Object.hasOwn(writes.at(-1).body, 'status'));

  await page.goto(`${base}/manager/units/unit`);
  await page.getByRole('heading', { name: 'SM-A-001', exact: true }).waitFor();
  assert.equal(await breadcrumb.innerText(), 'Danh sách kho');
  assert.equal(await unitLink.getAttribute('aria-current'), 'page');
  await page.getByRole('button', { name: 'Sửa thông tin kho', exact: true }).click();
  await dialog.getByLabel('Khu', { exact: true }).selectOption('__new_location__');
  await page.getByLabel('Nhập khu mới', { exact: true }).fill('B');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(writes.at(-1).path, 'manager/units/unit');
  assert.equal(writes.at(-1).body.zone, 'B');
  assert.equal(writes.at(-1).body.expectedUpdatedAt, version);
  assert(!Object.hasOwn(writes.at(-1).body, 'unitNumber'));
  unit.editLocked = true;
  unit.history = [{ id: 'audit', action: 'UPDATE', actorName: 'Quản lý kho', createdAt: version }];
  await page.getByRole('button', { name: 'Làm mới hồ sơ' }).click();
  await page.getByText('Lịch sử xử lý', { exact: true }).click();
  await page.getByText('Quản lý kho', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sửa thông tin kho', exact: true }).click();
  await dialog.getByText(/vị trí kho đã khóa/).waitFor();
  assert(await dialog.getByRole('combobox', { name: 'Tầng', exact: true }).isDisabled());
  assert.equal(await dialog.getByRole('button', { name: 'Lưu thay đổi' }).count(), 0);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-workspace-role="manager"]').getAttribute('data-workspace-theme'), 'dark');
  await catalogGroup.click();
  await catalogLink.click();
  await page.waitForURL('**/manager/catalog');
  await page.getByRole('heading', { name: 'Loại kho & đơn giá', exact: true }).waitFor();
  await page.getByText('Quản lý loại kho, kích thước và giá thuê.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Thêm kho', exact: true }).count(), 0);
  await sidebar.getByRole('link', { name: 'Dịch vụ bổ sung', exact: true }).click();
  await page.waitForURL('**/manager/catalog/additional-services');
  await page.getByRole('heading', { name: 'Dịch vụ bổ sung', exact: true }).waitFor();
  assert.equal(await breadcrumb.innerText(), 'Dịch vụ bổ sung');
  assert.equal(await catalogLink.getAttribute('aria-current'), null);
  await page.locator('main').getByRole('link', { name: 'Loại kho & đơn giá', exact: true }).waitFor();
  await page.goto(`${base}/manager/inventory`);
  await page.waitForURL('**/manager/units');
  await page.getByRole('heading', { name: 'Danh sách kho', exact: true }).waitFor();
  await sidebar.getByRole('link', { name: 'Kho đang thuê', exact: true }).click();
  await page.waitForURL('**/manager/operations/rentals');
  await page.getByRole('heading', { name: 'Kho đang thuê', exact: true }).waitFor();
  await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/manager/rentals') && new URL(response.url()).searchParams.get('overdue') === 'true'),
    page.getByRole('combobox', { name: 'Trạng thái' }).selectOption('true'),
  ]);
  assert.equal(await breadcrumb.innerText(), 'Kho đang thuê');
  assert.equal(await writes.length, 5);
  assert.deepEqual(errors, []);
  console.log('PASS: Manager web create/edit type, price and physical unit; version payload; no manual status writes. All APIs mocked.');
} catch (error) {
  console.error('Inventory UI test failure:', page.url(), (await page.locator('body').innerText()).slice(0, 3000), errors);
  console.error('Invalid fields:', await page.locator('dialog input:invalid, dialog select:invalid').evaluateAll(fields => fields.map(field => ({ name: field.name, value: field.value, message: field.validationMessage }))));
  throw error;
} finally { await context.close(); await browser.close(); }
