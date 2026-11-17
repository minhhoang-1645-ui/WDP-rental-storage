import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff, customer, when } from './fixtures/workspace.mjs';
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173', output = 'artifacts/operational-followups';
await mkdir(output, { recursive: true });
const browser = await launchTestBrowser(), errors = [], writes = [];
let revision = 0;
let claim = { id: 'claim', claimCode: 'CLAIM-TEST', status: 'RESOLVED', discoveredOn: '2026-11-17', unitCodeSnapshot: 'RV10-SM-04', description: 'Hàng bị hư hỏng cần xác minh', updatedAt: when, estimatedValue: 5000000, affectedItems: [{ id: 'item', name: 'Trực thăng', unit: 'thùng' }], evidenceLinks: [], staffFacts: 'Đã kiểm tra và ghi nhận hư hỏng', decision: 'APPROVED', decisionReason: 'Lý do quyết định ban đầu', resolutionNote: 'Kết quả xử lý ban đầu', customer };
const support = { ...fixture['support-requests'][0], id: 'support', status: 'ASSIGNED', assignedStaff: staff, subject: 'Yêu cầu chuyển kho', reservation: { id: 'reservation-id', reference: 'RES-TEST' } };
let transfer = { ...fixture.transfers[0], id: 'transfer', status: 'REQUESTED', rejectionReason: null, supportRequest: { id: 'support', status: 'ASSIGNED' } };
let proposal = { id: 'proposal', supportCode: 'EARLY-TEST', subject: 'Đề nghị trả kho trước hạn', status: 'RESOLVED', decision: 'APPROVED', description: 'Không còn nhu cầu sử dụng kho', resolutionNote: 'Chấp thuận trả kho trước hạn', resolvedAt: when, resolvedBy: staff, updatedAt: when, customer, reservation: { id: 'reservation-id', reference: 'RES-TEST', effectiveEndDate: '2027-05-17' }, contracts: [], physicallyReturnedAt: when, financialSummary: { outstandingAmount: 3000000, paidAmount: 7275000, invoicedDeposit: 1500000 }, financialReview: null,
  eligibleUnusedInvoices: [{ id: 'invoice-2', code: 'I02', amount: 1500000, startDate: '2026-12-17', endDate: '2027-01-17' }, { id: 'invoice-3', code: 'I03', amount: 1500000, startDate: '2027-01-17', endDate: '2027-02-17' }] };
async function setup(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'followup-fixture'));
  await context.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace(/^\/api\//, '');
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (request.method() !== 'GET') {
      const body = request.postDataJSON(); writes.push({ path, body });
      if (path.endsWith('damage-claims/claim')) {
        claim = { ...claim, ...(body.action === 'amend-decision' ? { decisionReason: body.decisionReason } : body.action === 'amend-resolution' ? { resolutionNote: body.resolutionNote } : { staffFacts: body.staffFacts, status: 'INVESTIGATING' }), updatedAt: `2026-11-17T12:00:${String(++revision).padStart(2, '0')}Z` };
        return route.fulfill({ json: claim });
      }
      if (path.endsWith('/transfers/transfer/reject')) { transfer = { ...transfer, status: 'REJECTED', rejectionReason: body.reason }; return route.fulfill({ json: transfer }); }
      if (path.endsWith('/early-return-requests/proposal/financial-review')) { proposal = { ...proposal, financialReview: { disposition: body.financialDisposition, reason: body.financialReason, waivedAmount: 3000000, appliedAt: when }, eligibleUnusedInvoices: [], financialSummary: { ...proposal.financialSummary, outstandingAmount: 0 } }; return route.fulfill({ json: proposal }); }
      throw new Error(`Unexpected write ${path}`);
    }
    if (path === 'auth/me') return route.fulfill({ json: { ...(role === 'CUSTOMER' ? customer : staff), role } });
    if (path.endsWith('/support-requests/support')) return route.fulfill({ json: support });
    if (path.endsWith('/transfers/transfer')) return route.fulfill({ json: transfer });
    if (path.endsWith('/destinations')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 100 } });
    if (path.endsWith('/assigned-units') || path.endsWith('/unit-staff-assignments')) return route.fulfill({ json: { enabled: false, items: [] } });
    const kind = path.split('/').at(-1);
    const data = { 'damage-claims': role === 'CUSTOMER' ? [] : [claim], 'early-return-requests': [proposal], 'support-requests': role === 'CUSTOMER' ? [{ ...support, subject: 'Đề nghị trả kho trước hạn', status: 'RESOLVED', earlyReturnDecision: 'APPROVED', resolutionNote: 'Đã chấp thuận trả sớm' }] : [support], transfers: [] };
    const items = data[kind] ?? [];
    return route.fulfill({ json: { items, total: items.length, page: 1, limit: 100 } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
  return { page, context };
}
async function shot(page, name) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' });
}
try {
  const manager = await setup('MANAGER'), page = manager.page;
  await page.goto(base + '/manager/damage-claims');
  await page.getByRole('button', { name: 'Chỉnh sửa lý do quyết định', exact: true }).click();
  assert.equal(await page.locator('.claim-record-editor textarea').inputValue(), 'Lý do quyết định ban đầu');
  await page.locator('.claim-record-editor textarea').fill('Lý do đã cập nhật sau khi đối chiếu');
  await page.getByRole('button', { name: 'Lưu chỉnh sửa', exact: true }).click();
  await page.getByRole('button', { name: 'Chỉnh sửa lý do quyết định', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Chỉnh sửa kết quả', exact: true }).click();
  assert.equal(await page.locator('.claim-record-editor textarea').inputValue(), 'Kết quả xử lý ban đầu');
  await page.locator('.claim-record-editor textarea').fill('Kết quả đã cập nhật và thông báo cho khách');
  await page.getByRole('button', { name: 'Lưu chỉnh sửa', exact: true }).click();
  await page.getByRole('button', { name: 'Chỉnh sửa kết quả', exact: true }).waitFor();
  assert.equal(claim.status, 'RESOLVED');
  assert(await page.locator('.claim-review-card').evaluate(element => element.getBoundingClientRect().height) < 1000);
  await shot(page, 'manager-claim-review');
  await page.setViewportSize({ width: 390, height: 844 }); await shot(page, 'manager-claim-review-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/manager/early-returns?record=proposal');
  await page.getByRole('heading', { name: 'Thanh toán đủ trước khi trả kho', exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Cách xử lý công nợ', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Lưu quyết định công nợ', exact: true }).count(), 0);
  await shot(page, 'manager-early-return-full-settlement');
  assert.equal(writes.filter(item => item.path.endsWith('/financial-review')).length, 0);

  claim = { ...claim, status: 'REPORTED', staffFacts: null, decisionReason: null, resolutionNote: null };
  const worker = await setup('STAFF');
  await worker.page.goto(base + '/staff/damage-claims');
  await worker.page.locator('.claim-record-editor textarea').fill('Đã kiểm tra thực tế hàng hóa tại kho');
  await worker.page.getByRole('button', { name: 'Lưu ghi nhận để quản lý xem xét', exact: true }).click();
  await worker.page.getByRole('button', { name: 'Chỉnh sửa ghi nhận', exact: true }).waitFor();
  assert.equal(await worker.page.locator('.claim-record-editor').count(), 0);
  await shot(worker.page, 'staff-claim-review');
  await worker.page.goto(base + '/staff/support-requests/support');
  await worker.page.getByRole('button', { name: 'Tạo lệnh chuyển từ yêu cầu này', exact: true }).waitFor();
  assert.equal(await worker.page.getByRole('button', { name: /Hoàn tất hỗ trợ|Bắt đầu hỗ trợ/ }).count(), 0);
  await shot(worker.page, 'staff-transfer-request-only');
  await worker.page.goto(base + '/staff/transfers/transfer');
  await worker.page.locator('.transfer-rejection-form textarea').fill('Hiện không có kho đích cùng loại phù hợp');
  await worker.page.getByRole('button', { name: 'Từ chối chuyển kho', exact: true }).click();
  await worker.page.getByText('Hiện không có kho đích cùng loại phù hợp', { exact: true }).waitFor();
  assert.equal(writes.find(item => item.path.endsWith('/reject')).body.reason, 'Hiện không có kho đích cùng loại phù hợp');

  const client = await setup('CUSTOMER');
  await client.page.goto(base + '/customer/returns');
  const badge = client.page.locator('a[href="/customer/returns"] .navigation-work-count');
  await badge.waitFor(); assert.equal(await badge.innerText(), '1');
  await shot(client.page, 'customer-action-badge');
  assert.deepEqual(errors, []);
  console.log('PASS: claim amendment UI, Staff transfer-only handling, rejection reason, mandatory full settlement policy and per-page customer badge. All writes mocked.');
} finally { await browser.close(); }
