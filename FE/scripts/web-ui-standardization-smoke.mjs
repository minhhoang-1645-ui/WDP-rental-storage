import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-test.mjs';
import { customer, fixture, staff } from './fixtures/workspace.mjs';

const base = process.env.WDP_FE_URL ?? 'http://localhost:5173';
const api = process.env.WDP_API_URL ?? 'http://localhost:3000/api';
const catalog = await fetch(api + '/booking/catalog').then(response => {
  assert(response.ok, 'The local catalog must be available for the public route fixtures.');
  return response.json();
});
const routes = {
  PUBLIC: ['/', '/storage', '/size-guide', '/booking'],
  AUTH: ['/account/login', '/account/register', '/portal/login', '/forgot-password', '/reset-password#token=' + 't'.repeat(43)],
  CUSTOMER: ['/customer/reservations', '/customer/reservations/reservation-0', '/customer/settings/security'],
  STAFF: ['/staff/stock-movements', '/staff/stock-movements/' + fixture['stock-movements'][0].id, '/staff/appointments'],
  MANAGER: ['/manager/units', '/manager/units/' + fixture.units[0].id, '/manager/customers/' + customer.id, '/manager/finance'],
  ADMIN: ['/admin/users', '/admin/users/' + staff.id, '/admin/login-history', '/admin/activity'],
};
const widths = [1920, 1366, 1024, 768, 390];
async function assertPrimaryColors(control, fill = 'primary') {
  await control.waitFor();
  await control.page().waitForFunction(({ button, fill }) => {
    const css = getComputedStyle(button);
    const token = name => {
      const hex = css.getPropertyValue('--workspace-' + name).trim().slice(1);
      const expanded = hex.length === 3 ? Array.from(hex, digit => digit.repeat(2)).join('') : hex;
      return 'rgb(' + expanded.match(/.{2}/g).map(value => parseInt(value, 16)).join(', ') + ')';
    };
    return css.color === token('on-primary') && css.backgroundColor === token(fill);
  }, { button: await control.elementHandle(), fill }, { timeout: 3000 });
}
const contrastPairs = [
  ['text', 'surface'], ['secondary', 'surface'], ['secondary', 'table'],
  ['muted', 'input'], ['on-primary', 'primary'],
  ['success', 'success-bg'], ['warning', 'warning-bg'], ['error', 'error-bg'],
];

function fixtureResponse(url, actor) {
  const path = url.pathname.replace(/^\/api\//, '');
  if (path === 'auth/me') return actor;
  if (path === 'booking/catalog') return catalog;
  if (path === 'storage') return { items: catalog.products, total: catalog.products.length };
  if (path === 'customer/stored-items') return [];
  if (path === 'reservations') return fixture.reservations;
  if (path.startsWith('reservations/')) return fixture.reservations[0];
  const parts = path.split('/');
  const [kind, id] = parts.slice(parts[1] === 'management' ? 2 : 1);
  const limit = Number(url.searchParams.get('limit')) || 20;
  const items = kind === 'users' ? [{ ...staff, role: 'STAFF' }] : fixture[kind] ?? [];
  return id ? items.find(item => item.id === id) ?? {} : { items: items.slice(0, limit), page: 1, limit, total: items.length };
}

const browser = await launchTestBrowser();
const findings = [], errors = [], mutations = [];
let checks = 0;
try {
  for (const [role, paths] of Object.entries(routes)) {
    const authenticated = role !== 'PUBLIC' && role !== 'AUTH';
    const actor = { ...(role === 'CUSTOMER' ? customer : staff), role };
    const context = await browser.newContext({ viewport: { width: 1366, height: 850 }, reducedMotion: 'reduce' });
    if (authenticated) await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1', 'phase4-fixture'));
    await context.route('https://images.pexels.com/**', route => route.abort());
    await context.route(/\/api\//, async route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      if (req.method() !== 'GET') {
        mutations.push(url.pathname);
        return route.fulfill({ status: 405 });
      }
      return route.fulfill({ json: fixtureResponse(url, actor) });
    });
    const page = await context.newPage();
    let activePath = '';
    page.on('pageerror', error => errors.push({ path: activePath, error: error.message }));
    for (const path of paths) {
      activePath = path;
      await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      const heading = page.locator('main h1').first();
      try { await heading.waitFor({ timeout: 12000 }); }
      catch { findings.push({ path, issue: 'No visible page heading', current: page.url() }); continue; }
      for (const theme of ['light', 'dark']) {
        await page.evaluate(value => {
          localStorage.setItem('nestbox-workspace-theme', value);
          window.dispatchEvent(new Event('nestbox-workspace-theme-change'));
        }, theme);
        const themedShell = page.locator(`.workspace-themed[data-workspace-theme="${theme}"]`).first();
        await themedShell.waitFor();
        const lowContrast = await themedShell.evaluate((shell, pairs) => {
          const css = getComputedStyle(shell);
          const luminance = name => {
            const hex = css.getPropertyValue('--workspace-' + name).trim().slice(1);
            const expanded = hex.length === 3 ? Array.from(hex, digit => digit.repeat(2)).join('') : hex;
            const values = expanded.match(/.{2}/g).map(value => {
              const channel = parseInt(value, 16) / 255;
              return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
            });
            return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
          };
          return pairs.filter(pair => {
            const [dark, light] = pair.map(luminance).sort((a, b) => a - b);
            return (light + .05) / (dark + .05) < 4.5;
          });
        }, contrastPairs);
        if (lowContrast.length) findings.push({ path, theme, lowContrast });
        for (const width of widths) {
          await page.setViewportSize({ width, height: 850 });
          const metrics = await heading.evaluate(element => ({
            extra: document.documentElement.scrollWidth - innerWidth,
            titleSize: parseFloat(getComputedStyle(element).fontSize),
          }));
          if (metrics.extra > 1 || metrics.titleSize < 22) findings.push({ path, theme, width, ...metrics });
          checks++;
        }
        if (path === '/') {
          await page.setViewportSize({ width: 1366, height: 850 });
          for (const control of [
            page.getByRole('link', { name: 'Đặt kho nhanh', exact: true }),
            page.getByRole('button', { name: 'Xem kho phù hợp' }),
          ]) {
            await page.mouse.move(0, 0);
            await assertPrimaryColors(control);
            await control.hover();
            await assertPrimaryColors(control, 'primary-hover');
          }
          await page.setViewportSize({ width: 390, height: 850 });
          await page.getByRole('button', { name: 'Mở menu' }).click();
          await assertPrimaryColors(page.getByRole('navigation', { name: 'Điều hướng di động' }).getByRole('link', { name: 'Đặt kho nhanh' }));
          await page.getByRole('button', { name: 'Đóng menu' }).click();
        }
      }
    }
    if (authenticated) {
      await page.getByRole('button', { name: 'Menu tài khoản' }).click();
      await page.getByRole('button', { name: 'Bảo mật', exact: true }).click();
      await page.waitForURL('**/settings/security');
      await page.getByRole('form', { name: 'Đổi mật khẩu' }).waitFor();
      await page.getByRole('navigation', { name: 'Đường dẫn' }).getByText('Cài đặt tài khoản').waitFor();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ checks, findings, errors, interceptedMutations: mutations.length }, null, 2));
assert.deepEqual(errors, []);
assert.deepEqual(findings, []);
assert.deepEqual(mutations, []);
