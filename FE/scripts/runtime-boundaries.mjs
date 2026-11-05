// Exercise the actual pure web/mobile helpers, including hostile gateway URLs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const load = async path => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
};
for (const path of ['../src/utils/vnpay-destination.ts', '../../mobile/src/utils/vnpay-destination.ts']) {
  const { vnpayDestination } = await load(path);
  for (const host of ['sandbox.vnpayment.vn', 'pay.vnpayment.vn', 'pay.vnpay.vn']) assert.equal(vnpayDestination(`https://${host}/paymentv2/vpcpay.html?vnp_Amount=65000000`).hostname, host);
  for (const value of ['javascript:alert(1)', 'http://sandbox.vnpayment.vn/pay', 'https://sandbox.vnpayment.vn.evil.com/pay', 'https://sandbox.vnpayment.vn@evil.com/pay', 'https://bad.vnpayment.vn/pay', 'https://user:password@pay.vnpay.vn/pay', 'https://pay.vnpay.vn:8443/pay']) assert.throws(() => vnpayDestination(value));
}
for (const path of ['../src/utils/business-date.ts', '../../mobile/src/utils/calendar-date.ts']) {
  const { vietnamCalendarDate } = await load(path);
  assert.equal(vietnamCalendarDate(Date.parse('2026-11-05T16:59:59.999Z')), '2026-11-05');
  assert.equal(vietnamCalendarDate(Date.parse('2026-11-05T17:00:00Z')), '2026-11-06');
  assert.equal(vietnamCalendarDate(Date.parse('2026-12-31T17:00:00Z')), '2027-01-01');
}
console.log('PASS: web/mobile gateway redirects reject lookalike hosts, credentials, insecure protocols and ports; Vietnamese midnight and year-end boundaries agree.');
