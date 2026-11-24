import { facilityIds } from '../facility-access/facility-access.service.js';
import { assertActiveRole } from '../facility-access/record-access.js';
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
const permissionActions = ['CHANGE_ROLE', 'GRANT_FACILITY_ACCESS', 'REVOKE_FACILITY_ACCESS', 'REVOKE_SESSIONS', 'DISABLE_ACCOUNT', 'REACTIVATE_ACCOUNT'];
const legacyPermissionRoutes = ['/admin/facility-access', '/admin/facility-access/:id/revoke', '/admin/facility-access/users/:id/role', '/admin/users/:id/status'];
const accountNoticeActions = ['CREATE', 'UPDATE', 'DISABLE_ACCOUNT', 'REACTIVATE_ACCOUNT'];
const roles = ['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'];
// oxlint-disable-next-line no-control-regex -- Strip control characters from untrusted display fields.
const clean = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || null : null;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async catalogNotices(actor: PublicUser, query: { page: number; limit: number }) {
    if (actor.role !== 'FACILITY_MANAGER') return [];
    const ids = await facilityIds(this.prisma, { ...actor, selectedFacilityId: undefined });
    if (!ids.length) return [];
    const where = {
      resource: 'shared-service-catalog', action: 'UPDATE_SHARED_SERVICE_CATALOG',
      metadata: { path: ['recipientIds'], array_contains: [actor.id] },
    };
    const [total, records] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where, select: { id: true, resourceId: true, createdAt: true, metadata: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit, take: query.limit,
      }),
    ]);
    const items = records.flatMap(({ metadata, ...record }) => {
      const event = metadata as { code: string; name: string; changes: unknown[];
        grants: { userId: string; facilityId: string }[]; reviewFacilityIds: string[];
      };
      const grants = event.grants.filter(grant => grant.userId === actor.id && ids.includes(grant.facilityId));
      const target = grants.find(grant => event.reviewFacilityIds.includes(grant.facilityId)) ?? grants[0];
      return target ? [{ ...record, code: event.code, name: event.name, changes: event.changes,
        facilityId: target.facilityId, reviewRequired: event.reviewFacilityIds.includes(target.facilityId) }] : [];
    });
    return { items, total, limit: query.limit };
  }

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

  async list(query: Record<string, unknown>,actor:PublicUser) {
    await assertActiveRole(this.prisma,actor,'SYSTEM_ADMINISTRATOR');
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
    const eventId = category === 'ACTIVITY' || category === 'LOGIN' ? scalar('event', 120) : undefined;
    const action = scalar('action', 80), accountId = scalar('accountId', 120), scope = scalar('scope');
    if (scope && (scope !== 'permissions' || category !== 'ACTIVITY')) throw new BadRequestException('Phạm vi nhật ký không hợp lệ.');
    const extraFilters: Prisma.AuditEventWhereInput[] = [];
    if (scope === 'permissions') extraFilters.push({ OR: [{ action: { in: permissionActions } }, { route: { in: legacyPermissionRoutes } }] });
    if (action) {
      const legacy = action === 'CHANGE_ROLE' ? { action: 'ROLE', route: '/admin/facility-access/users/:id/role' }
        : action === 'GRANT_FACILITY_ACCESS' ? { action: 'CREATE', route: '/admin/facility-access' }
        : action === 'REVOKE_FACILITY_ACCESS' ? { action: 'REVOKE', route: '/admin/facility-access/:id/revoke' }
        : undefined;
      extraFilters.push(legacy ? { OR: [{ action }, legacy] } : { action });
    }
    if (accountId) extraFilters.push(category === 'LOGIN'
      ? { actorId: accountId }
      : { OR: [{ actorId: accountId }, { resource: 'users', resourceId: accountId }] });
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
      AND: [categoryFilter, ...extraFilters],
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
      if (category !== 'ACTIVITY') return { page, limit, total, items: withNames };
      const facilityId = (metadata: Prisma.JsonValue) => metadata && typeof metadata === 'object' && !Array.isArray(metadata) &&
        typeof metadata.facilityId === 'string' ? metadata.facilityId : undefined;
      const ids = [...new Set(items.flatMap(item => facilityId(item.metadata) ?? []))];
      const facilities = ids.length ? await this.prisma.facility.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
      const names = new Map(facilities.map(facility => [facility.id, facility.name]));
      const enriched = withNames.map(item => ({ ...item, facilityName: names.get(facilityId(item.metadata) ?? '') }));
      return { page, limit, total, items: await this.withTargetAccounts(enriched) };
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
