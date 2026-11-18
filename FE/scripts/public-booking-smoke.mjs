// Uses configured catalog/quote/availability APIs; the isolated helper uses read-only catalog/pricing and fixture availability. Final submissions are mocked.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
const api = process.env.WDP_API_URL || 'http://127.0.0.1:3001/api';
// Live availability may expire unpaid holds. Require the dedicated read-only fixture helper.
const proof = await fetch(api + '/_test/read-only').then(response => { assert(response.ok, 'Start BE/scripts/read-only-smoke-server.mjs; do not use the live business API for this test.'); return response.json(); });
assert(proof.testOnly === true && proof.databaseMode === 'READ_ONLY' && proof.availability === 'FIXTURE');
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const catalog = await fetch(api + '/booking/catalog').then(response => { assert(response.ok); return response.json(); });
const product = catalog.products.find(item => item.id === 'sm-b12' && item.monthlyPrice > 0) || catalog.products.find(item => item.monthlyPrice > 0);
assert(product, 'A priced storage type is needed for booking acceptance');
const future = new Date(); future.setUTCDate(future.getUTCDate() + 180);
const startDate = future.toISOString().slice(0, 10);
const browser = await launchTestBrowser();
const errors = [], unexpected = [], writes = [], checks = [];
try {
  for (const width of [1440, 900, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 960 } });
    await context.addInitScript(({ productId, startDate }) => {
      localStorage.setItem('wdp-booking-draft-v1', JSON.stringify({ productId, startDate, durationMonths: 3, periodMode: 'duration', quantity: 2, services: [], addonIds: [], paymentPlan: 'PAY_MONTHLY' }));
    }, { productId: product.id, startDate });
    let availabilityMode = 'available', stockRace = true, quote;
    await context.route(/\/api\//, async route => {
      const request = route.request(), path = new URL(request.url()).pathname.replace(/^\/api\//, '');
      if (request.method() === 'GET' && ['booking/catalog', 'additional-services'].includes(path)) return route.fulfill({ response: await route.fetch({ url: api + '/' + path }) });
      if (request.method() === 'POST' && ['pricing/quote', 'booking/availability'].includes(path)) {
        if (path === 'booking/availability' && availabilityMode === 'error') return route.fulfill({ status: 503, json: { message: 'availability service unavailable' } });
        const response = await route.fetch({ url: api + '/' + path });
        const body = await response.json();
        assert(response.ok(), JSON.stringify(body));
        if (path === 'pricing/quote') quote = body;
        return route.fulfill({ response, json: path === 'booking/availability' ? {
          ...body, available: availabilityMode === 'available', availableQuantity: availabilityMode === 'available' ? 3 : availabilityMode === 'partial' ? 1 : 0,
          reasonCode: availabilityMode === 'available' ? 'AVAILABLE' : availabilityMode === 'partial' ? 'INSUFFICIENT_INVENTORY' : 'CONFLICT',
        } : body });
      }
      if (request.method() === 'POST' && path === 'guest/booking-requests') {
        const body = request.postDataJSON();
        writes.push({ path, body });
        assert.equal(body.storageTypeId, product.id);
        assert.equal(body.quantity, 1);
        if (stockRace) {
          stockRace = false;
          return route.fulfill({ status: 409, json: { message: 'Kho vừa thay đổi', availability: { available: false, availableQuantity: 0, reasonCode: 'CONFLICT' } } });
        }
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
    assert.equal(await page.locator('.booking-preview-heading h2').innerText(), '2 kho · ' + product.name);
    assert.equal(await page.locator('.booking-preview-visual img').getAttribute('data-catalog-image'), product.image);
    if (width === 1440) {
      await page.getByRole('link', { name: 'Đặt kho nhanh', exact: true }).click();
      await page.getByRole('heading', { name: 'Đặt kho nhanh', exact: true }).waitFor();
    }
    if (width === 390) await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
    await page.getByRole('button', { name: 'Chọn thời gian', exact: true }).click();
    const next = page.getByRole('button', { name: 'Tiếp tục', exact: true });
    await next.waitFor();
    assert.equal(await page.locator('.booking-summary-product img').getAttribute('data-catalog-image'), product.image); await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Tiếp tục' && !button.disabled));
    if (width === 390) {
      await page.locator('#booking-start-date').evaluate(input => input.scrollIntoView({ block: 'center' }));
      await page.waitForFunction(() => {
        const rect = document.querySelector('.booking-mobile-bar')?.getBoundingClientRect();
        return rect && rect.top >= 0 && rect.bottom <= innerHeight + 1;
      });
    }
    const quoteColors = await page.locator('.booking-first-payment').evaluate(panel => ({
      background: getComputedStyle(panel).backgroundColor,
      amount: getComputedStyle(panel.querySelector('.quote-first-amount')).color,
      themeAccent: getComputedStyle(panel).getPropertyValue('--workspace-primary').trim(),
    }));
    assert.equal(quoteColors.background,'rgba(0, 0, 0, 0)');
    assert(quoteColors.themeAccent && quoteColors.amount !== quoteColors.background);
    availabilityMode = 'partial';
    const another = new Date(future); another.setUTCDate(another.getUTCDate() + 1);
    await page.getByLabel('Ngày bắt đầu', { exact: true }).fill(another.toISOString().slice(0, 10));
    await page.getByText('Chỉ còn 1 kho phù hợp với thời gian đã chọn.', { exact: true }).waitFor();
    assert(await next.isDisabled());
    assert.equal(await page.locator('.quote-first-amount').count(),0);
    await page.getByText('2 kho · ' + product.name,{exact:true}).waitFor();
    availabilityMode = 'error';
    await page.getByRole('button',{name:'Giảm còn 1 kho',exact:true}).click();
    await page.getByText('Không thể kiểm tra kho lúc này.',{exact:true}).waitFor();
    assert(await next.isDisabled());
    availabilityMode = 'conflict';
    await page.getByRole('button',{name:'Thử kiểm tra lại',exact:true}).click();
    await page.getByText('Không đủ kho cho toàn bộ thời gian đã chọn.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Đổi thời gian',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.id==='booking-start-date');
    availabilityMode = 'available';
    await page.getByLabel('Ngày bắt đầu', { exact: true }).fill(startDate);
    await page.locator('.booking-availability.is-success').waitFor();
    await next.click();
    await page.locator('.booking-summary-product img').waitFor();
    assert.equal(await page.locator('.booking-summary-product img').getAttribute('data-catalog-image'), product.image);
    await page.getByLabel('Họ và tên', { exact: true }).fill('Người đặt kiểm thử');
    await page.getByLabel('Số điện thoại', { exact: true }).fill('0900000000');
    await page.getByLabel('Email', { exact: true }).fill('booking-ui@example.test');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px booking overflow`);
    await page.getByRole('button', { name: 'Gửi yêu cầu đặt kho', exact: true }).click();
    await page.getByText('Kho trống vừa thay đổi.', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Gửi yêu cầu đặt kho', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Kiểm tra lại', exact: true }).click();
    await page.getByRole('button', { name: 'Gửi yêu cầu đặt kho', exact: true }).click();
    await page.getByRole('heading', { name: 'Kiểm tra email để tiếp tục', exact: true }).waitFor();
    checks.push(`${width}px: comparison → same product/image in all three booking steps, server quotes, configured availability source and invalidation and isolated guest confirmation`);
    await context.unrouteAll({ behavior: 'wait' });
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed: checks, mockedSubmissions: writes.length, realDatabaseWrites: 0, sentEmails: 0, browserErrors: errors.length }, null, 2));
} finally {
  // Let forwarded read-only requests settle before disposing their context;
  // otherwise teardown can hide the assertion that actually failed.
  for (const context of browser.contexts()) await context.unrouteAll({ behavior: 'wait' });
  await browser.close();
}
