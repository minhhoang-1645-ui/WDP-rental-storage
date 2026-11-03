import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { isIP } from 'node:net';
import { Prisma, type UserRole } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

export type AuditInput = {
  category: 'LOGIN' | 'ACTIVITY'; action: string; resource: string; resourceId?: unknown;
  method: string; route: string; httpStatus: number; actor?: PublicUser; attemptedEmail?: unknown; ipAddress?: string;
};
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
    if (category && !['LOGIN', 'ACTIVITY'].includes(category)) throw new BadRequestException('Nhóm nhật ký không hợp lệ.');
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
    if (from && to && from > to) throw new BadRequestException('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
    const where: Prisma.AuditEventWhereInput = {
      ...(category ? { category: category as 'LOGIN' | 'ACTIVITY' } : {}),
      ...(outcome ? { outcome: outcome as 'SUCCESS' | 'FAILURE' } : {}),
      ...(role ? { actorRole: role as UserRole } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}) } } : {}),
      ...(search ? { OR: ['actorName', 'actorEmail', 'resourceId', 'resource', 'action'].map(field => ({ [field]: { contains: search, mode: 'insensitive' as const } })) } : {}),
    };
    try {
      const [total, items] = await Promise.all([
        this.prisma.auditEvent.count({ where }),
        this.prisma.auditEvent.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      ]);
      return { page, limit, total, items };
    } catch {
      throw new ServiceUnavailableException({ code: 'AUDIT_STORAGE_UNAVAILABLE', message: 'Chưa đọc được nhật ký. Kiểm tra kết nối DB và migration nhật ký Admin.' });
    }
  }
}
