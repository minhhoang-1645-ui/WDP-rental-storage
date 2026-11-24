import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const browser = await launchTestBrowser();
const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const policy = { key: 'reservationHoldMinutes', title: 'Giữ chỗ', value: 30, min: 1, max: 1440, unit: 'phút', history: [], updatedAt: null };
const actor = { id: 'fixture-bom', role: 'BUSINESS_OPERATIONS_MANAGER', fullName: 'BOM kiểm thử', email: 'bom@example.test', phone: '', accountStatus: 'ACTIVE' };
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    const mutations = [];
    const nativeDialogs = [];
    page.on('dialog', async dialog => { nativeDialogs.push(dialog.type()); await dialog.dismiss(); });
    await page.addInitScript(theme => {
      localStorage.setItem('wdp-auth-token-v1', 'fixture-token');
      localStorage.setItem('nestbox-workspace-theme', theme);
    }, theme);
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      if (request.method() !== 'GET') mutations.push({ path, body: request.postDataJSON() });
      const json = path.endsWith('/auth/me') ? actor : path === '/api/operations/business-policies'
        ? { items: [policy], commercialRules: { prepaidDiscounts: [], depositDescription: '' } }
        : { items: [], total: 0 };
      return route.fulfill({ json });
    });
    await page.goto(`${base}/operations/policies`);
    await page.getByLabel('Giá trị mới (phút)').fill('60');
    await page.getByLabel('Áp dụng từ (UTC+7)').fill('2030-01-01T10:00');
    const publish = page.getByRole('button', { name: 'Kiểm tra và công bố phiên bản' });
    const dialog = page.getByRole('dialog', { name: 'Công bố chính sách' });
    await publish.click();
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /30 → 60 phút/);
    assert.equal(await dialog.evaluate(el => el.closest('.workspace-themed')?.dataset.workspaceTheme), theme);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(mutations.length, 0);
    assert.equal(await publish.evaluate(el => el === document.activeElement), true);
    await publish.click();
    await dialog.getByRole('button', { name: 'Công bố', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await publish.waitFor();
    assert.deepEqual(mutations, [{ path: '/api/operations/business-policies/reservationHoldMinutes', body: {value:60,expectedUpdatedAt:null,effectiveFrom:'2030-01-01T03:00:00.000Z'} }]);
    assert.deepEqual(nativeDialogs, []);
    await page.close();
  }
  const page = await browser.newPage();
  const unexpected = [];
  page.on('dialog', async dialog => { unexpected.push(dialog.type()); await dialog.dismiss(); });
  await page.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'fixture-token'));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (request.method() !== 'GET') unexpected.push(`${request.method()} ${path}`);
    if (path.endsWith('/auth/me')) return route.fulfill({ json: {...actor,role:'FACILITY_MANAGER'} });
    if (path.endsWith('/manager/staff/facilities')) return route.fulfill({ json: [{id:'facility',name:'Cơ sở kiểm thử',code:'CS01'}] });
    const items = path.endsWith('/manager/staff') ? [{id:'staff',fullName:'Nhân viên kiểm thử'}]
      : path.endsWith('/manager/appointments') ? [{id:'appointment',status:'REQUESTED',appointmentCode:'APPT-001'}] : [];
    return route.fulfill({ json: {page:1,limit:100,total:items.length,items} });
  });
  await page.goto(`${base}/manager/assignments?kind=appointments&record=appointment`);
  const assignment = page.getByRole('dialog', { name: 'Phân công nhân viên' });
  await assignment.getByRole('radio', { name: /Nhân viên kiểm thử/ }).check();
  await assignment.getByRole('button', { name: 'Hủy', exact: true }).click();
  await assignment.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('dialog:modal').count(), 0);
  assert.deepEqual(unexpected, []);
  console.log('PASS: policy confirmation in both themes and assignment cancellation without mutation.');
} finally {
  await browser.close();
}
