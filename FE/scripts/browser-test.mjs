import { createRequire } from 'node:module';

export async function launchTestBrowser() {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.WDP_PLAYWRIGHT_MODULE || 'playwright');
  return chromium.launch({
    headless: true,
    ...(process.env.WDP_BROWSER_PATH
      ? { executablePath: process.env.WDP_BROWSER_PATH }
      : process.platform === 'win32' ? { channel: 'msedge' } : {}),
  });
}

export async function openCalendar(scope, label, date) {
  await scope.getByRole('button', { name: label, exact: true }).click();
  const calendar = scope.getByRole('dialog', { name: 'Lịch · ' + label, exact: true });
  const [year, month] = date.split('-');
  await calendar.getByRole('combobox', { name: 'Năm', exact: true }).selectOption(year);
  await calendar.getByRole('combobox', { name: 'Tháng', exact: true }).selectOption(month);
  return calendar;
}

export async function chooseDate(scope, label, date) {
  const calendar = await openCalendar(scope, label, date);
  await calendar.getByRole('button', { name: date.split('-').reverse().join('/'), exact: true }).click();
}

export async function chooseTime(scope, label, time) {
  await scope.getByRole('combobox', { name: label + ' · giờ', exact: true }).selectOption(time.slice(0, 2));
  await scope.getByRole('combobox', { name: label + ' · phút', exact: true }).selectOption(time.slice(3));
}
