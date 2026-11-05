import { BadRequestException, ConflictException, Injectable, UnauthorizedException, HttpException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { EmailService } from './email.service.js';

@Injectable()
export class AccountOnboardingService {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService, private readonly email: EmailService) {}
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  async limit(scope: string, identity: string, maximum = 10) {
    const key = this.hash(scope + ':' + identity), bucket = new Date(Math.floor(Date.now() / 900000) * 900000);
    const result = await this.prisma.accountFlowLimit.upsert({ where: { key }, create: { key, bucket, count: 0 }, update: {} });
    if (result.bucket.getTime() !== bucket.getTime()) await this.prisma.accountFlowLimit.updateMany({ where: { key, bucket: result.bucket }, data: { bucket, count: 0 } });
    const increment = await this.prisma.accountFlowLimit.updateMany({ where: { key, bucket, count: { lt: maximum } }, data: { count: { increment: 1 } } });
    if (!increment.count) throw new HttpException('Bạn thao tác quá nhiều. Vui lòng thử lại sau 15 phút.', 429);
  }
  async verify(token: string) {
    if (typeof token !== 'string' || token.length < 32 || token.length > 200) throw new BadRequestException('Liên kết không hợp lệ.');
    return this.prisma.$transaction(async tx => {
      const record = await tx.guestBookingRequest.findUnique({ where: { claimTokenHash: this.hash(token) }, include: { storageType: true } });
      if (!record || record.status !== 'PENDING_VERIFICATION' || !record.claimTokenExpiresAt || record.claimTokenExpiresAt <= new Date()) throw new ConflictException('Liên kết đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu gửi lại email.');
      const changed = await tx.guestBookingRequest.updateMany({ where: { id: record.id, status: 'PENDING_VERIFICATION', claimTokenHash: this.hash(token), claimTokenExpiresAt: { gt: new Date() } }, data: { status: 'VERIFIED', emailVerifiedAt: new Date(), claimTokenHash: null, claimTokenExpiresAt: null } });
      if (!changed.count) throw new ConflictException('Liên kết đã được sử dụng.');
      const continuationToken = randomBytes(32).toString('base64url');
      await tx.accountFlowToken.create({ data: { kind: 'ONBOARDING', tokenHash: this.hash(continuationToken), email: record.email, bookingCode: record.bookingCode, expiresAt: new Date(Date.now() + 30 * 60000) } });
      return { bookingCode: record.bookingCode, continuationToken, status: 'VERIFIED', storage: { id: record.storageType.id, code: record.storageType.code, name: record.storageType.name }, quantity: record.quantity, startDate: record.startDate.toISOString().slice(0, 10), endDate: record.endDate.toISOString().slice(0, 10), quote: record.quoteSnapshot };
    });
  }
  private async proof(token: unknown, kind: string) {
    if (typeof token !== 'string' || token.length < 32 || token.length > 200) throw new UnauthorizedException('Phiên xác minh không hợp lệ.');
    const record = await this.prisma.accountFlowToken.findUnique({ where: { tokenHash: this.hash(token) } });
    if (!record || record.kind !== kind || record.usedAt || record.expiresAt <= new Date()) throw new UnauthorizedException('Phiên xác minh đã hết hạn hoặc đã dùng.');
    return record;
  }
  async context(token: unknown) {
    const proof = await this.proof(token, 'ONBOARDING');
    const guest = await this.prisma.guestBookingRequest.findUniqueOrThrow({ where: { bookingCode: proof.bookingCode! }, include: { storageType: true } });
    const user = await this.prisma.user.findUnique({ where: { email: proof.email } });
    return { email: proof.email, existingAccount: Boolean(user), bookingCode: guest.bookingCode, storage: guest.storageType.name, startDate: guest.startDate.toISOString().slice(0, 10), endDate: guest.endDate.toISOString().slice(0, 10), quantity: guest.quantity, quote: guest.quoteSnapshot, status: guest.status };
  }
  async setup(input: Record<string, unknown>) {
    if (input.password !== input.confirmPassword) throw new BadRequestException('Mật khẩu xác nhận không khớp.');
    const proof = await this.proof(input.token, 'ONBOARDING');
    const guest = await this.prisma.guestBookingRequest.findUniqueOrThrow({ where: { bookingCode: proof.bookingCode! } });
    if (guest.status !== 'VERIFIED') throw new ConflictException('Yêu cầu không còn ở bước tạo tài khoản.');
    // Register always creates CUSTOMER, hashes with the existing password policy and rejects duplicate email.
    const session = await this.auth.register({ email: proof.email, fullName: guest.fullName, phone: guest.phone, password: input.password });
    await this.prisma.accountFlowToken.update({ where: { id: proof.id }, data: { usedAt: new Date() } });
    return session;
  }
  async requestReset(input: Record<string, unknown>) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new BadRequestException('Email không hợp lệ.');
    await this.limit('reset-email', email, 5);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.accountStatus !== 'DISABLED') {
      const token = randomBytes(32).toString('base64url');
      const saved = await this.prisma.accountFlowToken.create({ data: { kind: 'RESET', tokenHash: this.hash(token), email, expiresAt: new Date(Date.now() + 30 * 60000) } });
      try { await this.email.sendPasswordReset(email, token); }
      catch { await this.prisma.accountFlowToken.update({ where: { id: saved.id }, data: { usedAt: new Date() } }); }
    }
    return { message: 'Nếu email có tài khoản phù hợp, hướng dẫn đặt lại mật khẩu sẽ được gửi. Vui lòng kiểm tra hộp thư.' };
  }
  async reset(input: Record<string, unknown>) {
    if (input.password !== input.confirmPassword) throw new BadRequestException('Mật khẩu xác nhận không khớp.');
    const proof = await this.proof(input.token, 'RESET');
    const passwordHash = await this.auth.encodePassword(input.password);
    const userId = await this.prisma.$transaction(async tx => {
      const changed = await tx.accountFlowToken.updateMany({ where: { id: proof.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (!changed.count) throw new UnauthorizedException('Liên kết đã được dùng.');
      const user = await tx.user.findUnique({ where: { email: proof.email } });
      if (!user || user.accountStatus === 'DISABLED') throw new UnauthorizedException('Không thể đặt lại mật khẩu.');
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.accountFlowToken.updateMany({ where: { email: proof.email, kind: 'RESET', usedAt: null }, data: { usedAt: new Date() } });
      return user.id;
    });
    this.auth.revokeUserSessions(userId);
    return { message: 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới để tiếp tục.' };
  }
  async resend(input: Record<string, unknown>) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    await this.limit('verification-email', email, 5);
    const record = typeof input.bookingCode === 'string' ? await this.prisma.guestBookingRequest.findUnique({ where: { bookingCode: input.bookingCode }, include: { storageType: true } }) : null;
    if (record && record.email === email && ['PENDING_VERIFICATION', 'EXPIRED', 'VERIFIED'].includes(record.status)) {
      const token = randomBytes(32).toString('base64url');
      const changed = await this.prisma.guestBookingRequest.updateMany({ where: { id: record.id, status: record.status, claimTokenHash: record.claimTokenHash }, data: { status: 'PENDING_VERIFICATION', emailVerifiedAt: null, claimTokenHash: this.hash(token), claimTokenExpiresAt: new Date(Date.now() + 3600000) } });
      if (changed.count) {
        const quote = record.quoteSnapshot as any;
        try { await this.email.sendBookingClaim({ to: email, fullName: record.fullName, bookingCode: record.bookingCode, storageName: record.storageType.name, startDate: record.startDate.toISOString().slice(0, 10), endDate: record.endDate.toISOString().slice(0, 10), quantity: record.quantity, paymentPlan: record.paymentPlan, rentalAmount: quote.rentalAmount, discountAmount: quote.discountAmount, depositAmount: quote.depositAmount, initialAmountDue: quote.estimatedInitialAmountDue, claimToken: token, expiresInMinutes: 60 }); } catch { /* Same public response prevents booking/email enumeration. */ }
      }
    }
    return { message: 'Nếu thông tin khớp yêu cầu còn hiệu lực, liên kết xác minh mới sẽ được gửi.' };
  }
}
