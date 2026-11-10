import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionReadiness, formatProductionReadiness } from './production-readiness.mjs';

function environment() {
  return { NODE_ENV: 'production', APP_INSTANCE_COUNT: '1', FRONTEND_PUBLIC_URL: 'https://storage.company.vn', FRONTEND_URL: 'https://storage.company.vn', DATABASE_URL: 'postgresql://fixture:private-database-secret@database.company.vn/app', INQUIRY_LOOKUP_SECRET: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJK',
    EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.company.vn', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: 'sender@company.vn', SMTP_PASS: 'private-smtp-secret', EMAIL_FROM_ADDRESS: 'sender@company.vn',
    CONTRACT_LEGAL_NAME: 'Thông tin đã duyệt', CONTRACT_TAX_CODE: 'fixture-tax', CONTRACT_ADDRESS: 'Thông tin đã duyệt', CONTRACT_REPRESENTATIVE: 'Thông tin đã duyệt', CONTRACT_TERMS_VERSION: 'V2', CONTRACT_TERMS_APPROVED: 'true',
    WDP_BANK_NAME: 'Ngân hàng', WDP_BANK_CODE: '970436', WDP_BANK_ACCOUNT_NUMBER: '123456789', WDP_BANK_ACCOUNT_NAME: 'Chủ tài khoản', DEMO_PAYMENT_ENABLED: 'false' };
}
test('one valid bank channel is sufficient without VNPay, no external operations needed', () => { assert.equal(productionReadiness(environment()).ready, true); });
test('one valid live VNPay channel is sufficient without a bank channel', () => {
  const env = environment(); for (const key of Object.keys(env).filter(key => key.startsWith('WDP_BANK_'))) delete env[key];
  Object.assign(env, { VNPAY_TMN_CODE: 'FIXTURE', VNPAY_HASH_SECRET: 'private-provider-secret', VNPAY_PAYMENT_URL: 'https://pay.vnpay.vn/vpcpay.html', VNPAY_RETURN_URL: 'https://storage.company.vn/customer/payments/vnpay-return' });
  assert.equal(productionReadiness(env).ready, true);
});
test('rejects local, credential-bearing and mismatched public frontend origins', () => {
  for (const origin of ['http://storage.company.vn', 'https://localhost', 'https://127.1', 'https://[::1]', 'https://10.0.0.1', 'https://name:secret@storage.company.vn', 'https://example.com', 'https://storage.company.vn/path']) assert.equal(productionReadiness({ ...environment(), FRONTEND_PUBLIC_URL: origin }).ready, false);
  assert.equal(productionReadiness({ ...environment(), FRONTEND_URL: 'https://different.company.vn' }).ready, false);
});
test('reports blockers for missing signing/legal config, weak secrets, multi-instance and demo settings', () => {
  for (const patch of [{ EMAIL_PROVIDER: 'development' }, { SMTP_PASS: '' }, { SMTP_SECURE: 'false' }, { CONTRACT_TERMS_APPROVED: 'false' }, { CONTRACT_LEGAL_NAME: '' }, { INQUIRY_LOOKUP_SECRET: 'x'.repeat(64) }, { APP_INSTANCE_COUNT: '2' }, { WEB_CONCURRENCY: '2' }, { DEMO_PAYMENT_ENABLED: 'true' }, { NODE_ENV: 'development' }]) assert.equal(productionReadiness({ ...environment(), ...patch }).ready, false);
});
test('refuses an advertised sandbox gateway and return on another origin even when the bank channel is valid', () => {
  const env = { ...environment(), VNPAY_TMN_CODE: 'FIXTURE', VNPAY_HASH_SECRET: 'private-provider-secret', VNPAY_PAYMENT_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html', VNPAY_RETURN_URL: 'https://storage.company.vn/customer/payments/vnpay-return' };
  assert.equal(productionReadiness(env).ready, false);
  assert.equal(productionReadiness({ ...env, VNPAY_PAYMENT_URL: 'https://pay.vnpay.vn:444/vpcpay.html' }).ready, false);
  assert.equal(productionReadiness({ ...env, VNPAY_PAYMENT_URL: 'https://pay.vnpay.vn/vpcpay.html', VNPAY_RETURN_URL: 'https://other.company.vn/customer/payments/vnpay-return' }).ready, false);
});
test('output remains bounded and does not echo values, URLs, passwords or malicious configuration text', () => {
  const env = environment(); const secret = 'DO_NOT_PRINT_' + 'a'.repeat(100000);
  Object.assign(env, { EMAIL_PROVIDER: secret, DATABASE_URL: secret, FRONTEND_URL: secret, FRONTEND_PUBLIC_URL: secret });
  const output = formatProductionReadiness(productionReadiness(env));
  assert(!output.includes('DO_NOT_PRINT')); assert(!output.includes('private-smtp-secret')); assert(!output.includes('private-database-secret')); assert(output.length < 6000);
});
