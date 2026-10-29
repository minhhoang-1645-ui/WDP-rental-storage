import { mkdir } from 'node:fs/promises';
// Read-only browser fixtures and intercepted writes. No database connection or test records.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff, customer, reservation, unit } from './fixtures/workspace.mjs';
const browser = await launchTestBrowser(), errors = [], unexpected = [], writes = [], checks = [];
const bookings = Array.from({ length: 111 }, (_, i) => ({ ...fixture.reservations[0], id: `RES-${i}`, status: i === 1 ? 'CANCELLED' : i === 2 ? 'EXPIRED' : 'CONFIRMED', product: { ...fixture.reservations[0].product, name: `Kho ${i}` }, createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString() }));
const contracts = bookings.map((booking, i) => ({ ...fixture.contracts[0], id: `contract-${i}`, contractCode: `CON-${i}`, status: i === 100 ? 'COMPLETED' : 'ACTIVE', reservation: { ...reservation, id: `database-${i}`, reference: booking.id }, startDate: '2026-10-01', endDate: i === 100 ? '2027-04-01' : '2027-01-01', completedAt: i === 100 ? '2026-10-28T01:00:00Z' : null, storageUnit: { ...unit, unitCode: i === 100 ? 'MD-E06-004' : `U-${i}`, physicalStatus: 'OCCUPIED' } }));
async function setup(role, width, mobile = false) {
  const context = await browser.newContext({ viewport: { width, height: 960 } });
  await context.addInitScript(role => { localStorage.setItem('wdp-auth-token-v1', `isolated-${role}`); localStorage.setItem('wdp-mobile-auth-token', `isolated-${role}`); }, role);
  const requests = [];
  await context.route(/\/api\//, async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace(/^\/api\//, ''), method = req.method(); requests.push({ path, method, page: url.searchParams.get('page') });
    const send = (json, status = 200) => route.fulfill({ json, status });
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === 'auth/me') return send({ ...(role === 'CUSTOMER' ? customer : staff), role });
    if (path === 'manager/dashboard/summary') return send({ availableUnits: 1 });
    if (path === 'reservations') return send(bookings);
    if (path.startsWith('reservations/')) return send(bookings.find(item => item.id === path.split('/')[1]));
    if (path === 'customer/payment-config') return send({ vnpayConfigured: true, configured: false });

    const parts = path.split('/'), offset = parts[1] === 'management' ? 2 : 1, kind = parts[offset], id = parts[offset + 1];
    if (method !== 'GET') {
      writes.push({ path, body: req.postDataJSON(), key: req.headers()['idempotency-key'] });
      if (role === 'STAFF' && path === 'staff/management/maintenance') {
        assert.equal(req.postDataJSON().storageUnitId, unit.id); assert.equal(req.postDataJSON().category, 'CLEANING');
        return send({ ...fixture.maintenance[0], id: 'new-maintenance' }, 201);
      }
      unexpected.push(`${method} ${path}`); return send({ message: 'Unexpected write' }, 403);
    }
    const items = kind === 'contracts' ? contracts : kind === 'payment-submissions' ? [] : fixture[kind];
    if (!items) { unexpected.push(`${method} ${path}`); return send({ message: 'Unexpected read' }, 500); }
    if (id) return send(items.find(item => (item.id || item.reservationId) === id));
    const page = Number(url.searchParams.get('page') || 1), limit = kind === 'contracts' ? 20 : 100;
    return send({ page, limit, total: items.length, items: items.slice((page - 1) * limit, page * limit) });
  });
  const page = await context.newPage(); page.setDefaultTimeout(mobile ? 60000 : 20000); page.on('pageerror', error => errors.push(error.message));
  return { context, page, requests, goto: path => page.goto(`http://127.0.0.1:${mobile ? 8081 : 5173}${path}`) };
}
try {
  for (const width of [1440, 390]) {
    const app = await setup('CUSTOMER', width); await app.goto('/customer/booking-history');
    await app.page.getByText('111 / 111 đơn đặt kho', { exact: true }).waitFor();
    await app.page.getByLabel('Tìm trong lịch sử', { exact: true }).fill('MD-E06-004');
    const card = app.page.locator('.booking-history-card'); await card.getByText('Đã trả kho', { exact: true }).waitFor(); assert.equal(await card.count(), 1); assert((await card.innerText()).includes('01/04/2027')); assert(app.requests.some(item => item.path === 'customer/contracts' && item.page === '6'));
    if (process.env.WDP_SCREENSHOTS_DIR) { await mkdir(process.env.WDP_SCREENSHOTS_DIR, { recursive: true }); await app.page.screenshot({ path: `${process.env.WDP_SCREENSHOTS_DIR}/booking-history-${width}.png`, fullPage: true }); }
    await card.getByRole('link', { name: 'Xem hợp đồng liên quan', exact: true }).click(); await app.page.getByText('CON-100', { exact: true }).waitFor(); assert.equal(await app.page.locator('.customer-table tbody tr').count(), 1);
    await app.goto('/customer/booking-history'); await app.page.getByLabel('Trạng thái lịch sử', { exact: true }).selectOption('CANCELLED'); await app.page.getByText('RES-1 · Đặt ngày', { exact: false }).waitFor(); assert.equal(await app.page.locator('.booking-history-card').count(), 1);
    assert(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await app.context.close();
    const operator = await setup('STAFF', width); await operator.goto('/staff/maintenance'); await operator.page.getByRole('button', { name: 'Tạo bảo trì', exact: true }).click();
    await operator.page.getByLabel('Kho cần bảo trì', { exact: true }).selectOption(unit.id); await operator.page.getByLabel('Hạng mục').selectOption('CLEANING'); await operator.page.getByLabel('Mô tả tình trạng', { exact: true }).fill('Vệ sinh kho sau kiểm tra.'); await operator.page.getByRole('button', { name: 'Tạo yêu cầu', exact: true }).click(); await operator.page.getByRole('dialog').waitFor({ state: 'hidden' });
    const before = operator.requests.filter(item => item.path === 'auth/me').length;
    // A fresh API module represents the empty role cache after HMR while the UI stays signed in.
    await operator.page.evaluate(async () => { const api = await import('/src/services/api.ts?isolated-maintenance-refresh'); await Promise.all([api.apiRequest('/manager/units'), api.apiRequest('/manager/maintenance', { method: 'POST', body: JSON.stringify({ storageUnitId: 'unit-id', category: 'CLEANING', priority: 'MEDIUM', description: 'Kiểm tra sau cập nhật giao diện.' }), headers: { 'Idempotency-Key': 'isolated-hot-refresh' } })]); });
    assert.equal(operator.requests.filter(item => item.path === 'auth/me').length - before, 1); assert(!operator.requests.some(item => item.method === 'POST' && item.path.startsWith('manager/'))); await operator.context.close();
    checks.push(`${width}px: all 111 booking records and 6 contract pages, returned/renewed history, related contract, cancelled filter; Staff maintenance create and recovered empty role cache`);
  }
  const mobile = await setup('CUSTOMER', 390, true); await mobile.goto('/customer/booking-history'); await mobile.page.getByText('111 / 111 đơn đặt kho', { exact: true }).waitFor(); await mobile.page.getByLabel('Tìm trong lịch sử', { exact: true }).fill('MD-E06-004'); await mobile.page.getByText('RES-100 · Đã trả kho', { exact: true }).waitFor(); await mobile.context.close();
  for (const mobile of [false, true]) {
    const manager = await setup('MANAGER', 390, mobile); await manager.goto('/manager'); await manager.page.getByText(mobile ? 'Bàn làm việc' : 'Tổng quan vận hành', { exact: true }).last().waitFor();
    await manager.goto(mobile ? '/manager/deposit-settlements' : '/manager/operations/deposit-settlements');
    await manager.page.getByText('SET-TEST', { exact: true }).first().waitFor();
    await manager.goto(mobile ? '/manager/deposit-settlements/settlement-id' : '/manager/operations/deposit-settlements/settlement-id');
    await manager.page.getByText('SET-TEST', { exact: true }).first().waitFor();
    assert(manager.requests.some(item => item.path === 'manager/deposit-settlements/settlement-id'));
    await manager.context.close();
  }
  checks.push('Expo web history; Manager settlement restored with working list/detail routes on web/mobile under the approved scope');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); console.log(JSON.stringify({ checks, mockedWrites: writes.length, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
