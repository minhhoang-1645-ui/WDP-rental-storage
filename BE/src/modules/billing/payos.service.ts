import { BadRequestException, Injectable, ServiceUnavailableException, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayOS } from '@payos/node';

@Injectable()
export class PayosService implements OnModuleInit {
  private sdk?: PayOS;
  constructor(private readonly config: ConfigService) {}

  get enabled() { return this.config.get('PAYOS_ENABLED') === 'true'; }
  get cutover() { return this.enabled || this.config.get('PAYOS_CUTOVER') === 'true'; }
  assertConfigured() { this.client(); }
  onModuleInit() { if (this.enabled) this.assertConfigured(); }

  private client() {
    const names = ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY'] as const;
    const [clientId, apiKey, checksumKey] = names.map(name => this.config.get<string>(name)?.trim());
    const missing = names.filter((_, index) => ![clientId, apiKey, checksumKey][index]);
    if (missing.length) throw new ServiceUnavailableException('Thiếu cấu hình payOS: ' + missing.join(', '));
    return this.sdk ??= new PayOS({ clientId, apiKey, checksumKey, timeout: 8000, maxRetries: 0, logLevel: 'off' });
  }

  async create(orderCode: number, amount: number, expiresAt: Date, transactionId: string, invoiceId: string, mobile: boolean) {
    const expiredAt = Math.floor(+expiresAt / 1000);
    if (!Number.isSafeInteger(orderCode) || orderCode < 1 || !Number.isSafeInteger(amount) || amount < 1
      || expiredAt <= Date.now() / 1000 || expiredAt > 2_147_483_647) throw new BadRequestException('Thông tin phiên payOS không hợp lệ.');
    const publicUrl = this.config.get<string>('FRONTEND_PUBLIC_URL') || this.config.get<string>('FRONTEND_URL')?.split(',')[0];
    let destination: URL;
    try {
      destination = new URL(mobile ? '/customer/payments/payos-return/mobile' : '/customer/payments/payos-return', publicUrl);
      if (!['https:', 'http:'].includes(destination.protocol) || destination.username || destination.password
        || this.config.get('NODE_ENV') === 'production' && destination.protocol !== 'https:') throw new Error();
    } catch {
      throw new ServiceUnavailableException('Cần cấu hình FRONTEND_PUBLIC_URL cho payOS.');
    }
    destination.searchParams.set('transaction', transactionId);
    destination.searchParams.set('invoiceId', invoiceId);
    const sdk = this.client();
    try {
      return await sdk.paymentRequests.create({ orderCode, amount, description: 'NESTBOX', expiredAt,
        returnUrl: destination.href, cancelUrl: destination.href });
    } catch {
      throw new ServiceUnavailableException('Chưa xác định được kết quả tạo link payOS. Hãy thử lại để kiểm tra phiên hiện tại.');
    }
  }

  async get(orderCode: number) {
    const sdk = this.client();
    try { return await sdk.paymentRequests.get(orderCode); }
    catch (error) {
      if (typeof error === 'object' && error && 'status' in error && error.status === 404) return null;
      throw new ServiceUnavailableException('Chưa thể truy vấn payOS. Vui lòng thử lại.');
    }
  }

  async cancel(orderCode: number) {
    const sdk = this.client();
    try { return await sdk.paymentRequests.cancel(orderCode); }
    catch { throw new ServiceUnavailableException('Chưa xác định được kết quả hủy link payOS.'); }
  }

  async verify(body: Parameters<PayOS['webhooks']['verify']>[0]) {
    const sdk = this.client();
    try { return await sdk.webhooks.verify(body); }
    catch { throw new BadRequestException('Chữ ký webhook payOS không hợp lệ.'); }
  }
}
