import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

export interface StoredUser extends PublicUser { passwordHash: string }
export abstract class UserRepository {
  abstract findByEmail(email: string): Promise<StoredUser | null>;
  abstract findById(id: string): Promise<StoredUser | null>;
  abstract create(input: Omit<StoredUser, 'id'>): Promise<StoredUser>;
  abstract list(offset: number, limit: number): Promise<StoredUser[]>;
}

export class MemoryUserRepository extends UserRepository {
  private readonly users = new Map<string, StoredUser>();
  async findByEmail(email: string) {
    return [...this.users.values()].find(user => user.email === email) ?? null;
  }
  async findById(id: string) { return this.users.get(id) ?? null; }
  async list(offset: number, limit: number) { return [...this.users.values()].slice(offset, offset + limit); }
  async create(input: Omit<StoredUser, 'id'>) {
    // Check and insert without an await so concurrent registrations cannot overwrite each other.
    if ([...this.users.values()].some(user => user.email === input.email)) {
      throw new ConflictException('Email này đã được đăng ký.');
    }
    const user = { ...input, id: randomUUID() };
    this.users.set(user.id, user);
    return user;
  }
}

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly prisma: PrismaService) { super(); }
  async list(offset: number, limit: number) {
    const users = await this.prisma.user.findMany({ skip: offset, take: limit, orderBy: { id: 'asc' } });
    return users.map(user => ({ ...user, phone: user.phone ?? '' }));
  }
  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? { ...user, phone: user.phone ?? '' } : null;
  }
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? { ...user, phone: user.phone ?? '' } : null;
  }
  async create(input: Omit<StoredUser, 'id'>) {
    try {
      const user = await this.prisma.user.create({ data: input });
      return { ...user, phone: user.phone ?? '' };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Email này đã được đăng ký.');
      }
      throw error;
    }
  }
}
