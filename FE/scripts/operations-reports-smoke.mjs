import assert from 'node:assert/strict';
import { chooseDate, launchTestBrowser, openCalendar } from './browser-test.mjs';

const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const browser = await launchTestBrowser();
const now = new Date('2026-12-04T17:10:00Z');
const facility = {
  id: 'east', name: 'NestBox Long Bình', code: 'NB-01', operationalStatus: 'CLOSED', bookingEnabled: false, address: 'Long Bình',
  units: { total: 30, occupied: 3, available: 24, reserved: 2, maintenance: 1 }, activeContracts: 3, newReservations: 2,
  handovers: 1, returns: 0, rent: '5000000', services: '650000', fees: '350000', deposit: '2000000', billed: '8000000',
  debt: '1200000', received: '6000000', depositRefunded: '300000', rentRefunded: '0', bookingRefunded: '450000', transferRefunded: null,
};
const other = { ...facility, id: 'west', name: 'NestBox Tây', code: 'NB-02', operationalStatus: 'OPEN', bookingEnabled: true };
const financialFields = ['rent', 'services', 'fees', 'deposit', 'billed', 'received', 'depositRefunded', 'rentRefunded', 'bookingRefunded', 'transferRefunded'];

try {
  for (const [theme, viewport] of [['light', { width: 1366, height: 768 }], ['dark', { width: 390, height: 800 }]]) {
    const page = await browser.newPage({ viewport, timezoneId: 'America/Los_Angeles' });
    await page.clock.setFixedTime(now);
    await page.addInitScript(theme => {
      localStorage.setItem('wdp-auth-token-v1', 'fixture-report');
      localStorage.setItem('nestbox-workspace-theme', theme);
    }, theme);
    const requests = [];
    const errors = [];
    let variant = 'normal';
    let csvFails = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      assert.equal(request.method(), 'GET');
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/auth/me') return route.fulfill({ json: { id: 'bom', role: 'BUSINESS_OPERATIONS_MANAGER', fullName: 'NestBox', email: 'bom@example.test' } });
      if (path === '/operations/facilities') return route.fulfill({ json: [facility, other] });
      const filters = Object.fromEntries(url.searchParams);
      requests.push({ path, ...filters });
      const state = variant === 'normal' && filters.from === filters.to && filters.from ? 'empty'
        : variant === 'normal' && filters.from === '2026-11-01' && filters.to === '2026-11-30' ? 'single' : variant;
      const noMoney = Object.fromEntries(financialFields.map(field => [field, '0']));
      const bucket = filters.group === 'day' ? filters.to ?? '2026-12-05' : (filters.to ?? '2026-12-05').slice(0, 7);
      if (path.endsWith('/performance')) {
        if (variant === 'error') return route.fulfill({ status: 503, json: { message: 'Chưa thể tải báo cáo kiểm thử.' } });
        await new Promise(resolve => setTimeout(resolve, 170));
        const items = filters.facilityId ? [filters.facilityId === 'east' ? facility : other] : [facility, other];
        const reportItems = state === 'no-facility' ? [] : items.map((item, index) => {
          if (state === 'empty') return { ...item, ...noMoney, newReservations: 0, handovers: 0, returns: 0 };
          if (state === 'single') return { ...item, ...noMoney, rent: index === 0 ? '5000000' : '0',
            billed: index === 0 ? '5000000' : '0', depositRefunded: index === 0 ? '300000' : '0' };
          if (state === 'missing') return { ...item, billed: null, rentRefunded: null };
          return state === 'mismatch' ? { ...item, billed: '8888888', rentRefunded: '120000', transferRefunded: '80000' } : item;
        });
        return route.fulfill({ json: { items: reportItems, asOf: now.toISOString(), period: { from: filters.from, to: filters.to } } });
      }
      if (path.endsWith('/financial')) return route.fulfill({ json: {
        invoiceCount: state === 'empty' ? 0 : state === 'single' ? 1 : 2,
        times: state === 'empty' ? [] : state === 'single'
          ? [{ date: bucket, rent: 5000000, received: 0, bookings: 1 }]
          : [{ date: filters.group === 'day' ? '2026-12-04' : '2026-11', rent: 2000000, received: 1000000, bookings: 1 },
             { date: bucket, rent: 3000000, received: 5000000, bookings: 1 }],
      } });
      if (path.endsWith('/invoices.csv')) {
        await new Promise(resolve => setTimeout(resolve, 350));
        return csvFails ? route.fulfill({ status: 400, json: { message: 'Không xuất được dữ liệu kiểm thử.' } })
          : route.fulfill({ contentType: 'text/csv', body: 'Mã hóa đơn\r\nNB-TEST' });
      }
      return route.fulfill({ json: { items: [], total: 0 } });
    });
    await page.goto(base + '/operations/facilities/east');
    await page.getByRole('link', { name: 'Hiệu quả cơ sở', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/operations/reports' && url.searchParams.get('facilityId') === 'east');
    const title = page.getByRole('heading', { name: 'Doanh thu và hiệu quả cơ sở' });
    await title.waitFor();
    assert.equal(await page.locator('[data-workspace-theme]').first().getAttribute('data-workspace-theme'), theme);
    const period = page.getByRole('combobox', { name: 'Kỳ báo cáo' });
    assert.equal(await period.inputValue(), 'month');
    assert.equal(await page.getByRole('combobox', { name: 'Cơ sở', exact: true }).inputValue(), 'east');
    const table = page.getByRole('region', { name: 'Bảng so sánh hiệu quả cơ sở' });
    await table.getByRole('link', { name: facility.name }).waitFor();
    assert.equal(requests.filter(request => request.path.endsWith('/performance')).length, 1);
    assert.deepEqual(requests.find(request => request.path.endsWith('/performance')), {
      path: '/operations/reports/performance', facilityId: 'east', from: '2026-12-01', to: '2026-12-05',
    });
    await page.locator('.bom-report-donut').waitFor();
    assert.match(await page.locator('.bom-report-kpis').innerText(), /5\.000\.000[\s\S]*6\.000\.000[\s\S]*1\.200\.000[\s\S]*10,0%/);
    const invoicePanel = page.getByRole('region', { name: 'Cơ cấu hóa đơn trong kỳ', exact: true });
    const refunds = invoicePanel.locator('.bom-report-refund-summary');
    const refundAmounts = () => refunds.locator('dd').allTextContents();
    assert.equal(await page.getByRole('heading', { name: 'Hoàn tiền trong kỳ', exact: true }).count(), 0);
    assert.deepEqual(await refundAmounts(), []);
    assert(await invoicePanel.evaluate(element => element.offsetWidth === element.parentElement.clientWidth));
    assert.match(await table.innerText(), /Đã ngừng hoạt động[\s\S]*24[\s\S]*Bảo trì/);
    assert.equal(await table.getByRole('link', { name: facility.name }).getAttribute('href'), '/operations/facilities/east');
    assert.equal(await table.getByRole('row').count(), 2);
    const buckets = page.locator('.bom-report-bucket');
    await buckets.last().waitFor();
    assert.equal(await buckets.count(), 2);
    const lastBucket = buckets.last();
    await lastBucket.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await lastBucket.locator('.bom-report-tooltip').waitFor({ state: 'visible' });
    assert.match(await lastBucket.locator('.bom-report-tooltip').innerText(), /05\/12\/2026[\s\S]*5\.000\.000/);
    const details = page.locator('.bom-report-trend-details');
    await details.getByText('Xem số liệu chi tiết theo ngày', { exact: true }).click();
    await details.locator('tbody tr').first().waitFor();
    await details.locator('summary').click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (viewport.width < 500) assert(await table.evaluate(el => el.scrollWidth > el.clientWidth));

    const donut = page.locator('.bom-report-donut');
    const composition = page.locator('.bom-report-composition');
    const chart = page.locator('.bom-report-chart');
    const geometry = async () => Promise.all([donut, composition, chart].map(element => element.evaluate(node => node.offsetHeight)));
    const initialGeometry = await geometry();
    const columns = await table.getByRole('columnheader').allTextContents();
    for (const [preset, from, to, group, count] of [['today', '2026-12-05', '2026-12-05', 'day', 0], ['previous', '2026-11-01', '2026-11-30', 'day', 1],
      ['quarter', '2026-10-01', '2026-12-05', 'month', 2], ['year', '2026-01-01', '2026-12-05', 'month', 2], ['all', null, null, 'month', 2], ['month', '2026-12-01', '2026-12-05', 'day', 2]]) {
      const result = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/performance') && url.searchParams.get('from') === from && url.searchParams.get('to') === to;
      });
      const trend = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/financial') && url.searchParams.get('from') === from && url.searchParams.get('to') === to
          && url.searchParams.get('group') === group && url.searchParams.get('facilityId') === 'east';
      });
      await period.selectOption(preset);
      await Promise.all([result, trend]);
      await table.getByRole('link', { name: facility.name }).waitFor();
      await page.getByRole('heading', { name: 'Xu hướng tài chính theo ' + (group === 'day' ? 'ngày' : 'tháng') }).waitFor();
      if (count === 0) {
        await page.getByText('Không phát sinh hóa đơn trong kỳ', { exact: true }).waitFor();
        await page.getByText('Không phát sinh tiền thuê lập hóa đơn hoặc tiền đã thu trong kỳ.').waitFor();
        assert.match(await donut.innerText(), /0 ₫/);
        assert.equal(await donut.evaluate(node => getComputedStyle(node).backgroundImage), 'none');
        assert.equal(await composition.locator('small').allTextContents().then(parts => parts.join('')), '');
      } else {
        await buckets.first().waitFor();
        assert.match(await donut.evaluate(node => getComputedStyle(node).backgroundImage), /^conic-gradient/);
        if (count === 1) {
          assert.equal((await composition.locator('small').allTextContents())[0], '100,0%');
          assert.match(await composition.locator('.bom-report-total').innerText(), /5\.000\.000/);
          assert.deepEqual(await refundAmounts(), ['300.000\u00a0₫']);
          assert.equal(await refunds.locator('dt').innerText(), 'Tổng tiền đã hoàn (bao gồm cọc)');
        }
      }
      assert.equal(await buckets.count(), count);
      assert.deepEqual(await geometry(), initialGeometry);
      assert.deepEqual(await table.getByRole('columnheader').allTextContents(), columns);
      assert.match(await page.locator('.bom-report-kpis').innerText(), /1\.200\.000[\s\S]*10,0%/);
    }
    const customTrend = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/financial') && url.searchParams.get('from') === '2026-12-03'
        && url.searchParams.get('to') === '2026-12-05' && url.searchParams.get('group') === 'day';
    });
    await chooseDate(page, 'Từ ngày', '2026-12-03');
    await customTrend;
    await page.waitForURL(url => url.searchParams.get('from') === '2026-12-03');
    await page.locator('select[aria-label="Kỳ báo cáo"] option:checked[value="custom"]').waitFor({ state: 'attached' });
    assert.equal(await period.inputValue(), 'custom');
    const calendar = await openCalendar(page, 'Đến ngày', '2026-12-03');
    assert(await calendar.getByRole('button', { name: '02/12/2026' }).isDisabled());
    await page.keyboard.press('Escape');
    const exportButton = page.getByRole('button', { name: 'Xuất hóa đơn CSV' });
    const downloaded = page.waitForEvent('download');
    await exportButton.click();
    assert(await page.getByRole('button', { name: 'Đang xuất CSV…' }).isDisabled());
    assert.equal((await downloaded).suggestedFilename(), 'nestbox-hoa-don.csv');
    assert.deepEqual(requests.filter(request => request.path.endsWith('/invoices.csv')), [{
      path: '/operations/reports/invoices.csv', facilityId: 'east', from: '2026-12-03', to: '2026-12-05',
    }]);
    csvFails = true;
    await exportButton.click();
    await page.getByRole('alert').filter({ hasText: 'Không xuất được dữ liệu kiểm thử.' }).waitFor();

    const refresh = page.getByRole('button', { name: 'Làm mới' });
    variant = 'mismatch';
    await refresh.click();
    await page.getByText('Đang cập nhật…', { exact: true }).waitFor();
    assert(await table.isVisible());
    assert.deepEqual(await refundAmounts(), []);
    await page.getByText('Số liệu hóa đơn chưa khớp.').waitFor();
    assert.equal(await donut.evaluate(node => getComputedStyle(node).backgroundImage), 'none');
    assert.deepEqual(await refundAmounts(), ['950.000\u00a0₫']);
    variant = 'empty';
    await refresh.click();
    await page.getByText('Không phát sinh hóa đơn trong kỳ', { exact: true }).waitFor();
    await page.getByText('Không phát sinh tiền thuê lập hóa đơn hoặc tiền đã thu trong kỳ.').waitFor();
    assert.deepEqual(await refundAmounts(), ['0\u00a0₫']);
    variant = 'missing';
    await refresh.click();
    await page.getByText('Chưa đủ số liệu hóa đơn.').waitFor();
    assert.match(await donut.innerText(), /—/);
    assert.deepEqual(await refundAmounts(), []);
    variant = 'error';
    await refresh.click();
    const error = page.getByRole('alert').filter({ hasText: 'Chưa thể tải báo cáo kiểm thử.' });
    await error.waitFor();
    assert.equal(await page.locator('.bom-report-kpi').count(), 0);
    variant = 'no-facility';
    await error.getByRole('button', { name: 'Thử lại' }).click();
    await page.getByText('Không có cơ sở phù hợp').waitFor();

    variant = 'normal';
    await page.goto(base + '/operations/reports?facilityId=east&from=2026-11-01&to=2026-12-05');
    await table.waitFor();
    assert.equal(await period.inputValue(), 'custom');
    await page.getByRole('combobox', { name: 'Cơ sở', exact: true }).selectOption('');
    await page.waitForURL(url => !url.searchParams.has('facilityId') && url.searchParams.get('from') === '2026-11-01');
    await table.getByRole('link', { name: other.name }).waitFor();
    if (viewport.width > 900) {
      const sidebar = page.locator('.manager-sidebar').getByRole('link', { name: 'Doanh thu và hiệu quả cơ sở' });
      await sidebar.click();
      assert.equal(await sidebar.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
      await sidebar.press('Shift+Tab');
      await page.keyboard.press('Tab');
      assert(await sidebar.evaluate(el => el === document.activeElement && getComputedStyle(el).outlineWidth === '2px'
        && getComputedStyle(el).boxShadow === 'none'));
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: BOM report filters, UTC+7, facility scope, charts, refunds, CSV, loading, errors and responsive themes.');
} finally {
  await browser.close();
}
