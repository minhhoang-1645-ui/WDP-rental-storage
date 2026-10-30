import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

@Injectable()
export class VnpayService {
  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET', 'VNPAY_PAYMENT_URL', 'VNPAY_RETURN_URL'].every(key => Boolean(this.config.get<string>(key)?.trim()));
  }

  assertConfigured() { this.settings(); }

  paymentUrl(input: { orderRef: string; amount: bigint; ipAddress: string; bankCode?: string; locale?: string; createdAt: Date }) {
    const settings = this.settings();
    const params: Record<string, string> = {
      vnp_Version: '2.1.0', vnp_Command: 'pay', vnp_TmnCode: settings.tmnCode,
      vnp_Amount: String(input.amount * 100n), vnp_CurrCode: 'VND', vnp_TxnRef: input.orderRef,
      vnp_OrderInfo: `Thanh toan hoa don WDP ${input.orderRef}`, vnp_OrderType: 'other',
      vnp_Locale: input.locale === 'en' ? 'en' : 'vn', vnp_ReturnUrl: settings.returnUrl,
      vnp_IpAddr: input.ipAddress || '127.0.0.1', vnp_CreateDate: this.vnpDate(input.createdAt),
      vnp_ExpireDate: this.vnpDate(new Date(input.createdAt.getTime() + 5 * 60_000)),
      ...(input.bankCode ? { vnp_BankCode: input.bankCode } : {}),
    };
    const canonical = this.canonical(params);
    const signature = createHmac('sha512', settings.hashSecret).update(canonical).digest('hex');
    return `${settings.paymentUrl}?${canonical}&vnp_SecureHash=${signature}`;
  }

  verify(query: Record<string, unknown>) {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) if (typeof value === 'string' && key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType') params[key] = value;
    const supplied = typeof query.vnp_SecureHash === 'string' ? query.vnp_SecureHash.toLowerCase() : '';
    const expected = createHmac('sha512', this.settings().hashSecret).update(this.canonical(params)).digest('hex');
    if (!supplied || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new BadRequestException({ code: 'INVALID_VNPAY_SIGNATURE', message: 'Chữ ký VNPay không hợp lệ.' });
    const orderRef = params.vnp_TxnRef ?? '';
    const amountMinor = params.vnp_Amount ?? '';
    if (!orderRef || !/^\d+$/.test(amountMinor)) throw new BadRequestException({ code: 'INVALID_VNPAY_PAYLOAD', message: 'Callback VNPay thiếu dữ liệu bắt buộc.' });
    return { orderRef, amountMinor: BigInt(amountMinor), responseCode: params.vnp_ResponseCode ?? '', transactionStatus: params.vnp_TransactionStatus ?? '', providerTransactionId: params.vnp_TransactionNo || null, bankCode: params.vnp_BankCode || null };
  }

  private settings() {
    const tmnCode = this.config.get<string>('VNPAY_TMN_CODE')?.trim() ?? '', hashSecret = this.config.get<string>('VNPAY_HASH_SECRET')?.trim() ?? '', paymentUrl = this.config.get<string>('VNPAY_PAYMENT_URL')?.trim() ?? '', returnUrl = this.config.get<string>('VNPAY_RETURN_URL')?.trim() ?? '';
    if (!this.isConfigured()) throw new ServiceUnavailableException({ code: 'VNPAY_NOT_CONFIGURED', message: 'VNPay chưa được cấu hình.' });
    return { tmnCode, hashSecret, paymentUrl, returnUrl };
  }

  private canonical(params: Record<string, string>) { return Object.keys(params).sort().map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key]!).replace(/%20/g, '+')}`).join('&'); }
  private vnpDate(date: Date) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date); const value = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${value.year}${value.month}${value.day}${value.hour}${value.minute}${value.second}`; }
}
