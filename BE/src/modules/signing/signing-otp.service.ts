import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { EmailService } from '../guest-booking/email.service.js';

export type SigningContext = { userId: string; email: string; kind: 'contract' | 'appendix'; documentId: string; documentHash: string; signatureImage: string; acceptanceName: string };
type Challenge = { binding: string; documentKey: string; userId: string; codeHash: Buffer; expiresAt: number; attempts: number; locked: boolean; email: string };
export type SignatureVerification = { method: 'EMAIL_OTP'; verifiedAt: string; documentHash: string; signatureHash: string; challengeId: string; recipient: string };
const TTL = 10 * 60_000, RESEND = 60_000, MAX_ATTEMPTS = 5;

/** Pending challenges are ephemeral; successful evidence is stored with the signed snapshot. */
@Injectable()
export class SigningOtpService {
  private readonly challenges = new Map<string, Challenge>();
  private readonly rates = new Map<string, { last: number; count: number; since: number }>();
  private readonly resends = new Map<string, number>();
  constructor(private readonly email: EmailService) {}

  availability() { return { required: true, emailConfigured: this.email.signatureDeliveryConfigured(), expiresInSeconds: TTL / 1000, resendAfterSeconds: RESEND / 1000 }; }

  async issue(context: SigningContext, documentLabel?: string) {
    if (!this.email.signatureDeliveryConfigured()) throw new ServiceUnavailableException({ code: 'SIGNATURE_EMAIL_NOT_CONFIGURED', message: 'Chưa cấu hình email xác thực chữ ký. Vui lòng liên hệ cơ sở; hợp đồng chưa được ký và chưa thể thanh toán.' });
    const now = Date.now();
    this.prune(now);
    const rate = this.rates.get(context.userId);
    const resendKey = `${context.userId}:${context.kind}:${context.documentId}`, last = this.resends.get(resendKey);
    if (last !== undefined && now - last < RESEND || rate && rate.count >= 10 && now - rate.since < 3_600_000) throw new ConflictException('Vui lòng chờ ít nhất 60 giây trước khi gửi lại. Mỗi giờ được gửi tối đa 10 mã xác thực.');
    if (this.challenges.size >= 5000) throw new ServiceUnavailableException('Có quá nhiều yêu cầu ký. Vui lòng thử lại sau.');
    const id = randomUUID(), code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    // Reserve the rate slot before awaiting delivery, so parallel requests cannot flood email.
    const next = !rate || now - rate.since >= 3_600_000 ? { last: now, count: 1, since: now } : { ...rate, last: now, count: rate.count + 1 };
    this.rates.set(context.userId, next);
    this.resends.set(resendKey, now);
    await this.email.sendSignatureOtp({ to: context.email, code, documentLabel: documentLabel || (context.kind === 'contract' ? 'hợp đồng thuê kho' : 'phụ lục gia hạn'), expiresInMinutes: 10 });
    for (const [key, value] of this.challenges) if (value.documentKey === resendKey) this.challenges.delete(key);
    this.challenges.set(id, { binding: this.binding(context), documentKey: resendKey, userId: context.userId, codeHash: this.digest(`${id}:${code}`), expiresAt: now + TTL, attempts: 0, locked: false, email: this.mask(context.email) });
    return { challengeId: id, recipient: this.mask(context.email), expiresAt: new Date(now + TTL).toISOString(), resendAfterSeconds: 60 };
  }

  acquire(context: SigningContext, input: Record<string, unknown>) {
    const id = typeof input.challengeId === 'string' ? input.challengeId : '';
    const code = typeof input.otp === 'string' ? input.otp.trim() : '';
    const item = this.challenges.get(id);
    if (!item || item.userId !== context.userId || item.binding !== this.binding(context)) throw new BadRequestException('Mã xác thực không thuộc nội dung và chữ ký này. Vui lòng gửi mã mới.');
    if (item.expiresAt <= Date.now() || item.attempts >= MAX_ATTEMPTS) { this.challenges.delete(id); throw new BadRequestException('Mã xác thực đã hết hạn hoặc vượt quá số lần thử. Vui lòng gửi mã mới.'); }
    if (item.locked) throw new ConflictException('Chữ ký đang được lưu. Vui lòng chờ.');
    if (!/^\d{6}$/.test(code) || !timingSafeEqual(item.codeHash, this.digest(`${id}:${code}`))) { item.attempts++; throw new BadRequestException(`Mã xác thực không đúng. Còn ${Math.max(0, MAX_ATTEMPTS - item.attempts)} lần thử.`); }
    item.locked = true;
    const evidence: SignatureVerification = { method: 'EMAIL_OTP', verifiedAt: new Date().toISOString(), documentHash: context.documentHash, signatureHash: this.digest(context.signatureImage).toString('hex'), challengeId: id, recipient: item.email };
    return { evidence, commit: () => this.challenges.delete(id), release: () => { item.locked = false; } };
  }

  private binding(context: SigningContext) { return this.digest(JSON.stringify(context)).toString('hex'); }
  private digest(value: string) { return createHash('sha256').update(value).digest(); }
  private mask(email: string) { const [name, domain] = email.split('@'); return `${name.slice(0, 2)}***@${domain ?? ''}`; }
  private prune(now: number) { for (const [id, item] of this.challenges) if (item.expiresAt <= now && !item.locked) this.challenges.delete(id); for (const [id, rate] of this.rates) if (now - rate.since >= 3_600_000) this.rates.delete(id); for (const [key, sentAt] of this.resends) if (now - sentAt >= RESEND) this.resends.delete(key); }
}

export function signedDocument(value: any) { return value?.envelopeVersion === 1 && value?.document ? value.document : value; }
export function signatureVerification(value: any): SignatureVerification | null { return value?.envelopeVersion === 1 ? value.verification ?? null : null; }
export function signedEnvelope(document: unknown, verification: SignatureVerification) { return { envelopeVersion: 1, document, verification }; }
