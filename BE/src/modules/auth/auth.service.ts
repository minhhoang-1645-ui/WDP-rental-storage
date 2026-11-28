import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { UserRepository } from '../users/user.repository.js';
import type { StoredUser, UserProfileChanges } from '../users/user.repository.js';
import type { AuthSession, PublicUser } from './auth.types.js';
import { AccountDisabledException } from './auth.errors.js';

const sessionEndMessage = {
  FACILITY_ACCESS_REVOKED: 'Quyền truy cập cơ sở đã thay đổi. Vui lòng đăng nhập lại để tiếp tục.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.',
  SESSION_INVALID: 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.',
};
function sessionDevice(userAgent?: string) {
  if (!userAgent) return undefined;
  const browser = /Edg(?:A|iOS)?\//.test(userAgent) ? 'Edge'
    : /(?:Firefox|FxiOS)\//.test(userAgent) ? 'Firefox'
    : /(?:Chrome|CriOS)\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari' : undefined;
  const platform = /Android/i.test(userAgent) ? 'Android'
    : /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS'
    : /Windows/i.test(userAgent) ? 'Windows'
    : /Macintosh/i.test(userAgent) ? 'macOS'
    : /Linux/i.test(userAgent) ? 'Linux' : undefined;
  return [browser, platform].filter(Boolean).join(' · ') || undefined;
}

const sessionEnded = (code: keyof typeof sessionEndMessage) => new UnauthorizedException({ statusCode: 401, code, message: sessionEndMessage[code] });

@Injectable()
export class AuthService {
  private readonly sessionTtlMs = 8 * 60 * 60 * 1000;
  private readonly rememberedSessionTtlMs = 30 * 24 * 60 * 60 * 1000;
  private readonly loginAttempts = new Map<string, { count: number; until: number }>();
  private readonly passwordChangeAttempts = new Map<string, { count: number; until: number }>();
  private activePasswordHashes = 0;

  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}

  async register(input: Record<string, unknown>, userAgent?: string): Promise<AuthSession> {
    this.assertBody(input);
    const fullName = this.requiredText(input.fullName, 'Họ và tên', 2, 120);
    const email = this.email(input.email);
    const phone = this.phone(input.phone);
    const password = this.password(input.password, 8);
    if (await this.users.findByEmail(email)) throw new ConflictException('Email này đã được đăng ký.');
    const salt = randomBytes(16).toString('hex');
    const passwordHash = 'scrypt$' + salt + '$' + (await this.hashPassword(password, salt)).toString('hex');
    const user = await this.users.create({ fullName, email, phone, passwordHash, role: 'STORAGE_CUSTOMER' });
    return this.createSession(user, false, userAgent);
  }

  async login(input: Record<string, unknown>, remoteAddress?: string, userAgent?: string): Promise<AuthSession> {
    this.assertBody(input);
    const email = this.email(input.email);
    const password = this.password(input.password, 1);
    this.claimLoginAttempt(remoteAddress);
    const user = await this.users.findByEmail(email);
    if (!await this.matchesPassword(password, user?.passwordHash) || !user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }
    if (user.accountStatus === 'DISABLED') throw new AccountDisabledException(user);
    return this.createSession(user, input.rememberMe === true, userAgent);
  }

  async createInternalUser(input: Record<string, unknown>, actor: PublicUser) {
    await this.users.authorizeAdministrator(actor.id);
    this.assertBody(input);
    const fullName = this.requiredText(input.fullName, 'Họ và tên', 2, 120);
    const email = this.email(input.email);
    const phone = this.phone(input.phone);
    const role = input.role;
    if (role !== 'FACILITY_STAFF' && role !== 'FACILITY_MANAGER' && role !== 'BUSINESS_OPERATIONS_MANAGER') throw new BadRequestException('Chỉ được tạo tài khoản nhân viên, quản lý cơ sở hoặc điều hành kinh doanh.');
    if (await this.users.findByEmail(email)) throw new ConflictException('Email này đã được đăng ký.');
    const password = this.password(input.password, 8);
    const salt = randomBytes(16).toString('hex');
    const passwordHash = 'scrypt$' + salt + '$' + (await this.hashPassword(password, salt)).toString('hex');
    return this.toPublicUser(await this.users.create({ fullName, email, phone, passwordHash, role }));
  }

  async getUserByToken(token: string | undefined): Promise<PublicUser> {
    const account = token ? await this.users.findSessionAccount(this.tokenKey(token)) : null;
    if (!account) throw sessionEnded('SESSION_INVALID');
    if (account.revokedByDisable) throw new AccountDisabledException();
    if (account.revokedAt) throw sessionEnded(account.revocationReason === 'FACILITY_ACCESS_REVOKED' ? 'FACILITY_ACCESS_REVOKED' : 'SESSION_INVALID');
    if (account.expiresAt.getTime() <= Date.now()) throw sessionEnded('SESSION_EXPIRED');
    if (account.accountStatus === 'DISABLED') throw new AccountDisabledException();
    return this.toPublicUser(account);
  }

  logout(token: string) { return this.users.deleteSession(this.tokenKey(token)); }

  async changePassword(actor: PublicUser, token: string, input: Record<string, unknown>) {
    this.assertBody(input);
    if (Object.keys(input).some(key => key !== 'currentPassword' && key !== 'newPassword')) throw new BadRequestException('Dữ liệu đổi mật khẩu không hợp lệ.');
    const currentPassword = this.password(input.currentPassword, 1);
    const newPassword = this.password(input.newPassword, 8);
    this.claimAttempt(this.passwordChangeAttempts, actor.id, 5, 15 * 60_000, 'Bạn đã thử đổi mật khẩu quá nhiều lần. Vui lòng thử lại sau 15 phút.');
    const user = await this.users.findById(actor.id);
    if (!user) throw sessionEnded('SESSION_INVALID');
    if (user.accountStatus === 'DISABLED') throw new AccountDisabledException();
    if (!await this.matchesPassword(currentPassword, user.passwordHash)) throw new BadRequestException('Mật khẩu hiện tại không đúng.');
    if (newPassword === currentPassword) throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    const passwordHash = await this.encodePassword(newPassword);
    const changed = await this.users.changePassword(actor.id, this.tokenKey(token), user.passwordHash, passwordHash).catch(() => {
      // Keep database errors with credential arguments out of the HTTP exception logs.
      throw new ServiceUnavailableException('Chưa đổi được mật khẩu. Vui lòng thử lại.');
    });
    if (!changed) throw new ConflictException('Thông tin đăng nhập đã thay đổi. Hãy tải lại trang và thử lại.');
    this.passwordChangeAttempts.delete(actor.id);
  }

  async encodePassword(value: unknown) {
    const password = this.password(value, 8);
    const salt = randomBytes(16).toString('hex');
    return 'scrypt$' + salt + '$' + (await this.hashPassword(password, salt)).toString('hex');
  }

  async encodeReplacementPassword(value: unknown, currentHash: string) {
    const password = this.password(value, 8);
    if (await this.matchesPassword(password, currentHash)) return null;
    return this.encodePassword(password);
  }

  revokeUserSessions(userId: string) {
    return this.users.deleteUserSessions(userId);
  }

  async updateProfile(actor: PublicUser, input: Record<string, unknown>): Promise<PublicUser> {
    const updated = await this.users.updateProfile(actor.id, this.profileChanges(input));
    if (!updated) {
      if ((await this.users.findById(actor.id))?.accountStatus === 'DISABLED') throw new AccountDisabledException();
      throw sessionEnded('SESSION_INVALID');
    }
    if (updated.accountStatus === 'DISABLED') throw new AccountDisabledException();
    return this.toPublicUser(updated);
  }

  updateAdminProfile(actor: PublicUser, id: string, input: Record<string, unknown>) {
    return this.users.updateAdminProfile(id, this.profileChanges(input), actor.id);
  }

  private profileChanges(input: Record<string, unknown>): UserProfileChanges {
    this.assertBody(input);
    if (!Object.keys(input).length || Object.keys(input).some(key => !['fullName', 'phone'].includes(key))) throw new BadRequestException('Chỉ được cập nhật họ tên và số điện thoại.');
    const data: UserProfileChanges = {};
    if (Object.hasOwn(input, 'fullName')) data.fullName = this.requiredText(input.fullName, 'Họ và tên', 2, 120);
    if (Object.hasOwn(input, 'phone')) data.phone = this.phone(input.phone);
    return data;
  }

  private async createSession(user: StoredUser, rememberMe = false, userAgent?: string): Promise<AuthSession> {
    const token = randomBytes(32).toString('hex');
    const ttl = rememberMe ? this.rememberedSessionTtlMs : this.sessionTtlMs;
    const createdAt = new Date();
    const saved = await this.users.saveSession({
      tokenHash: this.tokenKey(token), userId: user.id, createdAt,
      expiresAt: new Date(createdAt.getTime() + ttl), device: sessionDevice(userAgent),
    }, user.passwordHash);
    if (!saved) {
      const current = await this.users.findById(user.id);
      if (current?.accountStatus === 'DISABLED') throw new AccountDisabledException(current);
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }
    return { token, user: this.toPublicUser(user) };
  }

  private tokenKey(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private toPublicUser(user: PublicUser): PublicUser {
    return { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role };
  }
  private hashPassword(password: string, salt: string): Promise<Buffer> {
    if (this.activePasswordHashes >= 8) throw new HttpException('Hệ thống đang xử lý nhiều yêu cầu đăng nhập. Vui lòng thử lại sau.', HttpStatus.TOO_MANY_REQUESTS);
    this.activePasswordHashes++;
    return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)))
      .finally(() => { this.activePasswordHashes--; });
  }
  private claimLoginAttempt(remoteAddress: string | undefined) {
    // Only the server's socket address is supplied by the controller. Never key by email
    // or trust arbitrary forwarded headers, which would allow lockouts/bypasses.
    const key = remoteAddress && isIP(remoteAddress) ? remoteAddress : 'internal';
    this.claimAttempt(this.loginAttempts, key, 30, 60_000, 'Quá nhiều lượt đăng nhập. Vui lòng chờ một phút rồi thử lại.');
  }

  private claimAttempt(attempts: Map<string, { count: number; until: number }>, key: string, maximum: number, windowMs: number, message: string) {
    const now = Date.now();
    for (const [expiredKey, attempt] of attempts) if (attempt.until <= now) attempts.delete(expiredKey);
    const attempt = attempts.get(key);
    if (attempt && attempt.count >= maximum || !attempt && attempts.size >= 10000) throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    attempts.set(key, { count: (attempt?.count ?? 0) + 1, until: attempt?.until ?? now + windowMs });
  }

  private async matchesPassword(password: string, encoded = '') {
    const [algorithm, salt, hash] = encoded.split('$');
    const validFormat = algorithm === 'scrypt' && /^[a-f0-9]{32}$/.test(salt ?? '') && /^[a-f0-9]{128}$/.test(hash ?? '');
    const supplied = await this.hashPassword(password, validFormat ? salt! : '00000000000000000000000000000000');
    const expected = validFormat ? Buffer.from(hash!, 'hex') : Buffer.alloc(64);
    return timingSafeEqual(supplied, expected) && validFormat;
  }
  private assertBody(input: unknown): asserts input is Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Dữ liệu không hợp lệ.');
  }
  private email(value: unknown) {
    const email = this.requiredText(value, 'Email', 5, 254).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestException('Email không hợp lệ.');
    return email;
  }
  private phone(value: unknown) {
    const phone = this.requiredText(value, 'Số điện thoại', 8, 25);
    const digits = phone.replace(/\D/g, '');
    if (!/^\+?[\d\s().-]{8,25}$/.test(phone) || digits.length < 8 || digits.length > 15) throw new BadRequestException('Số điện thoại không hợp lệ.');
    return phone;
  }
  private password(value: unknown, minimum: number) {
    if (typeof value !== 'string' || value.length < minimum || value.length > 128 || !value.trim()) {
      throw new BadRequestException(`Mật khẩu phải có ${minimum}–128 ký tự.`);
    }
    return value;
  }
  private requiredText(value: unknown, label: string, minimum: number, maximum: number) {
    if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > maximum) {
      throw new BadRequestException(`${label} phải có ${minimum}–${maximum} ký tự.`);
    }
    return value.trim();
  }
}
