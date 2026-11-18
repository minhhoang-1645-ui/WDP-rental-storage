import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL ?? 'http://localhost:5173';
const row = structuredClone(fixture.returns[0]);
const [inspection] = row.inspections;
Object.assign(row, {
  status: 'INSPECTION_IN_PROGRESS',
  inventory: { remainingItemTypes: 1, pendingMovements: 0 },
});
Object.assign(inspection, {
  result: 'PENDING', inspectedAt: null, issueType: null, contract: { ...inspection.contract, id: 'test-contract' },
});
const returnPath = '/staff/returns/' + row.id;
const browser = await launchTestBrowser();
try {
  const page = await browser.newPage();
  const errors = [], mutations = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'isolated-staff-return'));
  await page.route(/\/api\//, route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/api/auth/me') return route.fulfill({ json: staff });
    if (method === 'GET') {
      return route.fulfill({ json: path.endsWith('/returns/' + row.id) ? row : { items: [], page: 1, limit: 100, total: 0 } });
    }
    mutations.push(path);
    if (method === 'PATCH' && path === '/api' + returnPath + '/inspections/' + inspection.id) {
      assert.equal(request.postDataJSON().result, 'PASS');
      inspection.result = 'PASS';
      inspection.inspectedAt = '2026-11-16T02:00:00Z';
      return route.fulfill({ json: row });
    }
    if (method === 'POST' && path === '/api' + returnPath + '/finalize') {
      assert.equal(inspection.result, 'PASS');
      assert.deepEqual(row.inventory, { remainingItemTypes: 0, pendingMovements: 0 });
      row.status = 'PENDING_SETTLEMENT';
      return route.fulfill({ json: row });
    }
    return route.fulfill({ status: 405 });
  });

  await page.goto(base + returnPath);
  const requirements = page.locator('.return-requirements');
  const confirmation = page.getByRole('checkbox', { name: /Đã nhận lại thực tế/ });
  const finalize = page.getByRole('button', { name: 'Hoàn tất nhận kho trả' });
  await requirements.getByText(/cho từng kho chưa lưu kết quả/).waitFor();
  await requirements.getByText(/Còn 1 loại hàng trong kho/).waitFor();
  assert(await confirmation.isDisabled());
  assert(await finalize.isDisabled());
  assert.equal(await requirements.getByRole('link', { name: 'Xem hàng đang lưu' }).getAttribute('href'), '/staff/stored-items?storageUnitId=' + inspection.unit.id);
  await page.getByRole('button', { name: /Lưu kết quả kho/ }).click();
  await requirements.getByText(/cho từng kho chưa lưu kết quả/).waitFor({ state: 'hidden' });
  await requirements.getByText(/Còn 1 loại hàng trong kho/).waitFor();
  assert(await confirmation.isDisabled());

  row.inventory = { remainingItemTypes: 0, pendingMovements: 1 };
  await page.reload();
  await requirements.getByText(/Còn 1 phiếu nhập hoặc xuất chưa hoàn tất/).waitFor();
  assert(await confirmation.isDisabled());
  assert.equal(await requirements.getByRole('link', { name: 'Mở phiếu nhập – xuất' }).getAttribute('href'), '/staff/stock-movements?rentalContractId=test-contract');

  row.inventory.pendingMovements = 0;
  await page.reload();
  await confirmation.check();
  await finalize.click();
  await page.getByText(/Đã nhận kho trả\. Quyết toán tiền cọc/).waitFor();
  assert.deepEqual(mutations, [
    '/api' + returnPath + '/inspections/' + inspection.id,
    '/api' + returnPath + '/finalize',
  ]);
  assert.deepEqual(errors, []);
  console.log('PASS return confirmation shows actual blockers and unlocks after saved inspection and inventory clearance. APIs mocked.');
} finally {
  await browser.close();
}
