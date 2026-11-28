const { chromium } = require('../../FE/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const phase = process.argv[2] || 'after';
  const output = path.resolve(__dirname, '../artifacts/staff-redesign', phase);
  fs.mkdirSync(output, { recursive: true });
  // Local visual harness only: native Expo Go is not subject to browser CORS.
  // Leave application API/auth/server configuration unchanged.
  const browser = await chromium.launch({ headless: true, channel: 'msedge', args: ['--disable-web-security'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => console.log('Request failed:', request.url(), request.failure()?.errorText));
  page.on('console', message => { if (message.type() === 'error') console.log('Browser:', message.text()); });
  const response = await page.request.post('http://127.0.0.1:3000/api/auth/login', { data: { email: 'staff@test.com', password: process.env.STAFF_REVIEW_PASSWORD } });
  if (!response.ok()) throw new Error('Staff login failed: ' + response.status());
  const { token } = await response.json();
  await page.addInitScript(token => localStorage.setItem('wdp-mobile-auth-token', token), token);
  for (const [name, route] of [['home', '/staff'], ['operations', '/staff/tasks'], ['maintenance', '/staff/maintenance'], ['account', '/staff/account']]) {
    await page.goto('http://127.0.0.1:8081' + route);
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
    console.log(name + ': ' + page.url());
  }
  if (phase === 'after') {
    for (const resource of ['reservations', 'inquiries', 'support-requests', 'appointments', 'renewals', 'transfers', 'returns', 'maintenance']) {
      await page.goto('http://127.0.0.1:8081/staff/' + resource);
      await page.waitForTimeout(1800);
      const content = await page.locator('body').innerText();
      if (/Không tìm thấy phân hệ|Kết nối lại NestBox|Unmatched Route/.test(content)) throw new Error('Staff route failed: ' + resource);
      console.log('Route verified:', resource);
    }
    await page.goto('http://127.0.0.1:8081/staff/tasks');
    await page.getByRole('textbox', { name: 'Tìm nghiệp vụ', exact: true }).fill('bao tri');
    await page.getByRole('button', { name: /Bảo trì kho/ }).waitFor();
    console.log('Accent-insensitive directory search verified');
  }
  console.log('Page errors:', JSON.stringify(errors));
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
