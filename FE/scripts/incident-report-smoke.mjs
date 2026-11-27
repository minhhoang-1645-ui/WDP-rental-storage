import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const base = new URL(process.env.WDP_FE_URL || 'http://127.0.0.1:5182');
assert(['localhost', '127.0.0.1'].includes(base.hostname), 'This browser smoke test requires a local Web preview.');
const firstFacility = { id: 'a', name: 'Cơ sở A' };
const secondFacility = { id: 'b', name: 'Cơ sở B' };
const staff = { id: 'incident-test', fullName: 'Staff Test', role: 'FACILITY_STAFF', email: 'staff@example.test', phone: '0900000000' };
const report = { id: 'incident-id', maintenanceCode: 'MNT-TEST', status: 'OPEN', category: 'UTILITIES', priority: 'URGENT',
  commonArea: 'CORRIDOR', description: 'Nước chảy ở hành lang.', facility: firstFacility, createdAt: new Date().toISOString() };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jLZkAAAAASUVORK5CYII=', 'base64');
const browser = await launchTestBrowser();
try {
  for (const single of [true, false]) {
    const context = await browser.newContext({ viewport: single ? { width: 390, height: 850 } : { width: 1280, height: 900 } });
    await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'incident-local-fixture'));
    const writes = [];
    await context.route('**/api/**', async route => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname;
      if (path === '/api/auth/me') return route.fulfill({ json: staff });
      if (path === '/api/staff/maintenance/facilities') return route.fulfill({ json: single ? [firstFacility] : [firstFacility, secondFacility] });
      if (path === '/api/staff/maintenance/units') {
        const facility = url.searchParams.get('facilityId');
        const items = facility === 'a' ? [{ id: 'unit-1', unitCode: 'A101', status: 'OCCUPIED' }] : [];
        return route.fulfill({ json: { items, total: items.length, page: 1, limit: 20 } });
      }
      if (path === '/api/staff/maintenance/reported-by-me') {
        const items = writes.length >= 2 ? [report] : [];
        return route.fulfill({ json: { items, page: 1, limit: 10, total: items.length } });
      }
      if (path === '/api/staff/maintenance' && req.method() === 'POST') {
        writes.push({ key: req.headers()['idempotency-key'], type: req.headers()['content-type'], body: req.postData() });
        return writes.length === 1
          ? route.fulfill({ status: 503, json: { message: 'Chưa tải được ảnh kiểm thử.' } })
          : route.fulfill({ status: 201, json: report });
      }
      if (path.endsWith('/maintenance/incident-id')) return route.fulfill({ json: report });
      return route.fulfill({ json: { items: [], total: 0, unreadCount: 0 } });
    });
    const page = await context.newPage();
    await page.goto(new URL('/staff/report-issue', base).href);
    await page.getByRole('heading', { name: 'Báo cáo sự cố', exact: true }).waitFor();
    if (single) {
      await page.locator('.staff-facility-label').filter({ hasText: firstFacility.name }).waitFor();
      await page.getByRole('option', { name: /A101/ }).waitFor({ state: 'attached' });
      await page.getByLabel('Ô kho', { exact: true }).selectOption('unit-1');
      await page.getByRole('radio', { name: 'Khu vực chung' }).check();
      await page.getByRole('combobox', { name: 'Khu vực chung', exact: true }).selectOption('CORRIDOR');
      await page.getByRole('combobox', { name: 'Ảnh hưởng đến khả năng cho thuê', exact: true }).selectOption('NO_IMPACT');
      await page.getByLabel('Loại sự cố', { exact: true }).selectOption('UTILITIES');
      await page.getByLabel('Mức ưu tiên đề xuất', { exact: true }).selectOption('URGENT');
      await page.getByLabel('Mô tả sự cố', { exact: true }).fill(report.description);
      const photo = page.locator('input[type=file][multiple]');
      await photo.setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
      await page.getByText('Chỉ nhận ảnh JPG', { exact: false }).waitFor();
      await page.locator('input[type=file][capture=environment]').setInputFiles({ name: 'incident.png', mimeType: 'image/png', buffer: png });
      await page.getByAltText('Ảnh sự cố 1').waitFor();
      const submit = page.getByRole('button', { name: 'Gửi báo cáo', exact: true });
      await submit.click();
      await page.getByText('Chưa tải được ảnh kiểm thử.').waitFor();
      assert.equal(await page.getByLabel('Mô tả sự cố', { exact: true }).inputValue(), report.description);
      await page.getByAltText('Ảnh sự cố 1').waitFor();
      await submit.click();
      await page.getByRole('status').filter({ hasText: 'MNT-TEST' }).waitFor();
      assert.equal(writes.length, 2);
      assert.equal(writes[0].key, writes[1].key);
      assert.match(writes[1].type, /^multipart\/form-data; boundary=/);
      assert.match(writes[1].body, /name="photos"; filename="incident.png"/);
      assert.doesNotMatch(writes[1].body, /name="storageUnitId"/);
      await page.getByRole('status').filter({ hasText: 'MNT-TEST' }).getByRole('link', { name: 'Xem chi tiết' }).click();
      await page.getByText(report.description, { exact: true }).waitFor();
    } else {
      await page.getByText('Tài khoản chưa có một cơ sở làm việc cố định').waitFor();
      assert.equal(writes.length, 0);
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await context.close();
  }
  console.log('Staff incident UI passed on desktop and mobile viewport.');
} finally {
  await browser.close();
}
