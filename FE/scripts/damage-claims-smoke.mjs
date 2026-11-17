import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { customer, staff } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL ?? 'http://localhost:5173';
const browser = await launchTestBrowser();
const timestamp = '2026-10-18T04:00:00.000Z';
const inspected = 'Đã kiểm tra hộp hàng, vỏ bị móp.';
const manager = { ...staff, id: 'claims-manager', role: 'MANAGER', fullName: 'Quản lý thử' };
const sequence = Array.from({ length: 12 }, (_, index) => ({
  id: `claim-${index + 1}`, claimCode: `NB-SC-TEST${index + 1}`, description: `Hộp hàng bị móp ${index + 1}`,
  unitCodeSnapshot: 'SM-B12-003', rentalContract: { contractCode: 'HĐ-123' }, status: 'APPROVED', decision: 'APPROVED',
  staffFacts: inspected, decisionReason: 'Đã đối chiếu theo kết quả kiểm tra.', resolutionNote: 'Đã thông báo kết quả cho khách.',
  createdAt: timestamp, updatedAt: timestamp, discoveredOn: '2026-10-18', estimatedValue: 150000,
  affectedItems: [{ id: 'item', name: 'Hộp đựng đồ', unit: 'hộp' }], evidenceLinks: ['https://example.test/hop-hang'],
  customer, assignedStaff: staff, compensation: { status: 'AWAITING_HANDOVER', approvedCompensationAmount: 100000, paidCompensationAmount: null, method: 'CASH', approvedAt: timestamp },
  history: [{ action: 'INSPECTED', role: 'STAFF', actorName: staff.fullName, at: timestamp, to: 'INVESTIGATING' }],
}));
const handover = sequence[0];
const legacyClaim = { ...sequence[2], status: 'INVESTIGATING', decision: null, decisionReason: null, resolutionNote: null };
const errors = [];
const requests = [];
let failList = false;
let failHandover = true;
let blockList;

async function setup(account, theme, width, legacy = false) {
  const context = await browser.newContext({ viewport: { width, height: 850 } });
  await context.addInitScript(({ theme }) => {
    localStorage.setItem('wdp-auth-token-v1', 'isolated-damage-claim-ui');
    localStorage.setItem('nestbox-workspace-theme', theme);
  }, { theme });
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const method = request.method(), path = url.pathname;
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/api/auth/me') return route.fulfill({ json: account });
    if (path === '/api/reservations') return route.fulfill({ json: [] });
    if (path === '/api/customer/contracts') return route.fulfill({ json: { items: [{ id: 'test-contract', status: 'ACTIVE', contractCode: 'HĐ-123', storageUnit: { unitCode: 'SM-B12-003' } }], total: 1, page: 1, limit: 20 } });
    if (path === '/api/customer/stored-items') return route.fulfill({ json: [] });
    const match = /^\/api\/(customer|manager|staff\/management)\/damage-claims(?:\/([^/]+)(\/compensation\/handover)?)?$/.exec(path);
    const page = Number(url.searchParams.get('page') ?? 1), limit = Number(url.searchParams.get('limit') ?? 25);
    if (!match) return route.fulfill({ json: { items: [], total: 0, page, limit } });
    const [, , id, action] = match;
    const visible = record => {
      const row = structuredClone(record);
      if (account.role !== 'MANAGER') {
        for (const key of ['deliveredBy', 'receivedBy', 'recordedBy', 'approvedAt', 'recordedAt', 'handoverNote']) delete row.compensation[key];
      }
      if (account.role === 'STAFF' || legacy) delete row.compensation;
      if (account.role === 'CUSTOMER') delete row.customer;
      return row;
    };
    if (method === 'PATCH' && action && account.role === 'MANAGER') {
      requests.push(request.postDataJSON());
      if (failHandover) {
        failHandover = false;
        return route.fulfill({ status: 409, json: { message: 'Bản ghi đang thay đổi. Vui lòng kiểm tra lại.' } });
      }
      const { paidCompensationAmount, deliveredBy, receivedBy, handedOverAt, handoverNote } = requests.at(-1);
      Object.assign(handover.compensation, { paidCompensationAmount, deliveredBy, receivedBy, handedOverAt, handoverNote, status: 'HANDED_OVER', recordedBy: manager.fullName });
      handover.updatedAt = '2026-10-18T08:01:00Z';
      handover.history.push({ role: 'MANAGER', action: 'CASH_HANDED_OVER', at: handover.updatedAt, actorName: manager.fullName });
      return route.fulfill({ json: visible(handover) });
    }
    if (method !== 'GET') return route.fulfill({ status: 403 });
    if (id) return route.fulfill({ status: 404, json: { message: `Cannot GET ${path}` } });
    const detail = url.searchParams.get('id');
    if (detail) {
      const record = legacy && detail === legacyClaim.id ? legacyClaim : sequence.find(row => row.id === detail);
      const items = record ? [visible(record)] : [];
      return route.fulfill({ json: { items, total: items.length, page, limit } });
    }
    const ownList = limit === 10 || limit === 20 || limit === 50;
    if (ownList && blockList) await blockList;
    if (ownList && failList) return route.fulfill({ status: 503, json: { message: 'Tạm thời chưa tải được danh sách.' } });
    const search = url.searchParams.get('search')?.toLowerCase() ?? '';
    const stage = url.searchParams.get('stage');
    const items = sequence.filter(row => row.description.toLowerCase().includes(search) && (!stage || stage === 'handover' && row.compensation.status === 'AWAITING_HANDOVER'));
    return route.fulfill({ json: { items: items.slice((page - 1) * limit, page * limit).map(visible), total: items.length, page, limit } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
}

async function noPageOverflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}

try {
  const page = await setup(manager, 'light', 1440);
  const table = page.getByRole('table', { name: 'Danh sách sự cố hàng hóa' });
  let release;
  blockList = new Promise(resolve => { release = resolve; });
  await page.goto(base + '/manager/damage-claims?limit=10');
  await page.locator('.claims-page [aria-busy=true]').waitFor();
  release();
  blockList = undefined;
  await table.waitFor();
  const list = page.locator('.claims-page');
  assert.equal(await page.locator('html').getAttribute('data-workspace-theme'), 'light');
  assert.equal(await table.locator('tbody tr').count(), 10);
  await list.getByRole('button', { name: 'Trang sau' }).click();
  await table.getByRole('link', { name: 'Hộp hàng bị móp 12', exact: true }).waitFor();
  assert.equal(await table.locator('tbody tr').count(), 2);
  await list.getByRole('searchbox', { name: 'Tìm kiếm' }).fill('móp 11');
  await table.getByRole('link', { name: 'Hộp hàng bị móp 12', exact: true }).waitFor({ state: 'hidden' });
  await table.getByRole('link', { name: 'Hộp hàng bị móp 11', exact: true }).waitFor();
  assert.equal(await table.locator('tbody tr').count(), 1);
  await list.getByRole('combobox', { name: 'Trạng thái' }).selectOption('unassigned');
  await list.getByRole('heading', { name: 'Chưa có sự cố phù hợp' }).waitFor();
  await list.getByRole('combobox', { name: 'Trạng thái' }).selectOption('handover');
  await table.getByText('Chờ giao tiền', { exact: true }).waitFor();
  failList = true;
  await list.getByRole('button', { name: 'Làm mới' }).click();
  await list.getByRole('alert').getByText('Tạm thời chưa tải được danh sách.').waitFor();
  failList = false;
  await list.getByRole('button', { name: 'Thử lại' }).click();
  await table.waitFor();
  await list.getByRole('searchbox', { name: 'Tìm kiếm' }).fill('');
  await table.getByRole('link', { name: 'Hộp hàng bị móp 1', exact: true }).click();
  await page.getByRole('heading', { name: 'Bồi thường tiền mặt' }).waitFor();
  assert.equal(await list.getByRole('button', { name: 'Hoàn tất hồ sơ' }).count(), 0);
  await list.getByRole('button', { name: 'Ghi nhận đã giao tiền' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ghi nhận đã giao tiền' });
  assert(await dialog.getByRole('button', { name: 'Xác nhận đã giao tiền' }).isDisabled());
  assert.match(await dialog.getByLabel('Số tiền đã giao').inputValue(), /100\.000/);
  await dialog.getByLabel(/Ngày giờ bàn giao/).fill('2026-10-18T15:00');
  await dialog.getByLabel('Người giao').fill('Người giao tiền thử');
  await dialog.getByRole('checkbox', { name: /Xác nhận đã bàn giao/ }).check();
  await dialog.getByRole('button', { name: 'Xác nhận đã giao tiền' }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByLabel('Người giao').inputValue(), 'Người giao tiền thử');
  await dialog.getByRole('button', { name: 'Xác nhận đã giao tiền' }).click();
  await list.getByText('Đã ghi nhận bàn giao tiền mặt.').waitFor();
  await list.getByText('Đã bàn giao tiền bồi thường', { exact: true }).waitFor();
  await list.getByRole('button', { name: 'Hoàn tất hồ sơ' }).waitFor();
  assert.equal(await list.getByRole('button', { name: 'Ghi nhận đã giao tiền' }).count(), 0);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[1].paidCompensationAmount, 100000);
  assert.equal(requests[1].handedOverAt, '2026-10-18T08:00:00.000Z');
  await noPageOverflow(page);

  const narrow = await setup({ ...customer, role: 'CUSTOMER', accountStatus: 'ACTIVE' }, 'dark', 390);
  await narrow.goto(base + '/customer/damage-claims');
  await narrow.locator('.claims-page').getByRole('table').waitFor();
  assert.equal(await narrow.locator('html').getAttribute('data-workspace-theme'), 'dark');
  await noPageOverflow(narrow);
  await narrow.locator('.claims-page').getByRole('button', { name: 'Báo sự cố' }).click();
  const report = narrow.getByRole('dialog', { name: 'Báo sự cố' });
  await report.getByLabel('Mô tả sự cố').waitFor();
  const box = await report.boundingBox();
  assert(box && box.x >= 0 && box.width <= 390 && box.height <= 850);
  await report.getByRole('button', { name: 'Hủy' }).click();
  await narrow.goto(base + '/customer/damage-claims?claim=claim-1');
  await narrow.getByText('Đã bàn giao tiền bồi thường', { exact: true }).waitFor();
  await narrow.getByText('Giá trị tôi ước tính').waitFor();
  await narrow.getByText('Số tiền được duyệt').waitFor();
  assert.equal(await narrow.getByText('Người giao tiền thử', { exact: true }).count(), 0);
  await noPageOverflow(narrow);
  await narrow.goto(base + '/customer/damage-claims?claim=claim-2');
  await narrow.getByText('Đã duyệt bồi thường — Chờ giao tiền').waitFor();
  await narrow.goto(base + '/customer/damage-claims?claim=missing');
  await narrow.locator('.claims-page').getByRole('alert').getByText('Không tìm thấy hồ sơ sự cố.').waitFor();

  const worker = await setup(staff, 'light', 1280);
  await worker.goto(base + '/staff/damage-claims?claim=claim-1');
  await worker.locator('.claims-page').getByText(inspected).waitFor();
  assert.equal(await worker.getByRole('heading', { name: 'Bồi thường tiền mặt' }).count(), 0);
  assert.equal(await worker.getByRole('button', { name: 'Chỉnh kết quả kiểm tra' }).count(), 0);

  const oldApi = await setup(manager, 'light', 1280, true);
  await oldApi.goto(base + `/manager/damage-claims?claim=${legacyClaim.id}`);
  await oldApi.getByRole('button', { name: 'Quyết định xử lý', exact: true }).click();
  const decision = oldApi.getByRole('dialog', { name: 'Quyết định xử lý' });
  await decision.getByText('API đang chạy chưa hỗ trợ duyệt bồi thường tiền mặt.').waitFor();
  assert.equal(await decision.getByRole('checkbox', { name: 'Duyệt bồi thường tiền mặt' }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS local Web: role-specific lists/details, search, filters, pagination, loading/error/empty, cash dialog and retry, light/dark, 390px layout, legacy details and compensation guard. APIs mocked.');
} finally {
  await browser.close();
}
