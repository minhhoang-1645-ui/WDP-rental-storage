import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, staff, customer, when } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const output = 'artifacts/handover-assignment';
await mkdir(output, { recursive: true });
const browser = await launchTestBrowser();
const errors = [], writes = [];
const otherStaff = { ...staff, id: 'second-staff', fullName: 'Nguyễn Nhân Viên', email: 'second-shift@example.test' };
let rejectFirstAssignment = true;
const legacyId = 'cmwk402iz00015op4i0bvrb7j';
const legacyNote = `BIÊN BẢN BÀN GIAO KHO\nNgười nhận: Khách kiểm thử\nKhách đứng tên: Khách kiểm thử (${legacyId})\nHình thức nhận: Khách đứng tên hợp đồng\nĐã đối chiếu người nhận và kiểm tra các kho trong lịch.\nHiện trạng: Kho sạch, cửa và khóa bình thường\nSố chìa khóa/thẻ: 1\nĐã bàn giao phương tiện/hướng dẫn truy cập.\nĐã giao giấy tờ bàn giao cho khách.`;
let appointment = { ...fixture.appointments[0], status: 'CONFIRMED', assignedStaff: null, assignmentStatus: 'UNASSIGNED', scheduledAt: '2026-11-20T03:00:00Z' };

async function setup(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'handover-fixture'));
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace(/^\/api\//, '');
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (request.method() === 'PATCH' && path === 'manager/appointments/appointment-id/assign') {
      writes.push(request.postDataJSON());
      if (rejectFirstAssignment) {
        rejectFirstAssignment = false;
        return route.fulfill({ status: 409, json: { message: 'Phân công chưa được lưu, vui lòng thử lại.' } });
      }
      const assigned = request.postDataJSON().staffUserId === staff.id ? staff : otherStaff;
      appointment = { ...appointment, assignedStaff: assigned, assignmentStatus: 'ASSIGNED', assignedAt: when };
      return route.fulfill({ json: appointment });
    }
    if (request.method() !== 'GET') throw new Error(`Unexpected write: ${path}`);
    if (path === 'auth/me') return route.fulfill({ json: { ...(role === 'CUSTOMER' ? customer : staff), role } });
    if (path.endsWith('/appointments/appointment-id')) return route.fulfill({ json: appointment });
    if (path.endsWith('/assigned-units') || path === 'manager/unit-staff-assignments') return route.fulfill({ json: { enabled: false, items: [] } });
    const kind = path.split('/').at(-1);
    const sources = { appointments: [appointment], staff: [staff, otherStaff], contracts: [] };
    const items = sources[kind] ?? [];
    return route.fulfill({ json: { items, total: items.length, page: 1, limit: 100 } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  return { page, context };
}
async function shot(page, name) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' });
}

try {
  const customerApp = await setup('CUSTOMER');
  await customerApp.page.goto(base + '/customer/appointments');
  await customerApp.page.locator('.appointment-assignment:not(.is-assigned)').waitFor();
  assert.match(await customerApp.page.locator('.appointment-assignment').innerText(), /chờ quản lý phân công/);
  await shot(customerApp.page, 'customer-pending');

  const managerApp = await setup('MANAGER'), page = managerApp.page;
  await page.goto(base + '/manager/assignments?kind=appointments&record=appointment-id');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'Phân công nhân viên', exact: true }).waitFor();
  const confirm = dialog.getByRole('button', { name: 'Xác nhận phân công', exact: true });
  assert(await confirm.isDisabled());
  await dialog.getByRole('searchbox', { name: 'Tìm nhân viên' }).fill('second-shift');
  await dialog.getByRole('radio', { name: /Nguyễn Nhân Viên/ }).waitFor();
  assert.equal(await dialog.getByRole('radio').count(), 1);
  await dialog.getByRole('button', { name: 'Hủy' }).focus();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(writes, []);

  await page.goto(base + '/manager/assignments?kind=appointments&record=appointment-id');
  const staffOption = dialog.locator(`input[type=radio][value="${staff.id}"]`);
  await staffOption.check();
  await shot(page, 'manager-assign-appointment');
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 640 });
    await shot(page, `manager-assign-appointment-${width}`);
    assert(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Manager assignment dialog overflows');
    await dialog.getByRole('searchbox', { name: 'Tìm nhân viên' }).focus();
    await confirm.focus();
    await page.keyboard.press('Tab');
    assert(await dialog.evaluate(element => element.contains(document.activeElement)), 'Keyboard escaped modal');
    const box = await confirm.boundingBox();
    assert(box && box.y + box.height <= 641, 'Footer must stay visible');
  }
  await confirm.click();
  await dialog.getByRole('alert').getByText('Phân công chưa được lưu, vui lòng thử lại.').waitFor();
  assert(await staffOption.isChecked());
  await confirm.click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(writes, [
    { staffUserId: staff.id, expectedAssignedStaffUserId: null },
    { staffUserId: staff.id, expectedAssignedStaffUserId: null },
  ]);
  await customerApp.page.reload();
  await customerApp.page.locator('.appointment-assignment.is-assigned').waitFor();
  assert.match(await customerApp.page.locator('.appointment-assignment').innerText(), new RegExp(staff.fullName));
  await shot(customerApp.page, 'customer-assigned');

  await page.evaluate(() => localStorage.setItem('nestbox-workspace-theme', 'dark'));
  await page.goto(base + '/manager/assignments?kind=appointments&record=appointment-id');
  await page.locator('[data-workspace-theme="dark"]').waitFor();
  await shot(page, 'manager-reassignment-mobile-dark');
  await dialog.getByText(staff.fullName, { exact: true }).first().waitFor();
  const confirmChange = dialog.getByRole('button', { name: 'Xác nhận đổi nhân viên' });
  assert(await confirmChange.isDisabled());
  await dialog.getByRole('radio', { name: /Nguyễn Nhân Viên/ }).check();
  await confirmChange.click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(writes.at(-1), { staffUserId: otherStaff.id, expectedAssignedStaffUserId: staff.id });
  assert.equal(writes.length, 3);
  appointment = { ...appointment, assignedStaff: staff };

  appointment = { ...appointment, status: 'COMPLETED', handoverNote: legacyNote, completedBy: staff, completedAt: when };
  const staffApp = await setup('STAFF');
  await staffApp.page.goto(base + '/staff/appointments/appointment-id');
  const report = staffApp.page.getByRole('region', { name: 'Biên bản bàn giao kho' });
  await report.waitFor();
  assert.match(await report.innerText(), /Kho sạch, cửa và khóa bình thường/);
  assert.match(await report.innerText(), /1 chiếc/);
  assert.equal(await staffApp.page.getByText(legacyId, { exact: false }).count(), 0);
  assert.equal(await report.locator('.is-verified').count(), 4);
  await shot(staffApp.page, 'staff-handover-report');
  await staffApp.page.setViewportSize({ width: 390, height: 844 });
  await shot(staffApp.page, 'staff-handover-report-mobile');

  appointment = { ...appointment, handoverNote: null, handoverReport: { recipientType: 'AUTHORIZED', recipientName: 'Người nhận được ủy quyền', customerName: customer.fullName, authorizationBasis: 'Văn bản ủy quyền đã đối chiếu', condition: 'Kho sạch, đã kiểm tra khóa', accessItemCount: 2, identityVerified: true, unitInspected: true, accessDelivered: true, documentsDelivered: true }, completedAt: when };
  await staffApp.page.reload(); await report.waitFor();
  assert.match(await report.innerText(), /Người nhận được ủy quyền/);
  assert.match(await report.innerText(), /2 chiếc/);
  assert.match(await report.innerText(), /Văn bản ủy quyền đã đối chiếu/);

  appointment = { ...appointment, status: 'CONFIRMED', assignedStaff: null, handoverReport: null };
  await staffApp.page.reload();
  await staffApp.page.getByText('Chỉ nhân viên được quản lý phân công mới được bàn giao lịch này.', { exact: false }).waitFor();
  assert.equal(await staffApp.page.getByRole('button', { name: 'Hoàn tất bàn giao', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: manager assignment, customer visibility, legacy/structured reports, responsive layout and Staff action gating');
} finally {
  await browser.close();
}
