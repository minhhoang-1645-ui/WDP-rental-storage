import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser();
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const output = 'artifacts/workspace-loading';
const stock = { ...fixture['stock-movements'][0], status: 'ASSIGNED', completedAt: null };
const stockPath = 'staff/stock-movements/movement-id';
const stockReadPath = 'staff/management/stock-movements/movement-id';
const appointment = { ...fixture.appointments[0], status: 'CONFIRMED', scheduledAt: '2026-11-12T05:00:00Z' };
const report = { asOf: '2026-11-12T03:00:00Z', units: { total: 5, available: 4, occupied: 1, reserved: 0, maintenance: 0 },
  finance: { outstandingAmount: 600000, unpaidInvoices: 1 }, queue: {} };

async function withWorkspace(role, theme, verify) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: theme === 'dark' ? 'reduce' : 'no-preference' });
  let gate;
  const errors = [];
  const writes = [];
  let stockRecord = { ...stock };
  let appointments = [appointment];
  let appointmentError = false;
  await context.addInitScript(theme => {
    localStorage.setItem('wdp-auth-token-v1', 'loading-fixture');
    localStorage.setItem('nestbox-workspace-theme', theme);
  }, theme);
  await context.route('**/*', async route => {
    const req = route.request();
    if (!['fetch', 'xhr', 'eventsource'].includes(req.resourceType())) return route.continue();
    const path = new URL(req.url()).pathname.replace(/^\/(?:api\/)?/, '');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === 'auth/me') return route.fulfill({ json: { ...staff, role } });
    const pending = gate;
    if (pending?.matches(path)) { pending.started(); await pending.pause; }
    if (req.method() !== 'GET') {
      writes.push([path, req.postDataJSON()]);
      if (path === stockPath + '/complete') { stockRecord = { ...stockRecord, status: 'COMPLETED' }; return route.fulfill({ json: stockRecord }); }
      return route.fulfill({ status: 403, json: { message: 'Không có thao tác trong bộ kiểm thử.' } });
    }
    if (path === stockReadPath) return route.fulfill({ json: stockRecord });
    if (path === 'manager/dashboard/analytics') return route.fulfill({ json: report });
    if (path === 'manager/reports') return route.fulfill({ json: { received: 600000, rent: 1500000, bookingCount: 1, times: [] } });
    const appointmentList = path.endsWith('/appointments');
    if (appointmentList && appointmentError) return route.fulfill({ status: 503, json: { message: 'Tạm thời chưa tải được lịch.' } });
    const items = appointmentList ? appointments : path.endsWith('/stock-movements') ? [stockRecord] : [];
    return route.fulfill({ json: { page: 1, limit: 20, total: items.length, items } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  function hold(matches) {
    let started, release;
    const arrived = new Promise(resolve => { started = resolve; });
    const pause = new Promise(resolve => { release = resolve; });
    gate = { matches, started, pause, release };
    return { arrived, release: () => { gate = undefined; release(); } };
  }
  try {
    await verify(page, hold, {
      writes, setAppointmentError: value => { appointmentError = value; }, clearAppointments: () => { appointments = []; },
      updateStock: () => { stockRecord = { ...stockRecord, updatedAt: '2026-11-12T03:00:00Z', note: 'Ghi chú mới từ máy chủ' }; },
    });
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error(role, page.url(), (await page.locator('body').innerText()).slice(-2500));
    throw error;
  } finally { gate?.release(); await context.close(); }
}

const refreshIndicator = page => page.getByRole('status').filter({ hasText: 'Đang cập nhật…' });
async function checkPlaceholder(page, variant, count) {
  const skeleton = page.locator(`.workspace-skeleton--${variant}`);
  await skeleton.first().waitFor();
  if (count) assert.equal(await skeleton.count(), count);
  assert.equal(await skeleton.locator('a, button, input, select, [tabindex]').count(), 0);
  return skeleton;
}

try {
  await mkdir(output, { recursive: true });
  await withWorkspace('STAFF', 'light', async (page, hold, api) => {
    const dashboard = hold(path => path.endsWith('/appointments'));
    await page.goto(`${base}/staff`);
    const cards = await checkPlaceholder(page, 'metric', 4);
    assert.notEqual(await cards.first().locator('.loading-skeleton__bone').first().evaluate(node => getComputedStyle(node).animationName), 'none');
    await page.screenshot({ path: `${output}/staff-dashboard.png` });
    dashboard.release();
    await cards.first().waitFor({ state: 'detached' });

    const table = hold(path => path.endsWith('/appointments'));
    await page.goto(`${base}/staff/appointments`);
    const skeleton = await checkPlaceholder(page, 'table', 1);
    assert.equal(await skeleton.locator('.workspace-skeleton__row').count(), 7);
    await page.setViewportSize({ width: 360, height: 780 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.screenshot({ path: `${output}/staff-appointments.png` });
    table.release();
    await page.locator('tbody tr').first().waitFor();

    const background = hold(path => path.endsWith('/appointments'));
    await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
    await refreshIndicator(page).waitFor();
    assert.equal(await skeleton.count(), 0);
    assert.equal(await page.locator('tbody tr').count(), 1);
    api.setAppointmentError(true);
    background.release();
    const alert = page.getByRole('alert').filter({ hasText: 'Tạm thời chưa tải được lịch.' });
    await alert.waitFor();
    api.setAppointmentError(false);
    api.clearAppointments();
    await alert.getByRole('button', { name: 'Thử lại' }).click();
    await page.getByRole('heading', { name: 'Không tìm thấy dữ liệu' }).waitFor();

    const detail = hold(path => path === stockReadPath);
    await page.goto(`${base}/staff/stock-movements/movement-id`);
    await checkPlaceholder(page, 'detail', 1);
    detail.release();
    const quantity = page.getByLabel(/Số lượng thực tế/);
    await quantity.waitFor();
    const inFlight = hold(path => path === stockReadPath);
    await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
    await inFlight.arrived;
    await quantity.fill('3');
    const note = page.getByLabel(/Ghi chú kiểm đếm/);
    await note.fill('Khách giao 3 thùng');
    api.updateStock();
    inFlight.release();
    await refreshIndicator(page).waitFor({ state: 'detached' });
    assert.equal(await quantity.inputValue(), '3');
    assert.equal(await note.inputValue(), 'Khách giao 3 thùng');
    await page.getByRole('checkbox', { name: /Tôi đã kiểm đếm/ }).check();
    await page.getByRole('button', { name: 'Hoàn tất phiếu' }).click();
    await page.getByText('Đã hoàn tất phiếu và cập nhật số lượng hàng.').waitFor();
    assert.deepEqual(api.writes[0][1].lines, [{ lineId: 'line-id', actualQty: 3 }]);
  });

  await withWorkspace('MANAGER', 'dark', async (page, hold) => {
    const dashboard = hold(path => path === 'manager/dashboard/analytics');
    await page.goto(`${base}/manager`);
    await checkPlaceholder(page, 'metric', 4);
    await checkPlaceholder(page, 'distribution', 1);
    dashboard.release();
    await page.getByText('1 / 5', { exact: true }).waitFor();

    const reports = hold(path => path === 'manager/reports' || path === 'manager/dashboard/analytics');
    await page.goto(`${base}/manager/reports`);
    const bars = await checkPlaceholder(page, 'bars', 1);
    assert.equal(await page.locator('.manager-report-metric[aria-busy="true"]').count(), 3);
    assert.equal(await bars.locator('.loading-skeleton__bone').first().evaluate(node => getComputedStyle(node).animationName), 'none');
    await page.screenshot({ path: `${output}/manager-reports-dark.png` });
    await page.getByRole('tab', { name: 'Kho & vận hành' }).click();
    await checkPlaceholder(page, 'storage', 1);
    assert.equal(await page.locator('.manager-report-metric[aria-busy="true"]').count(), 3);
    reports.release();
    await page.getByText('1 / 5 kho', { exact: true }).waitFor();

    for (const [url, resource] of [
      ['assignments', 'stock-movements'],
      ['operations/deposit-settlements', 'deposit-settlements'],
      ['operations/invoices', 'invoices'],
      ['operations/payments', 'payments'],
    ]) {
      const request = hold(path => path === `manager/${resource}`);
      await page.goto(`${base}/manager/${url}`);
      await checkPlaceholder(page, 'table', 1);
      request.release();
      await page.locator('.workspace-skeleton--table').waitFor({ state: 'detached' });
    }
  });
  console.log('PASS Staff and Manager skeletons, themes, reduced motion, keyboard, refresh, retry, empty state and mock submissions.');
} finally { await browser.close(); }
