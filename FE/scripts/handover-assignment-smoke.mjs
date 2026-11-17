import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { selectChoice } from './select-choice.mjs';
import { fixture, staff, customer, when } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const output = 'artifacts/handover-assignment';
await mkdir(output, { recursive: true });
const browser = await launchTestBrowser();
const errors = [], writes = [];
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
      appointment = { ...appointment, assignedStaff: staff, assignmentStatus: 'ASSIGNED', assignedAt: when };
      return route.fulfill({ json: appointment });
    }
    if (request.method() !== 'GET') throw new Error(`Unexpected write: ${path}`);
    if (path === 'auth/me') return route.fulfill({ json: { ...(role === 'CUSTOMER' ? customer : staff), role } });
    if (path.endsWith('/appointments/appointment-id')) return route.fulfill({ json: appointment });
    if (path.endsWith('/assigned-units') || path === 'manager/unit-staff-assignments') return route.fulfill({ json: { enabled: false, items: [] } });
    const kind = path.split('/').at(-1);
    const sources = { appointments: [appointment], staff: [staff], contracts: [] };
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
  await dialog.getByRole('heading', { name: 'Lịch bàn giao · APP-TEST' }).waitFor();
  await selectChoice(dialog.getByRole('combobox', { name: 'Nhân viên phụ trách', exact: true }), staff.id);
  await shot(page, 'manager-assign-appointment');
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'manager-assign-appointment-mobile');
  assert(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Manager assignment dialog overflows');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole('button', { name: 'Phân công', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(writes, [{ staffUserId: staff.id, expectedAssignedStaffUserId: null }]);
  await customerApp.page.reload();
  await customerApp.page.locator('.appointment-assignment.is-assigned').waitFor();
  assert.match(await customerApp.page.locator('.appointment-assignment').innerText(), new RegExp(staff.fullName));
  await shot(customerApp.page, 'customer-assigned');

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
