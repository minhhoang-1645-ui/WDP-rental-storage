// Read the catalog, then intercept every browser API call. No business writes.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import ts from 'typescript';
import { launchTestBrowser } from './browser-test.mjs';

const source = ts.transpileModule(await readFile(new URL('../src/catalog/public-catalog.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { publicCatalog, isFixtureProduct } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const raw = await fetch('http://127.0.0.1:3000/api/booking/catalog').then(response => { assert(response.ok); return response.json(); });
raw.products.find(product => !isFixtureProduct(product)).image = '/missing-photo-for-review.jpg';
const catalog = publicCatalog(raw), checks = [], errors = [], blockedWrites = [], reservedImages = [];
assert(catalog.products.length > 0);
assert(isFixtureProduct({ id: 'appointment-product-1234abcd', image: 'https://example.test/a.jpg' }));
assert(!isFixtureProduct({ id: 'real-new-type', image: 'https://example.test/a.jpg' }));
assert(!isFixtureProduct({ id: 'appointment-product-1234abcd', image: 'https://images.example.org/real.jpg' }));
assert(!catalog.sizes.some(size => /\btest\b/i.test(JSON.stringify(size))));
const first = catalog.products[0];
const single = publicCatalog({ ...raw, products: [first] });
assert.equal(single.products.length, 1);
assert.equal(single.sizes.length, 1);
checks.push('Only known integration-fixture IDs with reserved test images are excluded; genuine products and single-category catalogs remain');

const browser = await launchTestBrowser();
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 960 } });
    await context.route(/\/api\//, async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      if (request.method() !== 'GET') { blockedWrites.push(url.pathname); return route.fulfill({ status: 400, json: {} }); }
      if (url.pathname === '/api/booking/catalog') return route.fulfill({ json: raw });
      if (url.pathname === '/api/storage') {
        const size = url.searchParams.get('size'), type = url.searchParams.get('type');
        const items = raw.products.filter(item => (!size || size === 'all' || item.sizeId === size) && (!type || type === 'all' || item.condition === type));
        return route.fulfill({ json: { items, total: items.length, checkedPeriod: false } });
      }
      throw new Error(`Unexpected public API: ${url.pathname}`);
    });
    await context.route('https://images.pexels.com/**', route => route.abort());
    await context.route('**/missing-photo-for-review.jpg', route => route.fulfill({ status: 404, body: '' }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/https?:\/\/[^/]*\.test\//.test(request.url())) reservedImages.push(request.url()); });
    await page.goto('http://127.0.0.1:5173/storage', { waitUntil: 'domcontentloaded' });
    const cards = page.locator('.storage-listing-card');
    await cards.first().waitFor();
    assert.equal(await cards.count(), catalog.products.length);
    await page.getByText(`${catalog.products.length} lựa chọn phù hợp`, { exact: false }).waitFor();
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      await card.locator('img').waitFor();
      await page.waitForFunction(image => image.complete && image.naturalWidth > 0, await card.locator('img').elementHandle());
      const image = card.locator('img');
      const rect = await image.boundingBox();
      assert(rect?.width > 100 && rect.height > 100);
    }
    assert(!/\bWDP\b|Appointment product|Billing product|Test room|Test capacity/.test(await page.locator('body').innerText()));
    assert((await page.title()).includes('NestBox Storage'));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole('link', { name: 'Xem chi tiết', exact: true }).first().click();
    await page.getByRole('heading', { name: first.name, exact: true }).waitFor();
    await page.getByText(first.dimensions, { exact: true }).waitFor();
    await page.getByText('Kỳ thuê tối thiểu', { exact: true }).waitFor();
    await page.locator('figure img').waitFor();
    await page.waitForFunction(image => image.complete && image.naturalWidth > 0, await page.locator('figure img').elementHandle());
    const action = page.getByRole('link', { name: 'Bắt đầu đặt kho', exact: true });
    assert.equal(new URL(await action.getAttribute('href'), page.url()).searchParams.get('product'), first.id);
    await page.goto('http://127.0.0.1:5173/size-guide', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'So sánh kho trước khi chọn.', exact: true }).waitFor();
    assert.equal(await page.locator('[data-candidate-id]').count(), catalog.products.length);
    assert.equal(await page.locator('.storage-side-comparison').count(), 0);
    assert.equal(await page.locator('canvas').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const group = catalog.sizes[0];
    await page.locator('.catalog-size-filters button').filter({ hasText: group.name }).click();
    const groupCount = catalog.products.filter(product => product.sizeId === group.id).length;
    await page.waitForURL(url => url.searchParams.get('size') === group.id);
    await page.waitForFunction(count => document.querySelectorAll('[data-candidate-id]').length === count, groupCount);
    assert.equal(await page.locator('[data-candidate-id]').count(), groupCount);
    assert.equal(new URL(page.url()).searchParams.get('size'), group.id);
    await page.getByRole('button', { name: /Tất cả loại kho/ }).click();
    await page.waitForURL(url => url.searchParams.get('size') === 'all');
    await page.waitForFunction(count => document.querySelectorAll('[data-candidate-id]').length === count, catalog.products.length);
    const chosen = catalog.products.slice(0, 3);
    for (const product of chosen) await page.getByRole('checkbox', { name: `So sánh ${product.name}`, exact: true }).check();
    if (catalog.products.length > 3) assert(await page.getByRole('checkbox', { name: `So sánh ${catalog.products[3].name}`, exact: true }).isDisabled());
    await page.getByRole('checkbox', { name: `So sánh ${chosen[2].name}`, exact: true }).uncheck();
    await page.getByRole('link', { name: 'So sánh các kho đã chọn', exact: true }).click();
    await page.getByRole('region', { name: 'Bảng so sánh kho đã chọn', exact: true }).waitFor();
    assert.equal(await page.locator('th[data-product-id]').count(), 2);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const comparison = page.locator(`th[data-product-id="${first.id}"]`);
    assert.equal(await comparison.locator('img').getAttribute('data-catalog-image'), first.image);
    if (process.env.WDP_SCREENSHOTS_DIR) {
      await mkdir(process.env.WDP_SCREENSHOTS_DIR, { recursive: true });
      await page.screenshot({ path: `${process.env.WDP_SCREENSHOTS_DIR}/nestbox-comparison-${width}.png`, fullPage: true });
    }
    // A new choice must open the product step even if an older draft was on step two.
    await page.evaluate(() => localStorage.setItem('wdp-booking-step-v1', '2'));
    await page.getByRole('link', { name: `Chọn kho ${first.name}`, exact: true }).click();
    await page.locator('.booking-preview-heading h2').waitFor();
    assert.equal(await page.locator('.booking-preview-heading h2').innerText(), first.name);
    assert.equal(await page.locator('.booking-preview-visual img').getAttribute('data-catalog-image'), first.image);
    if (process.env.WDP_SCREENSHOTS_DIR) await page.screenshot({ path: `${process.env.WDP_SCREENSHOTS_DIR}/nestbox-booking-${width}.png`, fullPage: true });
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.locator('.home-group-card').first().waitFor();
    assert(!/Test room|Test capacity|Test only/.test(await page.locator('main').innerText()));
    if (process.env.WDP_SCREENSHOTS_DIR) {
      await mkdir(process.env.WDP_SCREENSHOTS_DIR, { recursive: true });
      await page.goto('http://127.0.0.1:5173/storage');
      for (const card of await page.locator('.storage-listing-card').all()) { await card.scrollIntoViewIfNeeded(); await card.locator('img').waitFor(); await page.waitForFunction(image => image.complete && image.naturalWidth > 0, await card.locator('img').elementHandle()); }
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `${process.env.WDP_SCREENSHOTS_DIR}/nestbox-storage-${width}.png`, fullPage: true });
    }
    await context.close();
    checks.push(`${width}px: real catalog only, original catalog imagery with graceful fallback on photo failure, correct information/booking link, brand and no horizontal overflow`);
  }
  assert.deepEqual(blockedWrites, []);
  assert.deepEqual(reservedImages, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, publishedProducts: catalog.products.length, excludedFixtures: raw.products.length - catalog.products.length, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
