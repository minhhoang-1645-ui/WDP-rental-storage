import { Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { Resend } from 'resend';

export type BookingEmail = {
  to: string;
  fullName: string;
  bookingCode: string;
  storageName: string;
  startDate: string;
  endDate: string;
  rentalAmount: number;
  discountAmount: number;
  depositAmount: number;
  initialAmountDue: number;
  claimToken: string;
  quantity: number;
  paymentPlan: 'PAY_MONTHLY' | 'PREPAID';
};

type SmtpTransport = Pick<Transporter, 'sendMail' | 'verify'>;
type ResendClient = Pick<Resend, 'emails'>;

@Injectable()
export class EmailService implements OnModuleInit {
  private smtpTransport?: SmtpTransport;
  private resendClient?: ResendClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const provider = this.provider();
    if (provider === 'smtp') this.smtpConfig();
    else if (provider === 'resend') this.resendConfig();
    else if (provider && provider !== 'development') throw new Error(`EMAIL_PROVIDER_INVALID: Provider email không được hỗ trợ: ${provider}.`);
  }

  async sendBookingClaim(message: BookingEmail) {
    const provider = this.provider();
    const claimUrl = this.claimUrl(message.claimToken, provider === 'smtp');
    if (provider === 'development' && this.config.get<string>('NODE_ENV') !== 'production') {
      return { delivered: false, adapter: 'development' as const, claimUrl };
    }
    if (provider === 'smtp') return this.sendSmtp(message, claimUrl);
    if (provider === 'resend') return this.sendResend(message, claimUrl);
    if (!provider || provider === 'development') {
      throw new ServiceUnavailableException({ code: 'EMAIL_PROVIDER_NOT_CONFIGURED', message: 'Dịch vụ email chưa được cấu hình; email xác minh chưa được gửi.' });
    }
    throw new ServiceUnavailableException({ code: 'EMAIL_PROVIDER_INVALID', message: `Provider email không được hỗ trợ: ${provider}.` });
  }

  async verifySmtpConnection() {
    if (this.provider() !== 'smtp') throw new Error('EMAIL_PROVIDER phải là smtp để kiểm tra kết nối SMTP.');
    try {
      await this.getSmtpTransport().verify();
    } catch (error) {
      throw new Error(this.smtpFailureMessage(error));
    }
  }

  signatureDeliveryConfigured() {
    try { if (this.provider() === 'smtp') { this.smtpConfig(); return true; } if (this.provider() === 'resend') { this.resendConfig(); return true; } } catch { return false; }
    return false;
  }

  async sendSignatureOtp(message: { to: string; code: string; documentLabel: string; expiresInMinutes: number }) {
    if (!this.signatureDeliveryConfigured()) throw new ServiceUnavailableException({ code: 'SIGNATURE_EMAIL_NOT_CONFIGURED', message: 'Chưa cấu hình email xác thực chữ ký.' });
    const text = `NestBox Storage\n\nMã xác thực chữ ký ${message.documentLabel}: ${message.code}\nMã có hiệu lực ${message.expiresInMinutes} phút, chỉ dùng một lần cho nội dung và chữ ký bạn vừa xem. Không chia sẻ mã này. Nếu không yêu cầu ký, hãy bỏ qua email và liên hệ cơ sở.`;
    try {
      if (this.provider() === 'smtp') {
        const config = this.smtpConfig();
        await this.getSmtpTransport().sendMail({ from: { name: config.fromName, address: config.fromAddress }, to: message.to, subject: 'NestBox - Xác thực chữ ký của bạn', text });
      } else {
        const config = this.resendConfig();
        const response = await this.getResendClient().emails.send({ from: `${config.fromName} <${config.fromAddress}>`, to: [message.to], subject: 'NestBox - Xác thực chữ ký của bạn', text });
        if (response.error) throw new Error('Delivery rejected');
      }
    } catch { throw new ServiceUnavailableException({ code: 'EMAIL_DELIVERY_FAILED', message: 'Chưa gửi được mã xác thực. Vui lòng thử lại sau; chữ ký chưa được lưu.' }); }
  }

  private async sendSmtp(message: BookingEmail, claimUrl: string) {
    const smtp = this.smtpConfig();
    try {
      await this.getSmtpTransport().sendMail({
        from: { name: smtp.fromName, address: smtp.fromAddress },
        to: message.to,
        subject: `Xác minh yêu cầu đặt kho ${message.bookingCode}`,
        text: this.text(message, claimUrl),
        html: this.html(message, claimUrl),
      });
    } catch (error) {
      throw new ServiceUnavailableException({ code: 'EMAIL_DELIVERY_FAILED', message: this.smtpFailureMessage(error) });
    }
    return { delivered: true, adapter: 'smtp' as const };
  }

  private async sendResend(message: BookingEmail, claimUrl: string) {
    const resend = this.resendConfig();
    try {
      const response = await this.getResendClient().emails.send({
        from: `${resend.fromName} <${resend.fromAddress}>`,
        to: [message.to],
        subject: `Xác minh yêu cầu đặt kho ${message.bookingCode}`,
        text: this.text(message, claimUrl),
        html: this.html(message, claimUrl),
      });
      if (response.error) throw new Error('Resend API rejected the email.');
    } catch {
      throw new ServiceUnavailableException({ code: 'EMAIL_DELIVERY_FAILED', message: 'Không thể gửi email xác minh lúc này.' });
    }
    return { delivered: true, adapter: 'resend' as const };
  }

  private getSmtpTransport() {
    if (!this.smtpTransport) {
      const smtp = this.smtpConfig();
      this.smtpTransport = this.createSmtpTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        requireTLS: !smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
      });
    }
    return this.smtpTransport;
  }

  private getResendClient() {
    if (!this.resendClient) this.resendClient = this.createResendClient(this.resendConfig().apiKey);
    return this.resendClient;
  }

  private createSmtpTransport(options: SMTPTransport.Options) { return nodemailer.createTransport(options); }

  private createResendClient(apiKey: string) { return new Resend(apiKey); }

  private smtpConfig() {
    const host = this.config.get<string>('SMTP_HOST')?.trim() ?? '';
    const port = Number(this.config.get<string>('SMTP_PORT'));
    const user = this.config.get<string>('SMTP_USER')?.trim() ?? '';
    const pass = this.config.get<string>('SMTP_PASS') ?? '';
    const fromAddress = this.config.get<string>('EMAIL_FROM_ADDRESS')?.trim() ?? '';
    const fromName = this.config.get<string>('EMAIL_FROM_NAME')?.trim() || 'NestBox Storage';
    const frontendUrl = this.frontendUrl();
    const missing = [!host && 'SMTP_HOST', (!Number.isInteger(port) || port < 1 || port > 65535) && 'SMTP_PORT', !user && 'SMTP_USER', !pass && 'SMTP_PASS', !fromAddress && 'EMAIL_FROM_ADDRESS', !frontendUrl && 'FRONTEND_URL'].filter(Boolean);
    if (missing.length) throw new Error(`EMAIL_SMTP_CONFIG_INVALID: Thiếu hoặc không hợp lệ ${missing.join(', ')}.`);
    return { host, port, user, pass, fromAddress, fromName, secure: this.boolean('SMTP_SECURE'), frontendUrl };
  }

  private resendConfig() {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim() ?? '';
    const fromAddress = this.config.get<string>('EMAIL_FROM_ADDRESS')?.trim() ?? '';
    const fromName = this.config.get<string>('EMAIL_FROM_NAME')?.trim() || 'NestBox Storage';
    const frontendUrl = this.frontendUrl();
    const missing = [!apiKey && 'RESEND_API_KEY', !fromAddress && 'EMAIL_FROM_ADDRESS', !frontendUrl && 'FRONTEND_URL'].filter(Boolean);
    if (missing.length) throw new Error(`EMAIL_RESEND_CONFIG_INVALID: Thiếu hoặc không hợp lệ ${missing.join(', ')}.`);
    return { apiKey, fromAddress, fromName, frontendUrl };
  }

  private claimUrl(token: string, requireConfiguredUrl: boolean) {
    const appUrl = this.frontendUrl() || (requireConfiguredUrl ? '' : 'http://127.0.0.1:5173');
    if (!appUrl) throw new Error('EMAIL_SMTP_CONFIG_INVALID: Thiếu hoặc không hợp lệ FRONTEND_URL.');
    return `${appUrl.split(',')[0]!.replace(/\/$/, '')}/claim-booking?token=${encodeURIComponent(token)}`;
  }

  private frontendUrl() {
    return this.config.get<string>('FRONTEND_PUBLIC_URL')?.trim() || this.config.get<string>('FRONTEND_URL')?.trim() || '';
  }

  private provider() { return (this.config.get<string>('EMAIL_PROVIDER') ?? '').trim().toLowerCase(); }

  private boolean(name: string) { return (this.config.get<string>(name) ?? 'false').trim().toLowerCase() === 'true'; }

  private smtpFailureMessage(error: unknown) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    return code === 'EAUTH' ? 'SMTP authentication failed.' : 'Không thể gửi email xác minh lúc này.';
  }

  private html(message: BookingEmail, claimUrl: string) {
    const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
    return `<h1>WDP Storage</h1><p>Xin chào ${this.escape(message.fullName)},</p><p>Mã đặt kho: <strong>${this.escape(message.bookingCode)}</strong></p><p>${this.escape(message.storageName)} · ${message.startDate} đến ${message.endDate}</p><p>Số lượng: ${message.quantity}<br>Phương thức thanh toán: ${this.escape(this.paymentPlan(message.paymentPlan))}</p><p>Tiền thuê ước tính: ${money(message.rentalAmount)} VND<br>Giảm giá: ${money(message.discountAmount)} VND<br>Tiền cọc: ${money(message.depositAmount)} VND<br>Cần thanh toán ban đầu: ${money(message.initialAmountDue)} VND</p><p><a href="${this.escape(claimUrl)}">Xác minh và nhận booking</a></p><p>Liên kết chỉ sử dụng một lần và sẽ hết hạn.</p>`;
  }

  private text(message: BookingEmail, claimUrl: string) {
    return `WDP Storage\n\nXin chào ${message.fullName},\nMã đặt kho: ${message.bookingCode}\n${message.storageName} · ${message.startDate} đến ${message.endDate}\nSố lượng: ${message.quantity}\nPhương thức thanh toán: ${this.paymentPlan(message.paymentPlan)}\n\nXác minh và nhận booking: ${claimUrl}\n\nLiên kết chỉ sử dụng một lần và sẽ hết hạn.`;
  }

  private paymentPlan(value: BookingEmail['paymentPlan']) { return value === 'PREPAID' ? 'Trả trước' : 'Thanh toán hàng tháng'; }

  private escape(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  }
}
