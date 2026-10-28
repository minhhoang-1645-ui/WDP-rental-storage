// Uses real read-only catalog/quote/availability APIs. Final submissions are mocked.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
const api = process.env.WDP_API_URL || 'http://127.0.0.1:3000/api';
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const catalog = await fetch(api + '/booking/catalog').then(response => { assert(response.ok); return response.json(); });
const product = catalog.products.find(item => item.id === 'sm-b12' && item.monthlyPrice > 0) || catalog.products.find(item => item.monthlyPrice > 0);
assert(product, 'A priced storage type is needed for booking acceptance');
const future = new Date(); future.setUTCDate(future.getUTCDate() + 180);
const startDate = future.toISOString().slice(0, 10);
const browser = await launchTestBrowser();
const errors = [], unexpected = [], writes = [], checks = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 960 } });
    await context.addInitScript(({ productId, startDate }) => {
      localStorage.setItem('wdp-booking-draft-v1', JSON.stringify({ productId, startDate, durationMonths: 3, periodMode: 'duration', quantity: 1, services: [], addonIds: [], paymentPlan: 'PAY_MONTHLY' }));
    }, { productId: product.id, startDate });
    let unavailable = false, quote;
    await context.route(/\/api\//, async route => {
      const request = route.request(), path = new URL(request.url()).pathname.replace(/^\/api\//, '');
      if (request.method() === 'GET' && ['booking/catalog', 'additional-services'].includes(path)) return route.continue();
      if (request.method() === 'POST' && ['pricing/quote', 'booking/availability'].includes(path)) {
        const response = await route.fetch();
        const body = await response.json();
        assert(response.ok(), JSON.stringify(body));
        if (path === 'pricing/quote') quote = body;
        return route.fulfill({ response, json: path === 'booking/availability' ? { ...body, available: !unavailable, message: unavailable ? 'Không đủ kho cho thời gian này.' : 'Còn kho phù hợp trong toàn kỳ.' } : body });
      }
      if (request.method() === 'POST' && path === 'guest/booking-requests') {
        const body = request.postDataJSON();
        writes.push({ path, body });
        assert.equal(body.storageTypeId, product.id); assert.equal(body.quantity, 1);
        return route.fulfill({ status: 201, json: { bookingCode: 'WDPG-UI-CHECK', status: 'PENDING_VERIFICATION', storage: { id: product.id, name: product.name }, quantity: 1, startDate: body.startDate, endDate: body.endDate, quote, message: 'Yêu cầu kiểm thử giao diện; không gửi email thật.' } });
      }
      unexpected.push(`${request.method()}:${path}`); return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    const other = catalog.products.find(item => item.id !== product.id && !item.image.includes('.test/'));
    await page.goto(base + `/size-guide?compare=${encodeURIComponent(product.id + ',' + other.id)}`, { waitUntil: 'domcontentloaded' });
    const comparison = page.locator(`th[data-product-id="${product.id}"]`);
    await comparison.waitFor();
    assert.equal(await comparison.locator('img').getAttribute('data-catalog-image'), product.image);
    assert.equal(await page.locator('canvas').count(), 0);
    await page.getByRole('link', { name: `Chọn kho ${product.name}`, exact: true }).click();
    await page.locator('.booking-preview-heading h2').waitFor();
    assert.equal(await page.locator('.booking-preview-heading h2').innerText(), product.name);
    assert.equal(await page.locator('.booking-preview-visual img').getAttribute('data-catalog-image'), product.image);
    await page.getByRole('button', { name: 'Chọn thời gian', exact: true }).click();
    const next = page.getByRole('button', { name: 'Tiếp tục', exact: true });
    await next.waitFor();
    assert.equal(await page.locator('.booking-summary-product img').getAttribute('data-catalog-image'), product.image); await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Tiếp tục' && !button.disabled));
    // Changing the rental period must invalidate previously available inventory.
    unavailable = true;
    const another = new Date(future); another.setUTCDate(another.getUTCDate() + 1);
    await page.getByLabel('Ngày bắt đầu mong muốn', { exact: true }).fill(another.toISOString().slice(0, 10));
    await page.locator('.availability-badge.is-unavailable').first().waitFor();
    assert(await next.isDisabled());
    unavailable = false;
    await page.getByLabel('Ngày bắt đầu mong muốn', { exact: true }).fill(startDate);
    await page.locator('.availability-badge.is-available').first().waitFor();
    await next.click();
    assert.equal(await page.locator('.quote-product img').getAttribute('data-catalog-image'), product.image);
    await page.getByLabel('Họ và tên', { exact: true }).fill('Người đặt kiểm thử');
    await page.getByLabel('Số điện thoại', { exact: true }).fill('0900000000');
    await page.getByLabel('Email', { exact: true }).fill('booking-ui@example.test');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px booking overflow`);
    await page.getByRole('button', { name: 'Gửi yêu cầu đặt kho', exact: true }).click();
    await page.getByRole('heading', { name: 'Đã ghi nhận yêu cầu xác minh email', exact: true }).waitFor();
    checks.push(`${width}px: comparison → same product/image in all three booking steps, real quotes, availability invalidation and isolated guest confirmation`);
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed: checks, mockedSubmissions: writes.length, realDatabaseWrites: 0, sentEmails: 0, browserErrors: errors.length }, null, 2));
} finally { await browser.close(); }
