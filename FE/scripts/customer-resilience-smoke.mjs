// Read the catalog once; intercept every browser API request, including every write.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { launchTestBrowser } from './browser-test.mjs';
import { customer } from './fixtures/workspace.mjs';
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const api = process.env.WDP_API_URL || 'http://127.0.0.1:3000/api';
const raw = await fetch(api + '/booking/catalog').then(response => { assert(response.ok); return response.json(); });
const source = ts.transpileModule(await readFile(new URL('../src/catalog/public-catalog.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { publicCatalog } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const catalog = { ...publicCatalog(raw), addons: [] }, product = catalog.products[0];
assert(product);
const browser = await launchTestBrowser(), errors = [], unexpected = [], writes = [], checks = [];
const moneyQuote = input => ({ status: 'PRICED', periodStatus: 'APPROVED_DURATION', currency: 'VND', storageTypeId: input.storageTypeId, storageTypeName: product.name, quantity: input.quantity, startDate: input.startDate, endDate: input.endDate, billingMode: 'MONTHLY', termMonths: 3, paymentPlan: 'PAY_MONTHLY', monthlyUnitPrice: 650000, quotedTotalAmount: 1950000, estimatedInitialAmountDue: 650000, rentalAmount: 1950000, depositAmount: 0, addOnTotalAmount: 0, grandTotal: 1950000, discountPercent: 0, lineItems: [{ code: 'storage-rent', label: 'Tiền thuê kho', basis: '3 tháng × 1 kho', amount: 1950000, status: 'INCLUDED' }], initialPaymentBreakdown: { rentalAmount: 650000, depositAmount: 0, purchaseAddOnAmount: 0, rentalAddOnAmount: 0, totalAmount: 650000, remainingAmount: 1300000, periodStart: input.startDate, periodEnd: '2027-02-28' }, message: 'Báo giá kiểm thử, không tạo hóa đơn.' });
async function setup(width, { signedIn = false, quota = false, corrupt = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 960 } });
  const state = { user: { ...customer, phone: '', role: 'CUSTOMER', accountStatus: 'ACTIVE' }, quoteFailures: 1, profileFailures: 1, guestFailures: 1, quoteReads: 0 };
  await context.addInitScript(({ id, signedIn, quota, corrupt }) => {
    if (signedIn) localStorage.setItem('wdp-auth-token-v1', 'resilience-fixture');
    localStorage.setItem('wdp-booking-draft-v1', JSON.stringify({ productId: id, startDate: corrupt ? '2027-02-31' : '2027-01-31', endDate: 'banana', durationMonths: 3, periodMode: 'duration', quantity: 1, services: [], addonIds: [], paymentPlan: 'PAY_MONTHLY', customer: { fullName: 'Khách kiểm thử', email: 'customer@example.test', phone: '0900000000' } }));
    localStorage.setItem('wdp-booking-step-v1', '2.5');
    if (quota) { Storage.prototype.setItem = () => { throw new DOMException('No space', 'QuotaExceededError'); }; Storage.prototype.removeItem = () => { throw new DOMException('No space', 'QuotaExceededError'); }; }
  }, { id: product.id, signedIn, quota, corrupt });
  await context.route(/\/api\//, async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace(/^\/api/, ''), method = req.method();
    const send = (json, status = 200) => route.fulfill({ json, status });
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/auth/me' && method === 'GET') return send(state.user);
    if (path === '/auth/me' && method === 'PATCH') {
      const input = req.postDataJSON(); writes.push({ path, body: input });
      assert.deepEqual(Object.keys(input).sort(), ['fullName', 'phone']);
      if (state.profileFailures-- > 0) return send({ message: 'Kết nối bị gián đoạn, vui lòng thử lại.' }, 503);
      state.user = { ...state.user, ...input }; return send(state.user);
    }
    if (path === '/booking/catalog' && method === 'GET') return send(catalog);
    if (path === '/additional-services' && method === 'GET') return send([]);
    if (path === '/pricing/quote' && method === 'POST') {
      state.quoteReads++;
      if (state.quoteFailures-- > 0) return send({ message: 'Chưa kết nối được báo giá.' }, 503);
      return send(moneyQuote(req.postDataJSON()));
    }
    if (path === '/booking/availability' && method === 'POST') { const input = req.postDataJSON(); return send({ available: true, startDate: input.startDate, endDateExclusive: '2027-04-30', periodStatus: 'APPROVED_DURATION', reasonCode: 'AVAILABLE', message: 'Đã kiểm tra lịch.', quote: moneyQuote({ ...input, storageTypeId: input.productId, endDate: '2027-04-30' }) }); }
    if (path === '/guest/booking-requests' && method === 'POST') {
      writes.push({ path, body: req.postDataJSON(), key: req.headers()['idempotency-key'] });
      if (state.guestFailures-- > 0) return send({ message: 'Chưa gửi được yêu cầu. Vui lòng thử lại.' }, 503);
      return send({ bookingCode: 'WDPG-RESILIENCE', status: 'PENDING_VERIFICATION', storage: { id: product.id, code: product.code, name: product.name }, quantity: 1, startDate: '2027-01-31', endDate: '2027-04-30', quote: moneyQuote(req.postDataJSON()), message: 'Development email not configured' }, 201);
    }
    if (method === 'GET' && path === '/reservations') return send([]);
    if (method === 'GET' && path.startsWith('/customer/')) return send({ items: [], total: 0, page: 1, limit: 100 });
    unexpected.push(method + ' ' + path); return send({ message: 'Unexpected intercepted request' }, 500);
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
  return { context, page, state };
}
try {
  for (const width of [320, 390, 1440]) {
    const test = await setup(width, { signedIn: true, quota: true, corrupt: true });
    const { page, state } = test;
    await page.goto(base + '/booking?date=not-a-date&step=2.5', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Chọn kích thước và loại kho', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Chọn thời gian', exact: true }).click();
    const date = page.getByLabel('Ngày bắt đầu mong muốn', { exact: true });
    assert.equal(await date.inputValue(), '');
    assert.equal(state.quoteReads, 0, 'Malformed calendar dates never reach pricing/availability');
    await date.fill('2027-01-31');
    await page.getByRole('button', { name: 'Thử lại báo giá', exact: true }).click();
    await page.locator('.availability-badge.is-available').first().waitFor();
    await page.locator('.quote-first-amount').first().waitFor();
    assert.equal(await date.inputValue(), '2027-01-31');
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await page.getByText('Bạn cần bổ sung họ tên và số điện thoại hợp lệ trước khi gửi yêu cầu.', { exact: false }).waitFor();
    assert(await page.getByRole('button', { name: 'Bổ sung thông tin liên hệ để tiếp tục', exact: false }).isDisabled());
    await page.getByRole('link', { name: 'Cập nhật hồ sơ rồi tiếp tục đặt kho', exact: true }).click();
    await page.getByRole('heading', { name: 'Hồ sơ cá nhân', exact: true }).waitFor();
    assert(new URL(page.url()).searchParams.get('returnTo')?.startsWith('/booking?'));
    assert(await page.getByLabel('Email đăng nhập', { exact: true }).isEditable() === false);
    const phone = page.getByLabel('Số điện thoại', { exact: true });
    await phone.fill('0901234567');
    await page.getByRole('button', { name: 'Lưu thông tin', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Kết nối bị gián đoạn' }).waitFor();
    assert.equal(await phone.inputValue(), '0901234567', 'Failed profile save preserves the edit');
    assert.equal(await page.getByText('Đã cập nhật hồ sơ của bạn.', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Lưu thông tin', exact: true }).click();
    await page.getByText('Đã cập nhật hồ sơ của bạn.', { exact: true }).waitFor();
    assert.equal(await page.locator('form[data-wdp-dirty],form[data-wdp-submitting]').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px profile overflow`);
    await page.getByRole('link', { name: 'Tiếp tục đặt kho', exact: true }).click();
    await page.getByRole('heading', { name: 'Thông tin khách hàng và xác nhận yêu cầu', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Gửi yêu cầu đặt kho', exact: false }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('.checkout-form button[type=submit]')?.disabled);
    assert.equal(await page.getByLabel('Số điện thoại', { exact: true }).inputValue(), '0901234567');
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    if (!fits) {
      console.log(JSON.stringify(await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll('body *')].filter(node => { const rect = node.getBoundingClientRect(); return rect.width && rect.right > innerWidth + 1; }).slice(0, 18).map(node => ({ tag: node.tagName, className: String(node.className), width: node.getBoundingClientRect().width, text: node.textContent?.slice(0, 90) })) })), null, 2));
      await page.screenshot({ path: 'artifacts/production-20261104/booking-overflow.png', fullPage: true, animations: 'disabled' });
    }
    assert(fits, `${width}px booking overflow`);
    assert(!/NaN|Invalid Date|undefined/.test(await page.locator('.booking-page').innerText()));
    checks.push(`${width}px: bad URL/draft recovery, quote retry, quota-safe resume, actual profile save failure/retry, required contact correction and responsive checkout`);
    await test.context.close();
  }
  const guest = await setup(390, { quota: true });
  await guest.page.goto(base + '/booking?step=2', { waitUntil: 'domcontentloaded' });
  await guest.page.getByRole('button', { name: 'Thử lại báo giá', exact: true }).click();
  await guest.page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await guest.page.getByRole('checkbox', { name: /^Xác minh email để nhận yêu cầu đặt kho/ }).check();
  await guest.page.getByRole('button', { name: 'Gửi yêu cầu đặt kho', exact: false }).click();
  await guest.page.getByRole('alert').filter({ hasText: 'Chưa gửi được yêu cầu.' }).waitFor();
  await guest.page.getByRole('button', { name: 'Gửi yêu cầu đặt kho', exact: false }).click();
  await guest.page.getByRole('heading', { name: 'Đã ghi nhận yêu cầu xác minh email', exact: true }).waitFor();
  const attempts = writes.filter(row => row.path === '/guest/booking-requests'); assert.equal(attempts.length, 2); assert.equal(attempts[0].key, attempts[1].key); assert(attempts[0].key);
  await guest.page.getByText(/Email xác minh chưa được gửi/).waitFor();
  const draft = await guest.page.evaluate(async () => { const { safeLocalStorage } = await import('/src/services/browser-storage.ts'); return safeLocalStorage.getItem('wdp-booking-draft-v1'); });
  const pendingDraft = JSON.parse(draft);
  assert.equal(pendingDraft.productId, product.id, 'Email verification is pending, so preserve choices for claim/repricing recovery even when native storage throws');
  assert.equal(pendingDraft.durationMonths, 3);
  assert.equal(pendingDraft.quantity, 1);
  checks.push('Guest email request keeps its idempotency key after network failure, shows the actual pending-verification result and preserves choices for claim/repricing recovery despite storage quota; unconfigured email is never claimed sent');
  await guest.context.close();

  // Mount the actual shared component in an isolated browser-only fixture; no test route is added to production.
  const context = await browser.newContext({ viewport: { width: 320, height: 850 } });
  await context.route(base + '/__review/entity-select', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"><link rel="stylesheet" href="/src/styles/index.css"></head><body><div id="root"></div><script type="module">window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;const ReactModule=await import('/node_modules/.vite/deps/react.js');const React=ReactModule.default??ReactModule;const DomModule=await import('/node_modules/.vite/deps/react-dom_client.js');const{createRoot}=DomModule.default??DomModule;const{EntitySelect}=await import('/src/components/EntitySelect.tsx');function App(){const[value,setValue]=React.useState('');return React.createElement('div',null,React.createElement(EntitySelect,{value,onValueChange:setValue,'aria-label':'Chọn nhân viên'},React.createElement('option',{value:'',disabled:true},'Chọn nhân viên'),React.createElement('option',{value:'disabled',disabled:true},'Nguyễn bận'),React.createElement('option',{value:'one'},'Nguyễn An · 0 việc đang xử lý'),React.createElement('option',{value:'two'},'Trần Bình · 2 việc đang xử lý')),React.createElement('button',{type:'button'},'Tiếp theo'));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>` }));
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/__review/entity-select', { waitUntil: 'domcontentloaded' });
  const choice = page.getByRole('combobox', { name: 'Chọn nhân viên', exact: true });
  await choice.click(); const search = page.getByRole('searchbox'); await search.fill('nguyen'); await search.press('Home'); await search.press('Enter');
  assert.equal(await choice.getAttribute('data-value'), 'one', 'Keyboard skips disabled matching entries');
  await choice.click(); await page.getByRole('searchbox').press('End'); await page.getByRole('searchbox').press('Enter');
  assert.equal(await choice.getAttribute('data-value'), 'two');
  await choice.click(); await page.getByRole('searchbox').press('Tab');
  assert.equal(await choice.getAttribute('aria-expanded'), 'false');
  assert(await page.getByRole('button', { name: 'Tiếp theo', exact: true }).evaluate(node => node === document.activeElement));
  checks.push('Shared entity picker: accent-insensitive search, keyboard skips disabled entries, Home/End/Enter selection and Tab closes popup without trapping focus');
  await context.close();
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ ok: true, checks, mockedWrites: writes.length, browserErrors: errors, realWrites: 0 }, null, 2));
} finally { await browser.close(); }
