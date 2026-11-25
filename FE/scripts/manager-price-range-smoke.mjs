import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const browser = await launchTestBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const writes = [];
  const facility = { id: 'east', code: 'NB-E', name: 'NestBox Đông' };
  const other = { id: 'west', code: 'NB-W', name: 'NestBox Tây' };
  const type = { id: 'small-2', code: 'SM-2', name: 'Kho 2 m²', facilityId: facility.id, sizeId: 'small', condition: 'STANDARD',
    widthCm: 100, lengthCm: 200, heightCm: 240, monthlyRate: 650000, bookingEnabled: true, minRentalDays: null, allowDailyRental: false,
    facility: { operationalStatus: 'OPEN', bookingEnabled: true }, updatedAt: '2026-11-25T00:00:00Z' };
  const group = { locker: 'Tủ lưu trữ', small: 'Kho nhỏ', medium: 'Kho vừa', large: 'Kho lớn' };
  const range = (facilityId, sizeId, min, max, status = 'EFFECTIVE') => ({
    facilityId, sizeId, value: { min, max }, status, effectiveFrom: status === 'EFFECTIVE' ? '2000-01-01T00:00:00Z' : '2099-01-01T00:00:00Z',
  });
  const rows = [type];
  await page.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'range-fixture'));
  await page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/auth/me') return route.fulfill({ json: { id: 'manager', email: 'manager@example.test', fullName: 'Quản lý', role: 'FACILITY_MANAGER' } });
    if (path === '/manager/staff/facilities') return route.fulfill({ json: [facility, other] });
    if (path === '/manager/storage-types' && req.method() === 'POST') {
      const body = req.postDataJSON();
      writes.push(body);
      const record = { ...type, ...body, id: 'type-created-' + writes.length };
      rows.push(record);
      return route.fulfill({ json: record });
    }
    assert.equal(req.method(), 'GET');
    if (path === '/manager/storage-types') {
      const facilityId = url.searchParams.get('scopeFacilityId');
      const ranges = [range('east', 'small', 500000, 800000), range('east', 'small', 700000, 900000, 'SCHEDULED'),
        range('east', 'large', 2000000, 3000000), range('west', 'small', 1200000, 1500000)];
      return route.fulfill({ json: { items: rows.filter(row => row.facilityId === facilityId),
        facilities: [facility, other].filter(site => site.id === facilityId), groups: group, pricingRanges: ranges.filter(item => item.facilityId === facilityId) } });
    }
    if (path === '/booking/catalog') return route.fulfill({ json: { products: [], sizes: [] } });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  const base = process.env.WDP_FE_URL || 'http://localhost:5173';
  await page.goto(base + '/manager/catalog?facilityId=east');
  const table = page.getByRole('table', { name: 'Loại kho và đơn giá' });
  await table.getByText(/500\.000.*800\.000/).waitFor();
  await table.getByText('Hợp lệ', { exact: true }).waitFor();
  const open = () => page.getByRole('button', { name: 'Thêm loại kho', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Thêm loại kho' });
  const price = editor.getByLabel('Giá tháng (VND)', { exact: true });
  const apply = editor.getByRole('button', { name: 'Lưu', exact: true });
  const size = editor.getByRole('combobox', { name: 'Nhóm kho' });
  const fields = async (code, name) => {
    for (const [field, value] of [['Mã loại kho', code], ['Tên loại kho', name], ['Rộng (cm)', '100'], ['Dài (cm)', '200'], ['Cao (cm)', '240']])
      await editor.getByLabel(field, { exact: true }).fill(value);
  };
  await open();
  await editor.getByText(/Khung chờ hiệu lực/).waitFor();
  assert.equal(await editor.getByLabel('Cơ sở', { exact: true }).inputValue(), 'NestBox Đông');
  await fields('SM-3', 'Kho 3 m²');
  await price.fill('800001');
  assert(await apply.isDisabled());
  await price.fill('800000');
  assert(await apply.isEnabled());
  await size.selectOption('large');
  assert.equal(await price.inputValue(), '800000');
  assert(await apply.isDisabled());
  await size.selectOption('small');
  await apply.click();
  await editor.waitFor({ state: 'hidden' });
  assert.equal(writes[0].sizeId, 'small');
  assert.equal(writes[0].monthlyRate, 800000);
  assert.equal(writes[0].bookingEnabled, true);

  await open();
  await fields('MD-1', 'Kho vừa dự thảo');
  await size.selectOption('medium');
  await price.fill('900000');
  await editor.getByText('Nhóm kho này chưa được BOM thiết lập khung giá.').waitFor();
  assert(await editor.getByRole('checkbox', { name: 'Bật kinh doanh loại kho' }).isDisabled());
  await apply.click();
  await editor.waitFor({ state: 'hidden' });
  assert.equal(writes[1].bookingEnabled, false);
  await table.getByText('Đã tắt kinh doanh').waitFor();

  await page.goto(base + '/manager/catalog?facilityId=west');
  await open();
  await editor.getByText(/1\.200\.000.*1\.500\.000/).waitFor();
  assert.equal(await editor.getByLabel('Cơ sở', { exact: true }).inputValue(), 'NestBox Tây');
  console.log('PASS: Manager facility scope, effective and scheduled ranges, boundary price, group switch, and draft save.');
} finally {
  await browser.close();
}
