import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { UserRepository } from '../users/user.repository.js';
import type { StoredUser } from '../users/user.repository.js';
import type { AuthSession, PublicUser } from './auth.types.js';

@Injectable()
export class AuthService {
  private readonly sessionTtlMs = 8 * 60 * 60 * 1000;
  private readonly rememberedSessionTtlMs = 30 * 24 * 60 * 60 * 1000;
  private readonly loginAttempts = new Map<string, { count: number; until: number }>();
  private activePasswordHashes = 0;

  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}

  async register(input: Record<string, unknown>): Promise<AuthSession> {
    this.assertBody(input);
    const fullName = this.requiredText(input.fullName, 'Họ và tên', 2, 120);
    const email = this.email(input.email);
    const phone = this.phone(input.phone);
    const password = this.password(input.password, 8);
    if (await this.users.findByEmail(email)) throw new ConflictException('Email này đã được đăng ký.');
    const salt = randomBytes(16).toString('hex');
    const passwordHash = 'scrypt$' + salt + '$' + (await this.hashPassword(password, salt)).toString('hex');
    const user = await this.users.create({ fullName, email, phone, passwordHash, role: 'CUSTOMER' });
    return this.createSession(user);
  }

  async login(input: Record<string, unknown>, remoteAddress?: string): Promise<AuthSession> {
    this.assertBody(input);
    const email = this.email(input.email);
    const password = this.password(input.password, 1);
    this.claimLoginAttempt(remoteAddress);
    const user = await this.users.findByEmail(email);
    const [algorithm, salt, hash] = (user?.passwordHash ?? '').split('$');
    const validFormat = algorithm === 'scrypt' && /^[a-f0-9]{32}$/.test(salt ?? '') && /^[a-f0-9]{128}$/.test(hash ?? '');
    const supplied = await this.hashPassword(password, validFormat ? salt! : '00000000000000000000000000000000');
    const expected = validFormat ? Buffer.from(hash!, 'hex') : Buffer.alloc(64);
    if (!timingSafeEqual(supplied, expected) || !user || !validFormat) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }
    if (user.accountStatus === 'DISABLED') throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa.');
    return this.createSession(user, input.rememberMe === true);
  }

  async createInternalUser(input: Record<string, unknown>) {
    this.assertBody(input);
    const fullName = this.requiredText(input.fullName, 'Họ và tên', 2, 120);
    const email = this.email(input.email);
    const phone = this.phone(input.phone);
    const role = input.role;
    if (role !== 'STAFF' && role !== 'MANAGER') throw new BadRequestException('Admin chỉ được tạo STAFF hoặc MANAGER.');
    if (await this.users.findByEmail(email)) throw new ConflictException('Email này đã được đăng ký.');
    const password = this.password(input.password, 8);
    const salt = randomBytes(16).toString('hex');
    const passwordHash = 'scrypt$' + salt + '$' + (await this.hashPassword(password, salt)).toString('hex');
    return this.toPublicUser(await this.users.create({ fullName, email, phone, passwordHash, role }));
  }

  async getUserByToken(token: string | undefined): Promise<PublicUser> {
    const key = token ? this.tokenKey(token) : '';
    const session = token ? await this.users.findSession(key) : null;
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      if (session) await this.users.deleteSession(key);
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
    const user = await this.users.findById(session.userId);
    if (!user || user.accountStatus === 'DISABLED') {
      await this.users.deleteSession(key);
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ, đã hết hạn hoặc tài khoản đã bị vô hiệu hóa.');
    }
    return this.toPublicUser(user);
  }

  logout(token: string) { return this.users.deleteSession(this.tokenKey(token)); }

  async encodePassword(value: unknown) {
    const password = this.password(value, 8);
    const salt = randomBytes(16).toString('hex');
    return 'scrypt$' + salt + '$' + (await this.hashPassword(password, salt)).toString('hex');
  }

  revokeUserSessions(userId: string) {
    return this.users.deleteUserSessions(userId);
  }

  async updateProfile(actor: PublicUser, input: Record<string, unknown>): Promise<PublicUser> {
    this.assertBody(input);
    if (!Object.keys(input).length || Object.keys(input).some(key => !['fullName', 'phone'].includes(key))) throw new BadRequestException('Chỉ được cập nhật họ tên và số điện thoại của bạn.');
    const data: Partial<Pick<PublicUser, 'fullName' | 'phone'>> = {};
    if (Object.hasOwn(input, 'fullName')) data.fullName = this.requiredText(input.fullName, 'Họ và tên', 2, 120);
    if (Object.hasOwn(input, 'phone')) data.phone = this.phone(input.phone);
    const updated = await this.users.updateProfile(actor.id, data);
    if (!updated || updated.accountStatus !== 'ACTIVE') throw new UnauthorizedException('Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.');
    return this.toPublicUser(updated);
  }

  private async createSession(user: StoredUser, rememberMe = false): Promise<AuthSession> {
    const token = randomBytes(32).toString('hex');
    const ttl = rememberMe ? this.rememberedSessionTtlMs : this.sessionTtlMs;
    await this.users.saveSession({ tokenHash: this.tokenKey(token), userId: user.id, expiresAt: new Date(Date.now() + ttl) });
    return { token, user: this.toPublicUser(user) };
  }

  private tokenKey(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private toPublicUser(user: StoredUser): PublicUser {
    return { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role };
  }
  private hashPassword(password: string, salt: string): Promise<Buffer> {
    if (this.activePasswordHashes >= 8) throw new HttpException('Hệ thống đang xử lý nhiều yêu cầu đăng nhập. Vui lòng thử lại sau.', HttpStatus.TOO_MANY_REQUESTS);
    this.activePasswordHashes++;
    return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)))
      .finally(() => { this.activePasswordHashes--; });
  }
  private claimLoginAttempt(remoteAddress: string | undefined) {
    const now = Date.now();
    for (const [key, attempt] of this.loginAttempts) if (attempt.until <= now) this.loginAttempts.delete(key);
    // Only the server's socket address is supplied by the controller. Never key by email
    // or trust arbitrary forwarded headers, which would allow lockouts/bypasses.
    const key = remoteAddress && isIP(remoteAddress) ? remoteAddress : 'internal';
    const attempt = this.loginAttempts.get(key);
    if (attempt && attempt.count >= 30 || !attempt && this.loginAttempts.size >= 10000) throw new HttpException('Quá nhiều lượt đăng nhập. Vui lòng chờ một phút rồi thử lại.', HttpStatus.TOO_MANY_REQUESTS);
    this.loginAttempts.set(key, { count: (attempt?.count ?? 0) + 1, until: attempt?.until ?? now + 60_000 });
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
