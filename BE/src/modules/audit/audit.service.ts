import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { isIP } from 'node:net';
import { Prisma, type UserRole } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

export type AuditInput = {
  category: 'LOGIN' | 'ACTIVITY'; action: string; resource: string; resourceId?: unknown;
  method: string; route: string; httpStatus: number; actor?: Pick<PublicUser, 'id' | 'fullName' | 'email' | 'role'>; attemptedEmail?: unknown; ipAddress?: string;
};
export const disabledLoginAction = 'AUTH_LOGIN_ACCOUNT_DISABLED';
const accountNoticeActions = ['CREATE', 'UPDATE', 'DISABLE_ACCOUNT', 'REACTIVATE_ACCOUNT'];
const roles = ['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'];
// oxlint-disable-next-line no-control-regex -- Strip control characters from untrusted display fields.
const clean = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || null : null;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: AuditInput) {
    const email = clean(input.actor?.email ?? input.attemptedEmail, 254)?.toLowerCase();
    const data = {
      category: input.category, action: input.action, resource: input.resource,
      resourceId: clean(input.resourceId, 120), method: input.method, route: input.route,
      outcome: input.httpStatus < 400 ? 'SUCCESS' as const : 'FAILURE' as const, httpStatus: input.httpStatus,
      actorId: clean(input.actor?.id, 120), actorName: clean(input.actor?.fullName, 120),
      actorEmail: email && /^\S+@\S+\.\S+$/.test(email) ? email : null,
      actorRole: roles.includes(input.actor?.role ?? '') ? input.actor!.role : null,
      // Do not trust arbitrary X-Forwarded-For values supplied by the client.
      ipAddress: input.ipAddress && isIP(input.ipAddress) ? input.ipAddress : null,
    };
    try { await this.prisma.auditEvent.create({ data }); }
    catch (error) {
      // Preserve completed business operations/login even when audit storage is unavailable.
      // Never log database messages or request/response bodies (credentials, OTP, signatures).
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'UNAVAILABLE';
      this.logger.error(JSON.stringify({ event: 'audit_write_failed', code }));
    }
  }

  async list(query: Record<string, unknown>) {
    const scalar = (name: string, max = 100) => {
      const value = query[name];
      if (value === undefined || value === '') return undefined;
      if (typeof value !== 'string' || value.length > max) throw new BadRequestException(`${name} không hợp lệ.`);
      return value.trim();
    };
    const page = Number(scalar('page', 6) ?? 1), limit = Number(scalar('limit', 3) ?? 20);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Phân trang không hợp lệ.');
    const category = scalar('category'), outcome = scalar('outcome'), role = scalar('role'), search = scalar('search');
    if (category && !['LOGIN', 'ACTIVITY', 'ACCOUNT_NOTICES'].includes(category)) throw new BadRequestException('Nhóm nhật ký không hợp lệ.');
    if (outcome && !['SUCCESS', 'FAILURE'].includes(outcome)) throw new BadRequestException('Kết quả không hợp lệ.');
    if (role && !roles.includes(role)) throw new BadRequestException('Vai trò không hợp lệ.');
    const date = (key: string) => {
      const value = scalar(key, 10);
      if (!value) return undefined;
      const parsed = new Date(value + 'T00:00:00+07:00');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || new Date(parsed.getTime() + 7 * 3600000).toISOString().slice(0, 10) !== value) throw new BadRequestException(`${key} phải là ngày YYYY-MM-DD hợp lệ.`);
      return parsed;
    };
    const from = date('from'), to = date('to');
    const eventId = category === 'ACTIVITY' ? scalar('event', 120) : undefined;
    if (from && to && from > to) throw new BadRequestException('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
    const sessionActions = ['AUTH_LOGIN', 'AUTH_LOGOUT', disabledLoginAction];
    const categoryFilter: Prisma.AuditEventWhereInput = category === 'LOGIN'
      ? { AND: [{ OR: [
          { category: 'LOGIN', action: { in: sessionActions } },
          // Older versions recorded logout under ACTIVITY.
          { category: 'ACTIVITY', action: 'AUTH_LOGOUT' },
        ] }] }
      : category === 'ACTIVITY'
        ? { category: 'ACTIVITY', action: { notIn: sessionActions } }
        : {};
    const where: Prisma.AuditEventWhereInput = {
      ...categoryFilter,
      ...(outcome ? { outcome: outcome as 'SUCCESS' | 'FAILURE' } : {}),
      ...(category === 'ACCOUNT_NOTICES' ? { category: 'ACTIVITY', resource: 'users', outcome: 'SUCCESS', action: { in: accountNoticeActions }, resourceId: { not: null } } : {}),
      ...(eventId ? { id: eventId } : {}),
      ...(role ? { actorRole: role as UserRole } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}) } } : {}),
      ...(search ? { OR: ['actorName', 'actorEmail', 'resourceId', 'resource', 'action'].map(field => ({ [field]: { contains: search, mode: 'insensitive' as const } })) } : {}),
    };
    try {
      const paging = { orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }], skip: (page - 1) * limit, take: limit };
      if (category === 'ACCOUNT_NOTICES') {
        const [total, items] = await Promise.all([
          this.prisma.auditEvent.count({ where }),
          this.prisma.auditEvent.findMany({ where, ...paging, select: { id: true, action: true, outcome: true, resource: true, resourceId: true, createdAt: true } }),
        ]);
        return { page, limit, total, items: await this.withTargetAccounts(items) };
      }
      const [total, items] = await Promise.all([
        this.prisma.auditEvent.count({ where }),
        this.prisma.auditEvent.findMany({ where, ...paging }),
      ]);
      const unnamedLogins = items.filter(item => item.action === 'AUTH_LOGIN' && item.outcome === 'FAILURE' && !item.actorName);
      const emails = [...new Set(unnamedLogins.flatMap(item => item.actorEmail ? [item.actorEmail.toLowerCase()] : []))];
      const accounts = emails.length ? await this.prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true, fullName: true } }) : [];
      const namesByEmail = new Map(accounts.map(account => [account.email, account.fullName]));
      // An email match helps Admin identify the account without attributing the attempt to an authenticated actor.
      const withNames = items.map(item => item.action === 'AUTH_LOGIN' && item.outcome === 'FAILURE' && !item.actorName && item.actorEmail
        ? { ...item, attemptAccountName: namesByEmail.get(item.actorEmail.toLowerCase()) }
        : item);
      return { page, limit, total, items: category === 'ACTIVITY' ? await this.withTargetAccounts(withNames) : withNames };
    } catch {
      throw new ServiceUnavailableException({ code: 'AUDIT_STORAGE_UNAVAILABLE', message: 'Chưa đọc được nhật ký. Kiểm tra kết nối DB và migration nhật ký Admin.' });
    }
  }

  private async withTargetAccounts<T extends { resource: string; resourceId: string | null }>(items: T[]) {
    const ids = [...new Set(items.flatMap(item => item.resource === 'users' && item.resourceId ? [item.resourceId] : []))];
    if (!ids.length) return items;
    const accounts = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, role: true } });
    const byId = new Map(accounts.map(({ id, fullName, role }) => [id, { fullName, role }]));
    return items.map(item => item.resource === 'users' && item.resourceId ? { ...item, targetAccount: byId.get(item.resourceId) ?? null } : item);
  }
}
