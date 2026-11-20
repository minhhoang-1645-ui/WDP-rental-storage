// UI-only fixtures. Every API/SSE request is intercepted; no shared database access.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
const browser = await launchTestBrowser();
const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const output = 'artifacts/light-professional';
await mkdir(output, { recursive: true });
const errors = [], writes = [];
const product = { id: 'test', name: 'Kho nhỏ kiểm thử', code: 'TEST', dimensions: '1 × 2 × 3 m', monthlyPrice: 1000000, sizeId: 'small', condition: 'standard', status: 'available', floor: 'Tầng trệt', access: 'Theo giờ cơ sở', depositMonths: 1, minRentalDays: 30, allowDailyRental: false, features: ['Kho tự quản'], image: '/storage-space.svg' };
const reservations = Array.from({ length: 47 }, (_, i) => ({ id: `TEST-${i}`, reference: `TEST-${i}`, status: i % 2 ? 'CONFIRMED' : 'PENDING', product, quantity: 1, startDate: '2027-01-01', endDate: '2027-04-01', createdAt: '2026-11-10T01:00:00Z', quote: { currency: 'VND', rentalAmount: 3000000, depositAmount: 1000000, quotedTotalAmount: 4000000, lineItems: [] } }));
const contrast = (a, b) => {
  const light = hex => { const values = hex.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return values[0] * .2126 + values[1] * .7152 + values[2] * .0722; };
  const x = light(a), y = light(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
try {
  for (const pair of [['#172b3a','#ffffff'],['#475569','#ffffff'],['#64748b','#ffffff'],['#ffffff','#0f766e'],['#0f766e','#e6f4f1']]) assert(contrast(...pair) >= 4.5, `AA contrast ${pair}`);
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'fixture-redesign'));
  await context.route('**/*', async route => {
    const request = route.request();
    if (!['fetch', 'xhr', 'eventsource'].includes(request.resourceType())) return route.continue();
    const url = new URL(request.url()), path = url.pathname.replace(/^\/(?:api\/)?/, '');
    const send = json => route.fulfill({ json });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (request.method() !== 'GET') { writes.push(path); return route.fulfill({ status: 400, json: { message: 'Read-only UI test' } }); }
    if (path === 'auth/me') return send({ id: 'ui-customer', fullName: 'Khách kiểm thử', email: 'ui@example.test', role: 'CUSTOMER' });
    if (path === 'reservations') return send(reservations);
    if (path.startsWith('reservations/')) return send(reservations.find(row => row.id === path.split('/').at(-1)));
    if (path === 'booking/catalog') return send({ products: [product], sizes: [{ id: 'small', name: 'Kho nhỏ', kicker: 'Không gian vừa đủ', dimensions: '1 × 2 × 3 m', floorArea: '2 m²', volume: '6 m³', roomEquivalent: 'Đồ dùng cá nhân', capacity: 'Tham khảo kích thước', boxCount: 'Tùy cách sắp xếp', suitableItems: ['Vali'], image: '/storage-space.svg', illustrationScale: 1 }], approvedDurations: [1,3,6,12], addons: [] });
    if (path === 'customer/payment-config') return send({ configured: false, vnpayConfigured: false });
    if (path === 'additional-services') return send([]);
    return send({ page: 1, limit: 20, total: 0, items: [] });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/customer');
  await page.getByRole('heading', { name: 'Chào Khách kiểm thử' }).waitFor();
  assert.equal(await page.locator('.internal-kpi').count(), 4);
  await page.locator('.customer-recent-item').first().waitFor();
  assert.equal(await page.locator('.customer-recent-item').count(), 5);
  assert((await page.locator('.internal-task-list li').count()) <= 5);
  for (const width of [1366, 1920, 768, 390]) {
    for (const zoom of [1, 1.25]) {
      await page.setViewportSize({ width: Math.floor(width / zoom), height: 900 });
      await page.evaluate(() => document.fonts.ready);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Customer overflow ${width} at ${zoom}`);
      await page.screenshot({ path: `${output}/customer-${width}-${zoom}.png`, fullPage: true, animations: 'disabled' });
    }
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(base + '/customer/reservations');
  await page.getByText('1–10 / 47 bản ghi', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await page.getByText('11–20 / 47 bản ghi', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Số dòng mỗi trang' }).selectOption('5');
  await page.getByText('1–5 / 47 bản ghi', { exact: true }).waitFor();
  await page.getByRole('searchbox', { name: 'Tìm đơn' }).fill('TEST-4');
  await page.waitForFunction(() => document.querySelectorAll('.customer-table tbody tr').length === 5);
  await page.getByRole('combobox', { name: 'Lọc theo trạng thái' }).selectOption('PENDING');
  assert(new URL(page.url()).searchParams.get('status') === 'PENDING');
  await page.screenshot({ path: `${output}/customer-reservations.png`, fullPage: true });
  // Original workflow routes remain usable after the visual change.
  for (const path of ['/customer/contracts','/customer/payments','/customer/appointments','/customer/support','/booking','/storage','/storage/test','/']) {
    await page.goto(base + path); await page.locator('main h1').first().waitFor();
    await page.waitForLoadState('networkidle');
    for (const width of [1366,768,390]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} overflow ${width}`);
    }
    await page.screenshot({ path: `${output}/${path.replaceAll('/','-') || 'home'}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.goto(base + '/customer');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
  await page.getByRole('button', { name: /Đặt kho & nhận kho/ }).waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  assert(await page.evaluate(() => document.activeElement !== document.body), 'Keyboard navigation is available');
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  console.log('PASS Customer dashboard, 5/10 pagination, search/status filters, responsive layouts, 125% equivalent viewport, key token AA contrast and keyboard menu. All APIs mocked.');
  await context.close();
} finally { await browser.close(); }
