import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chooseDate, chooseTime, launchTestBrowser } from './browser-test.mjs';

const browser = await launchTestBrowser();
const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const artifacts = 'artifacts/bom-policies';
const actor = { id: 'fixture-bom', role: 'BUSINESS_OPERATIONS_MANAGER', fullName: 'Điều hành NestBox', email: 'bom@example.test', phone: '', accountStatus: 'ACTIVE' };
const scalar = (key, title, description, value, min, max, unit = 'ngày') => ({ key, title, description, value, min, max, unit, history: [], updatedAt: null, effectiveVersion: 0 });
const group = (key, title, description, value) => ({ key, title, description, value, history: [], updatedAt: null, effectiveVersion: 0 });
const items = [
  scalar('reservationHoldMinutes', 'Thời hạn giữ đơn chưa thanh toán', 'Áp dụng cho đơn xác nhận mới. Giữ nguyên hạn của đơn đã tạo.', 1440, 15, 10080, 'phút'),
  scalar('handoverLeadDays', 'Nhận chìa khóa trước ngày thuê', 'Quy định thời gian nhận chìa khóa trước ngày bắt đầu thuê.', 3, 0, 7),
  scalar('returnNoticeDays', 'Báo trước khi trả kho', 'Thông báo để bố trí lịch trả kho.', 7, 0, 30),
  scalar('renewalReminderDays', 'Nhắc hợp đồng sắp hết hạn', 'Nhắc khách trên ứng dụng trước khi hết hạn.', 7, 1, 30),
  scalar('paymentReminderDays', 'Nhắc trước hạn thanh toán', 'Nhắc khách về hóa đơn còn dư nợ trước ngày đến hạn.', 3, 1, 30),
];
const pricing = [
  group('deposit', 'Đặt cọc khi thuê kho', 'Tính cọc theo loại kho và kỳ thuê khi lập báo giá mới.', { locker: { method: 'NONE', amount: 0 }, smallDaily: { method: 'RENT_PERCENTAGE', amount: 100 }, other: { method: 'MONTHLY_RENT_MULTIPLIER', amount: 1 } }),
  group('prepaid', 'Giảm giá thanh toán trước', 'Chỉ giảm trên tiền thuê trả trước đủ điều kiện.', { 3: { enabled: true, percent: 5 }, 6: { enabled: true, percent: 10 }, 12: { enabled: true, percent: 15 } }),
  group('cancellation', 'Hủy đơn đã thanh toán', 'Các mốc hoàn tiền thuê theo ngày khách gửi yêu cầu và hạn xử lý khoản hoàn.', { farDays: 7, nearDays: 3, farPercent: 100, middlePercent: 90, nearPercent: 70, startedPercent: 50, refundDays: 7 }),
  group('renewal', 'Gia hạn hợp đồng', 'Thiết lập khoảng thời gian gửi yêu cầu và đơn giá cho kỳ mới.', { opensDaysBefore: 30, closesDaysBefore: 1, priceMode: 'CURRENT_LIST_PRICE' }),
  group('earlyReturn', 'Quyết toán trả kho trước hạn', 'Quy định phí và hoàn tiền thuê khi trả trước hạn.', { feeMethod: 'NONE', feeAmount: 0, refundMode: 'ORIGINAL_DISCOUNT' }),
  group('paymentOverdue', 'Quá hạn thanh toán', 'Thời gian cho phép quá hạn, mốc chuyển quản lý và cách tính phí chậm thanh toán.', { graceDays: 5, managerDays: 15, feeMethod: 'NONE', feeAmount: 0 }),
  group('returnOverdue', 'Quá hạn trả kho', 'Thời gian cho phép quá hạn và hệ số phí tính đến ngày bàn giao thực tế.', { graceDays: 0, managerDays: 7, multiplier: 100 }),
];
const policy = items[0];
const tabs = ['Đặt kho và thanh toán', 'Hợp đồng và bàn giao', 'Quá hạn và nhắc nhở'];
const currentTime = new Date('2026-12-03T08:44:00Z');
const future = new Date(+currentTime + 86_400_000);
const timeInput = new Date(+future + 7 * 3_600_000).toISOString().slice(0, 16);
const expectedDate = new Date(timeInput + '+07:00').toISOString();
try {
  await mkdir(artifacts, { recursive: true });
  for (const [width, height, theme] of [[1280, 720, 'dark'], [1366, 768, 'light'], [1920, 1080, 'dark'], [390, 844, 'light']]) {
    const page = await browser.newPage({ viewport: { width, height }, timezoneId: 'America/Los_Angeles' });
    await page.clock.setFixedTime(currentTime);
    const mutations = [];
    const errors = [];
    let phase = 'loading';
    let saved;
    let shouldFail = true;
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { errors.push(dialog.type()); await dialog.dismiss(); });
    await page.addInitScript(theme => {
      localStorage.setItem('wdp-auth-token-v1', 'fixture-token');
      localStorage.setItem('nestbox-workspace-theme', theme);
    }, theme);
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      if (path.endsWith('/auth/me')) return route.fulfill({ json: actor });
      if (path === '/api/operations/business-policies') {
        if (phase === 'loading') {
          await new Promise(resolve => setTimeout(resolve, 500));
          return route.fulfill({ status: 503, json: { message: 'Tạm thời chưa tải được chính sách.' } });
        }
        if (phase === 'empty') return route.fulfill({ json: { items: [], pricing: [] } });
        return route.fulfill({ json: { items: [saved ?? policy, ...items.slice(1)], pricing } });
      }
      if (request.method() === 'PATCH' && path.endsWith('/business-policies/reservationHoldMinutes')) {
        const body = request.postDataJSON();
        mutations.push(body);
        await new Promise(resolve => setTimeout(resolve, 350));
        if (shouldFail) {
          shouldFail = false;
          return route.fulfill({ status: 409, json: { message: 'Vui lòng tải lại cấu hình.' } });
        }
        const updatedAt = new Date().toISOString();
        const version = { id: 'scheduled-1', version: 1, value: body.value, effectiveFrom: body.effectiveFrom, effectiveTo: null, status: 'SCHEDULED', author: actor.fullName, createdAt: updatedAt };
        saved = { ...policy, updatedAt, history: [version] };
        return route.fulfill({ json: version });
      }
      assert.equal(request.method(), 'GET', 'Unexpected mutation must stay within the fixture');
      return route.fulfill({ json: { items: [], total: 0 } });
    });
    await page.goto(base + '/operations/policies', { waitUntil: 'domcontentloaded' });
    await page.getByText('Đang tải chính sách…', { exact: true }).waitFor();
    await page.getByRole('alert').filter({ hasText: 'Tạm thời chưa tải được chính sách' }).waitFor();
    phase = 'empty';
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await page.getByText('Nhóm này chưa có chính sách.').waitFor();
    phase = 'data';
    await page.reload();
    await page.getByRole('heading', { name: 'Chính sách kinh doanh', exact: true }).waitFor();
    for (const tab of tabs) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      assert.equal(await page.locator('.policy-catalog-table tbody tr').count(), 4);
      for (const button of await page.locator('.policy-edit').all()) {
        await button.click();
        const editor = page.locator('.policy-editor:modal');
        await editor.getByText('Giá trị đang áp dụng', { exact: true }).waitFor();
        await editor.getByRole('tab', { name: 'Lịch sử phiên bản' }).click();
        await editor.getByText('Chưa có phiên bản được công bố.').waitFor();
        await page.keyboard.press('Escape');
        await editor.waitFor({ state: 'hidden' });
      }
    }
    await page.getByRole('tab', { name: tabs[0] }).click();
    const groupTab = page.getByRole('tab', { name: tabs[0] });
    assert.equal(await groupTab.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    await groupTab.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: tabs[1] }).evaluate(el => getComputedStyle(el).outlineWidth), '2px');
    await page.getByRole('tab', { name: tabs[1] }).press('ArrowLeft');
    await page.locator('#portal-main').evaluate(el => el.focus());
    assert.equal(await page.locator('#portal-main').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    await page.getByText('24 giờ', { exact: true }).waitFor();
    assert.equal(await page.getByText('Phí chuyển kho thông thường', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Hạn xử lý hoàn cọc', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (width > 400) await page.screenshot({ path: artifacts + '/bang-' + width + '-' + theme + '.png', animations: 'disabled' });

    await page.getByRole('row', { name: /Hủy đơn đã thanh toán/ }).getByText('Hủy đơn đã thanh toán', { exact: true }).click();
    const editor = page.locator('.policy-editor:modal');
    const publish = editor.getByRole('button', { name: 'Xem trước thay đổi' });
    assert.equal(await editor.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    assert.equal(await editor.locator('.portal-dialog-heading').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    assert.equal(await editor.evaluate(el => el.getBoundingClientRect().height <= innerHeight * .9 + 1), true);
    if (width > 400) await page.screenshot({ path: artifacts + '/huy-don-' + width + '-' + theme + '.png', animations: 'disabled' });
    await editor.locator('[name="farDays"]').fill('2');
    await chooseDate(editor, 'Ngày hiệu lực', timeInput.slice(0, 10));
    await chooseTime(editor, 'Giờ hiệu lực', timeInput.slice(11));
    await publish.click();
    await editor.getByText('Mốc hoàn tiền sớm phải lớn hơn mốc gần ngày thuê.').waitFor();
    await editor.locator('[name="farDays"]').fill('10');
    await editor.locator('[name="nearDays"]').fill('4');
    await editor.getByRole('rowheader', { name: 'Trước ngày thuê từ 4 đến dưới 10 ngày' }).waitFor();
    const footerY = await editor.locator('footer').evaluate(el => el.getBoundingClientRect().top);
    await editor.locator('.policy-editor-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    assert.equal(await editor.locator('footer').evaluate(el => el.getBoundingClientRect().top), footerY);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Chỉnh sửa Đặt cọc khi thuê kho' }).click();
    await editor.locator('[name="smallDaily-method"]').selectOption('NONE');
    assert.equal(await editor.locator('[name="smallDaily-amount"]').inputValue(), '0');
    assert.equal(await editor.locator('[name="smallDaily-amount"]').isDisabled(), true);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Chỉnh sửa Giảm giá thanh toán trước' }).click();
    await editor.locator('[name="3-enabled"]').uncheck();
    assert.equal(await editor.locator('input[type=number][name="3-percent"]').isDisabled(), true);
    assert.equal(await editor.locator('input[type=hidden][name="3-percent"]').inputValue(), '5');
    await editor.locator('[name="3-enabled"]').check();
    assert.equal(await editor.locator('input[type=number][name="3-percent"]').inputValue(), '5');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Chỉnh sửa ' + policy.title }).click();
    assert.equal(await editor.evaluate(el => el.getBoundingClientRect().width <= 540), true);
    const duration = editor.getByRole('textbox', { name: 'Thời gian giữ đơn', exact: true });
    const unit = editor.getByRole('combobox', { name: 'Đơn vị thời gian giữ đơn' });
    assert.equal(await duration.inputValue(), '24');
    await unit.selectOption('days');
    assert.equal(await duration.inputValue(), '1');
    await unit.selectOption('minutes');
    assert.equal(await duration.inputValue(), '1440');
    await duration.fill('17');
    await unit.selectOption('hours');
    assert.equal(await duration.inputValue(), '17/60');
    await unit.selectOption('minutes');
    assert.equal(await duration.inputValue(), '17');
    await duration.fill('60');
    assert(await publish.isDisabled());
    const dateButton = editor.getByRole('button', { name: 'Ngày hiệu lực', exact: true });
    await dateButton.press('Enter');
    const calendar = editor.getByRole('dialog', { name: 'Lịch · Ngày hiệu lực' });
    assert(await calendar.isVisible());
    assert(await calendar.evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth;
    }));
    const currentDay = calendar.locator('button[aria-current="date"]');
    if (await currentDay.count()) {
      const day = Number(await currentDay.innerText());
      if (day > 1) assert(await currentDay.locator('xpath=preceding-sibling::button[1]').isDisabled());
    }
    await page.keyboard.press('Escape');
    await calendar.waitFor({ state: 'hidden' });
    assert(await editor.isVisible());
    assert(await dateButton.evaluate(el => el === document.activeElement));
    await chooseDate(editor, 'Ngày hiệu lực', '2026-12-03');
    const hour = editor.getByRole('combobox', { name: 'Giờ hiệu lực · giờ' });
    const minute = editor.getByRole('combobox', { name: 'Giờ hiệu lực · phút' });
    assert(await hour.locator('option[value="14"]').isDisabled());
    await hour.selectOption('15');
    assert(await minute.locator('option[value="44"]').isDisabled());
    assert(await publish.isDisabled());
    await chooseDate(editor, 'Ngày hiệu lực', timeInput.slice(0, 10));
    assert(await publish.isDisabled());
    assert.equal(await editor.getByRole('combobox', { name: 'Giờ hiệu lực · giờ' }).locator('option[value="24"]').count(), 0);
    await chooseTime(editor, 'Giờ hiệu lực', timeInput.slice(11));
    assert.equal(await dateButton.innerText(), timeInput.slice(0, 10).split('-').reverse().join('/'));
    if (width === 1366) await page.screenshot({ path: artifacts + '/giu-don-1366-light.png', animations: 'disabled' });
    await publish.click();
    const confirmation = page.getByRole('dialog', { name: 'Xem trước và công bố chính sách' });
    assert.match(await confirmation.innerText(), /Hiện tại · 24 giờ/);
    assert.match(await confirmation.innerText(), /Phiên bản mới · 1 giờ/);
    assert((await confirmation.innerText()).includes(timeInput.slice(11) + ', ' + timeInput.slice(0, 10).split('-').reverse().join('/') + ' (UTC+7)'));
    assert.equal(await confirmation.evaluate(el => el.closest('.workspace-themed')?.dataset.workspaceTheme), theme);
    await page.keyboard.press('Escape');
    await confirmation.waitFor({ state: 'hidden' });
    assert.equal(mutations.length, 0);
    assert.equal(await publish.evaluate(el => el === document.activeElement), true);
    await publish.click();
    await confirmation.getByRole('button', { name: 'Công bố phiên bản', exact: true }).click();
    await editor.getByRole('button', { name: 'Đang công bố…' }).waitFor();
    await editor.getByRole('alert').filter({ hasText: 'Vui lòng tải lại cấu hình.' }).waitFor();
    assert.equal(await editor.getByText('Đã công bố phiên bản mới.', { exact: true }).count(), 0);
    await publish.click();
    await confirmation.getByRole('button', { name: 'Công bố phiên bản', exact: true }).click();
    await editor.getByText('Đã lên lịch', { exact: true }).waitFor();
    assert.match(await editor.locator('.policy-history').innerText(), /1 giờ/);
    assert.equal(await editor.getByText(actor.fullName, { exact: true }).count(), 1);
    assert.deepEqual(mutations, Array(2).fill({ value: 60, expectedUpdatedAt: null, effectiveFrom: expectedDate }));
    assert.deepEqual(errors, []);
    await editor.getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.getByText('24 giờ', { exact: true }).waitFor();
    await page.getByText(/Phiên bản .* sẽ áp dụng từ/).waitFor();
    await page.getByRole('button', { name: 'Chỉnh sửa ' + policy.title }).click();
    await editor.getByText(/Phiên bản 1 đã lên lịch/).waitFor();
    await editor.getByText('24 giờ', { exact: true }).waitFor();
    await chooseDate(editor, 'Ngày hiệu lực', timeInput.slice(0, 10));
    await hour.selectOption(timeInput.slice(11, 13));
    assert(await minute.locator('option[value="44"]').isDisabled());
    await page.close();
  }
  console.log('PASS: 12 policies, keyboard dialogs, API errors and publishing, UTC+7, history, and responsive light/dark layouts.');
} finally {
  await browser.close();
}

