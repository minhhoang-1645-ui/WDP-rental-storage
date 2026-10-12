import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
};

@Injectable()
export class EmailService {
  constructor(private readonly config: ConfigService) {}

  async sendBookingClaim(message: BookingEmail) {
    const provider = (this.config.get<string>('EMAIL_PROVIDER') ?? '').toLowerCase();
    const appUrl = this.config.get<string>('FRONTEND_PUBLIC_URL') ?? this.config.get<string>('FRONTEND_URL') ?? 'http://127.0.0.1:5173';
    const claimUrl = `${appUrl.split(',')[0]!.replace(/\/$/, '')}/claim-booking?token=${encodeURIComponent(message.claimToken)}`;
    if (provider === 'development' && this.config.get<string>('NODE_ENV') !== 'production') {
      return { delivered: false, adapter: 'development' as const, claimUrl };
    }
    if (provider !== 'resend') {
      throw new ServiceUnavailableException({ code: 'EMAIL_PROVIDER_NOT_CONFIGURED', message: 'Dịch vụ email chưa được cấu hình; email xác minh chưa được gửi.' });
    }
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('EMAIL_FROM');
    if (!apiKey || !from) throw new ServiceUnavailableException({ code: 'EMAIL_PROVIDER_NOT_CONFIGURED', message: 'Thiếu cấu hình gửi email.' });
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: `Xác minh yêu cầu đặt kho ${message.bookingCode}`,
        html: this.html(message, claimUrl),
      }),
    });
    if (!response.ok) throw new ServiceUnavailableException({ code: 'EMAIL_DELIVERY_FAILED', message: 'Không thể gửi email xác minh lúc này.' });
    return { delivered: true, adapter: 'resend' as const };
  }

  private html(message: BookingEmail, claimUrl: string) {
    const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
    return `<h1>WDP Storage</h1><p>Xin chào ${this.escape(message.fullName)},</p><p>Mã đặt kho: <strong>${this.escape(message.bookingCode)}</strong></p><p>${this.escape(message.storageName)} · ${message.startDate} đến ${message.endDate}</p><p>Tiền thuê ước tính: ${money(message.rentalAmount)} VND<br>Giảm giá: ${money(message.discountAmount)} VND<br>Tiền cọc: ${money(message.depositAmount)} VND<br>Cần thanh toán ban đầu: ${money(message.initialAmountDue)} VND</p><p><a href="${this.escape(claimUrl)}">Xác minh và nhận booking</a></p><p>Liên kết chỉ sử dụng một lần và sẽ hết hạn.</p>`;
  }

  private escape(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  }
}
