import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';

const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const roles = [
  ['SYSTEM_ADMINISTRATOR', 'Quản trị viên', 'System Administrator', 1],
  ['BUSINESS_OPERATIONS_MANAGER', 'Điều hành kinh doanh', 'Business Operations Manager', 3],
  ['FACILITY_MANAGER', 'Quản lý cơ sở', 'Facility Manager', 5],
  ['FACILITY_STAFF', 'Nhân viên cơ sở', 'Facility Staff', 7],
  ['STORAGE_CUSTOMER', 'Khách thuê kho', 'Storage Customer', 1234],
];
const accounts = roles.map(([role, fullName], index) => ({
  id: 'role-test-' + index, role, fullName, email: `role-${index}@example.test`, accountStatus: 'ACTIVE',
}));
const browser = await launchTestBrowser();
const compactText = (value) => value.replace(/\s+/g, ' ').trim();

try {
  for (const [theme, width] of [['light', 1366], ['dark', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 820 } });
    const errors = [];
    const actualCounts = new Set();
    let failOnce = true;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => {
      localStorage.setItem('wdp-auth-token-v1', 'fixture-role');
      localStorage.setItem('nestbox-workspace-theme', theme);
    }, theme);
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      assert.equal(request.method(), 'GET');
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/auth/me') return route.fulfill({ json: accounts[0] });
      if (path === '/admin/users') {
        const index = roles.findIndex(([role]) => role === url.searchParams.get('role'));
        if (index < 0) return route.fulfill({ json: { total: 0, items: [] } });
        const total = roles[index][3];
        if (url.searchParams.get('limit') === '1') {
          actualCounts.add(roles[index][0]);
          if (index === 3 && failOnce) {
            failOnce = false;
            return route.fulfill({ status: 503, json: { message: 'Không thể tải số tài khoản.' } });
          }
        }
        return route.fulfill({ json: { items: [accounts[index]], page: 1, limit: Number(url.searchParams.get('limit')), total } });
      }
      if (path.endsWith('/access')) return route.fulfill({
        json: { history: [], openAssignments: 0, closedAssignments: 0, sessions: [], sessionManagement: true },
      });
      const account = accounts.find(({ id }) => path === '/admin/users/' + id);
      return route.fulfill({ json: account ?? { items: [], total: 0 } });
    });
    await page.goto(base + '/admin/roles');
    await page.locator(`[data-workspace-role="admin"][data-workspace-theme="${theme}"]`).waitFor();
    const table = page.getByRole('table', { name: 'Danh sách vai trò' });
    await table.waitFor();
    assert.deepEqual(await table.getByRole('columnheader').allTextContents(), ['Vai trò', 'Phạm vi truy cập', 'Số tài khoản', 'Thao tác']);
    assert.deepEqual(await table.locator('tbody th strong').allTextContents(), roles.map(([, label]) => label));
    assert.deepEqual(await table.locator('tbody th small').allTextContents(), roles.map(([, , english]) => english));
    const retry = table.getByRole('button', { name: 'Tải lại số tài khoản · Nhân viên cơ sở', exact: true });
    await retry.waitFor();
    assert.match(await retry.locator('..').innerText(), /Chưa tải được/);
    await retry.click();
    await table.getByRole('link', { name: '7 tài khoản · Nhân viên cơ sở', exact: true }).waitFor();
    assert.equal(actualCounts.size, roles.length);
    assert(await table.evaluate(el => {
      const last = el.querySelector('tbody tr td:last-child button').getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth + 1 && el.parentElement.scrollWidth <= el.parentElement.clientWidth + 1
        && last.right <= innerWidth && last.left >= 0;
    }));

    for (const [index, [key, label, english, total]] of roles.entries()) {
      const formatted = total.toLocaleString('vi-VN');
      const count = table.getByRole('link', { name: `${formatted} tài khoản · ${label}`, exact: true });
      assert.equal(await count.getAttribute('href'), '/admin/users?role=' + key);
      const trigger = index % 2 ? table.getByRole('button', { name: `Xem chi tiết · ${label}`, exact: true })
        : table.getByRole('button', { name: `${label} ${english}`, exact: true });
      if (index % 2) await trigger.press('Enter');
      else await trigger.click();
      const dialog = page.getByRole('dialog', { name: label, exact: true });
      await dialog.waitFor();
      await dialog.getByText(english, { exact: true }).waitFor();
      assert.equal(await dialog.getByText(formatted + ' tài khoản', { exact: true }).count(), 1);
      assert.equal(await dialog.getByRole('checkbox').count(), 0);
      assert(!((await dialog.innerText()).includes(key)));
      const scope = await dialog.locator('.admin-role-dialog-facts dd').first().innerText();
      const permissions = await dialog.locator('.admin-role-permissions').innerText();
      assert(await dialog.evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.scrollWidth <= el.clientWidth + 1));
      const layout = await dialog.evaluate(el => {
        const heading = el.querySelector('.portal-dialog-heading');
        const title = heading.querySelector('h2').getBoundingClientRect();
        const english = heading.querySelector('p').getBoundingClientRect();
        const icon = heading.querySelector('.admin-role-icon').getBoundingClientRect();
        const close = el.querySelector('header > button').getBoundingClientRect();
        const facts = [...el.querySelectorAll('.admin-role-dialog-facts > div')].map(node => node.getBoundingClientRect());
        const actions = [...el.querySelectorAll('.portal-dialog-footer > *')].map(node => ({ rect: node.getBoundingClientRect(), css: getComputedStyle(node) }));
        return {
          alignment: getComputedStyle(el).textAlign === 'start',
          focus: getComputedStyle(el).outlineStyle === 'none' && getComputedStyle(heading).outlineStyle === 'none',
          title: icon.right < title.left && Math.abs(title.left - english.left) <= 1 && title.bottom <= english.top,
          close: close.left > title.left && Math.abs((close.top + close.bottom) - (title.top + english.bottom)) <= 2,
          facts: facts[0].top === facts[1].top && Math.abs(facts[0].width - facts[1].width) <= 1,
          icons: el.querySelectorAll('.admin-role-permissions li > svg').length === el.querySelectorAll('.admin-role-permissions li').length
            && Boolean(el.querySelector('.admin-role-limits > svg')),
          footer: actions.map(({ rect, css }) => ({ top: rect.top, height: rect.height, radius: css.borderRadius, fontSize: css.fontSize })),
        };
      });
      const { footer, ...areas } = layout;
      for (const [area, valid] of Object.entries(areas)) assert(valid, `${theme} · ${label} · ${area}`);
      assert.deepEqual(footer[0], footer[1], `${theme} · ${label} · footer`);
      const listLink = dialog.getByRole('link', { name: 'Xem danh sách tài khoản', exact: true });
      assert.equal(await listLink.getAttribute('href'), '/admin/users?role=' + key);
      if (index === 2 && theme === 'dark') {
        await page.setViewportSize({ width, height: 420 });
        assert(await dialog.evaluate(el => {
          const header = el.querySelector('header'), body = el.querySelector('.portal-dialog-body'), footer = el.querySelector('footer');
          const top = header.getBoundingClientRect().top, bottom = footer.getBoundingClientRect().bottom;
          body.scrollTop = body.scrollHeight;
          return body.scrollTop > 0 && header.getBoundingClientRect().top === top && footer.getBoundingClientRect().bottom === bottom;
        }));
        await listLink.press('Tab');
        const closeIcon = dialog.getByRole('button', { name: 'Đóng hộp thoại', exact: true });
        assert(await closeIcon.evaluate(el => el === document.activeElement && getComputedStyle(el).outlineStyle === 'solid'));
        await page.setViewportSize({ width, height: 820 });
      }
      if (index % 2) {
        await listLink.click();
      } else {
        await page.keyboard.press('Escape');
        assert(await trigger.evaluate(el => document.activeElement === el));
        await count.click();
      }
      await page.waitForURL(url => url.pathname === '/admin/users' && url.searchParams.get('role') === key);
      const account = page.getByRole('link', { name: label, exact: true });
      await account.click();
      await page.getByRole('tab', { name: 'Phân quyền', exact: true }).click();
      const details = page.getByRole('tabpanel', { name: 'Phân quyền', exact: true });
      await details.getByText('Chi tiết quyền và giới hạn', { exact: true }).click();
      await details.locator('.admin-role-permissions').waitFor();
      assert.equal(await details.locator('.admin-permission-role > span').last().innerText(), scope);
      assert.equal(compactText(await details.locator('.admin-role-permissions').innerText()), compactText(permissions));
      await page.goto(base + '/admin/roles');
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: five Admin roles, live count API contract, role links, shared descriptions, dialogs, and responsive themes.');
} finally {
  await browser.close();
}
