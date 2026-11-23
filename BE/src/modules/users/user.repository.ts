import { assertNoOpenAssignments } from '../facility-access/facility-access.service.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import type { Prisma } from '../../generated/prisma/client.js';

export interface StoredUser extends PublicUser { passwordHash: string; accountStatus: 'ACTIVE' | 'DISABLED'; createdAt?: Date; updatedAt?: Date }
export type CreateStoredUser = Omit<StoredUser, 'id' | 'accountStatus'> & { accountStatus?: StoredUser['accountStatus'] };
export const userSorts = ['newest', 'oldest', 'name-asc', 'name-desc'] as const;
export interface UserListFilters { sort?: typeof userSorts[number]; search?: string; role?: PublicUser['role']; accountStatus?: StoredUser['accountStatus'] }
type StoredSession = { tokenHash: string; userId: string; expiresAt: Date };
type SessionAccount = PublicUser & {
  accountStatus: StoredUser['accountStatus'];
  expiresAt: Date;
  revokedByDisable: boolean;
};
const disabledSessionPrefix = 'disabled:';
export type UserProfileChanges = Partial<Pick<PublicUser, 'fullName' | 'phone'>>;
export abstract class UserRepository {
  async authorizeAdministrator(actorId:string) { assertActiveAdmin(await this.findById(actorId)); }

  abstract saveSession(session: StoredSession, passwordHash: string): Promise<boolean>;
  abstract findSessionAccount(tokenHash: string): Promise<SessionAccount | null>;
  abstract deleteSession(tokenHash: string): Promise<void>;
  abstract deleteUserSessions(userId: string): Promise<void>;
  abstract changePassword(id: string, sessionHash: string, previousHash: string, passwordHash: string): Promise<boolean>;
  abstract findByEmail(email: string): Promise<StoredUser | null>;
  abstract findById(id: string): Promise<StoredUser | null>;
  abstract create(input: CreateStoredUser): Promise<StoredUser>;
  abstract list(offset: number, limit: number, filters?: UserListFilters): Promise<StoredUser[]>;
  abstract count(filters?: UserListFilters): Promise<number>;
  abstract updateStatus(id: string, accountStatus: StoredUser['accountStatus'], actorId?: string): Promise<(StoredUser & { statusChanged: boolean }) | null>;
  abstract updateProfile(id: string, data: UserProfileChanges): Promise<StoredUser | null>;
  abstract updateAdminProfile(id: string, data: UserProfileChanges, actorId: string): Promise<StoredUser | null>;
}

function assertActiveAdmin(actor: Pick<StoredUser, 'role' | 'accountStatus'> | null | undefined) {
  if (!actor || actor.role !== 'SYSTEM_ADMINISTRATOR' || actor.accountStatus !== 'ACTIVE') throw new ForbiddenException('Phiên quản trị không còn quyền thay đổi tài khoản.');
}

function assertCanDisableAccount(actorId: string, targetId: string) {
  if (actorId === targetId) throw new BadRequestException('Bạn không thể vô hiệu hóa chính tài khoản đang đăng nhập.');
}

export class MemoryUserRepository extends UserRepository {
  private readonly users = new Map<string, StoredUser>();
  private readonly sessions = new Map<string, StoredSession>();
  async saveSession(session: StoredSession, passwordHash: string) {
    const user = this.users.get(session.userId);
    if (user?.accountStatus !== 'ACTIVE' || user.passwordHash !== passwordHash) return false;
    const now = Date.now();
    for (const [hash, existing] of this.sessions) {
      if (existing.userId === session.userId && existing.expiresAt.getTime() <= now) this.sessions.delete(hash);
    }
    this.sessions.set(session.tokenHash, session);
    return true;
  }
  async findSessionAccount(tokenHash: string) {
    const disabledHash = disabledSessionPrefix + tokenHash;
    const session = this.sessions.get(disabledHash) ?? this.sessions.get(tokenHash);
    if (!session) return null;
    const user = this.users.get(session.userId);
    return user ? { ...user, expiresAt: session.expiresAt, revokedByDisable: session.tokenHash === disabledHash } : null;
  }
  async deleteSession(tokenHash: string) { this.sessions.delete(tokenHash); }
  async deleteUserSessions(userId: string) {
    this.clearSessions(userId);
  }
  private clearSessions(userId: string) {
    for (const [key, session] of this.sessions) if (session.userId === userId) this.sessions.delete(key);
  }
  async changePassword(id: string, sessionHash: string, previousHash: string, passwordHash: string) {
    const user = this.users.get(id), session = this.sessions.get(sessionHash);
    if (user?.accountStatus !== 'ACTIVE' || user.passwordHash !== previousHash || session?.userId !== id || session.expiresAt.getTime() <= Date.now()) return false;
    this.users.set(id, { ...user, passwordHash, updatedAt: new Date() });
    for (const [hash, other] of this.sessions) if (other.userId === id && hash !== sessionHash) this.sessions.delete(hash);
    return true;
  }
  async findByEmail(email: string) {
    return [...this.users.values()].find(user => user.email === email) ?? null;
  }
  async findById(id: string) { return this.users.get(id) ?? null; }
  async updateProfile(id: string, data: UserProfileChanges) {
    const user = this.users.get(id);
    if (!user || user.accountStatus !== 'ACTIVE') return null;
    return this.saveProfile(user, data);
  }
  async updateAdminProfile(id: string, data: UserProfileChanges, actorId: string) {
    assertActiveAdmin(this.users.get(actorId));
    const user = this.users.get(id);
    return user ? this.saveProfile(user, data) : null;
  }
  private saveProfile(user: StoredUser, data: UserProfileChanges) {
    const updated = { ...user, ...data, updatedAt: new Date() };
    this.users.set(user.id, updated);
    return updated;
  }
  async list(offset: number, limit: number, filters: UserListFilters = {}) { const rows = this.filtered(filters);
    const sort = filters.sort ?? 'newest';
    const byName = sort === 'name-asc' || sort === 'name-desc';
    const direction = sort === 'oldest' || sort === 'name-asc' ? 1 : -1;
    return rows.sort((a, b) => direction * (byName ? a.fullName.localeCompare(b.fullName, 'vi')
      : (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)) || a.id.localeCompare(b.id)).slice(offset, offset + limit); }
  async count(filters: UserListFilters = {}) { return this.filtered(filters).length; }
  async updateStatus(id: string, accountStatus: StoredUser['accountStatus'], actorId?: string) {
    if (actorId) {
      assertActiveAdmin(this.users.get(actorId));
      if (accountStatus === 'DISABLED') assertCanDisableAccount(actorId, id);
    }
    const user = this.users.get(id); if (!user) return null;
    if (user.accountStatus === accountStatus) return { ...user, statusChanged: false };
    const now = Date.now();
    for (const [hash, session] of this.sessions) {
      if (session.userId !== id || hash.startsWith(disabledSessionPrefix) || session.expiresAt.getTime() <= now) continue;
      const disabledHash = disabledSessionPrefix + hash;
      this.sessions.delete(hash);
      this.sessions.set(disabledHash, { ...session, tokenHash: disabledHash });
    }
    const updated = { ...user, accountStatus, updatedAt: new Date() }; this.users.set(id, updated); return { ...updated, statusChanged: true };
  }
  async create(input: CreateStoredUser) {
    // Check and insert without an await so concurrent registrations cannot overwrite each other.
    if ([...this.users.values()].some(user => user.email === input.email)) {
      throw new ConflictException('Email này đã được đăng ký.');
    }
    const user: StoredUser = { ...input, accountStatus: input.accountStatus ?? 'ACTIVE', id: randomUUID(), createdAt: new Date() };
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
  async updateProfile(id: string, data: UserProfileChanges) {
    const result = await this.prisma.user.updateMany({ where: { id, accountStatus: 'ACTIVE' }, data });
    return result.count === 1 ? this.findById(id) : null;
  }
  async updateAdminProfile(id: string, data: UserProfileChanges, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.lockAdminChanges(tx, actorId);
      const result = await tx.user.updateMany({ where: { id }, data });
      if (!result.count) return null;
      const user = await tx.user.findUnique({ where: { id } });
      return user ? { ...user, phone: user.phone ?? '' } : null;
    });
  }
  async saveSession(session: StoredSession, passwordHash: string) {
    return this.prisma.$transaction(async tx => {
      // Use the same account row lock as a status update so issuance and revocation cannot interleave.
      const active = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User"
        WHERE id = ${session.userId} AND "accountStatus" = 'ACTIVE' AND "passwordHash" = ${passwordHash} FOR UPDATE`;
      if (!active.length) return false;
      await tx.authSession.deleteMany({ where: { userId: session.userId, expiresAt: { lte: new Date() } } });
      await tx.authSession.create({ data: session });
      return true;
    });
  }
  async findSessionAccount(tokenHash: string) {
    const disabledHash = disabledSessionPrefix + tokenHash;
    const [row] = await this.prisma.$queryRaw<Array<Omit<SessionAccount, 'phone'> & { phone: string | null }>>`
      SELECT u.id, u."fullName", u.email, u.phone, u.role, u."accountStatus", s."expiresAt",
        s."tokenHash" = ${disabledHash} AS "revokedByDisable"
      FROM "AuthSession" s JOIN "User" u ON u.id = s."userId"
      WHERE s."tokenHash" IN (${tokenHash}, ${disabledHash})
      ORDER BY "revokedByDisable" DESC LIMIT 1`;
    return row ? { ...row, phone: row.phone ?? '' } : null;
  }
  async deleteSession(tokenHash: string) { await this.prisma.authSession.deleteMany({ where: { tokenHash } }); }
  async deleteUserSessions(userId: string) { await this.prisma.authSession.deleteMany({ where: { userId } }); }
  async changePassword(id: string, sessionHash: string, previousHash: string, passwordHash: string) {
    return this.prisma.$transaction(async tx => {
      const now = new Date();
      const changed = await tx.user.updateMany({
        where: { id, accountStatus: 'ACTIVE', passwordHash: previousHash, authSessions: { some: { tokenHash: sessionHash, expiresAt: { gt: now } } } },
        data: { passwordHash },
      });
      if (!changed.count) return false;
      const user = await tx.user.findUniqueOrThrow({ where: { id }, select: { email: true } });
      await tx.authSession.deleteMany({ where: { userId: id, tokenHash: { not: sessionHash } } });
      await tx.accountFlowToken.updateMany({ where: { email: user.email, kind: 'RESET', usedAt: null }, data: { usedAt: now } });
      return true;
    });
  }
  async list(offset: number, limit: number, filters: UserListFilters = {}) {
    const sort = filters.sort ?? 'newest';
    const order = sort === 'name-asc' ? { fullName: 'asc' as const }
      : sort === 'name-desc' ? { fullName: 'desc' as const }
      : { createdAt: sort === 'oldest' ? 'asc' as const : 'desc' as const };
    const users = await this.prisma.user.findMany({ where: this.where(filters), skip: offset, take: limit, orderBy: [order, { id: 'asc' }] });
    return users.map(user => ({ ...user, phone: user.phone ?? '' }));
  }
  async count(filters: UserListFilters = {}) { return this.prisma.user.count({ where: this.where(filters) }); }
  async updateStatus(id: string, accountStatus: StoredUser['accountStatus'], actorId?: string) {
    return this.prisma.$transaction(async tx => {
      await this.lockAdminChanges(tx, actorId);
      if (actorId && accountStatus === 'DISABLED') assertCanDisableAccount(actorId, id);
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) return null;
      if (target.accountStatus === accountStatus) return { ...target, phone: target.phone ?? '', statusChanged: false };
      await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', id);
      if(accountStatus==='DISABLED')await assertNoOpenAssignments(tx,id);
      const updated = await tx.user.update({ where: { id }, data: { accountStatus } });
      // Keep a revoked hash to explain the logout even if the account is reactivated first.
      // Also revoke any legacy sessions that predate marking on disable.
      await tx.$executeRaw`UPDATE "AuthSession"
        SET "tokenHash" = ${disabledSessionPrefix} || "tokenHash"
        WHERE "userId" = ${id} AND "expiresAt" > ${new Date()} AND NOT starts_with("tokenHash", ${disabledSessionPrefix})`;
      return { ...updated, phone: updated.phone ?? '', statusChanged: true };
    });
  }
  private async lockAdminChanges(tx: Prisma.TransactionClient, actorId?: string) {
    // Serialize administrative writes and then verify the actor is still active.
    // Two administrators cannot disable one another concurrently.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "role" = 'SYSTEM_ADMINISTRATOR' ORDER BY "id" FOR UPDATE`;
    if (actorId) assertActiveAdmin(await tx.user.findUnique({ where: { id: actorId }, select: { role: true, accountStatus: true } }));
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
