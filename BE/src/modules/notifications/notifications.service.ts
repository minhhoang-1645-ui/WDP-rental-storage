import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicUser } from '../auth/auth.types.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { buildNotices, noticeKinds, noticeSearch, type Notice } from './notification-content.js';
import { customerMobileNotices } from './notification-mobile-content.js';
import { NotificationSources } from './notification-sources.js';
import { facilityIds } from '../facility-access/facility-access.service.js';
import { BusinessPolicyService, policyDefinitions, pricingDefinitions } from '../policies/business-policy.service.js';

const views = ['all', 'unread', 'action'];
const pageSizes = [5, 10, 20, 50];
const unavailable = 'Hồ sơ không còn khả dụng hoặc bạn không có quyền xem.';

function positiveInteger(input: unknown, fallback: number) {
  if (input === undefined) return fallback;
  if (typeof input !== 'string' || !/^\d+$/.test(input)) throw new BadRequestException('Trang không hợp lệ.');
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < 1) throw new BadRequestException('Trang không hợp lệ.');
  return value;
}
function item(notice: Notice, read: Set<string>) {
  return {
    token: notice.token, kind: notice.kind, title: notice.title, summary: notice.summary, at: notice.at,
    actionLabel: notice.actionLabel, important: notice.important,
    canOpen: Boolean(notice.target), unread: !read.has(notice.token),
  };
}

@Injectable()
export class NotificationsService {
  private readonly pending = new Map<string, Promise<Notice[]>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: NotificationSources,
    private readonly policies: BusinessPolicyService = new BusinessPolicyService(prisma),
  ) {}

  private snapshot(actor: PublicUser, mobile = false) {
    const key = `${actor.role}:${actor.id}:${actor.selectedFacilityId ?? ''}:${mobile}`;
    const sharePending = actor.role !== 'FACILITY_STAFF' && actor.role !== 'FACILITY_MANAGER';
    const running = sharePending ? this.pending.get(key) : undefined;
    if (running) return running;
    const request = this.sources.load(actor).then(async data => {
      const now = Date.now();
      if (actor.role === 'STORAGE_CUSTOMER' && data.contracts?.length) {
        const days = await this.policies.value('renewalReminderDays', this.prisma, new Date(now));
        data = { ...data, 'contract-expiry': data.contracts.map(row => ({ ...row, reminderDays: days })) };
      }
      if (actor.role === 'STORAGE_CUSTOMER' && data.invoices?.length) {
        const days = await this.policies.value('paymentReminderDays', this.prisma, new Date(now));
        data = { ...data, 'payment-due-reminder': data.invoices.map(row => ({ ...row, reminderDays: days })) };
      }
      if (actor.role === 'STORAGE_CUSTOMER' || (actor.role === 'FACILITY_MANAGER' && (await facilityIds(this.prisma, actor)).length)) {
        const effective = await this.prisma.businessRule.findMany({
          where: { facilityId: null, storageTypeId: null,
            key: { in: [...Object.keys(policyDefinitions), ...Object.keys(pricingDefinitions)] },
            effectiveFrom: { lte: new Date(now) }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date(now) } }] },
          select: { id: true, key: true, version: true, effectiveFrom: true },
        });
        data = { ...data, 'policy-effective': effective.map(row => ({ ...row, title: policyDefinitions[row.key as keyof typeof policyDefinitions]?.title ?? pricingDefinitions[row.key as keyof typeof pricingDefinitions]?.title, effectiveFrom: row.effectiveFrom.toISOString() })) };
      }
      if (actor.role === 'FACILITY_STAFF') {
        const catalog = await this.policies.staffApplied(actor).catch((error: unknown) => {
          if (error instanceof ForbiddenException) return null;
          throw error;
        });
        if (catalog) data = { ...data, 'policy-effective': catalog.updates.filter(update => !update.scheduled)
          .map(({ key, title, version, effectiveFrom }) => ({ staffOperational: true, id: key + ':' + version, title, version, effectiveFrom: effectiveFrom.toISOString() })) };
      }
      const notices = buildNotices(actor, data, now);
      return mobile ? customerMobileNotices(notices, data, now) : notices;
    })
      .finally(() => { if (sharePending) this.pending.delete(key); });
    if (sharePending) this.pending.set(key, request);
    return request;
  }

  private async receipts(userId: string, notices: Notice[]) {
    if (!notices.length) return new Set<string>();
    const seen = new Set<string>();
    for (let start = 0; start < notices.length; start += 1000) {
      const tokens = notices.slice(start, start + 1000).map(row => row.token);
      const rows = await this.prisma.notificationReceipt.findMany({
        where: { userId, token: { in: tokens } }, select: { token: true },
      });
      for (const row of rows) seen.add(row.token);
    }
    return seen;
  }

  async list(actor: PublicUser, query: Record<string, unknown>) {
    const view = query.view ?? 'all';
    const kind = query.kind ?? '';
    const search = query.search ?? '';
    const requestedPage = positiveInteger(query.page, 1);
    const limit = positiveInteger(query.limit, 10);
    if (typeof view !== 'string' || !views.includes(view) || !pageSizes.includes(limit)
      || typeof kind !== 'string' || kind && !Object.hasOwn(noticeKinds, kind)
      || typeof search !== 'string' || search.length > 100) throw new BadRequestException('Bộ lọc thông báo không hợp lệ.');

    const notices = await this.snapshot(actor, actor.role === 'STORAGE_CUSTOMER' && query.client === 'mobile');
    const seen = await this.receipts(actor.id, notices);
    const keyword = noticeSearch(search);
    const filtered = notices.filter(row =>
      (view === 'all' || (view === 'unread' ? !seen.has(row.token) : Boolean(row.actionLabel)))
      && (!kind || row.kind === kind)
      && (!keyword || noticeSearch([row.title, row.summary, row.code, noticeKinds[row.kind]].join(' ')).includes(keyword)));
    const total = filtered.length;
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / limit)));
    const kinds = [...new Set(notices.map(row => row.kind))].map(value => ({ value, label: noticeKinds[value] }))
      .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
    return {
      page, limit, total, unreadTotal: notices.length - seen.size, kinds,
      recent: notices.slice(0, 5).map(notice => item(notice, seen)),
      items: filtered.slice((page - 1) * limit, page * limit).map(notice => item(notice, seen)),
    };
  }

  async mark(actor: PublicUser, token: string, open = false, mobile = false) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new NotFoundException(unavailable);
    // Re-evaluate visibility with current assignment, ownership and dossier status before using a saved link.
    const notice = (await this.snapshot(actor, mobile && actor.role === 'STORAGE_CUSTOMER')).find(row => row.token === token);
    if (!notice || open && !notice.target) throw new NotFoundException(unavailable);
    await this.prisma.notificationReceipt.createMany({ data: [{ userId: actor.id, token }], skipDuplicates: true });
    return open ? { target: notice.target } : { read: true };
  }

  async markAll(actor: PublicUser) {
    const notices = await this.snapshot(actor);
    const seen = await this.receipts(actor.id, notices);
    const data = notices.filter(row => !seen.has(row.token)).map(row => ({ userId: actor.id, token: row.token }));
    const result = data.length ? await this.prisma.notificationReceipt.createMany({ data, skipDuplicates: true }) : { count: 0 };
    return { updated: result.count };
  }
}
