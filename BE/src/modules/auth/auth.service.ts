import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { AuthSession, PublicUser } from './auth.types.js';

interface StoredUser extends PublicUser {
  passwordHash: string;
  passwordSalt: string;
}

@Injectable()
export class AuthService {
  private readonly users: StoredUser[] = [];
  private readonly sessions = new Map<string, string>();

  register(input: Record<string, unknown>): AuthSession {
    const fullName = this.requiredText(input.fullName, 'Họ và tên', 2);
    const email = this.requiredText(input.email, 'Email', 5).toLowerCase();
    const phone = this.requiredText(input.phone, 'Số điện thoại', 8);
    const password = this.requiredText(input.password, 'Mật khẩu', 8);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestException('Email không hợp lệ.');
    if (this.users.some((user) => user.email === email)) throw new ConflictException('Email này đã được đăng ký.');

    const passwordSalt = randomBytes(16).toString('hex');
    const user: StoredUser = {
      id: randomUUID(),
      fullName,
      email,
      phone,
      role: 'CUSTOMER',
      passwordSalt,
      passwordHash: this.hashPassword(password, passwordSalt),
    };
    this.users.push(user);
    return this.createSession(user);
  }

  login(input: Record<string, unknown>): AuthSession {
    const email = this.requiredText(input.email, 'Email', 5).toLowerCase();
    const password = this.requiredText(input.password, 'Mật khẩu', 1);
    const user = this.users.find((candidate) => candidate.email === email);
    if (!user) throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    const supplied = Buffer.from(this.hashPassword(password, user.passwordSalt), 'hex');
    const expected = Buffer.from(user.passwordHash, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }
    return this.createSession(user);
  }

  getUserByToken(token: string | undefined): PublicUser {
    const userId = token ? this.sessions.get(token) : undefined;
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    return this.toPublicUser(user);
  }

  private createSession(user: StoredUser): AuthSession {
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, user.id);
    return { token, user: this.toPublicUser(user) };
  }

  private toPublicUser(user: StoredUser): PublicUser {
    return { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role };
  }

  private hashPassword(password: string, salt: string) {
    return scryptSync(password, salt, 64).toString('hex');
  }

  private requiredText(value: unknown, label: string, minimumLength: number) {
    if (typeof value !== 'string' || value.trim().length < minimumLength) {
      throw new BadRequestException(`${label} phải có ít nhất ${minimumLength} ký tự.`);
    }
    return value.trim();
  }
}
