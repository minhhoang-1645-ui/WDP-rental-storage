import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VnpayService } from './vnpay.service.js';
import { createHmac } from 'node:crypto';

const config = { VNPAY_TMN_CODE: 'DEMO_TMN', VNPAY_HASH_SECRET: 'test-only-secret', VNPAY_PAYMENT_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html', VNPAY_RETURN_URL: 'http://localhost:5173/customer/payments/vnpay-return' };

describe('VnpayService', () => {
  const callback = (params: Record<string, string>) => ({ ...params, vnp_SecureHash: createHmac('sha512', config.VNPAY_HASH_SECRET).update(Object.keys(params).sort().map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key]!).replace(/%20/g, '+')}`).join('&')).digest('hex') });

  it('rejects a correctly signed callback for a different or missing merchant', () => {
    const service = new VnpayService(new ConfigService(config));
    const params = { vnp_TxnRef: 'ORDER1', vnp_Amount: '65000000', vnp_ResponseCode: '00', vnp_TransactionStatus: '00' };
    expect(() => service.verify(callback({ ...params, vnp_TmnCode: 'OTHER_MERCHANT' }))).toThrow('không thuộc đơn vị');
    expect(() => service.verify(callback(params))).toThrow('không thuộc đơn vị');
    expect(service.verify(callback({ ...params, vnp_TmnCode: config.VNPAY_TMN_CODE }))).toMatchObject({ orderRef: 'ORDER1', amountMinor: 65000000n });
  });

  it.each([['00', '99'], { value: '00' }, 0, null])('rejects ambiguous non-scalar callback values instead of dropping them: %j', value => {
    const service = new VnpayService(new ConfigService(config));
    const signed = callback({ vnp_TmnCode: config.VNPAY_TMN_CODE, vnp_TxnRef: 'ORDER1', vnp_Amount: '65000000' });
    expect(() => service.verify({ ...signed, unexpected: value })).toThrow('tham số không hợp lệ');
  });
  it('creates a signed sandbox URL and verifies the same provider payload', () => {
    const service = new VnpayService(new ConfigService(config));
    expect(service.isConfigured()).toBe(true);
    const url = new URL(service.paymentUrl({ orderRef: 'WDPTEST0001', amount: 1250000n, ipAddress: '127.0.0.1', createdAt: new Date('2026-10-21T01:00:00.000Z') }));
    expect(url.origin).toBe('https://sandbox.vnpayment.vn');
    expect(url.searchParams.get('vnp_Amount')).toBe('125000000');
    expect(url.searchParams.get('vnp_ReturnUrl')).toBe('http://localhost:5173/customer/payments/vnpay-return');
    url.searchParams.set('vnp_ResponseCode', '00'); url.searchParams.set('vnp_TransactionStatus', '00');
    // Provider callbacks sign the complete callback payload, so a modified unsigned URL must fail.
    expect(() => service.verify(Object.fromEntries(url.searchParams))).toThrow(BadRequestException);
    const original = new URL(service.paymentUrl({ orderRef: 'WDPTEST0001', amount: 1250000n, ipAddress: '127.0.0.1', createdAt: new Date('2026-10-21T01:00:00.000Z') }));
    expect(service.verify(Object.fromEntries(original.searchParams))).toMatchObject({ orderRef: 'WDPTEST0001', amountMinor: 125000000n });
  });

  it('fails closed when VNPay configuration is incomplete', () => {
    const service = new VnpayService(new ConfigService({}));
    expect(service.isConfigured()).toBe(false);
    expect(() => service.assertConfigured()).toThrow(ServiceUnavailableException);
  });

  it('does not advertise an online channel when any required setting is blank', () => {
    for (const key of Object.keys(config)) {
      const service = new VnpayService(new ConfigService({ ...config, [key]: '  ' }));
      expect(service.isConfigured()).toBe(false);
      expect(() => service.assertConfigured()).toThrow(ServiceUnavailableException);
    }
  });
  it.each(['https://evil.example/pay', 'https://sandbox.vnpayment.vn.evil.example/pay', 'https://user:secret@sandbox.vnpayment.vn/pay', 'http://sandbox.vnpayment.vn/pay', 'https://sandbox.vnpayment.vn:8443/pay', 'https://sandbox.vnpayment.vn/pay?untrusted=1'])('does not advertise an invalid gateway: %s', paymentUrl => {
    const service = new VnpayService(new ConfigService({ ...config, VNPAY_PAYMENT_URL: paymentUrl }));
    expect(service.isConfigured()).toBe(false); expect(() => service.assertConfigured()).toThrow(ServiceUnavailableException);
  });
  it.each(['javascript:alert(1)', 'https://shop.example/wrong-route', 'https://user:secret@shop.example/customer/payments/vnpay-return'])('does not advertise a broken return URL: %s', returnUrl => {
    expect(new VnpayService(new ConfigService({ ...config, VNPAY_RETURN_URL: returnUrl })).isConfigured()).toBe(false);
  });
  it('supports the live provider hosts and disables Sandbox by default in production', () => {
    for (const host of ['pay.vnpay.vn', 'pay.vnpayment.vn']) expect(new VnpayService(new ConfigService({ ...config, NODE_ENV: 'production', VNPAY_PAYMENT_URL: `https://${host}/vpcpay.html`, VNPAY_RETURN_URL: 'https://nestbox.vn/customer/payments/vnpay-return' })).isConfigured()).toBe(true);
    expect(new VnpayService(new ConfigService({ ...config, NODE_ENV: 'production', VNPAY_RETURN_URL: 'https://nestbox.vn/customer/payments/vnpay-return' })).isConfigured()).toBe(false);
  });

  it('allows signed Sandbox payments and callbacks on a hosted HTTPS demo only with explicit opt-in', () => {
    const demoConfig = { ...config, NODE_ENV: 'production', VNPAY_ALLOW_SANDBOX: 'true' };
    expect(new VnpayService(new ConfigService(demoConfig)).isConfigured()).toBe(false);

    const returnUrl = 'https://demo.nestbox.vn/customer/payments/vnpay-return';
    const service = new VnpayService(new ConfigService({ ...demoConfig, VNPAY_RETURN_URL: returnUrl }));
    expect(service.isConfigured()).toBe(true);
    const url = new URL(service.paymentUrl({ orderRef: 'DEMO-1', amount: 650000n, ipAddress: '127.0.0.1', createdAt: new Date('2026-10-21T01:00:00.000Z') }));
    expect(url.origin).toBe('https://sandbox.vnpayment.vn');
    expect(url.searchParams.get('vnp_ReturnUrl')).toBe(returnUrl);
    expect(service.verify(callback({ vnp_TmnCode: config.VNPAY_TMN_CODE, vnp_TxnRef: 'DEMO-1', vnp_Amount: '65000000', vnp_ResponseCode: '00', vnp_TransactionStatus: '00' }))).toMatchObject({ orderRef: 'DEMO-1', amountMinor: 65000000n, responseCode: '00', transactionStatus: '00' });
  });
});
