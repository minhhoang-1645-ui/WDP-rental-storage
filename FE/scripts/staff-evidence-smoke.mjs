import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/STcAAAAASUVORK5CYII=';
const photo = 'data:image/png;base64,' + png;
const recordedAt = '2026-11-27T06:00:00Z';
const user = { id: 'staff', fullName: 'Staff A', email: 'staff@example.test', role: 'FACILITY_STAFF' };
const facility = { id: 'A', name: 'NestBox A' };
const assignee = { id: 'other', fullName: 'Other Staff' };
const evidence = { id: 'snapshot', staffUserId: user.id, staffName: user.fullName, recordedAt, photos: [photo], note: 'Chứng cứ: https://example.test/record.jpg' };
const incident = { id: 'incident', maintenanceCode: 'MNT-PHOTO', status: 'OPEN', source: 'MANUAL', reportedBy: user, facility, assignedStaff: assignee, createdAt: recordedAt, photos: [{ id: 'img' }] };
const repair = { ...incident, id: 'repair', maintenanceCode: 'MNT-REPAIR', status: 'IN_PROGRESS', reportedBy: assignee, workCompletedAt: recordedAt, evidenceSubmissions: [evidence] };
const inspection = { id: 'inspection', result: 'PENDING', unit: { id: 'unit', unitCode: 'LV-001' } };
const returned = { id: 'returned', returnCode: 'RET-PHOTO', status: 'INSPECTION_IN_PROGRESS', facility, assignedStaff: user, inspections: [inspection] };
const support = { id: 'support', supportCode: 'SUP-PHOTO', status: 'RESOLVED', facility, assignedStaff: user, resolvedBy: user, resolvedAt: recordedAt, resolutionType: 'ON_SITE_RESOLVED', resolutionPhotos: [photo] };
const records = { maintenance: [incident, repair], returns: [returned], 'support-requests': [support] };
const base = process.env.WDP_FE_URL ?? 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'This browser smoke test requires a local Web preview.');

const browser = await launchTestBrowser();
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  let manager = false;
  const photoRequests = [];
  await page.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'isolated-staff-evidence'));
  await page.route('**/api/**', route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const path = new URL(request.url()).pathname.slice(4).replace('/staff/management/', '/staff/');
    const send = json => route.fulfill({ json });
    if (path === '/auth/me') return send(manager ? { ...user, id: 'manager', role: 'FACILITY_MANAGER' } : user);
    if (['/manager/staff/facilities', '/staff/maintenance/facilities'].includes(path)) return send([facility]);
    if (path.endsWith('/photos/img')) {
      photoRequests.push(path);
      return route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') });
    }
    if (path === '/staff/returns/returned/inspections/inspection' && request.method() === 'PATCH') {
      assert.deepEqual(request.postDataJSON().inspectionPhotos, [photo]);
      Object.assign(inspection, { result: 'PASS', inspectedAt: recordedAt, inspectedBy: user, inspectionPhotos: [photo], evidenceSubmissions: [evidence] });
      return send(returned);
    }
    const [, , resource, id] = path.split('/');
    const items = records[resource] ?? [];
    return send(items.find(row => row.id === id) ?? { items, page: 1, limit: 100, total: items.length });
  });

  await page.goto(base + '/staff/returns/returned');
  const editor = page.locator('.portal-inspection-form');
  await editor.getByLabel('Chụp ảnh bằng camera').setInputFiles({ name: 'camera.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await editor.getByRole('img', { name: 'camera.png' }).waitFor();
  await editor.getByRole('button', { name: /Lưu kết quả kho/ }).click();
  await page.getByRole('img', { name: 'Ảnh kiểm tra kho LV-001 1' }).waitFor();

  await page.goto(base + '/staff/history');
  for (const code of ['MNT-PHOTO', 'MNT-REPAIR', 'RET-PHOTO', 'SUP-PHOTO']) {
    await page.getByRole('row').filter({ hasText: code }).getByRole('link', { name: 'Xem hồ sơ' }).waitFor();
  }
  await page.getByRole('row').filter({ hasText: 'MNT-PHOTO' }).getByRole('link', { name: 'Xem hồ sơ' }).click();
  await page.getByRole('img', { name: /Ảnh sự cố 1/ }).waitFor();
  assert(photoRequests.includes('/staff/maintenance/incident/photos/img'));
  await page.goto(base + '/staff/maintenance/repair');
  await page.getByRole('img', { name: 'Ảnh kết quả sửa chữa 1' }).scrollIntoViewIfNeeded();
  await page.getByRole('link', { name: 'Mở liên kết ảnh 1' }).waitFor();

  manager = true;
  for (const [path, name] of [
    ['maintenance/incident', /Ảnh sự cố 1/], ['maintenance/repair', 'Ảnh kết quả sửa chữa 1'],
    ['returns/returned', 'Ảnh kiểm tra kho LV-001 1'], ['support-requests/support', 'Ảnh kết quả hỗ trợ 1'],
  ]) {
    await page.goto(base + '/manager/operations/' + path);
    await page.getByRole('img', { name }).scrollIntoViewIfNeeded();
  }
  assert(photoRequests.includes('/manager/maintenance/incident/photos/img'));
  console.log('PASS: Camera file input, Staff history, evidence links and Manager photo galleries with mocked APIs.');
} finally {
  await browser.close();
}
