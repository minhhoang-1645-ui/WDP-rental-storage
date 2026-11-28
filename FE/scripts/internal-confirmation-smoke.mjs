import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const browser = await launchTestBrowser();
const base = process.env.WDP_FE_URL || 'http://localhost:5173';
import './operations-policies-smoke.mjs';
const actor = { id: 'fixture-bom', role: 'BUSINESS_OPERATIONS_MANAGER', fullName: 'BOM kiểm thử', email: 'bom@example.test', phone: '', accountStatus: 'ACTIVE' };
try {
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
