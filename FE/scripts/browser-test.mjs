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
