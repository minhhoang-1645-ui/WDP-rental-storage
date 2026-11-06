// Every API request is intercepted; fixture changes simulate other roles' actions.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, customer, staff } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const mobileBase = process.env.WDP_MOBILE_URL || 'http://127.0.0.1:8081';
const artifacts = 'artifacts/priority-20261106';
await mkdir(artifacts, { recursive: true });
const browser = await launchTestBrowser(), errors = [], writes = [], checks = [];
const old = '2020-01-01T00:00:00Z', fresh = '2030-01-01T00:00:00Z', latest = '2030-02-01T00:00:00Z';

async function setup(role, width, mobile = false) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const actor = { ...(role === 'CUSTOMER' ? customer : staff), id: role === 'STAFF' ? staff.id : role.toLowerCase() + '-id', role, accountStatus: 'ACTIVE' };
  const data = Object.fromEntries(Object.keys(fixture).map(key => [key, []]));
  const support = (id, status = 'ASSIGNED', updatedAt = old) => ({ ...fixture['support-requests'][0], id, supportCode: id, status, subject: 'Cần kiểm tra cửa kho', priority: 'MEDIUM', assignedStaff: staff, createdAt: old, updatedAt });
  if (role === 'STAFF') data['support-requests'] = [...Array.from({ length: 8 }, (_, index) => support('OLD-STAFF-' + index)), support('NEW-ASSIGNMENT', 'ASSIGNED', fresh), support('NEW-RESULT', 'RESOLVED', latest)];
  if (role === 'MANAGER') {
    data['support-requests'] = Array.from({ length: 8 }, (_, index) => support('OLD-ESCALATION-' + index, 'ESCALATED'));
    data.maintenance = [{ ...fixture.maintenance[0], id: 'new-maintenance', maintenanceCode: 'NEW-RESULT', status: 'COMPLETED', createdAt: old, updatedAt: latest }];
  }
  if (role === 'CUSTOMER') {
    data.invoices = Array.from({ length: 8 }, (_, index) => ({ ...fixture.invoices[0], id: 'old-invoice-' + index, invoiceCode: 'OLD-INVOICE-' + index, type: 'RECURRING', status: 'OPEN', balanceDue: 100000, dueAt: old, createdAt: old, updatedAt: old, signing: { complete: true } }));
    data['support-requests'] = [support('NEW-RESULT', 'RESOLVED', latest)];
    data.renewals = [{ ...fixture.renewals[0], id: 'new-renewal', renewalCode: 'NEW-RENEWAL', status: 'APPROVED_PENDING_PAYMENT', invoices: [], appendix: { acceptedAt: fresh }, requestedAt: old, updatedAt: fresh }];
  }
  if (role === 'ADMIN') data.users = [...Array.from({ length: 8 }, (_, index) => ({ ...actor, id: 'old-user-' + index, fullName: 'Tài khoản cũ ' + index, createdAt: old, updatedAt: old })), { ...actor, id: 'NEW-RESULT', fullName: 'Tài khoản vừa cập nhật', createdAt: old, updatedAt: latest }];
  await context.addInitScript(mobile => localStorage.setItem(mobile ? 'wdp-mobile-auth-token' : 'wdp-auth-token-v1', 'priority-fixture'), mobile);
  await context.route(/\/api\//, async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace(/^\/api\//, '');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (req.method() !== 'GET') { writes.push(req.method() + ':' + path); return route.abort(); }
    const send = json => route.fulfill({ json });
    if (path === 'auth/me') return send(actor);
    if (path === 'booking/catalog') return send({ products: [], sizes: [], addons: [] });
    if (path === 'additional-services') return send([]);
    if (path === 'reservations') return send(data.reservations);
    if (path === 'manager/dashboard/summary') return send({ availableUnits: 0, occupiedUnits: 0 });
    if (path === 'customer/payment-config') return send({ configured: false, vnpayConfigured: false });
    if (['manager/unit-staff-assignments', 'staff/assigned-units'].includes(path)) return send({ enabled: false, items: [] });
    const parts = path.split('/'), offset = parts[1] === 'management' ? 2 : 1, kind = parts[offset], id = parts[offset + 1];
    if (kind === 'stored-items') return send([]);
    const items = data[kind] ?? [];
    if (id) return send(items.find(item => item.id === id) ?? {});
    const limit = Number(url.searchParams.get('limit') || 20), page = Number(url.searchParams.get('page') || 1);
    return send({ page, limit, total: items.length, items: items.slice((page - 1) * limit, page * limit) });
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  const home = '/' + role.toLowerCase();
  const goto = path => page.goto((mobile ? mobileBase : base) + path, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const pulse = () => page.evaluate(() => window.dispatchEvent(new CustomEvent('wdp-data-changed')));
  return { context, page, data, home, goto, pulse };
}

try {
  for (const width of [1440, 390]) for (const role of ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN']) {
    const app = await setup(role, width), { page } = app;
    await app.goto(app.home);
    const summary = page.locator('.activity-summary');
    await summary.locator('.activity-item').first().filter({ hasText: 'NEW-RESULT' }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), role + ' overflow at ' + width);
    checks.push(`${role} ${width}px: latest completed/account update leads dashboard despite old backlog`);

    if (role === 'STAFF') {
      const queue = page.getByRole('region', { name: 'Ưu tiên xử lý' });
      await queue.locator('.workspace-shortcuts a').first().filter({ hasText: 'NEW-ASSIGNMENT' }).waitFor();
      assert.equal(await queue.getByText('NEW-RESULT', { exact: false }).count(), 0);
      await app.goto('/staff/notifications');
      await page.getByRole('button', { name: /^Cần thực hiện \(/ }).click();
      await page.locator('.activity-items .activity-item').first().filter({ hasText: 'NEW-ASSIGNMENT' }).waitFor();
      await page.getByRole('button', { name: 'Đánh dấu đã đọc', exact: true }).click();
      await app.goto('/staff');
      await queue.locator('.workspace-shortcuts a').first().filter({ hasText: 'NEW-ASSIGNMENT' }).waitFor();
      assert.equal(app.data['support-requests'].find(row => row.id === 'NEW-ASSIGNMENT').status, 'ASSIGNED');
      const current = app.data['support-requests'].find(row => row.id === 'NEW-ASSIGNMENT');
      Object.assign(current, { status: 'RESOLVED', resolvedAt: '2030-03-01T00:00:00Z', updatedAt: '2030-03-01T00:00:00Z', resolutionNote: 'Đã xử lý yêu cầu' });
      await app.pulse();
      await summary.locator('.activity-item').first().filter({ hasText: 'NEW-ASSIGNMENT' }).waitFor();
      await queue.locator('.workspace-shortcuts a').filter({ hasText: 'NEW-ASSIGNMENT' }).waitFor({ state: 'hidden' });
      checks.push(`${width}px Staff: priority matches inbox; read does not finish work; live completion removes action and surfaces result`);
    }
    if (role === 'CUSTOMER') {
      await app.goto('/customer/sections/support');
      const renewal = page.locator('.work-hub-item').filter({ has: page.locator('a.work-hub-card[href="/customer/renewals"]') });
      await renewal.getByText('NEW-RENEWAL', { exact: false }).first().waitFor();
      assert((await renewal.innerText()).includes('1 việc cần làm'));
      assert.equal(await renewal.locator('.work-hub-direct').getAttribute('href'), '/customer/renewals');
      const support = page.locator('.work-hub-item').filter({ has: page.locator('a.work-hub-card[href="/customer/support"]') });
      await support.getByText('NEW-RESULT', { exact: false }).first().waitFor();
      assert((await support.innerText()).includes('0 việc cần làm'));
      assert(!(await renewal.innerText()).includes('NEW-RESULT'));
      assert.equal(await support.locator('.work-hub-direct').getAttribute('href'), '/customer/support');
      await page.screenshot({ path: `${artifacts}/customer-support-${width}.png`, fullPage: true, animations: 'disabled' });
      checks.push(`${width}px Customer function cards show only their renewal/support update, correct task count and direct destination`);
    }
    if (role === 'MANAGER') {
      await app.goto('/manager/reviews');
      const support = page.locator('.work-hub-item').filter({ has: page.locator('a.work-hub-card[href^="/manager/operations/support-requests"]') });
      await support.getByText('OLD-ESCALATION-0', { exact: false }).first().waitFor();
      assert((await support.innerText()).includes('8 việc cần làm'));
      const maintenance = page.locator('.work-hub-item').filter({ has: page.locator('a.work-hub-card[href^="/manager/operations/maintenance"]') });
      await maintenance.getByText('NEW-RESULT', { exact: false }).first().waitFor();
      assert((await maintenance.innerText()).includes('0 việc cần làm'));
      assert.equal(await maintenance.locator('.work-hub-direct').getAttribute('href'), '/manager/operations/maintenance/new-maintenance');
      assert(!(await support.innerText()).includes('NEW-RESULT'));
      checks.push(`${width}px Manager review cards keep support/maintenance updates and task counts scoped`);
    }
    if (role === 'ADMIN') {
      const users = page.locator('.work-hub-item').filter({ has: page.locator('a.work-hub-card[href="/admin/users"]') });
      await users.getByText('NEW-RESULT', { exact: false }).first().waitFor();
      assert((await users.innerText()).includes('0 việc cần làm'));
      assert((await users.locator('.work-hub-direct').getAttribute('href')).startsWith('/admin/users?search='));
      assert.equal(await page.locator('.work-hub-item').filter({ has: page.locator('a.work-hub-card[href="/admin/activity"]') }).locator('.work-hub-update').count(), 0);
      checks.push(`${width}px Admin account update remains account-scoped and does not invent an operational task`);
    }
    await app.context.close();
  }
  for (const role of ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN']) {
    console.log('Checking priority updates on Expo web: ' + role);
    const app = await setup(role, 390, true), { page } = app;
    await app.goto(app.home);
    const summary = page.getByRole('heading', { name: 'Việc cần làm', exact: true }).locator('..');
    const records = summary.getByRole('button').filter({ hasText: /NEW-RESULT|NEW-ASSIGNMENT|NEW-RENEWAL|OLD-/ });
    await records.first().filter({ hasText: 'NEW-RESULT' }).waitFor({ timeout: 45000 });
    if (role !== 'ADMIN') assert.equal(await records.count(), 2, role + ' keeps a second actionable dossier beside the newest result');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), role + ' mobile overflows at 390px');
    checks.push(`${role} Expo web 390px: latest result leads home summary with outstanding work preserved`);
    if (role === 'STAFF') {
      const priority = page.getByRole('heading', { name: 'Ưu tiên xử lý', exact: true }).locator('..');
      await priority.getByRole('button').first().filter({ hasText: 'NEW-ASSIGNMENT' }).waitFor();
      assert.equal(await priority.getByText('NEW-RESULT', { exact: false }).count(), 0);
      await page.screenshot({ path: `${artifacts}/mobile-staff-390.png`, fullPage: true, animations: 'disabled' });
      await priority.screenshot({ path: `${artifacts}/mobile-staff-priority-390.png`, animations: 'disabled' });
      checks.push('Expo web Staff: priority uses the same latest actionable record and excludes completed results');
    }
    if (role === 'CUSTOMER') {
      await app.goto('/customer/services');
      await page.getByRole('button', { name: 'Thay đổi & hỗ trợ', exact: true }).click();
      const renewal = page.getByRole('button', { name: 'Gia hạn', exact: true }).locator('..');
      await renewal.getByText(/NEW-RENEWAL/).first().waitFor();
      assert((await renewal.innerText()).includes('1 việc cần làm'));
      assert(!(await renewal.innerText()).includes('NEW-RESULT'));
      const support = page.getByRole('button', { name: 'Hỗ trợ', exact: true }).locator('..');
      await support.getByText(/NEW-RESULT/).first().waitFor();
      assert((await support.innerText()).includes('0 việc cần làm'));
      assert(!(await support.innerText()).includes('NEW-RENEWAL'));
      checks.push('Expo web Customer services: renewal/support cards show their own current update and correct action counts');
    }
    await app.context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  console.log(JSON.stringify({ passed: checks, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
