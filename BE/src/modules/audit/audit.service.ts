import { facilityIds } from '../facility-access/facility-access.service.js';
import { assertActiveRole } from '../facility-access/record-access.js';
import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { isIP } from 'node:net';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

export type AuditInput = {
  category: 'LOGIN' | 'ACTIVITY'; action: string; resource: string; resourceId?: unknown;
  method: string; route: string; httpStatus: number; actor?: Pick<PublicUser, 'id' | 'fullName' | 'email' | 'role'>; attemptedEmail?: unknown; ipAddress?: string; metadata?: Prisma.InputJsonObject;
};
export const disabledLoginAction = 'AUTH_LOGIN_ACCOUNT_DISABLED';
const permissionActions = ['CHANGE_ROLE', 'GRANT_FACILITY_ACCESS', 'REVOKE_FACILITY_ACCESS', 'REVOKE_SESSION', 'REVOKE_SESSIONS', 'DISABLE_ACCOUNT', 'REACTIVATE_ACCOUNT'];
const relocationAction = 'RELOCATE_FACILITY_ACCESS';
const relocationRoute = '/admin/facility-access/users/:id/relocate';
const roleChangeRoute = '/admin/facility-access/users/:id/role';
const grantRoutes = ['/admin/facility-access', '/admin/facility-access/:id/revoke'];
const legacyPermissionRoutes = [...grantRoutes, roleChangeRoute, relocationRoute, '/admin/users/:id/status'];
const accountNoticeActions = ['CREATE', 'UPDATE', ...permissionActions];
const legacyAccountNotices = [
  { route: roleChangeRoute, action: 'ROLE', titleAction: 'CHANGE_ROLE' },
  { route: grantRoutes[0], action: 'CREATE', titleAction: 'GRANT_FACILITY_ACCESS' },
  { route: grantRoutes[1], action: 'REVOKE', titleAction: 'REVOKE_FACILITY_ACCESS' },
];
const historicalRoles: Record<string, string> = { STORAGE_CUSTOMER: 'CUSTOMER', FACILITY_MANAGER: 'MANAGER', FACILITY_STAFF: 'STAFF' };
const roles = ['STORAGE_CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPERATIONS_MANAGER', 'SYSTEM_ADMINISTRATOR'];
// oxlint-disable-next-line no-control-regex -- Strip control characters from untrusted display fields.
const clean = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || null : null;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async priceRangeNotices(actor: PublicUser, { page, limit }: { page: number; limit: number }) {
    if (actor.role !== 'FACILITY_MANAGER') return [];
    const ids = await facilityIds(this.prisma, { ...actor, selectedFacilityId: undefined });
    if (!ids.length) return [];
    const where: Prisma.AuditEventWhereInput = { resource: 'pricing-rules', action: 'PUBLISH_GROUP_PRICE_RANGE', outcome: 'SUCCESS',
      resourceId: { in: ids } };
    const [total, items] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({ where, select: { id: true, resourceId: true, createdAt: true, metadata: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    ]);
    return { items, total, limit };
  }

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

  async facilityLifecycleNotices(actor: PublicUser, query: { page: number; limit: number }) {
    const customer = actor.role === 'STORAGE_CUSTOMER';
    if (!customer && actor.role !== 'FACILITY_MANAGER') return [];
    const ids = customer ? [] : await facilityIds(this.prisma, { ...actor, selectedFacilityId: undefined });
    if (!customer && !ids.length) return [];
    const where: Prisma.AuditEventWhereInput = {
      resource: 'facility', outcome: 'SUCCESS',
      ...(customer
        ? { action: { in: ['FACILITY_LIFECYCLE', 'MANAGER_CLOSURE_NOTICE'] }, metadata: { path: ['customerRecipientIds'], array_contains: [actor.id] } }
        : { resourceId: { in: ids }, OR: [
          { action: 'FACILITY_LIFECYCLE', metadata: { path: ['statusChanged'], equals: true } },
          { action: 'FACILITY_SCHEDULE_IMPACT' },
        ] }),
    };
    const [total, items] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where, select: { id: true, action: true, createdAt: true, metadata: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit, take: query.limit,
      }),
    ]);
    return { total, items, limit: query.limit };
  }

  async relocationNotices(actor: PublicUser, query: { page: number; limit: number }) {
    const customer = actor.role === 'STORAGE_CUSTOMER';
    if (!customer && !['FACILITY_MANAGER', 'FACILITY_STAFF'].includes(actor.role)) return [];
    const ids = customer ? [] : await facilityIds(this.prisma, { ...actor, selectedFacilityId: undefined });
    if (!customer && !ids.length) return [];
    const staffLinks = actor.role === 'FACILITY_STAFF' ? await Promise.all([
      this.prisma.transferRequest.findMany({ where: { closurePlanId: { not: null }, OR: [
        { assignedStaffUserId: actor.id, fromStorageUnit: { storageType: { facilityId: { in: ids } } } },
        { receivingStaffId: actor.id, toStorageUnit: { storageType: { facilityId: { in: ids } } } },
      ] }, select: { id: true } }),
      this.prisma.supportRequest.findMany({ where: { closurePlanId: { not: null }, assignedStaffUserId: actor.id,
        storageUnit: { storageType: { facilityId: { in: ids } } } }, select: { id: true } }),
    ]) : null;
    const scope: Prisma.AuditEventWhereInput = customer
      ? { metadata: { path: ['customerId'], equals: actor.id }, action: { notIn: ['RELOCATION_PROPOSED', 'RELOCATION_DESTINATION_REJECTED'] } }
      : { AND: [
        { OR: ids.flatMap(id => ['sourceFacilityId','destinationFacilityId'].map(field => ({ metadata: { path: [field], equals: id } }))) },
        ...(staffLinks ? [{ resourceId: { in: staffLinks.flat().map(row => row.id) } },
          { metadata: { path: ['staffRecipientIds'], array_contains: [actor.id] } }] : []),
      ] };
    const where: Prisma.AuditEventWhereInput = { resource: 'relocation', outcome: 'SUCCESS', ...scope };
    const [total, items] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({ where, select: { id: true, action: true, createdAt: true, metadata: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
    ]);
    return { total, items, limit: query.limit };
  }

  async record(input: AuditInput) {
    const email = clean(input.actor?.email ?? input.attemptedEmail, 254)?.toLowerCase();
    const data = {
      category: input.category, action: input.action, resource: input.resource,
      ...(input.metadata ? { metadata: input.metadata } : {}),
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
    if (scope === 'permissions') extraFilters.push({ OR: [{ action: { in: [...permissionActions, relocationAction] } }, { route: { in: legacyPermissionRoutes } }] });
    if (action) {
      const legacy = action === 'CHANGE_ROLE' ? { action: 'ROLE', route: roleChangeRoute }
        : action === 'GRANT_FACILITY_ACCESS' ? { action: 'CREATE', route: '/admin/facility-access' }
        : action === 'REVOKE_FACILITY_ACCESS' ? { action: 'REVOKE', route: '/admin/facility-access/:id/revoke' }
        : undefined;
      const assignment = action.startsWith('TASK_ASSIGNMENT:') ? this.assignmentFilter(action.slice('TASK_ASSIGNMENT:'.length)) : undefined;
      const relocation = { OR: [{ action }, { resource: 'facility-access', action: 'RELOCATE', route: relocationRoute }] };
      extraFilters.push(assignment ?? (action === relocationAction ? relocation
        : legacy ? { OR: [{ action }, legacy] } : { action }));
    }
    const accountGrants = accountId && category === 'ACTIVITY'
      ? await this.prisma.facilityAccess.findMany({ where: { userId: accountId }, select: { id: true } })
      : [];
    if (accountId) extraFilters.push(category === 'LOGIN'
      ? { actorId: accountId }
      : { OR: [
          { actorId: accountId },
          { resource: 'users', resourceId: accountId },
          { resource: 'facility-access', route: { in: [roleChangeRoute, relocationRoute] }, resourceId: accountId },
          ...(accountGrants.length ? [{
            resource: 'facility-access', route: { in: grantRoutes }, resourceId: { in: accountGrants.map(grant => grant.id) },
          }] : []),
        ] });
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
    if (category === 'ACCOUNT_NOTICES') extraFilters.push({ OR: [
      { resource: 'users', action: { in: accountNoticeActions } },
      ...legacyAccountNotices.map(({ route, action }) => ({ resource: 'facility-access', route, action })),
    ] });
    try {
      const searchFilters: Prisma.AuditEventWhereInput[] = search
        ? ['actorName', 'actorEmail', 'resourceId', 'resource', 'action'].map(field => ({ [field]: { contains: search, mode: 'insensitive' as const } }))
        : [];
      if (search && scope === 'permissions') {
        const accountMatches = await this.prisma.user.findMany({ where: { OR: [
          { fullName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } },
        ] }, select: { id: true } });
        const matchedIds = accountMatches.map(account => account.id);
        const matchingGrants = matchedIds.length ? await this.prisma.facilityAccess.findMany({
          where: { userId: { in: matchedIds } }, select: { id: true },
        }) : [];
        if (matchedIds.length) searchFilters.push(
          { resource: 'users', resourceId: { in: matchedIds } },
          { resource: 'facility-access', route: { in: [roleChangeRoute, relocationRoute] }, resourceId: { in: matchedIds } },
        );
        if (matchingGrants.length) searchFilters.push({
          resource: 'facility-access', route: { in: grantRoutes }, resourceId: { in: matchingGrants.map(grant => grant.id) },
        });
        searchFilters.push(...['targetUserName', 'targetUserEmail'].map(field => ({
          metadata: { path: [field], string_contains: search, mode: 'insensitive' as const },
        })));
      }
      const where: Prisma.AuditEventWhereInput = {
        AND: [categoryFilter, ...extraFilters],
        ...(outcome ? { outcome: outcome as 'SUCCESS' | 'FAILURE' } : {}),
        ...(category === 'ACCOUNT_NOTICES' ? { category: 'ACTIVITY', outcome: 'SUCCESS', resourceId: { not: null } } : {}),
        ...(eventId ? { id: eventId } : {}),
        ...(role ? { actorRole: { in: [role, ...(historicalRoles[role] ? [historicalRoles[role]] : [])] } } : {}),
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}) } } : {}),
        ...(searchFilters.length ? { OR: searchFilters } : {}),
      };
      const paging = { orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }], skip: (page - 1) * limit, take: limit };
      if (category === 'ACCOUNT_NOTICES') {
        const [total, items] = await Promise.all([
          this.prisma.auditEvent.count({ where }),
          this.prisma.auditEvent.findMany({ where, ...paging, select: { id: true, action: true, outcome: true, resource: true, resourceId: true, createdAt: true, route: true, metadata: true } }),
        ]);
        const enriched = await this.withTargetAccounts(await this.withFacilities(items));
        const notices = enriched.map(item => {
          const legacy = item.resource === 'facility-access'
            ? legacyAccountNotices.find(row => row.route === item.route && row.action === item.action) : undefined;
          return legacy ? { ...item, action: legacy.titleAction } : item;
        });
        return { page, limit, total, items: notices };
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
      return { page, limit, total, items: await this.withAssignees(await this.withTargetAccounts(await this.withFacilities(withNames))) };
    } catch {
      throw new ServiceUnavailableException({ code: 'AUDIT_STORAGE_UNAVAILABLE', message: 'Chưa đọc được nhật ký. Kiểm tra kết nối DB và migration nhật ký Admin.' });
    }
  }

  private assignmentFilter(variant: string): Prisma.AuditEventWhereInput {
    const action = 'TASK_ASSIGNMENT';
    const source = ['source'];
    const manager = { actorRole: { in: ['FACILITY_MANAGER', 'MANAGER'] } };
    if (variant === 'CLAIM') return { action, metadata: { path: source, equals: 'SELF_CLAIM' } };
    if (variant === 'RELEASE') return { action, metadata: { path: source, equals: 'MANAGER_QUEUE' } };
    const next = { metadata: { path: ['assignedStaffUserId'], not: Prisma.AnyNull } };
    const previous = ['previousStaffUserId'];
    if (variant === 'REASSIGN') return { action, ...manager, AND: [next, { metadata: { path: previous, not: Prisma.AnyNull } }] };
    if (variant === 'ASSIGN') return { action, ...manager, AND: [next, { metadata: { path: previous, equals: Prisma.JsonNull } }] };
    throw new BadRequestException('Loại điều phối không hợp lệ.');
  }

  private async withFacilities<T extends { resource: string; resourceId: string | null; route: string; metadata: Prisma.JsonValue }>(items: T[]) {
    const ids = [...new Set(items.flatMap(item => ['facilityId', 'previousFacilityId'].flatMap(key => this.metadataText(item.metadata, key) ?? [])))];
    const facilities = ids.length ? await this.prisma.facility.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const names = new Map(facilities.map(facility => [facility.id, facility.name]));
    const grantIds = [...new Set(items.flatMap(item =>
      item.resource === 'facility-access' && grantRoutes.includes(item.route) && item.resourceId ? [item.resourceId] : []))];
    const grants = grantIds.length ? await this.prisma.facilityAccess.findMany({
      where: { id: { in: grantIds } },
      select: { id: true, userId: true, facility: { select: { name: true } } },
    }) : [];
    const grantsById = new Map(grants.map(grant => [grant.id, grant]));
    return items.map(item => {
      const grant = item.resource === 'facility-access' && grantRoutes.includes(item.route)
        ? grantsById.get(item.resourceId ?? '') : undefined;
      return {
        ...item,
        ...(grant ? { targetUserId: grant.userId } : {}),
        facilityName: this.metadataText(item.metadata, 'facilityName')
          ?? names.get(this.metadataText(item.metadata, 'facilityId') ?? '') ?? grant?.facility.name,
        ...(this.metadataText(item.metadata, 'previousFacilityId') || this.metadataText(item.metadata, 'previousFacilityName')
          ? { previousFacilityName: this.metadataText(item.metadata, 'previousFacilityName')
              ?? names.get(this.metadataText(item.metadata, 'previousFacilityId') ?? '') } : {}),
      };
    });
  }

  private async withTargetAccounts<T extends { resource: string; resourceId: string | null; route?: string; metadata?: Prisma.JsonValue; targetUserId?: string }>(items: T[]) {
    // Legacy role changes stored the user ID under the facility-access resource.
    const targetId = (item: T) => item.targetUserId ?? (item.resource === 'users' ||
      (item.resource === 'facility-access' && (item.route === roleChangeRoute || item.route === relocationRoute)) ? item.resourceId : null);
    const ids = [...new Set(items.flatMap(item => targetId(item) ?? []))];
    if (!ids.length) return items;
    const accounts = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, role: true, email: true } });
    const byId = new Map(accounts.map(({ id, fullName, role, email }) => [id, { fullName, role, ...(email && { email }) }]));
    return items.map(item => {
      const id = targetId(item);
      if (!id) return item;
      const current = byId.get(id);
      const fullName = this.metadataText(item.metadata, 'targetUserName');
      const email = this.metadataText(item.metadata, 'targetUserEmail');
      return { ...item, targetUserId: id, targetAccount: fullName
        ? { fullName, ...(email && { email }), ...(current && { role: current.role }) } : current ?? null };
    });
  }

  private async withAssignees<T extends { action: string; metadata: Prisma.JsonValue }>(items: T[]) {
    const keys = ['previousStaffUserId', 'assignedStaffUserId'];
    const ids = [...new Set(items.flatMap(item => item.action === 'TASK_ASSIGNMENT'
      ? keys.flatMap(key => this.metadataText(item.metadata, key) ?? []) : []))];
    if (!ids.length) return items;
    const people = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
    const names = new Map(people.map(person => [person.id, person.fullName]));
    return items.map(item => item.action === 'TASK_ASSIGNMENT' ? { ...item,
      previousAssigneeName: names.get(this.metadataText(item.metadata, 'previousStaffUserId') ?? ''),
      nextAssigneeName: names.get(this.metadataText(item.metadata, 'assignedStaffUserId') ?? ''),
    } : item);
  }

  private metadataText(metadata: Prisma.JsonValue | undefined, key: string) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
    return typeof metadata[key] === 'string' && metadata[key] ? metadata[key] : undefined;
  }
}
