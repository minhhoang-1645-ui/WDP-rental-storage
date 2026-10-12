import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

export interface StoredUser extends PublicUser { passwordHash: string; accountStatus: 'ACTIVE' | 'DISABLED' }
export type CreateStoredUser = Omit<StoredUser, 'id' | 'accountStatus'> & { accountStatus?: StoredUser['accountStatus'] };
export interface UserListFilters { search?: string; role?: PublicUser['role']; accountStatus?: StoredUser['accountStatus'] }
export abstract class UserRepository {
  abstract findByEmail(email: string): Promise<StoredUser | null>;
  abstract findById(id: string): Promise<StoredUser | null>;
  abstract create(input: CreateStoredUser): Promise<StoredUser>;
  abstract list(offset: number, limit: number, filters?: UserListFilters): Promise<StoredUser[]>;
  abstract count(filters?: UserListFilters): Promise<number>;
  abstract updateStatus(id: string, accountStatus: StoredUser['accountStatus']): Promise<StoredUser | null>;
}

export class MemoryUserRepository extends UserRepository {
  private readonly users = new Map<string, StoredUser>();
  async findByEmail(email: string) {
    return [...this.users.values()].find(user => user.email === email) ?? null;
  }
  async findById(id: string) { return this.users.get(id) ?? null; }
  async list(offset: number, limit: number, filters: UserListFilters = {}) { return this.filtered(filters).slice(offset, offset + limit); }
  async count(filters: UserListFilters = {}) { return this.filtered(filters).length; }
  async updateStatus(id: string, accountStatus: StoredUser['accountStatus']) {
    const user = this.users.get(id); if (!user) return null;
    const updated = { ...user, accountStatus }; this.users.set(id, updated); return updated;
  }
  async create(input: CreateStoredUser) {
    // Check and insert without an await so concurrent registrations cannot overwrite each other.
    if ([...this.users.values()].some(user => user.email === input.email)) {
      throw new ConflictException('Email này đã được đăng ký.');
    }
    const user: StoredUser = { ...input, accountStatus: input.accountStatus ?? 'ACTIVE', id: randomUUID() };
    this.users.set(user.id, user);
    return user;
  }
  private filtered(filters: UserListFilters) {
    const search = filters.search?.toLowerCase();
    return [...this.users.values()].filter((user) => (!filters.role || user.role === filters.role)
      && (!filters.accountStatus || user.accountStatus === filters.accountStatus)
      && (!search || [user.fullName, user.email, user.phone].some((value) => value.toLowerCase().includes(search))));
  }
}

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly prisma: PrismaService) { super(); }
  async list(offset: number, limit: number, filters: UserListFilters = {}) {
    const users = await this.prisma.user.findMany({ where: this.where(filters), skip: offset, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
    return users.map(user => ({ ...user, phone: user.phone ?? '' }));
  }
  async count(filters: UserListFilters = {}) { return this.prisma.user.count({ where: this.where(filters) }); }
  async updateStatus(id: string, accountStatus: StoredUser['accountStatus']) {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return null;
    const user = await this.prisma.user.update({ where: { id }, data: { accountStatus } });
    return { ...user, phone: user.phone ?? '' };
  }
  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? { ...user, phone: user.phone ?? '' } : null;
  }
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? { ...user, phone: user.phone ?? '' } : null;
  }
  async create(input: CreateStoredUser) {
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
  private where(filters: UserListFilters) {
    return {
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.accountStatus ? { accountStatus: filters.accountStatus } : {}),
      ...(filters.search ? { OR: [
        { fullName: { contains: filters.search, mode: 'insensitive' as const } },
        { email: { contains: filters.search, mode: 'insensitive' as const } },
        { phone: { contains: filters.search, mode: 'insensitive' as const } },
      ] } : {}),
    };
  }
}
