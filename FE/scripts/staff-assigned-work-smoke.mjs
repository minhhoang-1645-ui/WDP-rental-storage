import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser();
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const output = 'artifacts/staff-assigned-work';
const requests = [];
const errors = [];
const records = Object.fromEntries(['maintenance', 'support-requests'].map(resource => {
  const codeField = resource === 'maintenance' ? 'maintenanceCode' : 'supportCode';
  const prefix = resource === 'maintenance' ? 'MNT' : 'SUP';
  const mine = Array.from({ length: 12 }, (_, index) => ({
    ...fixture[resource][0], id: `${resource}-mine-${index}`, [codeField]: `${prefix}-MINE-${index + 1}`,
    assignedStaff: staff, priority: 'HIGH',
  }));
  return [resource, [...mine,
    { ...mine[0], id: `${resource}-other`, [codeField]: `${prefix}-OTHER`, assignedStaff: { id: 'other-staff', fullName: 'Nhân viên khác' }, priority: 'LOW' },
    { ...mine[0], id: `${resource}-unassigned`, [codeField]: `${prefix}-UNASSIGNED`, assignedStaff: null, priority: 'LOW' },
  ]];
}));

try {
  await mkdir(output, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'assigned-work-fixture'));
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    assert.equal(request.method(), 'GET', 'This check must not write application data');
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: staff });
    const resource = url.pathname.split('/').at(-1);
    if (!records[resource]) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    assert.equal(url.pathname, `/api/staff/management/${resource}`);
    const query = url.searchParams;
    requests.push({ resource, mine: query.get('assignedToMe'), page: query.get('page') });
    const items = records[resource].filter(row =>
      (query.get('assignedToMe') !== 'true' || row.assignedStaff?.id === staff.id) &&
      (!query.get('priority') || row.priority === query.get('priority')));
    const page = Number(query.get('page')) || 1;
    const limit = Number(query.get('limit')) || 20;
    return route.fulfill({ json: { items: items.slice((page - 1) * limit, page * limit), total: items.length, page, limit } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const resource of Object.keys(records)) {
    await page.goto(`${base}/staff/${resource}?limit=10&page=2`);
    const table = page.getByRole('table', { name: resource === 'maintenance' ? 'Bảo trì kho' : 'Hỗ trợ khách hàng', exact: true });
    await table.getByText('Nhân viên khác', { exact: true }).waitFor();
    const mine = page.getByRole('checkbox', { name: 'Việc được giao cho tôi', exact: true });
    await mine.click();
    await page.waitForURL(url => url.searchParams.get('mine') === 'true' && !url.searchParams.has('page'));
    await page.getByText('Trang 1 / 2', { exact: true }).waitFor();
    await table.locator('tbody tr').first().waitFor();
    assert.equal(await table.locator('tbody tr').count(), 10);
    assert.doesNotMatch(await table.innerText(), /Nhân viên khác|Chưa phân công/);
    await page.getByRole('button', { name: 'Trang sau' }).click();
    await page.getByText('Trang 2 / 2', { exact: true }).waitFor();
    assert.equal(await table.locator('tbody tr').count(), 2);
    assert.doesNotMatch(await table.innerText(), /Nhân viên khác|Chưa phân công/);
    await page.reload();
    await table.locator('tbody tr').first().waitFor();
    assert(await mine.isChecked());
    assert.equal(await table.locator('tbody tr').count(), 2);
    await page.screenshot({ path: `${output}/${resource}-mine.png`, fullPage: true });
    await mine.click();
    await page.waitForURL(url => !url.searchParams.has('mine') && !url.searchParams.has('page'));
    await page.getByRole('button', { name: 'Trang sau' }).click();
    await table.getByText('Nhân viên khác', { exact: true }).waitFor();
    assert.equal(await table.locator('tbody tr').count(), 4);
    await mine.click();
    await page.waitForURL(url => url.searchParams.get('mine') === 'true');
    await page.getByRole('combobox', { name: 'Ưu tiên', exact: true }).selectOption('LOW');
    await page.getByRole('table').waitFor({ state: 'hidden' });
    assert(requests.some(request => request.resource === resource && request.mine === 'true'));
    console.log(`PASS ${resource}: assignment toggle, page reset, pagination, reload and combined empty filter`);
  }
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
}
