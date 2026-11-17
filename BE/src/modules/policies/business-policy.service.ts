import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

export const policyDefinitions = {
  reservationHoldMinutes: { title: 'Thời hạn giữ đơn chưa thanh toán', unit: 'phút', defaultValue: 1440, min: 15, max: 10080, description: 'Chỉ áp dụng khi xác nhận đơn mới. Không đổi hạn giữ đã lưu trên đơn cũ.' },
  handoverLeadDays: { title: 'Nhận chìa khóa trước ngày thuê', unit: 'ngày', defaultValue: 3, min: 0, max: 7, description: 'Khoảng sớm tối đa để nhận chìa khóa. Hợp đồng vẫn chỉ kích hoạt từ ngày bắt đầu thuê.' },
} as const;
export function validatePolicy(key: string, value: unknown) {
  if (!Object.hasOwn(policyDefinitions, key)) throw new BadRequestException('Thông số này không được chỉnh qua giao diện.');
  const definition = policyDefinitions[key as keyof typeof policyDefinitions];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < definition.min || value > definition.max) throw new BadRequestException(`Nhập số nguyên từ ${definition.min} đến ${definition.max} ${definition.unit}.`);
  return value;
}
@Injectable()
export class BusinessPolicyService {
  constructor(private readonly prisma: PrismaService) {}
  async value(key: keyof typeof policyDefinitions, db: PrismaService | Prisma.TransactionClient = this.prisma) {
    const row = await db.businessPolicy.findUnique({ where: { key } });
    return row ? validatePolicy(key, row.value) : policyDefinitions[key].defaultValue;
  }
  async list() {
    const rows = await this.prisma.businessPolicy.findMany();
    return { items: Object.entries(policyDefinitions).map(([key, definition]) => {
      const row = rows.find(item => item.key === key);
      return { key, ...definition, value: row?.value ?? definition.defaultValue, updatedAt: row?.updatedAt.toISOString() ?? null, updatedById: row?.updatedById ?? null };
    }) };
  }
  async save(key: string, body: Record<string, unknown>, actorId: string) {
    const value = validatePolicy(key, body.value);
    if (!Object.hasOwn(body, 'expectedUpdatedAt') || Object.keys(body).some(field => !['value', 'expectedUpdatedAt'].includes(field))) throw new BadRequestException('Cần gửi giá trị và phiên bản thông số đã xem.');
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`policy:${key}`}))`);
      const old = await tx.businessPolicy.findUnique({ where: { key } });
      if ((old?.updatedAt.toISOString() ?? null) !== body.expectedUpdatedAt) throw new ConflictException('Thông số vừa thay đổi. Tải lại trước khi lưu.');
      const row = await tx.businessPolicy.upsert({ where: { key }, create: { key, value, updatedById: actorId }, update: { value, updatedById: actorId } });
      return { ...row, updatedAt: row.updatedAt.toISOString() };
    });
  }
}
