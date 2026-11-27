import { assertFacility, facilityIds } from '../facility-access/facility-access.service.js';
import { assertPriceWithin, groupPriceKeys, lockPriceRange, maxMonthlyPrice, missingPriceRange, priceBounds, priceVersionStatus, resolveMonthlyRange, sizeGroups as groups } from '../pricing/monthly-price-range.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { rasterImageMime } from '../../raster-image.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { unitHistoryCounts, unitMetadataLocked } from './unit-edit-policy.js';
import { canonicalUnitFloor, canonicalUnitZone, unitFloorValues } from './unit-location.js';

const groupLabels: Record<string, string> = groups;
const typeFields = ['facilityId', 'code', 'name', 'sizeId', 'condition', 'widthCm', 'lengthCm', 'heightCm', 'monthlyRate', 'allowDailyRental', 'minRentalDays', 'image', 'imageAlt', 'bookingEnabled', 'expectedUpdatedAt'];
const unitFields = ['storageTypeId', 'floor', 'zone', 'row', 'position', 'expectedUpdatedAt'];

function physicalUnitCode(prefix: string, sequence: bigint) {
  return `${prefix}-${sequence.toString().padStart(2, '0')}`;
}

@Injectable()
export class InventoryManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async listTypes(actor: PublicUser) {
    this.manager(actor);
    const ids = await facilityIds(this.prisma, actor);
    const now = new Date();
    const [items, facilities, rules] = await Promise.all([
      this.prisma.storageType.findMany({ where: { facilityId: { in: ids } }, include: { facility: { select: { bookingEnabled: true, operationalStatus: true } } }, orderBy: { code: 'asc' } }),
      this.prisma.facility.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, code: true }, orderBy: { code: 'asc' } }),
      this.prisma.businessRule.findMany({ where: { key: { in: groupPriceKeys }, facilityId: { in: ids }, storageTypeId: null,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] }, orderBy: { effectiveFrom: 'asc' } }),
    ]);
    const pricingRanges = rules.map(rule => ({ facilityId: rule.facilityId, sizeId: rule.key.split(':')[1], value: priceBounds(rule.value),
      effectiveFrom: rule.effectiveFrom, status: priceVersionStatus(rule, now) }));
    return { items: items.map(item => this.typeView(item)), facilities, pricingRanges, groups, total: items.length, page: 1, limit: Math.max(1, items.length) };
  }

  async saveType(id: string | undefined, input: Record<string, unknown>, actor: PublicUser) {
    this.manager(actor); this.body(input, typeFields);
    return this.write(async tx => {
      const scope = id ? await tx.storageType.findUnique({ where: { id }, select: { facilityId: true } }) : null;
      if (id && !scope) throw new NotFoundException('Không tìm thấy loại kho.');
      const scopedFacility = scope?.facilityId ?? this.text(input.facilityId, 'Cơ sở', 100);
      await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', actor.id);
      await assertFacility(tx, actor, scopedFacility);
      await lockPriceRange(tx, scopedFacility);
      const current = id ? await this.lockType(tx, id) : null;
      if (current) this.version(current.updatedAt, input.expectedUpdatedAt);
      const value = { ...current, ...input };
      const data = {
        facilityId: this.text(value.facilityId, 'Cơ sở', 100),
        code: current && (input.code === undefined || input.code === current.code) ? current.code : this.code(value.code, 'Mã loại kho'), name: this.text(value.name, 'Tên loại kho', 120),
        sizeId: this.text(value.sizeId, 'Nhóm kho', 20),
        condition: value.condition as 'STANDARD' | 'AIR_CONDITIONED',
        widthCm: this.integer(value.widthCm, 'Chiều rộng', 1, 100000),
        lengthCm: this.integer(value.lengthCm, 'Chiều dài', 1, 100000),
        heightCm: this.integer(value.heightCm, 'Chiều cao', 1, 100000),
        monthlyRate: current && !Object.hasOwn(input, 'monthlyRate') ? current.monthlyRate
          : this.integer(value.monthlyRate, 'Giá tháng (VND)', 1, maxMonthlyPrice),
        allowDailyRental: value.allowDailyRental,
        minRentalDays: value.allowDailyRental === true ? this.integer(value.minRentalDays, 'Số ngày thuê tối thiểu', 1, 30) : current?.minRentalDays ?? null,
        image: this.image(value.image), imageAlt: this.optionalText(value.imageAlt, 'Mô tả ảnh', 300) ?? '',
      };
      if (!Object.hasOwn(groups, data.sizeId)) throw new BadRequestException('Nhóm kho không hợp lệ.');
      if (input.bookingEnabled !== undefined && typeof input.bookingEnabled !== 'boolean') throw new BadRequestException('Trạng thái kinh doanh không hợp lệ.');
      if (current && (data.code !== current.code || data.facilityId !== current.facilityId)) throw new ConflictException('Không đổi mã hoặc cơ sở của loại kho đã tạo.');
      const range = await resolveMonthlyRange(tx, data.facilityId, data.sizeId);
      const bookingEnabled = (input.bookingEnabled as boolean | undefined) ?? current?.bookingEnabled ?? Boolean(range);
      const changedPrice = !current || Number(data.monthlyRate) !== Number(current.monthlyRate) || data.sizeId !== current.sizeId;
      const activating = bookingEnabled && !current?.bookingEnabled;
      if (!range && bookingEnabled && (changedPrice || activating)) throw new ConflictException(missingPriceRange);
      if (range && (changedPrice || activating)) assertPriceWithin(range, Number(data.monthlyRate));
      if (!['STANDARD', 'AIR_CONDITIONED'].includes(data.condition)) throw new BadRequestException('Điều kiện kho không hợp lệ.');
      if (typeof data.allowDailyRental !== 'boolean') throw new BadRequestException('allowDailyRental phải là boolean.');
      if (!await tx.facility.findUnique({ where: { id: data.facilityId }, select: { id: true } })) throw new BadRequestException('Cơ sở không tồn tại.');
      if (current) {
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
        return this.typeView(await tx.storageType.update({ where: { id: current.id }, data: { ...data, bookingEnabled, sizeName: groupLabels[data.sizeId] } }));
      }
      return this.typeView(await tx.storageType.create({ data: {
        ...data, bookingEnabled, id: `type-${randomUUID()}`, sizeName: groupLabels[data.sizeId],
        kicker: '', roomEquivalent: '', capacity: '', boxCount: '', suitableItems: [], features: [], floor: '', access: '',
      } }));
    }, 'ReadCommitted');
  }

  async listUnitLocations(actor: PublicUser) {
    this.manager(actor);
    const ids = await facilityIds(this.prisma, actor);
    const locations = await this.prisma.storageUnit.groupBy({ where: { storageType: { facilityId: { in: ids } } }, by: ['floor', 'zone'] });
    const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
    const options = (values: (string | null)[]) => [...new Map(values.filter((value): value is string => Boolean(value))
      .map(value => [value.toLocaleLowerCase('vi'), value])).values()].sort((left, right) => collator.compare(left, right));
    return {
      floors: options(locations.map(row => canonicalUnitFloor(row.floor))),
      zones: options(locations.map(row => canonicalUnitZone(row.zone))),
    };
  }

  async previewUnitCode(storageTypeId: string, actor: PublicUser) {
    this.manager(actor);
    return this.prisma.$transaction(async tx => {
      const type = await this.unitType(tx, storageTypeId, actor);
      const counter = await tx.storageUnitCodeCounter.findUnique({ where: { prefix: type.code } });
      return { unitNumber: physicalUnitCode(type.code, BigInt(counter?.lastIssued.toFixed(0) ?? '0') + 1n) };
    });
  }

  async saveUnit(id: string | undefined, input: Record<string, unknown>, actor: PublicUser) {
    this.manager(actor); this.body(input, unitFields);
    return this.write(async tx => {
      // Match booking's unit locks; serializable transactions also protect history predicates.
      if (id) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${id} FOR UPDATE`);
      const current = id ? await tx.storageUnit.findUnique({ where: { id }, include: { _count: { select: unitHistoryCounts }, storageType: { select: { facilityId: true } } } }) : null;
      if (id && !current) throw new NotFoundException('Không tìm thấy kho vật lý.');
      await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', actor.id);
      if (current) { await assertFacility(tx, actor, current.storageType.facilityId); this.version(current.updatedAt, input.expectedUpdatedAt); }
      const value = { ...current, ...input };
      const storageTypeId = this.text(value.storageTypeId, 'Loại kho', 100);
      const storageType = await this.unitType(tx, storageTypeId, actor, !current);
      const floor = canonicalUnitFloor(this.optionalText(value.floor, 'Tầng', 100));
      const zone = canonicalUnitZone(this.optionalText(value.zone, 'Khu', 100));
      const sameFloor = Boolean(current && floor?.toLocaleLowerCase('vi') === canonicalUnitFloor(current.floor)?.toLocaleLowerCase('vi'));
      const sameZone = Boolean(current && zone === canonicalUnitZone(current.zone));
      const data = {
        storageTypeId,
        floor: current && sameFloor ? current.floor : floor,
        zone: current && sameZone ? current.zone : zone,
        row: this.optionalInteger(value.row, 'Hàng'), position: this.optionalInteger(value.position, 'Vị trí'),
      };
      if (current && Object.entries(data).some(([key, v]) => v !== current[key as keyof typeof current])) {
        if (unitMetadataLocked(current.status, current._count)) {
          throw new ConflictException('Kho đã có hồ sơ, phân công hoặc đang sử dụng. Không đổi mã, loại hoặc vị trí; hãy tạo kho mới.');
        }
      }
      const locationChanged = !current || !sameFloor || !sameZone || current.row !== data.row
        || current.position !== data.position || (current.storageTypeId !== storageTypeId && current.storageType.facilityId !== storageType.facilityId);
      if (locationChanged && floor && zone && data.row !== null && data.position !== null) {
        const occupied = await tx.storageUnit.findFirst({ where: {
          ...(id ? { id: { not: id } } : {}),
          storageType: { facilityId: storageType.facilityId },
          floor: { in: unitFloorValues(floor), mode: 'insensitive' },
          zone: { equals: zone, mode: 'insensitive' },
          row: data.row, position: data.position,
        }, select: { unitNumber: true } });
        if (occupied) throw new ConflictException(`Vị trí này đã có kho ${occupied.unitNumber}.`);
      }
      if (current) return tx.storageUnit.update({ where: { id: current.id }, data });
      // The atomic increment and unit insert commit together. Serializable
      // retries also recheck the physical location before issuing a code.
      const counter = await tx.storageUnitCodeCounter.upsert({
        where: { prefix: storageType.code },
        create: { prefix: storageType.code, lastIssued: 1 },
        update: { lastIssued: { increment: 1 } },
      });
      const unitNumber = physicalUnitCode(storageType.code, BigInt(counter.lastIssued.toFixed(0)));
      return tx.storageUnit.create({ data: { ...data, unitNumber } });
    }, 'Serializable', id ? 1 : 5);
  }

  private async unitType(tx: Prisma.TransactionClient, id: string, actor: PublicUser, requireOpen = true) {
    const type = await tx.storageType.findUnique({
      where: { id },
      select: { code: true, facilityId: true, facility: { select: { operationalStatus: true } } },
    });
    if (!type) throw new BadRequestException('Loại kho không tồn tại.');
    await assertFacility(tx, actor, type.facilityId);
    if (requireOpen && type.facility.operationalStatus !== 'OPEN') {
      throw new ConflictException('Chỉ có thể thêm kho tại cơ sở đang hoạt động.');
    }
    return type;
  }

  private async lockType(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageType" WHERE "id" = ${id} FOR UPDATE`);
    const current = await tx.storageType.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Không tìm thấy loại kho.');
    return current;
  }
  private typeView(item: { monthlyRate: unknown; [key: string]: unknown }) { return { ...item, monthlyRate: item.monthlyRate === null ? null : Number(item.monthlyRate) }; }
  private manager(actor: PublicUser) { if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ Manager được quản lý kho và bảng giá.'); }
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
    if (typeof value === 'string' && value.startsWith('data:')) {
      const maxBytes = 1024 * 1024;
      if (value.length <= 4 * Math.ceil(maxBytes / 3) + 32) {
        const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
        if (match) {
          const bytes = Buffer.from(match[2], 'base64');
          if (bytes.length <= maxBytes && bytes.toString('base64') === match[2] && rasterImageMime(bytes) === match[1]) return value;
        }
      }
      throw new BadRequestException('Tệp ảnh phải là JPG, PNG hoặc WebP hợp lệ, tối đa 1 MB.');
    }
    const result = this.text(value, 'Ảnh', 2000);
    if (!/^https:\/\/[^\s]+$/i.test(result) && !/^\/(?!\/)[^\s]*$/.test(result)) throw new BadRequestException('Ảnh phải là URL HTTPS hoặc đường dẫn ảnh nội bộ.');
    return result;
  }
  private async write<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, isolationLevel: 'ReadCommitted' | 'Serializable', attempts = 1) {
    for (let attempt = 1; ; attempt++) {
      try { return await this.prisma.$transaction(operation, { isolationLevel, maxWait: 10000, timeout: 20000 }); }
      catch (error) {
        const code = typeof error === 'object' && error ? (error as { code?: string }).code : undefined;
        if (code === 'P2002') throw new ConflictException('Mã kho hoặc mã loại kho đã tồn tại.');
        if (code !== 'P2034') throw error;
        if (attempt === attempts) throw new ConflictException('Dữ liệu đang được sử dụng. Tải lại và thử lại.');
      }
    }
  }
}
