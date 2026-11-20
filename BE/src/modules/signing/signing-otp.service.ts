import { BadRequestException, ConflictException, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { EmailService } from '../guest-booking/email.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

export type SigningContext = { userId: string; email: string; kind: 'contract' | 'appendix' | 'transfer'; documentId: string; documentHash: string; signatureImage: string; acceptanceName: string };
type Challenge = { binding: string; documentKey: string; userId: string; codeHash: Buffer; expiresAt: number; attempts: number; locked: boolean; email: string };
export type SignatureVerification = { method: 'EMAIL_OTP'; verifiedAt: string; documentHash: string; signatureHash: string; challengeId: string; recipient: string };
const TTL = 10 * 60_000, RESEND = 60_000, MAX_ATTEMPTS = 5;

/** Runtime uses PostgreSQL. The in-memory adapter exists only for isolated unit tests. */
@Injectable()
export class SigningOtpService {
  private readonly challenges = new Map<string, Challenge>();
  private readonly rates = new Map<string, { last: number; count: number; since: number }>();
  private readonly resends = new Map<string, number>();
  constructor(private readonly email: EmailService, @Optional() private readonly prisma?: PrismaService) {}

  availability() { return { required: true, emailConfigured: this.email.signatureDeliveryConfigured(), expiresInSeconds: TTL / 1000, resendAfterSeconds: RESEND / 1000 }; }

  async issue(context: SigningContext, documentLabel?: string) {
    if (!this.email.signatureDeliveryConfigured()) throw new ServiceUnavailableException({ code: 'SIGNATURE_EMAIL_NOT_CONFIGURED', message: 'Chưa cấu hình email xác thực chữ ký. Vui lòng liên hệ cơ sở; hợp đồng chưa được ký và chưa thể thanh toán.' });
    if (this.prisma) return this.issuePersistent(context, documentLabel);
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

  private async issuePersistent(context: SigningContext, documentLabel?: string) {
    const db = this.prisma!, now = new Date(), id = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const documentKey = `${context.userId}:${context.kind}:${context.documentId}`;
    const expiresAt = new Date(now.getTime() + TTL);
    await db.$transaction(async tx => {
      // A user row serializes rate reservations across all BE processes, without storing OTP plaintext.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${context.userId} FOR UPDATE`);
      const recent = await tx.signingChallenge.findMany({ where: { userId: context.userId, createdAt: { gt: new Date(now.getTime() - 3_600_000) } }, select: { documentKey: true, createdAt: true } });
      if (recent.length >= 10 || recent.some(row => row.documentKey === documentKey && now.getTime() - row.createdAt.getTime() < RESEND)) throw new ConflictException('Chờ ít nhất 60 giây để gửi lại. Mỗi giờ được gửi tối đa 10 mã.');
      await tx.signingChallenge.updateMany({ where: { documentKey, consumedAt: null }, data: { consumedAt: now } });
      await tx.signingChallenge.create({ data: { id, userId: context.userId, documentKey, binding: this.binding(context), codeHash: this.digest(`${id}:${code}`).toString('hex'), recipient: this.mask(context.email), expiresAt, createdAt: now } });
    });
    try {
      await this.email.sendSignatureOtp({ to: context.email, code, documentLabel: documentLabel ?? 'hồ sơ thuê kho', expiresInMinutes: 10 });
      await db.signingChallenge.update({ where: { id }, data: { deliveredAt: new Date() } });
    } catch (error) {
      await db.signingChallenge.updateMany({ where: { id }, data: { consumedAt: new Date() } });
      throw error;
    }
    return { challengeId: id, recipient: this.mask(context.email), expiresAt: expiresAt.toISOString(), resendAfterSeconds: RESEND / 1000 };
  }

  async verifyAndSave<T>(context: SigningContext, input: Record<string, unknown>, save: (evidence: SignatureVerification, transaction?: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    if (!this.prisma) {
      const proof = this.acquire(context, input);
      try { const result = await save(proof.evidence); proof.commit(); return result; }
      catch (error) { proof.release(); throw error; }
    }
    const id = typeof input.challengeId === 'string' ? input.challengeId : '';
    const code = typeof input.otp === 'string' ? input.otp.trim() : '';
    const result = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SigningChallenge" WHERE "id" = ${id} FOR UPDATE`);
      const item = await tx.signingChallenge.findUnique({ where: { id } });
      if (!item || item.userId !== context.userId || item.binding !== this.binding(context)) return { error: 'Mã không thuộc nội dung và chữ ký này. Hãy gửi mã mới.' } as const;
      if (!item.deliveredAt || item.consumedAt || item.expiresAt <= new Date() || item.attempts >= MAX_ATTEMPTS) return { error: 'Mã đã dùng, hết hạn hoặc vượt số lần thử. Hãy gửi mã mới.' } as const;
      const hash = this.digest(`${id}:${code}`).toString('hex');
      if (!/^\d{6}$/.test(code) || hash !== item.codeHash) {
        await tx.signingChallenge.update({ where: { id }, data: { attempts: { increment: 1 } } });
        return { error: `Mã không đúng. Còn ${MAX_ATTEMPTS - item.attempts - 1} lần thử.` } as const;
      }
      const evidence: SignatureVerification = { method: 'EMAIL_OTP', verifiedAt: new Date().toISOString(), documentHash: context.documentHash, signatureHash: this.digest(context.signatureImage).toString('hex'), challengeId: id, recipient: item.recipient };
      const value = await save(evidence, tx);
      await tx.signingChallenge.update({ where: { id }, data: { consumedAt: new Date() } });
      return { value } as const;
    }, { timeout: 20000 });
    // Failed guesses must commit their counter; throwing inside the transaction would undo it.
    if ('error' in result) throw new BadRequestException(result.error);
    return result.value;
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
