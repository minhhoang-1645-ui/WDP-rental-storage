import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const base = process.env.WDP_FE_URL ?? 'http://localhost:5173';
const browser = await launchTestBrowser();
const listPage = (items = []) => ({ items, total: items.length, page: 1, limit: 100 });
const invoice = {
  id: 'invoice-test', invoiceCode: 'HOA-DON-01', type: 'INITIAL', status: 'PARTIALLY_PAID', currency: 'VND',
  issuedAt: '2026-11-18T05:00:00Z', billingPeriodStart: '2026-11-18', billingPeriodEnd: '2026-12-18', dueAt: '2026-11-30',
  reservation: { id: 'order-test', reference: 'DON-01', quantity: 2, storageType: { name: 'Kho nhỏ' }, customer: { fullName: 'Khách thử' } },
  rentalAmount: 3000000, depositAmount: 3000000, serviceAmount: 200000, chargeAmount: 0, totalAmount: 6200000, amountPaid: 3000000, balanceDue: 3200000,
  breakdown: {
    units: ['B12', 'B13'].map(unitCode => ({ contractId: unitCode, contractCode: `HD-${unitCode}`, unitCode, storageTypeName: 'Kho nhỏ', monthlyRate: 1500000, rentalAmount: 1500000, depositAmount: 1500000 })),
    sharedServices: [{ id: 'box', name: 'Hộp đóng gói', amount: 200000, unitPrice: 100000, quantity: 2, physicalUnit: 'hộp', billingUnit: 'ONE_TIME' }],
  },
};
let failDetail = false;
let emptyInvoices = false;
let listDelay;
const errors = [];
try {
  async function setup(role, theme, width) {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    await context.addInitScript(({ theme }) => {
      localStorage.setItem('wdp-auth-token-v1', 'invoice-smoke-test');
      localStorage.setItem('nestbox-workspace-theme', theme);
    }, { theme });
    await context.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      if (request.method() !== 'GET') return route.fulfill({ status: 405 });
      if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: role, role, fullName: 'Tài khoản thử', accountStatus: 'ACTIVE', email: 'invoice@example.test', phone: '0900000000' } });
      if (path.endsWith('/invoices/' + invoice.id)) return failDetail
        ? route.fulfill({ status: 503, json: { message: 'Chưa tải được hóa đơn thử.' } }) : route.fulfill({ json: invoice });
      if (path.endsWith('/invoices')) {
        if (listDelay) await listDelay;
        return route.fulfill({ json: listPage(emptyInvoices ? [] : [invoice]) });
      }
      if (path.endsWith('/payment-config')) return route.fulfill({ json: { configured: false, vnpayConfigured: false } });
      if (path === '/api/reservations') return route.fulfill({ json: [] });
      return route.fulfill({ json: listPage() });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    return page;
  }

  const customer = await setup('CUSTOMER', 'dark', 390);
  let releaseList;
  listDelay = new Promise(resolve => { releaseList = resolve; });
  await customer.goto(base + '/customer/payments');
  await customer.getByText('Đang tải dữ liệu thanh toán…', { exact: true }).waitFor();
  releaseList();
  listDelay = undefined;
  await customer.getByText('Đơn DON-01 · 2 kho', { exact: true }).waitFor();
  await customer.getByText('B12, B13', { exact: true }).waitFor();
  failDetail = true;
  await customer.getByRole('button', { name: 'Chi tiết & chuyển khoản' }).click();
  const dialog = customer.getByRole('dialog');
  await dialog.getByText('Chưa tải được hóa đơn thử.').waitFor();
  failDetail = false;
  await dialog.getByRole('button', { name: 'Thử lại' }).click();
  await dialog.getByRole('heading', { name: 'Chi tiết từng kho' }).waitFor();
  assert.equal(await dialog.getByRole('rowheader').count(), 3);
  await dialog.getByRole('heading', { name: 'Dịch vụ chung' }).waitFor();
  await dialog.getByText('3.200.000', { exact: false }).first().waitFor();
  assert(await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  assert.equal(await customer.locator('html').getAttribute('data-workspace-theme'), 'dark');

  const manager = await setup('MANAGER', 'light', 1440);
  await manager.goto(base + '/manager/operations/invoices/' + invoice.id);
  await manager.getByRole('heading', { name: 'Chi tiết từng kho' }).waitFor();
  await manager.getByText('Kho nhỏ · HD-B13', { exact: true }).waitFor();
  await manager.getByText('Hộp đóng gói', { exact: true }).waitFor();
  assert.equal(await manager.locator('html').getAttribute('data-workspace-theme'), 'light');
  emptyInvoices = true;
  await customer.reload();
  await customer.getByRole('heading', { name: 'Chưa có hóa đơn' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS Customer invoice list and dialog with error/retry, Manager invoice, dark/mobile and light/desktop. API fixtures only.');
} finally { await browser.close(); }
