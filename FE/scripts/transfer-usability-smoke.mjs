import { selectChoice } from './select-choice.mjs';
// All browser API traffic, including mutations, is intercepted. No database records are created.
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff as originalStaff, customer, unit, reservation, when } from './fixtures/workspace.mjs';
const browser = await launchTestBrowser(), errors = [], unexpected = [], writes = [], checks = [];
const base = 'http://127.0.0.1:5173', staff = { ...originalStaff, fullName: 'Nguyễn Mai', email: 'mai@nestbox.vn' };
const data = structuredClone(fixture), contract = data.contracts[0], dest = { ...unit, id: 'destination-id', unitCode: 'A102' };
data.units.push(dest); data['payment-submissions'] = [];
data.rentals = [{ ...data.rentals[0], quantity: 1, startDate: contract.startDate, endDate: contract.endDate, effectiveEndDate: contract.endDate, isOverdue: false, rentalState: 'ACTIVE', contracts: [{ ...contract, unit }], billingSummary: { totalInvoiced: 0, totalPaid: 0, totalOutstanding: 0, nextInvoice: null } }];
const supports = () => data['support-requests'].map(row => ({ ...row, transfers: data.transfers.filter(item => item.supportRequest?.id === row.id) }));
async function setup(role, width) {
  const context = await browser.newContext({ viewport: { width, height: 960 } });
  await context.addInitScript(role => { localStorage.setItem('wdp-auth-token-v1', `isolated-${role}`); localStorage.setItem('wdp-mobile-auth-token', `isolated-${role}`); }, role);
  await context.route(/\/api\//, async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace(/^\/api\//, ''), method = request.method();
    const send = (json, status = 200) => route.fulfill({ json, status });
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === 'auth/me') return send(role === 'CUSTOMER' ? { ...customer, role } : { ...staff, role, id: role === 'MANAGER' ? 'manager-id' : staff.id });
    if (path === 'manager/staff') { const page = Number(url.searchParams.get('page') || 1), items = [{ id: 'demo-cuid', fullName: 'Demo Staff', email: 'DEMO-1234abcd-staff@example.test' }, { ...staff, id: 'staff-other', fullName: 'Trần Linh' }, staff]; return send({ page, limit: 1, total: 3, items: items.slice(page - 1, page) }); }
    if (path === 'reservations') return send(data.reservations);
    if (path === 'customer/payment-config') return send({ vnpayConfigured: true, configured: false });
    const parts = path.split('/'), offset = parts[1] === 'management' ? 2 : 1, kind = parts[offset], id = parts[offset + 1], action = parts[offset + 2];
    if (!(kind in data)) { unexpected.push(`${role}:${method}:${path}`); return send({ message: 'Unexpected ' + path }, 500); }
    const row = data[kind].find(item => (item.id || item.reservationId) === id);
    if (method === 'GET') { const items = (kind === 'support-requests' ? supports() : data[kind]).filter(item => !url.searchParams.get('status') || item.status === url.searchParams.get('status')); return send(id ? items.find(item => (item.id || item.reservationId) === id) : { page: 1, limit: 100, total: items.length, items }); }
    const body = request.postData() ? request.postDataJSON() : {}; writes.push({ role, path, body });
    if (role === 'CUSTOMER' && kind === 'support-requests' && !id) { assert.equal(body.rentalContractId, contract.id); assert.equal(body.storageUnitId, unit.id); assert.equal(body.subject, 'Yêu cầu chuyển kho'); const support = { ...body, id: 'support-transfer', supportCode: 'SUP-TRANSFER', status: 'OPEN', priority: 'MEDIUM', customer, reservation, contract, unit, createdAt: when }; data['support-requests'].push(support); return send(support, 201); }
    if (action === 'assign') { assert.equal(role, 'MANAGER'); assert.equal(body.staffUserId, staff.id); row.assignedStaff = staff; row.status = 'ASSIGNED'; return send(row); }
    assert.equal(role, 'STAFF');
    if (kind === 'transfers' && !id) { assert(path.startsWith('staff/management/')); assert.equal(body.supportRequestId, 'support-transfer'); assert.equal(body.rentalContractId, contract.id); const transfer = { ...fixture.transfers[0], id: 'transfer-created', transferCode: 'TRF-CREATED', supportRequest: { id: 'support-transfer', supportCode: 'SUP-TRANSFER', status: 'ASSIGNED' }, contract, reservation }; data.transfers.push(transfer); return send(transfer, 201); }
    if (kind === 'transfers' && action === 'approve') { assert.equal(body.toStorageUnitId, dest.id); row.toUnit = dest; row.status = 'APPROVED'; return send(row); }
    if (kind === 'transfers' && action === 'complete') { row.status = 'COMPLETED'; row.completedAt = when; row.fromUnit.status = 'MAINTENANCE'; if (!data.maintenance.length) data.maintenance.push({ ...fixture.maintenance[0], id: 'maintenance-source', maintenanceCode: 'MNT-SOURCE', status: 'OPEN', assignedStaff: null, unit: row.fromUnit }); row.sourceMaintenance = data.maintenance[0]; row.sourceMaintenanceMissing = false; const support = data['support-requests'][0]; support.status = 'RESOLVED'; support.resolutionNote = 'Đã hoàn tất chuyển kho từ A101 sang A102.'; row.supportRequest.status = 'RESOLVED'; return send(row); }
    unexpected.push(`${role}:${method}:${path}`); return send({ message: 'Unexpected mutation' }, 500);
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
try {
  for (const width of [1440, 390]) {
    data['support-requests'] = []; data.transfers = []; data.maintenance = [];
    const client = await setup('CUSTOMER', width); await client.page.goto(base + '/customer/transfers');
    await selectChoice(client.page.getByLabel('Yêu cầu đặt kho', { exact: true }), reservation.reference);
    const customerContract = client.page.getByLabel('Hợp đồng liên quan', { exact: true }); assert((await customerContract.locator('..').locator('option').last().innerText()).includes(unit.unitCode)); await selectChoice(customerContract, contract.id);
    await client.page.getByLabel('Chi tiết', { exact: true }).fill('Tôi muốn chuyển kho để thuận tiện tiếp cận hàng.'); await client.page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
    await client.page.getByText('Đã gửi yêu cầu chuyển kho.', { exact: false }).waitFor(); assert.equal(new URL(client.page.url()).pathname, '/customer/transfers'); await client.context.close();
    const manager = await setup('MANAGER', width); await manager.page.goto(base + '/manager/assignments'); await manager.page.getByRole('row').filter({ hasText: 'SUP-TRANSFER' }).getByRole('button').click();
    const dialog = manager.page.getByRole('dialog'); await dialog.getByText(customer.fullName, { exact: true }).waitFor(); const picker = dialog.getByLabel('Nhân viên phụ trách', { exact: true }); await picker.locator('..').locator(`option[value="${staff.id}"]`).waitFor({ state: 'attached' });
    assert.equal(await picker.locator('..').locator('option').filter({ hasText: 'Demo Staff' }).count(), 0); await dialog.getByLabel('Tìm nhân viên', { exact: true }).fill('nguyen mai'); assert.equal(await picker.locator('..').locator('option').count(), 2); await selectChoice(picker, staff.id);
    await dialog.getByRole('button', { name: 'Phân công', exact: true }).click(); await manager.page.getByText('Đã cập nhật nhân viên phụ trách.', { exact: true }).waitFor(); await manager.context.close();
    const operator = await setup('STAFF', width); await operator.page.goto(base + '/staff/transfers'); const inbox = operator.page.getByRole('region', { name: 'Yêu cầu chuyển kho từ khách hàng' }); await inbox.getByRole('button', { name: 'Tiếp nhận chuyển kho', exact: true }).click();
    const form = operator.page.getByRole('dialog'), choice = form.getByLabel('Hợp đồng đang thuê', { exact: true }); await choice.locator('..').locator(`option[value="${contract.id}"]`).waitFor({ state: 'attached' }); assert((await choice.locator('..').locator('option:checked').innerText()).includes(unit.unitCode)); assert((await choice.locator('..').locator('option:checked').innerText()).includes(customer.fullName));
    await form.getByRole('button', { name: 'Tạo yêu cầu', exact: true }).click(); await operator.page.waitForURL(url => url.pathname === '/staff/transfers/transfer-created');
    await selectChoice(operator.page.getByLabel('Kho đích', { exact: true }), dest.id); await operator.page.getByRole('button', { name: 'Duyệt chuyển kho', exact: true }).click(); await operator.page.getByLabel('Tôi đã đối chiếu và hoàn tất chuyển kho thực tế', { exact: true }).check(); await operator.page.getByRole('button', { name: 'Hoàn tất chuyển kho', exact: true }).click();
    await operator.page.getByText('Đã hoàn tất chuyển kho và cập nhật yêu cầu của khách.', { exact: true }).waitFor(); assert.equal(data['support-requests'][0].status, 'RESOLVED'); assert.equal(data.maintenance.length, 1); await operator.page.getByRole('link', { name: 'Xem bảo trì kho nguồn · MNT-SOURCE', exact: true }).waitFor();
    const transferFacts = operator.page.locator('.manager-section').filter({ has: operator.page.getByRole('heading', { name: 'Điều chuyển', exact: true }) }); assert((await transferFacts.innerText()).includes('A102')); assert((await transferFacts.innerText()).includes('CON-TEST'));
    // Repair an existing completed record; the UI must not offer physical completion a second time.
    data['support-requests'][0].status = 'IN_PROGRESS'; data.transfers[0].supportRequest.status = 'IN_PROGRESS'; await operator.page.reload(); await operator.page.getByRole('button', { name: 'Đồng bộ kết quả cho khách', exact: true }).click(); await operator.page.getByText('Đã hoàn tất chuyển kho và cập nhật yêu cầu của khách.', { exact: true }).waitFor();
    data.transfers[0].sourceMaintenance = null; data.transfers[0].sourceMaintenanceMissing = true; await operator.page.reload(); await operator.page.getByRole('button', { name: 'Đồng bộ bảo trì kho nguồn', exact: true }).click(); await operator.page.getByRole('link', { name: 'Xem bảo trì kho nguồn · MNT-SOURCE', exact: true }).waitFor(); assert.equal(data.maintenance.length, 1);
    await operator.page.getByRole('link', { name: 'Xem yêu cầu của khách', exact: true }).click(); await operator.page.getByRole('link', { name: 'Mở lệnh chuyển kho', exact: true }).waitFor(); assert.equal(await operator.page.getByRole('button', { name: 'Tạo lệnh chuyển từ yêu cầu này', exact: true }).count(), 0); await operator.context.close();
    const result = await setup('CUSTOMER', width); await result.page.goto(base + '/customer/transfers'); await result.page.getByText('Đã hoàn tất chuyển kho từ A101 sang A102.', { exact: false }).waitFor(); await result.page.getByText('Đã chuyển kho', { exact: true }).waitFor(); assert(await result.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await result.context.close();
    checks.push(`${width}px: customer request → searchable assignment without fixture accounts → Staff transfer inbox → linked creation → approve → complete with customer status → legacy sync → no duplicate creation; source/destination/contract remain visible`);
  }
  data['support-requests'] = []; data.transfers = []; data.maintenance = [];
  const mobileCustomer = await setup('CUSTOMER', 390); await mobileCustomer.page.goto('http://127.0.0.1:8081/customer/rentals/' + reservation.id);
  await mobileCustomer.page.getByRole('button', { name: 'Yêu cầu chuyển kho A101', exact: true }).click();
  await mobileCustomer.page.getByLabel('Mô tả yêu cầu', { exact: true }).fill('Tôi muốn chuyển kho cho tiện lấy hàng.');
  await mobileCustomer.page.getByRole('button', { name: '□ Tôi xác nhận thông tin và thao tác này', exact: true }).click();
  await mobileCustomer.page.getByRole('button', { name: 'Lưu', exact: true }).click(); await mobileCustomer.page.getByText('Đã lưu thành công.', { exact: true }).waitFor(); await mobileCustomer.context.close();
  const mobileStaff = await setup('STAFF', 390); await mobileStaff.page.goto('http://127.0.0.1:8081/staff/transfers');
  await mobileStaff.page.getByRole('button', { name: 'Tiếp nhận chuyển kho', exact: true }).click();
  await mobileStaff.page.getByRole('button', { name: '□ Tôi xác nhận thực hiện thao tác này', exact: true }).click();
  await mobileStaff.page.getByRole('button', { name: 'Lưu', exact: true }).click(); await mobileStaff.page.getByRole('button', { name: 'TRF-CREATED ›', exact: true }).click();
  await mobileStaff.page.getByRole('button', { name: 'Duyệt chuyển kho', exact: true }).click();
  await mobileStaff.page.getByRole('radio', { name: /^A102 ·/ }).click(); await mobileStaff.page.getByRole('button', { name: '□ Tôi xác nhận thực hiện thao tác này', exact: true }).click();
  await mobileStaff.page.getByRole('button', { name: 'Lưu', exact: true }).click(); await mobileStaff.page.getByRole('button', { name: 'Hoàn tất chuyển kho', exact: true }).click();
  await mobileStaff.page.getByRole('button', { name: '□ Tôi xác nhận thông tin và thao tác này', exact: true }).click();
  await mobileStaff.page.getByRole('button', { name: 'Lưu', exact: true }).click(); await mobileStaff.page.getByRole('button', { name: 'Xem bảo trì kho nguồn ›', exact: true }).waitFor();
  assert.equal(data['support-requests'][0].status, 'RESOLVED'); assert.equal(data.maintenance.length, 1); await mobileStaff.context.close();
  const mobileResult = await setup('CUSTOMER', 390); await mobileResult.page.goto('http://127.0.0.1:8081/customer/transfers'); await mobileResult.page.getByText(/Đã chuyển kho · A101 → A102/).waitFor(); await mobileResult.context.close();
  checks.push('390px Expo web: scoped Customer contract request → Staff transfer inbox → approve destination → complete → linked maintenance and Customer result');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); console.log(JSON.stringify({ checks, mockedWrites: writes.length, browserErrors: errors.length, realDatabaseWrites: 0 }, null, 2));
} finally { await browser.close(); }
