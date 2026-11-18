import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { selectChoice } from './select-choice.mjs';
import { fixture, customer, staff, when } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const output = 'artifacts/return-settlement';
await mkdir(output, { recursive: true });
const browser = await launchTestBrowser();
const errors = [], writes = [];
let debt = 3000000, readinessDebt = 3000000, early = true, decided = false;
const endDate = () => early ? '2099-01-01' : '2026-10-01';
const rental = () => ({ ...fixture.rentals[0], effectiveEndDate: endDate(), pendingRenewal: null,
  billingSummary: { totalInvoiced: 9000000, totalPaid: 9000000 - debt, totalOutstanding: debt, payableBalance: 0, scheduledBalance: debt },
  paymentDetails: { totalInvoiced: 9000000, totalPaid: 9000000 - debt, totalOutstanding: debt, groups: [] },
  returnReadiness: { requiresFullSettlement: true, totalOutstanding: readinessDebt, canReturn: readinessDebt === 0 },
});
const approval = () => ({ ...fixture['support-requests'][0], id: 'approval', subject: 'Đề nghị trả kho trước hạn', status: 'RESOLVED', earlyReturnDecision: 'APPROVED', earlyReturnForEndDate: endDate(), reservation: { id: rental().reservationId, reference: rental().reservationReference }, resolutionNote: 'Chấp thuận thời điểm trả sớm.' });
const proposal = () => ({ id: 'proposal', supportCode: 'EARLY-SETTLEMENT', status: decided ? 'RESOLVED' : 'OPEN', decision: decided ? 'APPROVED' : null, description: 'Không còn nhu cầu sử dụng kho', updatedAt: when, createdAt: when, resolvedAt: decided ? when : null, resolvedBy: staff, customer,
  reservation: { id: rental().reservationId, reference: rental().reservationReference, effectiveEndDate: endDate() }, contracts: [], financialSummary: { outstandingAmount: debt, paidAmount: 9000000 - debt, invoicedDeposit: 1500000 }, financialReview: null,
});
async function setup(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'return-settlement-fixture'));
  await context.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace(/^\/api\//, '');
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (request.method() !== 'GET') { writes.push(path); return route.fulfill({ status: 403, json: { message: 'Unexpected write' } }); }
    if (path === 'auth/me') return route.fulfill({ json: { ...(role === 'CUSTOMER' ? customer : staff), role } });
    const sources = { rentals: [rental()], 'support-requests': early ? [approval()] : [], 'early-return-requests': [proposal()] };
    const items = sources[path.split('/').at(-1)] ?? [];
    return route.fulfill({ json: { items, total: items.length, page: 1, limit: 100 } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
async function shot(page, name) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: page overflows`);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' });
}
try {
  const client = await setup('CUSTOMER'), page = client.page;
  for (const timing of ['early', 'normal']) {
    early = timing === 'early'; debt = readinessDebt = 3000000;
    await page.goto(base + '/customer/returns');
    assert(await page.getByRole('button', { name: 'Gửi yêu cầu trả kho', exact: true }).isDisabled());
    const choice = page.getByRole('combobox', { name: 'Yêu cầu thuê đủ điều kiện trả', exact: true });
    await choice.click();
    const option = page.locator(`[role="option"][data-value="${rental().reservationId}"]`);
    await option.waitFor();
    assert.match(await option.innerText(), /Cần thanh toán/);
    await option.click();
    const payment = page.getByRole('region', { name: 'Thanh toán của kho muốn trả' });
    await payment.getByText('3.000.000', { exact: false }).waitFor();
    assert.equal(await payment.getByRole('link').getAttribute('href'), `/customer/payments?reservation=${rental().reservationId}`);
    assert(await page.getByRole('button', { name: 'Gửi yêu cầu trả kho', exact: true }).isDisabled());
    assert.equal(await page.getByRole('region', { name: 'Điều kiện thanh toán trước khi trả kho' }).count(), 0);
    if (timing === 'early') {
      await shot(page, 'customer-scheduled-debt-blocked');
      await page.setViewportSize({ width: 390, height: 844 }); await shot(page, 'customer-scheduled-debt-blocked-mobile');
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    debt = readinessDebt = 0;
    await page.reload();
    await selectChoice(choice, rental().reservationId);
    assert(await page.getByRole('button', { name: 'Gửi yêu cầu trả kho', exact: true }).isEnabled());
  }
  readinessDebt = null;
  await page.reload();
  await selectChoice(page.getByRole('combobox', { name: 'Yêu cầu thuê đủ điều kiện trả', exact: true }), rental().reservationId);
  await page.getByText('Chưa xác định được số tiền còn thiếu.', { exact: false }).waitFor();
  assert(await page.getByRole('button', { name: 'Gửi yêu cầu trả kho', exact: true }).isDisabled());

  debt = readinessDebt = 3000000;
  const manager = await setup('MANAGER');
  await manager.page.goto(base + '/manager/early-returns?record=proposal');
  await manager.page.getByRole('heading', { name: 'Thanh toán đủ trước khi trả kho', exact: true }).waitFor();
  assert.equal(await manager.page.getByRole('combobox', { name: 'Cách xử lý công nợ', exact: true }).count(), 0);
  assert.equal(await manager.page.getByRole('button', { name: 'Lưu quyết định công nợ', exact: true }).count(), 0);
  await manager.page.locator('textarea').fill('Chấp thuận thời điểm trả sớm, phải tất toán trước khi trả kho.');
  await manager.page.getByRole('checkbox', { name: 'Tôi đã kiểm tra hóa đơn, tiền cọc và điều kiện trả kho', exact: true }).check();
  assert(await manager.page.getByRole('button', { name: 'Lưu quyết định trả sớm', exact: true }).isEnabled());
  await shot(manager.page, 'manager-settlement-policy');
  decided = true;
  await manager.page.reload();
  await manager.page.getByRole('heading', { name: 'Thanh toán đủ trước khi trả kho', exact: true }).waitFor();
  assert.equal(await manager.page.locator('select').count(), 0);
  assert.equal(await manager.page.locator('textarea').count(), 0);
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  console.log('PASS: approved early/normal rentals stay selectable with scoped payment CTA; all debt blocks submission, full settlement enables return, unknown ledger blocks return; Manager approval unchanged. All requests mocked.');
} finally { await browser.close(); }
