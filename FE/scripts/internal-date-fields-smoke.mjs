import assert from 'node:assert/strict';
import { chooseDate, chooseTime, launchTestBrowser, openCalendar } from './browser-test.mjs';

const browser = await launchTestBrowser();
const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const actor = { id: 'bom', role: 'BUSINESS_OPERATIONS_MANAGER', fullName: 'NestBox', email: 'bom@example.test', accountStatus: 'ACTIVE' };
const original = {
  id: 'legacy', code: 'NB-LEGACY', name: 'NestBox cơ sở cũ', address: 'Địa chỉ cũ', officeHours: 'Theo lịch hẹn của từng ca',
  accessHours: '07:00–21:00 hằng ngày', operationalStatus: 'OPEN', bookingEnabled: false, updatedAt: '2026-10-15T00:00:00Z',
};
const futureDate = new Date(Date.now() + 2 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
async function chooseCompactTime(group, label, time) {
  const trigger = group.getByRole('button', { name: label, exact: true });
  await trigger.press('Enter');
  const clock = group.getByRole('dialog', { name: 'Chọn giờ · ' + label });
  await clock.waitFor();
  assert(await clock.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth;
  }));
  await chooseTime(clock, label, time);
  await clock.getByRole('button', { name: 'Xong' }).press('Escape');
  await clock.waitFor({ state: 'hidden' });
  assert(await trigger.evaluate(element => element === document.activeElement));
  assert.equal(await trigger.innerText(), time);
}
try {
  for (const [theme, viewport] of [['light', { width: 1366, height: 768 }], ['dark', { width: 390, height: 720 }]]) {
    const page = await browser.newPage({ viewport, timezoneId: 'America/Los_Angeles' });
    const writes = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { errors.push(dialog.type()); await dialog.dismiss(); });
    let facilities = [original, { ...original, id: 'closed', code: 'NB-CLOSED', name: 'Kho đã đóng', operationalStatus: 'CLOSED' }];
    await page.addInitScript(theme => {
      localStorage.setItem('wdp-auth-token-v1', 'fixture-token');
      localStorage.setItem('nestbox-workspace-theme', theme);
    }, theme);
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace(/^\/api/, '');
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      if (request.method() === 'GET') {
        if (path === '/auth/me') return route.fulfill({ json: actor });
        if (path === '/operations/facilities') return route.fulfill({ json: facilities });
        if (path === '/operations/pricing-rules') return route.fulfill({ json: { items: [], types: [], groups: { locker: 'Tủ lưu trữ', small: 'Kho nhỏ', medium: 'Kho vừa', large: 'Kho lớn' } } });
        if (path === '/operations/reports/financial') return route.fulfill({ json: { times: [] } });
        return route.fulfill({ json: { items: [], total: 0 } });
      }
      const body = request.postDataJSON();
      writes.push({ path, body });
      if (path === '/operations/facilities') facilities = [...facilities, { id: 'created', ...body, updatedAt: original.updatedAt }];
      if (path === '/operations/facilities/legacy') facilities = [{ ...original, ...body }, ...facilities.slice(1)];
      return route.fulfill({ json: body });
    });
    await page.goto(base + '/operations/facilities');
    const table = page.getByRole('table', { name: 'Danh sách cơ sở' });
    const search = page.getByRole('searchbox', { name: 'Tìm cơ sở' });
    const filter = page.getByLabel('Trạng thái hoạt động', { exact: true });
    const toolbar = page.locator('.bom-facility-toolbar');
    assert(await toolbar.evaluate(element => {
      const [search, status] = element.querySelectorAll('input, select');
      const icon = element.querySelector('svg').getBoundingClientRect();
      const field = search.getBoundingClientRect();
      return Math.abs(field.top - status.getBoundingClientRect().top) < 4 && icon.left > field.left && icon.right < field.right;
    }));
    await search.fill('NB-LEGACY');
    await table.getByRole('link', { name: original.name }).waitFor();
    assert.equal(await table.getByText('Kho đã đóng').count(), 0);
    await search.fill('');
    await filter.selectOption('CLOSED');
    await table.getByText('Kho đã đóng').waitFor();
    assert.equal(await table.getByText(original.name).count(), 0);
    await filter.selectOption('');
    const rowMenuTrigger = table.getByRole('button', { name: 'Thao tác ' + original.name });
    await rowMenuTrigger.press('Enter');
    const rowMenu = page.locator('.bom-facility-menu:popover-open');
    await rowMenu.waitFor();
    assert(await rowMenu.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
    }));
    assert.equal(await rowMenu.locator('svg').count(), 3);
    assert.equal(await rowMenu.getByRole('link', { name: 'Hiệu quả cơ sở' }).getAttribute('href'), '/operations/reports?facilityId=legacy');
    await page.keyboard.press('Tab');
    assert(await rowMenu.getByRole('link', { name: 'Xem chi tiết' }).evaluate(element => document.activeElement === element && getComputedStyle(element).outlineStyle === 'solid'));
    await page.keyboard.press('Escape');
    await rowMenu.waitFor({ state: 'hidden' });
    await rowMenuTrigger.click();
    await search.click();
    await rowMenu.waitFor({ state: 'hidden' });
    await rowMenuTrigger.press('Enter');
    await rowMenu.getByRole('button', { name: 'Chỉnh sửa' }).press('Enter');
    const editFromRow = page.getByRole('dialog', { name: 'Chỉnh sửa cơ sở' });
    await editFromRow.waitFor();
    await page.keyboard.press('Escape');
    await editFromRow.waitFor({ state: 'hidden' });
    assert(await rowMenuTrigger.evaluate(element => document.activeElement === element));
    const add = page.getByRole('button', { name: 'Thêm cơ sở', exact: true });
    await add.click();
    const create = page.getByRole('dialog', { name: 'Thêm cơ sở', exact: true });
    assert.equal(await create.locator('.portal-dialog-heading').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    if (viewport.width > 900) assert(await create.evaluate(el => {
      const body = el.querySelector('.portal-dialog-body');
      return el.clientWidth >= 740 && el.clientWidth <= 800 && body.scrollHeight <= body.clientHeight + 1;
    }));
    await create.getByLabel('Mã cơ sở').fill('NB-TEST');
    await create.getByLabel('Tên cơ sở').fill('NestBox cơ sở mới');
    await create.getByLabel('Địa chỉ').fill('Địa chỉ mới');
    const submit = create.getByRole('button', { name: 'Thêm cơ sở', exact: true });
    await submit.click();
    assert.equal(writes.length, 0);
    const office = create.getByRole('group', { name: 'Giờ làm việc *', exact: true });
    const access = create.getByRole('group', { name: 'Giờ khách ra vào *', exact: true });
    assert.equal(await office.getByRole('combobox').count(), 0);
    await chooseCompactTime(office, 'Từ giờ', '22:17');
    await chooseCompactTime(office, 'Đến giờ', '06:53');
    await office.getByRole('button', { name: 'Thứ Hai', exact: true }).click();
    await office.getByRole('button', { name: 'Thứ Bảy', exact: true }).click();
    await office.getByText('22:17–06:53 (qua nửa đêm), Thứ Hai, Thứ Bảy').waitFor();
    await access.getByText('24/7', { exact: true }).click();
    assert.equal(await access.getByRole('button', { name: 'Từ giờ' }).count(), 0);
    await submit.click();
    await create.waitFor({ state: 'hidden' });
    assert.equal(writes[0].body.officeHours, '22:17–06:53 (qua nửa đêm), Thứ Hai, Thứ Bảy');
    assert.equal(writes[0].body.accessHours, '24/7');

    await page.goto(base + '/operations/facilities/legacy');
    const editButton = page.getByRole('button', { name: 'Chỉnh sửa', exact: true });
    await page.getByRole('heading', { name: 'Thông tin cơ sở' }).waitFor();
    assert.equal(await page.locator('.bom-facility-info dt').allTextContents().then(labels => labels.join('|')), 'Địa chỉ|Giờ làm việc|Giờ khách ra vào');
    assert.equal(await page.getByRole('switch', { name: 'Nhận đặt kho mới' }).getAttribute('aria-checked'), 'false');
    await editButton.click();
    const edit = page.getByRole('dialog', { name: 'Chỉnh sửa cơ sở' });
    await edit.getByText(original.officeHours, { exact: true }).waitFor();
    const oldAccess = edit.getByRole('group', { name: 'Giờ khách ra vào *', exact: true });
    assert.equal(await oldAccess.getByRole('button', { name: 'Từ giờ' }).innerText(), '07:00');
    assert(await oldAccess.getByRole('radio', { name: 'Hằng ngày' }).isChecked());
    assert.equal(await oldAccess.getByRole('button', { name: 'Thứ Hai' }).count(), 0);
    await edit.getByLabel('Tên cơ sở').fill('NestBox cơ sở cập nhật');
    await edit.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await edit.waitFor({ state: 'hidden' });
    assert.equal(Object.hasOwn(writes[1].body, 'officeHours'), false);
    assert.equal(Object.hasOwn(writes[1].body, 'accessHours'), false);
    await editButton.click();
    await edit.getByRole('button', { name: 'Thiết lập lại giờ làm việc' }).click();
    const resetOffice = edit.getByRole('group', { name: 'Giờ làm việc *', exact: true });
    await resetOffice.getByText('Hằng ngày', { exact: true }).click();
    await chooseCompactTime(resetOffice, 'Từ giờ', '08:19');
    await chooseCompactTime(resetOffice, 'Đến giờ', '18:05');
    await edit.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await edit.waitFor({ state: 'hidden' });
    assert.equal(writes[2].body.officeHours, '08:19–18:05, Hằng ngày');

    await page.goto(base + '/operations/pricing');
    const prices = page.getByRole('table', { name: 'Khung giá theo nhóm kho' });
    await prices.waitFor();
    assert.equal(await prices.locator('tbody tr').count(), 4);
    await prices.getByRole('row', { name: /Kho nhỏ/ }).getByRole('button', { name: 'Thiết lập' }).click();
    const pricing = page.getByRole('dialog', { name: 'Thiết lập khung giá' });
    await pricing.locator('[name=min]').fill('100000');
    await pricing.locator('[name=max]').fill('200000');
    const publish = pricing.getByRole('button', { name: 'Xem trước thay đổi' });
    await publish.click();
    await pricing.getByText('Hãy chọn ngày.', { exact: true }).waitFor();
    assert.equal(writes.length, 3);
    await chooseDate(pricing, 'Hiệu lực (UTC+7) · Ngày', futureDate);
    await chooseTime(pricing, 'Hiệu lực (UTC+7) · Giờ', '00:03');
    await publish.click();
    const published = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/operations/pricing-rules'));
    await page.getByRole('dialog', { name: 'Công bố khung giá' }).getByRole('button', { name: 'Công bố', exact: true }).click();
    await published;
    await page.getByRole('dialog', { name: 'Công bố khung giá' }).waitFor({ state: 'hidden' });
    await pricing.waitFor({ state: 'hidden' });
    assert.equal(writes[3].body.sizeId, 'small');
    assert.equal(writes[3].body.facilityId, 'legacy');
    assert.equal(writes[3].body.effectiveFrom, new Date(futureDate + 'T00:03:00+07:00').toISOString());

    await page.goto(base + '/operations/facilities/legacy');
    await page.getByRole('button', { name: 'Bắt đầu ngừng kinh doanh', exact: true }).click();
    const closure = page.getByRole('dialog', { name: 'Bắt đầu ngừng kinh doanh', exact: true });
    await closure.getByText('Di dời bắt buộc', { exact: true }).click();
    const relocation = closure.getByRole('radio', { name: /Di dời bắt buộc/ });
    assert(await relocation.isChecked());
    assert(await relocation.evaluate(input => {
      const left = input.getBoundingClientRect().left - input.parentElement.getBoundingClientRect().left;
      return left < 20;
    }));
    await chooseDate(closure, 'Ngày dự kiến ngừng phục vụ', futureDate);
    await closure.getByRole('button', { name: 'Xóa Ngày dự kiến ngừng phục vụ' }).click();
    assert.equal(await closure.getByRole('button', { name: 'Ngày dự kiến ngừng phục vụ', exact: true }).innerText(), 'dd/MM/yyyy');
    await chooseDate(closure, 'Ngày dự kiến ngừng phục vụ', futureDate);
    await closure.getByLabel('Lý do ngừng kinh doanh').fill('Kế hoạch kiểm thử');
    const closeFacility = closure.getByRole('button', { name: 'Xác nhận ngừng kinh doanh' });
    assert(await closeFacility.evaluate(element => element.classList.contains('portal-danger')));
    await closeFacility.click();
    await closure.waitFor({ state: 'hidden' });
    assert.equal(writes[4].body.closureExpectedAt, futureDate);
    assert.equal(writes[4].body.closureMode, 'REQUIRED_RELOCATION');

    for (const [path, endpoint] of [['/operations?from=2025-01-01&to=2025-01-03', '/operations/dashboard'],
      ['/operations/reports?to=2025-01-03', '/operations/reports/performance']]) {
      await page.goto(base + path);
      const result = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname.endsWith(endpoint) && url.searchParams.get('from') === '2025-01-02';
      });
      await chooseDate(page, 'Từ ngày', '2025-01-02');
      await result;
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  for (const [role, path] of [['FACILITY_MANAGER', '/manager/reports?period=custom'], ['FACILITY_STAFF', '/staff/schedule'],
    ['SYSTEM_ADMINISTRATOR', '/admin/login-history']]) {
    const page = await browser.newPage({ timezoneId: 'America/Los_Angeles' });
    const existingSchedule = new Date(Date.now() - 86_400_000).toISOString();
    const appointment = { id: 'visit', appointmentCode: 'APP-TEST', status: 'CONFIRMED', scheduledAt: existingSchedule };
    const claim = {
      id: 'claim', claimCode: 'CLAIM-TEST', status: 'APPROVED', description: 'Hộp bị móp', updatedAt: existingSchedule, createdAt: existingSchedule,
      discoveredOn: existingSchedule.slice(0, 10), customer: { fullName: 'Khách kiểm thử' }, history: [], affectedItems: [], evidenceLinks: [],
      compensation: { status: 'AWAITING_HANDOVER', approvedCompensationAmount: 100000, approvedAt: existingSchedule, method: 'CASH' },
    };
    await page.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'fixture-token'));
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      if (url.pathname.endsWith('/manager/appointments/visit/schedule') && request.method() === 'PATCH') {
        return route.fulfill({ json: { ...appointment, scheduledAt: request.postDataJSON().scheduledAt } });
      }
      if (url.pathname.endsWith('/manager/damage-claims/claim/compensation/handover') && request.method() === 'PATCH') {
        return route.fulfill({ json: claim });
      }
      assert.equal(request.method(), 'GET');
      if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { ...actor, role } });
      if (url.pathname.endsWith('/manager/staff/facilities')) return route.fulfill({ json: [{ id: 'site', code: 'NB', name: 'NestBox' }] });
      if (url.pathname.endsWith('/manager/appointments/visit')) return route.fulfill({ json: appointment });
      if (url.pathname.endsWith('/manager/damage-claims')) return route.fulfill({ json: { items: [claim], total: 1 } });
      if (url.pathname.endsWith('/manager/reports') || url.pathname.endsWith('/manager/dashboard/analytics')) {
        return route.fulfill({ status: 503, json: { message: 'Báo cáo kiểm thử chưa có dữ liệu.' } });
      }
      return route.fulfill({ json: { items: [], total: 0 } });
    });
    await page.goto(base + path);
    await chooseDate(page, 'Từ ngày', '2025-01-02');
    const calendar = await openCalendar(page, 'Đến ngày', '2025-01-03');
    assert(await calendar.getByRole('button', { name: '01/01/2025' }).isDisabled());
    const endpoint = role === 'FACILITY_MANAGER' ? '/manager/reports' : '/admin/audit-events';
    const response = role === 'FACILITY_STAFF' ? null : page.waitForResponse(result => {
      const url = new URL(result.url());
      return url.pathname.endsWith(endpoint) && url.searchParams.get('from') === '2025-01-02'
        && url.searchParams.get('to') === '2025-01-03';
    });
    await calendar.getByRole('button', { name: '03/01/2025' }).click();
    if (role === 'FACILITY_MANAGER') await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('from') === '2025-01-02'
      && url.searchParams.get(role === 'FACILITY_STAFF' ? 'through' : 'to') === '2025-01-03');
    await response;
    if (role === 'FACILITY_STAFF') {
      await chooseDate(page, 'Ngày hẹn', '2025-01-03');
      await page.waitForURL(url => url.searchParams.get('date') === '2025-01-03');
      await page.getByRole('button', { name: 'Xóa Ngày hẹn' }).click();
      await page.waitForURL(url => !url.searchParams.has('date'));
    } else if (role === 'FACILITY_MANAGER') {
      await page.goto(base + '/manager/operations/appointments/visit');
      const scheduleForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Lưu thay đổi lịch' }) });
      await scheduleForm.getByLabel('Lý do', { exact: true }).fill('Thống nhất giờ mới với khách');
      await chooseDate(scheduleForm, 'Lịch mới (giờ Việt Nam) · Ngày', futureDate);
      await chooseTime(scheduleForm, 'Lịch mới (giờ Việt Nam) · Giờ', '01:43');
      const request = page.waitForRequest(result => result.method() === 'PATCH'
        && new URL(result.url()).pathname.endsWith('/manager/appointments/visit/schedule'));
      await scheduleForm.getByRole('button', { name: 'Lưu thay đổi lịch' }).click();
      assert.deepEqual((await request).postDataJSON(), {
        action: 'RESCHEDULE', expectedScheduledAt: existingSchedule, note: 'Thống nhất giờ mới với khách',
        scheduledAt: futureDate + 'T01:43:00+07:00',
      });

      await page.goto(base + '/manager/damage-claims?claim=claim');
      await page.getByRole('button', { name: 'Ghi nhận đã giao tiền', exact: true }).click();
      const cashDialog = page.getByRole('dialog', { name: 'Ghi nhận đã giao tiền' });
      const paymentTime = new Date(Date.now() + 7 * 3_600_000 - 7200000).toISOString().slice(0, 16);
      await chooseDate(cashDialog, 'Ngày giờ bàn giao (giờ Việt Nam) · Ngày', paymentTime.slice(0, 10));
      await chooseTime(cashDialog, 'Ngày giờ bàn giao (giờ Việt Nam) · Giờ', paymentTime.slice(11));
      await cashDialog.getByRole('combobox', { name: 'Giây', exact: true }).selectOption('37');
      await cashDialog.getByRole('checkbox', { name: /Xác nhận đã bàn giao/ }).check();
      const handover = page.waitForRequest(result => result.method() === 'PATCH'
        && new URL(result.url()).pathname.endsWith('/manager/damage-claims/claim/compensation/handover'));
      await cashDialog.getByRole('button', { name: 'Xác nhận đã giao tiền', exact: true }).click();
      assert.equal((await handover).postDataJSON().handedOverAt, new Date(paymentTime + ':37+07:00').toISOString());
    }
    await page.close();
  }
  console.log('PASS: facility hours, legacy strings, pricing UTC+7, and date filters for Manager, Staff, and Admin.');
} finally {
  await browser.close();
}
