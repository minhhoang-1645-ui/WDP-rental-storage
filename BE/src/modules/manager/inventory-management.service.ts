import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

const groups: Record<string, string> = { locker: 'Tủ lưu trữ', small: 'Kho nhỏ', medium: 'Kho vừa', large: 'Kho lớn' };
const typeFields = ['facilityId', 'code', 'name', 'sizeId', 'condition', 'widthCm', 'lengthCm', 'heightCm', 'monthlyRate', 'allowDailyRental', 'minRentalDays', 'image', 'imageAlt', 'expectedUpdatedAt'];
const unitFields = ['unitNumber', 'storageTypeId', 'floor', 'zone', 'row', 'position', 'expectedUpdatedAt'];

@Injectable()
export class InventoryManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async listTypes() {
    const [items, facilities] = await Promise.all([
      this.prisma.storageType.findMany({ orderBy: { code: 'asc' } }),
      this.prisma.facility.findMany({ select: { id: true, name: true, code: true }, orderBy: { code: 'asc' } }),
    ]);
    return { items: items.map(item => this.typeView(item)), facilities, total: items.length, page: 1, limit: Math.max(1, items.length) };
  }

  async saveType(id: string | undefined, input: Record<string, unknown>, actor: PublicUser) {
    this.manager(actor); this.body(input, typeFields);
    return this.write(async tx => {
      const current = id ? await this.lockType(tx, id) : null;
      if (current) this.version(current.updatedAt, input.expectedUpdatedAt);
      const value = { ...current, ...input };
      const data = {
        facilityId: this.text(value.facilityId, 'Cơ sở', 100),
        code: this.code(value.code, 'Mã loại kho'), name: this.text(value.name, 'Tên loại kho', 120),
        sizeId: this.text(value.sizeId, 'Nhóm kho', 20),
        condition: value.condition as 'STANDARD' | 'AIR_CONDITIONED',
        widthCm: this.integer(value.widthCm, 'Chiều rộng', 1, 100000),
        lengthCm: this.integer(value.lengthCm, 'Chiều dài', 1, 100000),
        heightCm: this.integer(value.heightCm, 'Chiều cao', 1, 100000),
        monthlyRate: this.integer(value.monthlyRate, 'Giá tháng (VND)', 1, 9999999999),
        allowDailyRental: value.allowDailyRental,
        minRentalDays: value.allowDailyRental === true ? this.integer(value.minRentalDays, 'Số ngày thuê tối thiểu', 1, 30) : current?.minRentalDays ?? null,
        image: this.image(value.image), imageAlt: this.optionalText(value.imageAlt, 'Mô tả ảnh', 300) ?? '',
      };
      if (!Object.hasOwn(groups, data.sizeId)) throw new BadRequestException('Nhóm kho không hợp lệ.');
      if (!['STANDARD', 'AIR_CONDITIONED'].includes(data.condition)) throw new BadRequestException('Điều kiện kho không hợp lệ.');
      if (typeof data.allowDailyRental !== 'boolean') throw new BadRequestException('allowDailyRental phải là boolean.');
      if (!await tx.facility.findUnique({ where: { id: data.facilityId }, select: { id: true } })) throw new BadRequestException('Cơ sở không tồn tại.');
      if (current) {
        if (data.code !== current.code || data.facilityId !== current.facilityId) throw new ConflictException('Không đổi mã hoặc cơ sở của loại kho đã tạo.');
        const structural = ['name', 'sizeId', 'condition', 'widthCm', 'lengthCm', 'heightCm', 'allowDailyRental', 'minRentalDays'] as const;
        if (structural.some(field => data[field] !== current[field])) {
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "storageTypeId" = ${current.id} FOR UPDATE`);
          // An interactive transaction owns one PostgreSQL connection; query it sequentially.
          const history = [
            await tx.reservation.count({ where: { storageTypeId: current.id } }),
            await tx.guestBookingRequest.count({ where: { storageTypeId: current.id } }),
            await tx.contactInquiry.count({ where: { storageTypeId: current.id } }),
            await tx.storageUnit.count({ where: { storageTypeId: current.id, OR: [
              { status: { not: 'AVAILABLE' } }, { maintenanceRequests: { some: {} } }, { supportRequests: { some: {} } },
              { reservationUnits: { some: {} } }, { staffAssignments: { some: {} } }, { returnInspections: { some: {} } },
              { outgoingTransfers: { some: {} } }, { incomingTransfers: { some: {} } },
            ] } }),
          ];
          if (history.some(count => count > 0)) throw new ConflictException('Loại kho đã có hồ sơ. Chỉ cập nhật giá hoặc ảnh; hãy tạo loại mới nếu đổi kích thước/điều kiện thuê.');
        }
        // Only the catalog row changes. Never update historical quotes, contracts or invoices.
        return this.typeView(await tx.storageType.update({ where: { id: current.id }, data: { ...data, sizeName: groups[data.sizeId] } }));
      }
      return this.typeView(await tx.storageType.create({ data: {
        ...data, id: `type-${randomUUID()}`, sizeName: groups[data.sizeId],
        kicker: '', roomEquivalent: '', capacity: '', boxCount: '', suitableItems: [], features: [], floor: '', access: '',
      } }));
    });
  }

  async saveUnit(id: string | undefined, input: Record<string, unknown>, actor: PublicUser) {
    this.manager(actor); this.body(input, unitFields);
    return this.write(async tx => {
      // Match booking's unit locks; serializable transactions also protect history predicates.
      if (id) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${id} FOR UPDATE`);
      const current = id ? await tx.storageUnit.findUnique({ where: { id }, include: { _count: { select: {
        reservationUnits: true, maintenanceRequests: true, supportRequests: true, outgoingTransfers: true, incomingTransfers: true, returnInspections: true, staffAssignments: true,
      } } } }) : null;
      if (id && !current) throw new NotFoundException('Không tìm thấy kho vật lý.');
      if (current) this.version(current.updatedAt, input.expectedUpdatedAt);
      const value = { ...current, ...input };
      const data = {
        unitNumber: this.code(value.unitNumber, 'Mã kho'), storageTypeId: this.text(value.storageTypeId, 'Loại kho', 100),
        floor: this.optionalText(value.floor, 'Tầng', 100), zone: this.optionalText(value.zone, 'Khu', 100),
        row: this.optionalInteger(value.row, 'Hàng'), position: this.optionalInteger(value.position, 'Vị trí'),
      };
      if (current && Object.entries(data).some(([key, v]) => v !== current[key as keyof typeof current])) {
        if (current.status !== 'AVAILABLE' || Object.values(current._count).some(count => count > 0)) {
          throw new ConflictException('Kho đã có hồ sơ, phân công hoặc đang sử dụng. Không đổi mã, loại hoặc vị trí; hãy tạo kho mới.');
        }
      }
      if (!await tx.storageType.findUnique({ where: { id: data.storageTypeId }, select: { id: true } })) throw new BadRequestException('Loại kho không tồn tại.');
      return current ? tx.storageUnit.update({ where: { id: current.id }, data }) : tx.storageUnit.create({ data });
    });
  }

  private async lockType(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageType" WHERE "id" = ${id} FOR UPDATE`);
    const current = await tx.storageType.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Không tìm thấy loại kho.');
    return current;
  }
  private typeView(item: { monthlyRate: unknown; [key: string]: unknown }) { return { ...item, monthlyRate: item.monthlyRate === null ? null : Number(item.monthlyRate) }; }
  private manager(actor: PublicUser) { if (actor.role !== 'MANAGER') throw new ForbiddenException('Chỉ Manager được quản lý kho và bảng giá.'); }
  private body(input: Record<string, unknown>, fields: string[]) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length) throw new BadRequestException('Dữ liệu không hợp lệ.');
    if (Object.keys(input).some(key => !fields.includes(key))) throw new BadRequestException('Có trường không được phép thay đổi. Trạng thái kho chỉ cập nhật qua nghiệp vụ vận hành.');
  }
  private version(updatedAt: Date, expected: unknown) {
    if (typeof expected !== 'string' || expected !== updatedAt.toISOString()) throw new ConflictException('Dữ liệu vừa thay đổi. Tải lại trước khi sửa.');
  }
  private text(value: unknown, title: string, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${title} là bắt buộc, tối đa ${max} ký tự.`);
    return value.trim();
  }
  private code(value: unknown, title: string) { const result = this.text(value, title, 50); if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(result)) throw new BadRequestException(`${title} chỉ gồm chữ, số, gạch ngang/gạch dưới.`); return result.toUpperCase(); }
  private optionalText(value: unknown, title: string, max: number) { return value === null || value === undefined || value === '' ? null : this.text(value, title, max); }
  private integer(value: unknown, title: string, min: number, max: number) {
    if ((typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Prisma.Decimal)) || value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new BadRequestException(`${title} phải là số nguyên từ ${min}–${max}.`);
    return Number(value);
  }
  private optionalInteger(value: unknown, title: string) { return value === null || value === undefined || value === '' ? null : this.integer(value, title, 1, 100000); }
  private image(value: unknown) {
    if (value === null || value === undefined || value === '') return '';
    const result = this.text(value, 'Ảnh', 2000);
    if (!/^https:\/\/[^\s]+$/i.test(result) && !/^\/(?!\/)[^\s]*$/.test(result)) throw new BadRequestException('Ảnh phải là URL HTTPS hoặc đường dẫn ảnh nội bộ.');
    return result;
  }
  private async write<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    try { return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 }); }
    catch (error) {
      const code = typeof error === 'object' && error ? (error as { code?: string }).code : undefined;
      if (code === 'P2002') throw new ConflictException('Mã kho hoặc mã loại kho đã tồn tại.');
      if (code === 'P2034') throw new ConflictException('Dữ liệu đang được sử dụng. Tải lại và thử lại.');
      throw error;
    }
  }
}
