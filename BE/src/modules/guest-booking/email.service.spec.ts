import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { EmailService } from './email.service.js';

const smtpEnvironment = {
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'sender@gmail.com',
  SMTP_PASS: 'google-app-password',
  EMAIL_FROM_NAME: 'WDP Storage',
  EMAIL_FROM_ADDRESS: 'sender@gmail.com',
  FRONTEND_URL: 'http://localhost:5173',
};

const booking = {
  to: 'customer@gmail.com',
  fullName: 'Nguyen Van A',
  bookingCode: 'WDPG-2026-EMAIL',
  storageName: 'Kho nhỏ tiêu chuẩn',
  startDate: '2026-11-01',
  endDate: '2026-12-01',
  rentalAmount: 1000000,
  discountAmount: 0,
  depositAmount: 500000,
  initialAmountDue: 1500000,
  quantity: 1,
  paymentPlan: 'PAY_MONTHLY' as const,
  claimToken: 'one-time-claim-token',
};

describe('EmailService SMTP', () => {
  it('sends the booking link to the guest using the configured sender', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'message-id' });
    const service = new EmailService(new ConfigService(smtpEnvironment));
    vi.spyOn(service as never, 'createSmtpTransport' as never).mockReturnValue({ sendMail, verify: vi.fn() } as never);

    const result = await service.sendBookingClaim(booking);

    expect((service as never)).toBeDefined();
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'customer@gmail.com',
      from: { name: 'WDP Storage', address: 'sender@gmail.com' },
      html: expect.stringContaining('claim-booking?token=one-time-claim-token'),
    }));
    expect(result).toEqual({ delivered: true, adapter: 'smtp' });
    expect(JSON.stringify(result)).not.toContain(booking.claimToken);
  });

  it('fails explicitly when SMTP configuration is incomplete', () => {
    const service = new EmailService(new ConfigService({ EMAIL_PROVIDER: 'smtp' }));
    expect(() => service.onModuleInit()).toThrow('EMAIL_SMTP_CONFIG_INVALID');
  });

  it('does not report a successful delivery when SMTP send fails', async () => {
    const service = new EmailService(new ConfigService(smtpEnvironment));
    vi.spyOn(service as never, 'createSmtpTransport' as never).mockReturnValue({ sendMail: vi.fn().mockRejectedValue({ code: 'EAUTH' }), verify: vi.fn() } as never);

    await expect(service.sendBookingClaim(booking)).rejects.toMatchObject({
      response: { code: 'EMAIL_DELIVERY_FAILED', message: 'SMTP authentication failed.' },
    } satisfies Partial<ServiceUnavailableException>);
  });

  it('verifies a configured SMTP transport without sending a message', async () => {
    const verify = vi.fn().mockResolvedValue(true);
    const service = new EmailService(new ConfigService(smtpEnvironment));
    vi.spyOn(service as never, 'createSmtpTransport' as never).mockReturnValue({ sendMail: vi.fn(), verify } as never);

    await expect(service.verifySmtpConnection()).resolves.toBeUndefined();
    expect(verify).toHaveBeenCalledOnce();
  });

  it('routes through the official Resend SDK with the configured sender and guest recipient', async () => {
    const service = new EmailService(new ConfigService({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test_key', EMAIL_FROM_NAME: 'WDP Storage', EMAIL_FROM_ADDRESS: 'onboarding@example.com', FRONTEND_URL: 'http://localhost:5173' }));
    const send = vi.fn().mockResolvedValue({ data: { id: 'resend-message-id' }, error: null });
    vi.spyOn(service as never, 'createResendClient' as never).mockReturnValue({ emails: { send } } as never);

    const result = await service.sendBookingClaim(booking);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: 'WDP Storage <onboarding@example.com>', to: ['customer@gmail.com'], html: expect.stringContaining('claim-booking?token=one-time-claim-token') }));
    expect(result).toEqual({ delivered: true, adapter: 'resend' });
  });

  it('validates Resend configuration and rejects unknown providers', () => {
    expect(() => new EmailService(new ConfigService({ EMAIL_PROVIDER: 'resend' })).onModuleInit()).toThrow('EMAIL_RESEND_CONFIG_INVALID');
    expect(() => new EmailService(new ConfigService({ EMAIL_PROVIDER: 'mailgun' })).onModuleInit()).toThrow('EMAIL_PROVIDER_INVALID');
  });

  it('does not report success when Resend rejects the request', async () => {
    const service = new EmailService(new ConfigService({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test_key', EMAIL_FROM_ADDRESS: 'onboarding@example.com', FRONTEND_URL: 'http://localhost:5173' }));
    vi.spyOn(service as never, 'createResendClient' as never).mockReturnValue({ emails: { send: vi.fn().mockResolvedValue({ data: null, error: { message: 'rejected' } }) } } as never);

    await expect(service.sendBookingClaim(booking)).rejects.toMatchObject({ response: { code: 'EMAIL_DELIVERY_FAILED' } } satisfies Partial<ServiceUnavailableException>);
  });
});
