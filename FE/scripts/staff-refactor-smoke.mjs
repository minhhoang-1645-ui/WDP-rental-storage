import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const base = 'http://127.0.0.1:5180';
const facility = { id: 'facility-a', name: 'Cơ sở A' };
const staff = { id: 'staff-a', fullName: 'Nhân viên A', email: 'staff@example.test', role: 'FACILITY_STAFF', accountStatus: 'ACTIVE' };
const reservedUnit = { id: 'unit-a', unitCode: 'A01', status: 'RESERVED', storageType: { facility } };
const appointment = {
  id: 'handover-a', appointmentCode: 'APPT-A', status: 'CONFIRMED', facility, assignedStaff: staff,
  scheduledAt: '2099-01-01T02:00:00Z', createdAt: '2098-12-20T02:00:00Z',
};
const blockedAppointment = {
  ...appointment, id: 'handover-blocked', appointmentCode: 'APPT-BLOCKED', bookingReady: false,
  handoverReadiness: { allowed: false, reason: 'Hóa đơn ban đầu chưa được thanh toán.' },
};
const handoverFixture = (id, quantity) => ({
  ...appointment, id, appointmentCode: 'APPT-' + id, bookingReady: true,
  handoverReadiness: { allowed: true, leadDays: 3 },
  reservation: { reference: 'RSV-' + id, quantity, customer: { fullName: 'Khách kiểm thử' } },
  allocatedUnits: Array.from({ length: quantity }, (_, index) => ({
    unitId: 'unit-' + index, unitCode: 'A0' + (index + 1), contractCode: 'CTR-' + index,
  })),
  unitHandoverProgress: [],
});
const singleHandover = handoverFixture('single', 1);
const multiHandover = handoverFixture('multi', 2);
const maintenance = {
  id: 'maintenance-done', maintenanceCode: 'MNT-DONE', status: 'AWAITING_VERIFICATION', facility,
  assignedStaff: staff, workCompletedAt: '2098-12-24T02:00:00Z', createdAt: '2098-12-20T02:00:00Z',
};
const repair = {
  ...maintenance, id: 'repair-a', maintenanceCode: 'MNT-REPAIR', status: 'OPEN',
  unit: { unitCode: 'A01' }, category: 'LOCK_OR_ACCESS', description: 'Khóa kho bị kẹt.',
};
const activeTask = { ...appointment, assignedStaff: staff, facility, scheduledAt: undefined };
const returns = ['pass', 'damage'].map(kind => ({
  ...activeTask, id: 'return-' + kind, returnCode: 'RET-' + kind, status: 'REQUESTED',
  returnReadiness: { canReturn: true },
  inspections: [{ id: 'inspection-' + kind, result: 'PENDING', unit: { unitCode: 'A01' }, contract: { contractCode: 'CTR-A' } }],
}));
const transfer = {
  ...activeTask, id: 'transfer-a', transferCode: 'TRF-A', status: 'APPROVED',
  commercial: null, fromUnit: { unitCode: 'A01' }, toUnit: { unitCode: 'A02' }, handoverReport: null,
};
const support = {
  ...activeTask, id: 'support-a', supportCode: 'SUP-A', status: 'ASSIGNED', category: 'LOCK_OR_KEY_ISSUE',
  subject: 'Hỗ trợ khóa kho', description: 'Khách cần hướng dẫn.',
};
const asPage = items => ({ page: 1, limit: 100, total: items.length, items });
const browser = await launchTestBrowser();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  page.setDefaultTimeout(10000);
  const sent = [];
  let revoked = false;
  let reassigned = false;
  let scheduleDenied = false;
  await page.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'fixture-token'));
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (!path.startsWith('/api/')) return url.origin === base ? route.continue() : route.abort();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (request.method() === 'POST' && path === '/api/staff/maintenance') {
      const body = request.postDataJSON();
      sent.push({ body, key: request.headers()['idempotency-key'] });
      if (revoked || body.storageUnitId !== 'unit-a') return route.fulfill({ status: 403, json: { message: 'FacilityAccess denied' } });
      return route.fulfill({ status: 201, json: { maintenanceCode: 'MNT-FIXTURE' } });
    }
    if (request.method() === 'POST' && path === '/api/staff/maintenance/repair-a/start') {
      assert.equal(repair.status, 'OPEN');
      repair.status = 'IN_PROGRESS';
      return route.fulfill({ status: 201, json: repair });
    }
    if (request.method() === 'POST' && path === '/api/staff/maintenance/repair-a/complete-work') {
      assert.equal(repair.status, 'IN_PROGRESS');
      const body = request.postDataJSON();
      assert.equal(body.workNote, 'Đã thay khóa và thử lại.');
      repair.status = 'AWAITING_VERIFICATION';
      repair.workNote = body.workNote;
      return route.fulfill({ status: 201, json: repair });
    }
    const handover = [singleHandover, multiHandover].find(item => path.startsWith('/api/staff/appointments/' + item.id + '/'));
    if (request.method() === 'PATCH' && handover && path.endsWith('/handover')) {
      const unitId = path.split('/').at(-2);
      const unit = handover.allocatedUnits.find(item => item.unitId === unitId);
      const body = request.postDataJSON();
      assert.ok(unit && body.inspected && body.identityVerified && body.accessDelivered);
      handover.unitHandoverProgress.push({ unitId, unitCode: unit.unitCode, condition: body.condition, completedAt: new Date().toISOString() });
      return route.fulfill({ json: handover });
    }
    if (request.method() === 'POST' && handover && path.endsWith('/complete-handover')) {
      assert.equal(handover.unitHandoverProgress.length, handover === multiHandover ? 2 : 0);
      const { handoverReport } = request.postDataJSON();
      assert.equal(handoverReport.recipientName, 'Khách kiểm thử');
      assert.ok(handoverReport.documentsDelivered && handoverReport.accessDelivered && handoverReport.unitInspected);
      Object.assign(handover, { status: 'COMPLETED', handoverReport });
      return route.fulfill({ json: handover });
    }
    const returning = returns.find(item => path.startsWith('/api/staff/returns/' + item.id + '/'));
    if (returning && request.method() !== 'GET') {
      if (path.endsWith('/start-inspection')) returning.status = 'INSPECTION_IN_PROGRESS';
      else if (path.includes('/inspections/')) {
        const body = request.postDataJSON();
        assert.equal(body.result, returning.id === 'return-damage' ? 'ISSUE_FOUND' : 'PASS');
        Object.assign(returning.inspections[0], body, { inspectedAt: new Date().toISOString() });
      } else if (path.endsWith('/finalize')) {
        assert.deepEqual(request.postDataJSON(), { unitsEmpty: true, accessRevoked: true });
        Object.assign(returning, { status: 'PENDING_SETTLEMENT', settlementStatus: 'PENDING_REVIEW', physicallyReturnedAt: new Date().toISOString() });
      } else return route.abort();
      return route.fulfill({ json: returning });
    }
    if (request.method() === 'POST' && path === '/api/staff/transfers/transfer-a/problem') {
      const { note } = request.postDataJSON();
      assert.equal(note, 'Kho đích cần kiểm tra khóa.');
      transfer.handoverReport = { problems: [{ note, reportedAt: new Date().toISOString(), staffName: staff.fullName }] };
      return route.fulfill({ json: transfer });
    }
    if (request.method() === 'POST' && path === '/api/staff/transfers/transfer-a/complete') {
      const body = request.postDataJSON();
      assert.ok(body.destinationReady && body.goodsMoved && body.oldKeysReturned && body.newKeysDelivered);
      Object.assign(transfer, { status: 'COMPLETED', handoverReport: { ...transfer.handoverReport, ...body } });
      return route.fulfill({ json: transfer });
    }
    if (request.method() === 'POST' && path.startsWith('/api/staff/support-requests/support-a/')) {
      if (path.endsWith('/start')) support.status = 'IN_PROGRESS';
      else if (path.endsWith('/escalate')) {
        assert.deepEqual(request.postDataJSON(), { reason: 'Cần quản lý xác minh.' });
        Object.assign(support, { status: 'ESCALATED', escalationReason: 'Cần quản lý xác minh.' });
      } else if (path.endsWith('/resolve')) {
        assert.equal(request.postDataJSON().resolutionNote, 'Đã hướng dẫn khách mở khóa.');
        Object.assign(support, { status: 'RESOLVED', resolutionNote: 'Đã hướng dẫn khách mở khóa.' });
      } else return route.abort();
      return route.fulfill({ json: support });
    }
    if (request.method() !== 'GET') return route.abort();
    if (path === '/api/auth/me') return route.fulfill({ json: staff });
    if (path === '/api/staff/maintenance/units') return route.fulfill({ json: asPage(revoked ? [] : [reservedUnit]) });
    if (path === '/api/staff/management/maintenance') return route.fulfill({ json: asPage([maintenance, repair]) });
    if (path === '/api/staff/management/maintenance/repair-a') return route.fulfill({ json: repair });
    if (path === '/api/staff/management/appointments') return scheduleDenied
      ? route.fulfill({ status: 403, json: { message: 'FacilityAccess denied' } })
      : route.fulfill({ json: asPage(reassigned ? [] : [appointment, blockedAppointment]) });
    const appointmentDetail = [blockedAppointment, singleHandover, multiHandover].find(item =>
      path === '/api/staff/management/appointments/' + item.id);
    if (appointmentDetail) return route.fulfill({ json: appointmentDetail });
    const returnDetail = returns.find(item => path === '/api/staff/management/returns/' + item.id);
    if (returnDetail) return route.fulfill({ json: returnDetail });
    if (path === '/api/staff/management/transfers') return route.fulfill({ json: asPage([transfer]) });
    if (path === '/api/staff/management/transfers/transfer-a') return route.fulfill({ json: transfer });
    if (path === '/api/staff/management/support-requests') return route.fulfill({ json: asPage([support]) });
    if (path === '/api/staff/management/support-requests/support-a') return route.fulfill({ json: support });
    return route.fulfill({ json: asPage([]) });
  });

  await page.goto(base + '/staff/schedule?date=2099-01-01');
  await page.getByRole('heading', { name: 'Lịch công việc' }).waitFor();
  await page.getByText('APPT-A', { exact: true }).waitFor();
  const blocked = page.getByRole('row').filter({ hasText: 'APPT-BLOCKED' });
  await blocked.getByText('Chưa đủ điều kiện bàn giao').waitFor();
  await blocked.getByRole('link', { name: 'Xem hồ sơ' }).click();
  await page.getByText('Hóa đơn ban đầu chưa được thanh toán.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Xác nhận đã bàn giao giấy tờ và chìa khóa' }).count(), 0);

  for (const item of [singleHandover, multiHandover]) {
    await page.goto(base + '/staff/appointments/' + item.id);
    const finish = page.getByRole('button', { name: 'Xác nhận đã bàn giao giấy tờ và chìa khóa' });
    await finish.waitFor();
    if (item === multiHandover) {
      assert.equal(await finish.isDisabled(), true);
      for (const unit of item.allocatedUnits) {
        await page.getByLabel('Hiện trạng kho ' + unit.unitCode).fill('Kho sạch và khóa hoạt động.');
        await page.getByLabel('Xác nhận bàn giao kho ' + unit.unitCode).check();
        await page.getByRole('button', { name: 'Ghi nhận bàn giao ' + unit.unitCode }).click();
        await page.getByRole('group', { name: unit.unitCode }).getByText('Đã bàn giao', { exact: true }).waitFor();
      }
    } else {
      await page.getByLabel('Hiện trạng cửa, khóa, tường, sàn và thiết bị').fill('Kho sạch và khóa hoạt động.');
      await page.getByLabel('Đã kiểm tra đúng mã kho và hiện trạng từng kho').check();
    }
    await page.getByLabel('Số chìa khóa/thẻ đã giao').fill('1');
    await page.getByLabel('Đã đối chiếu người nhận kho').check();
    await page.getByLabel('Đã bàn giao chìa khóa/thẻ hoặc hướng dẫn truy cập').check();
    await page.getByLabel('Đã giao giấy tờ bàn giao cho khách').check();
    await finish.click();
    await page.getByRole('dialog', { name: 'Hoàn tất bàn giao?' }).getByRole('button', { name: 'Hoàn tất bàn giao' }).click();
    await page.getByText('Bàn giao hoàn tất.').waitFor();
  }
  await page.goto(base + '/staff/schedule?date=2099-01-01');
  await page.getByText('APPT-A', { exact: true }).waitFor();
  reassigned = true;
  await page.getByRole('button', { name: 'Làm mới' }).click();
  await page.getByText('APPT-A', { exact: true }).waitFor({ state: 'hidden' });
  reassigned = false;
  await page.getByRole('button', { name: 'Làm mới' }).click();
  await page.getByText('APPT-A', { exact: true }).waitFor();
  scheduleDenied = true;
  await page.getByRole('button', { name: 'Làm mới' }).click();
  await page.getByText('APPT-A', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByText(/Chưa tải được Lịch nhận kho/).waitFor();
  await page.getByRole('link', { name: 'Lịch sử công việc' }).click();
  await page.getByText('MNT-DONE', { exact: true }).waitFor();

  await page.getByRole('link', { name: 'Công việc của tôi' }).click();
  await page.getByRole('row').filter({ hasText: 'MNT-REPAIR' }).getByRole('link', { name: 'Bắt đầu xử lý' }).click();
  await page.getByRole('button', { name: 'Bắt đầu sửa chữa' }).click();
  await page.getByLabel('Nội dung kiểm tra hoặc sửa chữa').fill('Đã thay khóa và thử lại.');
  await page.getByRole('button', { name: 'Gửi kết quả nghiệm thu' }).click();
  await page.getByText('Chờ quản lý nghiệm thu', { exact: true }).first().waitFor();
  Object.assign(repair, { status: 'IN_PROGRESS', verificationNote: 'Kiểm tra lại chìa dự phòng.' });
  await page.getByRole('link', { name: 'Công việc của tôi' }).click();
  await page.getByRole('button', { name: 'Làm mới' }).click();
  await page.getByRole('row').filter({ hasText: 'MNT-REPAIR' }).getByRole('link', { name: 'Tiếp tục xử lý' }).waitFor();

  for (const item of returns) {
    await page.goto(base + '/staff/returns/' + item.id);
    await page.getByRole('button', { name: 'Bắt đầu kiểm tra' }).click();
    await page.getByLabel('Kết quả kiểm tra').selectOption(item.id === 'return-damage' ? 'ISSUE_FOUND' : 'PASS');
    if (item.id === 'return-damage') {
      await page.getByLabel('Loại vấn đề').selectOption('CUSTOMER_DAMAGE');
      await page.getByLabel('Mô tả vấn đề').fill('Cửa kho bị móp.');
    }
    await page.getByRole('button', { name: 'Lưu kết quả kho A01' }).click();
    await page.getByLabel('Đã kiểm tra thực tế và xác nhận tất cả kho trong hồ sơ đã trống').check();
    await page.getByLabel('Đã thu hồi chìa khóa, thẻ hoặc quyền truy cập kho').check();
    await page.getByRole('button', { name: 'Hoàn tất nhận kho trả' }).click();
    await page.getByRole('dialog', { name: 'Hoàn tất nhận kho trả?' }).getByRole('button', { name: 'Xác nhận nhận kho' }).click();
    await page.getByText('Đã nhận kho thực tế', { exact: true }).waitFor();
    await page.getByText('Chờ quản lý quyết toán', { exact: true }).waitFor();
  }

  await page.goto(base + '/staff/transfers/transfer-a');
  await page.getByText('Báo vướng mắc cho quản lý').click();
  await page.getByLabel('Vướng mắc', { exact: true }).fill('Kho đích cần kiểm tra khóa.');
  await page.getByRole('button', { name: 'Gửi vướng mắc' }).click();
  await page.getByText('Đã báo vướng mắc. Chờ quản lý xử lý.').waitFor();
  assert.equal(transfer.status, 'APPROVED');
  // The existing Staff completion API is still available after the issue is corrected onsite.
  await page.getByLabel('Người nhận kho mới').fill('Khách kiểm thử');
  await page.getByLabel('Số chìa khóa/thẻ kho cũ đã thu').fill('1');
  await page.getByLabel('Số chìa khóa/thẻ kho mới đã giao').fill('1');
  for (const name of [/Đã kiểm tra kho đích/, /Đã kiểm tra kho cũ/, /Đã thu lại chìa khóa/, /Đã giao chìa khóa/]) {
    await page.getByLabel(name).check();
  }
  await page.getByRole('button', { name: 'Hoàn tất chuyển kho' }).click();
  await page.getByRole('dialog', { name: 'Hoàn tất chuyển kho?' }).getByRole('button', { name: 'Hoàn tất chuyển kho' }).click();
  await page.getByText('Đã hoàn tất điều chuyển', { exact: true }).waitFor();

  await page.goto(base + '/staff/support-requests/support-a');
  await page.getByRole('button', { name: 'Bắt đầu hỗ trợ' }).click();
  await page.getByLabel('Mô tả kết quả xử lý').fill('Đã hướng dẫn khách mở khóa.');
  await page.getByRole('button', { name: 'Hoàn tất hỗ trợ' }).click();
  await page.getByText('Đã hướng dẫn khách mở khóa.', { exact: true }).waitFor();
  support.status = 'ASSIGNED';
  await page.reload();
  await page.getByRole('button', { name: 'Bắt đầu hỗ trợ' }).click();
  await page.locator('#staff-processing select').selectOption('escalate');
  await page.getByLabel('Lý do chuyển quản lý').fill('Cần quản lý xác minh.');
  await page.getByRole('button', { name: 'Chuyển quản lý xem xét' }).click();
  await page.getByText('Đã chuyển quản lý xem xét', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Bắt đầu hỗ trợ' }).count(), 0);

  await page.getByRole('link', { name: 'Báo cáo sự cố' }).click();
  const units = page.locator('select[name="unit"]');
  await units.selectOption('unit-a');
  assert.deepEqual(await units.locator('option').evaluateAll(options => options.map(option => option.value)), ['', 'unit-a']);
  await page.getByLabel('Mô tả sự cố').fill('Khóa kho bị kẹt.');
  const submit = page.getByRole('button', { name: 'Gửi báo cáo sự cố' });
  const dialog = page.getByRole('dialog', { name: 'Gửi báo cáo sự cố?' });
  await submit.click();
  await dialog.getByRole('button', { name: 'Hủy' }).click();
  assert.equal(sent.length, 0);
  await submit.click();
  await dialog.getByRole('button', { name: 'Gửi báo cáo', exact: true }).click();
  await page.getByText(/Đã gửi báo cáo MNT-FIXTURE/).waitFor();
  assert.equal(sent[0].body.storageUnitId, 'unit-a');
  assert.ok(sent[0].key);

  await units.selectOption('unit-a');
  await page.getByLabel('Mô tả sự cố').fill('Phát hiện vấn đề mới ở cửa.');
  await submit.click();
  revoked = true;
  await dialog.getByRole('button', { name: 'Gửi báo cáo', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Bạn không còn quyền báo sự cố cho kho này.' }).waitFor();
  assert.equal(await page.getByLabel('Mô tả sự cố').inputValue(), 'Phát hiện vấn đề mới ở cửa.');
  assert.equal(sent.length, 2);
  await page.reload();
  await page.getByText('Chưa có kho để báo sự cố').waitFor();
  console.log('PASS: Staff handover (blocked, single, multi), return, transfer, support, maintenance/rework, report, reassignment and revoked grant.');
} catch (error) {
  console.error(page.url(), errors, (await page.locator('body').innerText()).slice(0, 600));
  throw error;
} finally {
  await browser.close();
}
