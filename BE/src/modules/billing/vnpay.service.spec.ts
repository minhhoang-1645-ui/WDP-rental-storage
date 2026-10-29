import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VnpayService } from './vnpay.service.js';

const config = { VNPAY_TMN_CODE: 'DEMO_TMN', VNPAY_HASH_SECRET: 'test-only-secret', VNPAY_PAYMENT_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html', VNPAY_RETURN_URL: 'http://localhost:5173/customer/payments/vnpay-return' };

describe('VnpayService', () => {
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
});
