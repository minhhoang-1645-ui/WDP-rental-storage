import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { UserRepository } from '../users/user.repository.js';
import type { StoredUser } from '../users/user.repository.js';
import type { AuthSession, PublicUser } from './auth.types.js';

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, { userId: string; expiresAt: number }>();
  private readonly sessionTtlMs = 8 * 60 * 60 * 1000;

  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}

  async register(input: Record<string, unknown>): Promise<AuthSession> {
    this.assertBody(input);
    const fullName = this.requiredText(input.fullName, 'Họ và tên', 2, 120);
    const email = this.email(input.email);
    const phone = this.requiredText(input.phone, 'Số điện thoại', 8, 25);
    if (!/^\+?[\d\s().-]{8,25}$/.test(phone)) throw new BadRequestException('Số điện thoại không hợp lệ.');
    const password = this.password(input.password, 8);
    if (await this.users.findByEmail(email)) throw new ConflictException('Email này đã được đăng ký.');
    const salt = randomBytes(16).toString('hex');
    const passwordHash = 'scrypt$' + salt + '$' + (await this.hashPassword(password, salt)).toString('hex');
    const user = await this.users.create({ fullName, email, phone, passwordHash, role: 'CUSTOMER' });
    return this.createSession(user);
  }

  async login(input: Record<string, unknown>): Promise<AuthSession> {
    this.assertBody(input);
    const email = this.email(input.email);
    const password = this.password(input.password, 1);
    const user = await this.users.findByEmail(email);
    const [algorithm, salt, hash] = (user?.passwordHash ?? '').split('$');
    const validFormat = algorithm === 'scrypt' && /^[a-f0-9]{32}$/.test(salt ?? '') && /^[a-f0-9]{128}$/.test(hash ?? '');
    const supplied = await this.hashPassword(password, validFormat ? salt! : '00000000000000000000000000000000');
    const expected = validFormat ? Buffer.from(hash!, 'hex') : Buffer.alloc(64);
    if (!timingSafeEqual(supplied, expected) || !user || !validFormat) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }
    return this.createSession(user);
  }

  async getUserByToken(token: string | undefined): Promise<PublicUser> {
    const key = token ? this.tokenKey(token) : '';
    const session = this.sessions.get(key);
    if (!session || session.expiresAt <= Date.now()) {
      this.sessions.delete(key);
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
    const user = await this.users.findById(session.userId);
    if (!user) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    return this.toPublicUser(user);
  }

  logout(token: string) { this.sessions.delete(this.tokenKey(token)); }

  private createSession(user: StoredUser): AuthSession {
    for (const [key, session] of this.sessions) {
      if (session.expiresAt <= Date.now()) this.sessions.delete(key);
    }
    const token = randomBytes(32).toString('hex');
    this.sessions.set(this.tokenKey(token), { userId: user.id, expiresAt: Date.now() + this.sessionTtlMs });
    return { token, user: this.toPublicUser(user) };
  }

  private tokenKey(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private toPublicUser(user: StoredUser): PublicUser {
    return { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role };
  }
  private hashPassword(password: string, salt: string): Promise<Buffer> {
    return new Promise((resolve, reject) => scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
  }
  private assertBody(input: unknown): asserts input is Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Dữ liệu không hợp lệ.');
  }
  private email(value: unknown) {
    const email = this.requiredText(value, 'Email', 5, 254).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestException('Email không hợp lệ.');
    return email;
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
