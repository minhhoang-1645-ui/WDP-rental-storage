// Isolated UI fixtures only. Every API call is intercepted; no account or business writes.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, customer, staff, reservation, unit } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser(), errors = [], writes = [], checks = [];
async function setup(role, width = 1440, mobile = false) {
  const data = structuredClone(fixture);
  data['payment-submissions'] = [];
  const rental = { ...data.rentals[0], reservationId: reservation.id, reservationReference: reservation.reference, startDate: '2026-10-01', effectiveEndDate: '2099-01-01', rentalState: 'ACTIVE', isOverdue: false, pendingRenewal: null, historicalPricing: { billingMode: 'MONTHLY' }, contracts: [{ ...data.contracts[0], unit }], billingSummary: { totalInvoiced: 1000000, totalPaid: 0, totalOutstanding: 1000000, nextInvoice: null } };
  data.rentals = [rental, { ...rental, reservationId: 'other-reservation', reservationReference: 'OTHER-RES', contracts: [{ ...rental.contracts[0], id: 'other-contract', unit: { ...unit, unitCode: 'OTHER-UNIT' } }] }];
  data.contracts = [data.contracts[0], { ...data.contracts[0], id: 'other-contract', contractCode: 'OTHER-CONTRACT', reservation: { ...reservation, id: 'other-reservation', reference: 'OTHER-RES' } }];
  data.invoices = [{ ...data.invoices[0], invoiceCode: 'SCOPE-INVOICE', reservation }, { ...data.invoices[0], id: 'other-invoice', invoiceCode: 'OTHER-INVOICE', reservation: { ...reservation, id: 'other-reservation', reference: 'OTHER-RES' } }];
  data.returns = []; data.renewals = []; data['support-requests'] = [{ ...data['support-requests'][0], status: 'ESCALATED' }];
  data.maintenance[0].status = 'AWAITING_VERIFICATION';
  data['stock-movements'] = [{ ...data['stock-movements'][0], status: 'ASSIGNED', assignedStaff: { ...staff, accountStatus: 'DISABLED' } }];
  const actor = { ...(role === 'CUSTOMER' ? customer : staff), role };
  const context = await browser.newContext({ viewport: { width, height: 960 } });
  await context.addInitScript(({ mobile }) => localStorage.setItem(mobile ? 'wdp-mobile-auth-token' : 'wdp-auth-token-v1', 'isolated-role-flow'), { mobile });
  const reads = [];
  await context.route(/\/api\//, async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace(/^\/api\//, '');
    const send = json => route.fulfill({ json });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (req.method() !== 'GET') { writes.push(path); return route.fulfill({ status: 403, json: { message: 'This is a read-only UI test.' } }); }
    reads.push(url.pathname + url.search);
    if (path === 'auth/me') return send(actor);
    if (path === 'manager/dashboard/summary') return send({ availableUnits: 2 });
    if (path === 'manager/unit-staff-assignments' || path === 'staff/assigned-units') return send({ enabled: false, items: [] });
    if (path === 'reservations') return send(data.reservations);
    if (path === 'customer/stored-items') return send([]);
    if (path === 'customer/payment-config') return send({ vnpayConfigured: true, configured: false });
    if (path === 'manager/staff') return send({ page: 1, limit: 100, total: 1, items: [staff] });
    const parts = path.split('/'), offset = parts[1] === 'management' ? 2 : 1, kind = parts[offset], id = parts[offset + 1];
    if (kind === 'users') return send({ page: 1, limit: 100, total: 1, items: [actor] });
    const items = data[kind];
    if (!items) throw new Error('Unexpected API read: ' + path);
    if (id) return send(items.find(item => item.id === id) ?? {});
    return send({ page: 1, limit: 100, total: items.length, items });
  });
  const page = await context.newPage(); page.setDefaultTimeout(mobile ? 60000 : 20000); page.on('pageerror', e => errors.push(e.message));
  return { context, page, reads, data, goto: path => page.goto(`http://127.0.0.1:${mobile ? 8081 : 5173}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 }) };
}
try {
  for (const width of [1440, 390]) {
    const app = await setup('CUSTOMER', width);
    await app.goto('/customer/rentals');
    const card = app.page.locator('article').filter({ hasText: reservation.reference }).first();
    await card.getByRole('link', { name: 'Hóa đơn & thanh toán', exact: true }).click();
    await app.page.getByText('SCOPE-INVOICE', { exact: true }).waitFor();
    assert.equal(await app.page.getByText('OTHER-INVOICE', { exact: true }).count(), 0);
    await app.goto('/customer/renewals?reservation=' + reservation.id);
    await app.page.waitForFunction(id => [...document.querySelectorAll('select')].some(select => select.value === id), reservation.id);
    await app.goto('/customer/transfers?reservation=' + reservation.id);
    await app.page.waitForFunction(reference => document.querySelector('select[aria-label="Yêu cầu đặt kho"]')?.value === reference, reservation.reference);
    await app.goto('/customer/returns?reservation=' + reservation.id);
    await app.page.getByLabel('Kho muốn trả sớm', { exact: true }).waitFor();
    await app.page.waitForFunction(id => document.querySelector('select[aria-label="Kho muốn trả sớm"]')?.value === id, reservation.id);
    assert.equal(await app.page.getByLabel('Kho muốn trả sớm', { exact: true }).inputValue(), reservation.id);
    await app.goto('/customer/stock-movements?rentalContractId=contract-id');
    await app.page.getByRole('button', { name: 'Tạo phiếu nhập / xuất', exact: true }).click();
    await app.page.waitForFunction(() => [...document.querySelectorAll('select')].some(select => select.value === 'contract-id'));
    assert(app.reads.some(path => path.includes('/customer/stock-movements?') && path.includes('rentalContractId=contract-id')));
    assert(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await app.context.close(); checks.push(`${width}px Customer: rental actions keep the correct invoice, renewal, support/transfer, early-return and stock contract context`);
  }
  const manager = await setup('MANAGER'); await manager.goto('/manager');
  await manager.page.getByRole('link', { name: /Chờ nghiệm thu bảo trì/ }).first().click(); assert(new URL(manager.page.url()).pathname.startsWith('/manager/'));
  const menu=manager.page.locator('aside.manager-sidebar nav a');
  assert.equal(await menu.count(),7,'Manager must have exactly seven primary groups');
  assert.deepEqual(await menu.locator(':scope > span').allTextContents(),['Tổng quan','Phân công nhân viên','Phê duyệt ngoại lệ','Tài chính','Hồ sơ thuê','Kho & bảng giá','Báo cáo']);
  manager.data.maintenance.push({...manager.data.maintenance[0],id:'ordinary-maintenance',maintenanceCode:'MNT-NORMAL',status:'OPEN'});
  await manager.goto('/manager/operations/maintenance?status=OPEN');
  await manager.page.getByRole('heading',{name:'Nghiệm thu bảo trì',exact:true}).waitFor();
  await manager.page.getByText('MNT-TEST',{exact:true}).waitFor();
  assert.equal(await manager.page.getByText('MNT-NORMAL',{exact:true}).count(),0);
  assert(manager.reads.some(path=>path.includes('/manager/maintenance?')&&path.includes('status=AWAITING_VERIFICATION')));
  assert.equal(await manager.page.getByRole('button',{name:'Tạo bảo trì',exact:true}).count(),0);
  for(const [section,title] of [['reviews','Phê duyệt ngoại lệ'],['finance','Tài chính'],['rental-records','Hồ sơ thuê'],['facility','Kho & bảng giá']]) { await manager.goto('/manager/'+section);await manager.page.getByRole('heading',{name:title,exact:true}).waitFor(); }
  manager.data.units[0].status='AVAILABLE';await manager.goto('/manager/units/'+manager.data.units[0].id);await manager.page.getByText(manager.data.units[0].unitCode,{exact:true}).first().waitFor();assert.equal(await manager.page.getByRole('link',{name:'Tạo bảo trì cho kho',exact:true}).count(),0);
  checks.push('Exact seven Manager groups, only escalated/verification cases, no Staff create actions, and working finance/review/records/facility destinations');
  await manager.goto('/manager/assignments?assignment=attention');
  await manager.page.getByText('Tài khoản đã vô hiệu hóa · cần đổi người', { exact: true }).waitFor();
  await manager.context.close(); checks.push('Manager: review shortcut stays in Manager; disabled assignee appears in replacement queue');
  const employee = await setup('STAFF'); await employee.goto('/staff');
  const queue = employee.page.locator('[aria-label="Ưu tiên xử lý"]'); await queue.waitFor();
  assert(!(await queue.innerText()).includes('MNT-TEST')); assert(!(await queue.innerText()).includes('SUP-TEST'));
  assert.equal(await employee.page.getByRole('link', { name: 'Phân công nhân viên', exact: true }).count(), 0);
  await employee.context.close(); checks.push('Staff: Manager review cases do not appear as executable Staff tasks, and no assignment menu');
  const admin = await setup('ADMIN'); await admin.goto('/admin/users'); await admin.page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).waitFor();
  assert.equal(await admin.page.getByRole('link', { name: 'Phân công nhân viên', exact: true }).count(), 0);
  await admin.goto('/manager'); await admin.page.waitForURL('**/admin'); await admin.context.close(); checks.push('Admin: account administration only, Manager URL returns to Admin');
  const mobile = await setup('MANAGER', 390, true); await mobile.goto('/manager'); await mobile.page.getByText('Chờ nghiệm thu bảo trì', { exact: true }).waitFor(); for(const [section,title] of [['reviews','Phê duyệt ngoại lệ'],['finance','Tài chính'],['rental-records','Hồ sơ thuê'],['facility','Kho & bảng giá']]) { await mobile.goto('/manager/'+section);await mobile.page.getByRole('heading',{name:title,exact:true}).waitFor(); } mobile.data['support-requests'][0].subject='Yêu cầu chuyển kho';await mobile.goto('/manager/support-requests/'+mobile.data['support-requests'][0].id);await mobile.page.getByRole('heading',{name:'SUP-TEST',exact:true}).waitFor();assert.equal(await mobile.page.getByRole('button',{name:'Tạo lệnh chuyển từ yêu cầu này',exact:true}).count(),0); await mobile.context.close(); checks.push('Mobile Manager: review work is visible on the work hub');
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
