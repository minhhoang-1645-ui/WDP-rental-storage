import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { BillingService } from '../billing/billing.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { ContractsService } from '../contracts/contracts.service.js';
import type { PaymentPlan } from '../pricing/pricing.types.js';
import type { BookingProduct } from './booking.catalog.js';
import { approvedDurations, type AvailabilityResult, type GuestContact, type GuestInquiry, type PendingReservation, type QuoteSnapshot, type ReservationDraft } from './booking.types.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const sizeOrder = ['locker', 'small', 'medium', 'large'];
const illustrationScale: Record<string, number> = { locker: 28, small: 44, medium: 66, large: 88 };
const managerInquiryStatuses = ['PENDING_CONTACT', 'CONTACTED', 'IN_REVIEW', 'CLOSED', 'CANCELLED'] as const;
const managerReservationStatuses = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const;
type ManagerReservationStatus = (typeof managerReservationStatuses)[number];
type LockedStorageUnit = { id: string; unitNumber: string; floor: string | null; zone: string | null; row: number | null; position: number | null };

const reservationTransitions: Record<ManagerReservationStatus, readonly ManagerReservationStatus[]> = {
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService = new PricingService(prisma),
    private readonly contracts: ContractsService = new ContractsService(prisma),
    private readonly billing: BillingService = new BillingService(prisma),
  ) {}

  async getCatalog() {
    const records = await this.prisma.storageType.findMany({ orderBy: { code: 'asc' } });
    const products = records.map((record) => this.toProduct(record));
    const sizes = [...new Map(records.map((record) => [record.sizeId, record])).values()]
      .sort((a, b) => sizeOrder.indexOf(a.sizeId) - sizeOrder.indexOf(b.sizeId))
      .map((record) => ({
        id: record.sizeId,
        name: record.sizeName,
        kicker: record.kicker,
        dimensions: this.dimensions(record),
        floorArea: this.floorArea(record),
        volume: this.volume(record),
        illustrationScale: illustrationScale[record.sizeId] ?? 50,
        roomEquivalent: record.roomEquivalent,
        capacity: record.capacity,
        boxCount: record.boxCount,
        suitableItems: this.stringArray(record.suitableItems),
        image: record.image,
      }));
    return {
      products,
      sizes,
      approvedDurations,
      addons: [],
      pricingPolicy: 'PRICING_V1' as const,
      inventoryPolicy: 'DATABASE_PHYSICAL_UNITS' as const,
    };
  }

  async checkAvailability(input: Record<string, unknown>): Promise<AvailabilityResult> {
    const { draft } = await this.validateDraft(input);
    return this.checkAvailabilityForDraft(this.prisma, draft);
  }

  async createReservation(user: PublicUser, input: Record<string, unknown>): Promise<PendingReservation> {
    const { draft } = await this.validateDraft(input);
    this.assertPayLater(draft);
    const idempotencyKey = this.fingerprint('reservation', user.id, draft);
    const existing = await this.prisma.reservation.findUnique({
      where: { idempotencyKey },
      include: { customer: true, storageType: true },
    });
    if (existing) return this.toReservation(existing);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const record = await this.prisma.$transaction(async (tx) => {
          const product = await tx.storageType.findUnique({ where: { id: draft.productId } });
          if (!product) throw new BadRequestException('Mã sản phẩm không hợp lệ.');
          const availability = await this.checkAvailabilityForDraft(tx, draft, undefined, product);
          if (!availability.available) throw new ConflictException({ message: availability.message, availability });
          return tx.reservation.create({
            data: {
              reservationCode: this.createReference('WDP'),
              customerId: user.id,
              facilityId: product.facilityId,
              storageTypeId: product.id,
              quantity: draft.quantity,
              startDate: this.date(draft.startDate),
              endDate: this.date(availability.endDateExclusive),
              periodMode: draft.periodMode === 'dates' ? 'CUSTOM_DATES' : 'DURATION',
              durationMonths: draft.periodMode === 'duration' ? draft.durationMonths : null,
              adjacentPreference: draft.adjacencyPreference,
              availabilitySnapshot: availability as unknown as Prisma.InputJsonValue,
              quoteSnapshot: availability.quote as unknown as Prisma.InputJsonValue,
              status: 'PENDING',
              notes: draft.note,
              idempotencyKey,
            },
            include: { customer: true, storageType: true },
          });
        }, { maxWait: 10000, timeout: 20000 });
        return this.toReservation(record);
      } catch (error) {
        if (this.isUniqueError(error)) {
          const duplicate = await this.prisma.reservation.findUnique({
            where: { idempotencyKey },
            include: { customer: true, storageType: true },
          });
          if (duplicate) return this.toReservation(duplicate);
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Không thể tạo mã reservation duy nhất. Vui lòng thử lại.');
  }

  async createInquiry(input: Record<string, unknown>): Promise<GuestInquiry> {
    const { draft } = await this.validateDraft(input);
    this.assertPayLater(draft);
    const customer = this.validateGuestContact(input);
    const idempotencyKey = this.fingerprint('inquiry', customer.email, draft, customer.phone);
    const accessToken = this.inquiryAccessToken(idempotencyKey);
    const existing = await this.prisma.contactInquiry.findUnique({
      where: { idempotencyKey },
      include: { storageType: true },
    });
    if (existing) return this.toInquiry(existing, accessToken);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const record = await this.prisma.$transaction(async (tx) => {
          const product = await tx.storageType.findUnique({ where: { id: draft.productId } });
          if (!product) throw new BadRequestException('Mã sản phẩm không hợp lệ.');
          const availability = await this.checkAvailabilityForDraft(tx, draft, undefined, product);
          if (!availability.available) throw new ConflictException({ message: availability.message, availability });
          return tx.contactInquiry.create({
            data: {
              inquiryCode: this.createReference('WDPQ'),
              lookupTokenHash: this.tokenHash(accessToken),
              facilityId: product.facilityId,
              storageTypeId: product.id,
              fullName: customer.fullName,
              email: customer.email,
              phone: customer.phone,
              quantity: draft.quantity,
              startDate: this.date(draft.startDate),
              endDate: this.date(availability.endDateExclusive),
              periodMode: draft.periodMode === 'dates' ? 'CUSTOM_DATES' : 'DURATION',
              durationMonths: draft.periodMode === 'duration' ? draft.durationMonths : null,
              adjacentPreference: draft.adjacencyPreference,
              availabilitySnapshot: availability as unknown as Prisma.InputJsonValue,
              quoteSnapshot: availability.quote as unknown as Prisma.InputJsonValue,
              customerNotes: draft.note,
              idempotencyKey,
            },
            include: { storageType: true },
          });
        }, { maxWait: 10000, timeout: 20000 });
        return this.toInquiry(record, accessToken);
      } catch (error) {
        if (this.isUniqueError(error)) {
          const duplicate = await this.prisma.contactInquiry.findUnique({
            where: { idempotencyKey },
            include: { storageType: true },
          });
          if (duplicate) return this.toInquiry(duplicate, accessToken);
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Không thể tạo mã yêu cầu duy nhất. Vui lòng thử lại.');
  }

  async listReservations(userId: string) {
    const records = await this.prisma.reservation.findMany({
      where: { customerId: userId },
      include: { customer: true, storageType: true },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.toReservation(record));
  }

  async getReservation(user: PublicUser, id: string) {
    const record = await this.prisma.reservation.findFirst({
      where: { OR: [{ id }, { reservationCode: id }] },
      include: { customer: true, storageType: true },
    });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu đặt kho.');
    if (record.customerId !== user.id && !['MANAGER', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Bạn không có quyền xem yêu cầu đặt kho này.');
    }
    return this.toReservation(record);
  }

  async listManagerReservations(page: number, limit: number) {
    const [total, records] = await Promise.all([
      this.prisma.reservation.count(),
      this.prisma.reservation.findMany({
        skip: (page - 1) * limit,
        take: limit,
        include: { customer: true, storageType: true, units: { include: { storageUnit: true }, orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { page, limit, total, items: records.map((record) => this.toManagerReservation(record)) };
  }

  async getManagerReservation(id: string) {
    const record = await this.prisma.reservation.findFirst({
      where: { OR: [{ id }, { reservationCode: id }] },
      include: { customer: true, storageType: true, units: { include: { storageUnit: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!record) throw new NotFoundException('Không tìm thấy reservation.');
    return this.toManagerReservation(record);
  }

  async updateManagerReservationStatus(id: string, input: Record<string, unknown>, manager: PublicUser) {
    if (!['MANAGER', 'ADMIN'].includes(manager.role)) throw new ForbiddenException('Chỉ Manager hoặc Admin được cập nhật reservation.');
    const requestedStatus = typeof input.status === 'string' ? input.status : '';
    if (!managerReservationStatuses.includes(requestedStatus as ManagerReservationStatus)) {
      throw new BadRequestException('Trạng thái Reservation không hợp lệ.');
    }
    const targetStatus = requestedStatus as ManagerReservationStatus;
    const existing = await this.prisma.reservation.findFirst({ where: { OR: [{ id }, { reservationCode: id }] }, select: { id: true } });
    if (!existing) throw new NotFoundException('Không tìm thấy reservation.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Reservation" WHERE "id" = ${existing.id} FOR UPDATE`);
        const current = await tx.reservation.findUnique({
          where: { id: existing.id },
          include: { customer: true, storageType: true, units: { include: { storageUnit: true }, orderBy: { createdAt: 'asc' } } },
        });
        if (!current) throw new NotFoundException('Không tìm thấy reservation.');
        if (current.status === targetStatus) {
          // Safely backfill legacy confirmed reservations only when their complete allocation exists.
          if (targetStatus === 'CONFIRMED') {
            await this.contracts.ensureForConfirmedReservation(tx, current.id);
            await this.billing.ensureInitialInvoice(tx, current.id);
          }
          const refreshed = await tx.reservation.findUnique({
            where: { id: current.id },
            include: { customer: true, storageType: true, units: { include: { storageUnit: true }, orderBy: { createdAt: 'asc' } } },
          });
          return this.toManagerReservation(refreshed!);
        }
        const allowed = reservationTransitions[current.status as ManagerReservationStatus] ?? [];
        if (!allowed.includes(targetStatus)) {
          throw new ConflictException(`Không thể chuyển reservation từ ${current.status} sang ${targetStatus}.`);
        }
        if (targetStatus === 'CONFIRMED') return this.confirmReservation(tx, current);

        if (current.status === 'CONFIRMED' && targetStatus === 'CANCELLED') {
          await tx.reservationUnit.updateMany({ where: { reservationId: current.id, releasedAt: null }, data: { releasedAt: new Date() } });
        }
        const updated = await tx.reservation.update({
          where: { id: current.id },
          data: { status: targetStatus },
          include: { customer: true, storageType: true, units: { include: { storageUnit: true }, orderBy: { createdAt: 'asc' } } },
        });
        return this.toManagerReservation(updated);
      }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
    } catch (error) {
      if (this.isPrismaCode(error, 'P2034')) throw new ConflictException('Reservation vừa được cập nhật bởi yêu cầu khác. Vui lòng tải lại và thử lại.');
      throw error;
    }
  }

  async getInquiry(id: string, accessToken: string | undefined) {
    const record = await this.prisma.contactInquiry.findFirst({
      where: { OR: [{ id }, { inquiryCode: id }] },
      include: { storageType: true },
    });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu liên hệ.');
    if (!accessToken || !this.safeEqual(record.lookupTokenHash, this.tokenHash(accessToken))) {
      throw new ForbiddenException('Mã truy cập yêu cầu không hợp lệ.');
    }
    return this.toInquiry(record);
  }

  async listManagerInquiries(page: number, limit: number) {
    const [inquiries, reservations] = await Promise.all([
      this.prisma.contactInquiry.findMany({ include: { storageType: true, processedBy: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.reservation.findMany({ include: { customer: true, storageType: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    const items = [
      ...inquiries.map((record) => this.toManagerInquiry(record)),
      ...reservations.map((record) => this.toManagerReservation(record)),
    ].sort((first, second) => second.createdAt.localeCompare(first.createdAt));
    const total = items.length;
    return { page, limit, total, items: items.slice((page - 1) * limit, page * limit) };
  }

  async getManagerInquiry(id: string) {
    const inquiry = await this.prisma.contactInquiry.findFirst({
      where: { OR: [{ id }, { inquiryCode: id }] },
      include: { storageType: true, processedBy: true },
    });
    if (inquiry) return this.toManagerInquiry(inquiry);
    const reservation = await this.prisma.reservation.findFirst({
      where: { OR: [{ id }, { reservationCode: id }] },
      include: { customer: true, storageType: true },
    });
    if (!reservation) throw new NotFoundException('Không tìm thấy yêu cầu.');
    return this.toManagerReservation(reservation);
  }

  async updateManagerInquiry(id: string, input: Record<string, unknown>, manager: PublicUser) {
    const status = typeof input.status === 'string' ? input.status : '';
    const internalNotes = typeof input.internalNotes === 'string' ? input.internalNotes.trim().slice(0, 2000) : undefined;
    const currentInquiry = await this.prisma.contactInquiry.findFirst({ where: { OR: [{ id }, { inquiryCode: id }] } });
    if (currentInquiry) {
      if (!managerInquiryStatuses.includes(status as (typeof managerInquiryStatuses)[number])) {
        throw new BadRequestException('Trạng thái Inquiry không hợp lệ.');
      }
      const record = await this.prisma.contactInquiry.update({
        where: { id: currentInquiry.id },
        data: {
          status: status as (typeof managerInquiryStatuses)[number],
          ...(internalNotes !== undefined ? { internalNotes: internalNotes || null } : {}),
          processedById: manager.id,
          ...(status === 'CONTACTED' && !currentInquiry.contactedAt ? { contactedAt: new Date() } : {}),
        },
        include: { storageType: true, processedBy: true },
      });
      return this.toManagerInquiry(record);
    }
    const currentReservation = await this.prisma.reservation.findFirst({ where: { OR: [{ id }, { reservationCode: id }] }, select: { id: true } });
    if (!currentReservation) throw new NotFoundException('Không tìm thấy yêu cầu.');
    return this.updateManagerReservationStatus(currentReservation.id, { status }, manager);
  }

  private async confirmReservation(tx: Prisma.TransactionClient, reservation: any) {
    if (!Number.isInteger(reservation.quantity) || reservation.quantity < 1) {
      throw new BadRequestException('Số lượng reservation không hợp lệ.');
    }
    if (reservation.units.length > 0) {
      throw new ConflictException('Reservation PENDING không được có allocation trước khi xác nhận.');
    }

    const draft = this.draftFromReservation(reservation);
    const lockedUnits = await tx.$queryRaw<LockedStorageUnit[]>(Prisma.sql`
      SELECT "id", "unitNumber", "floor", "zone", "row", "position"
      FROM "StorageUnit"
      WHERE "storageTypeId" = ${reservation.storageTypeId}
        AND "status" = 'AVAILABLE'::"UnitStatus"
      ORDER BY "id"
      FOR UPDATE
    `);
    const availability = await this.checkAvailabilityForDraft(tx, draft, reservation.quoteSnapshot as QuoteSnapshot);
    if (!availability.available) throw new ConflictException({ message: availability.message, availability });

    const start = this.date(draft.startDate);
    const end = this.date(availability.endDateExclusive);
    const conflictingAllocations = lockedUnits.length ? await tx.reservationUnit.findMany({
      where: {
        storageUnitId: { in: lockedUnits.map((unit) => unit.id) },
        releasedAt: null,
        plannedStartDate: { lt: end },
        plannedEndDate: { gt: start },
        reservation: { status: 'CONFIRMED' },
      },
      select: { storageUnitId: true },
    }) : [];
    const blockedIds = new Set(conflictingAllocations.map((allocation) => allocation.storageUnitId));
    for (const unitId of await this.approvedRenewalBlockedUnitIds(tx, lockedUnits.map((unit) => unit.id), start, end)) blockedIds.add(unitId);
    const availableUnits = lockedUnits.filter((unit) => !blockedIds.has(unit.id));
    if (availableUnits.length < reservation.quantity) {
      throw new ConflictException('Không đủ kho vật lý cho toàn bộ khoảng thuê. Reservation vẫn ở trạng thái PENDING.');
    }
    const selectedUnits = this.selectPreferredUnits(availableUnits, reservation.quantity, reservation.adjacentPreference);
    await tx.reservationUnit.createMany({
      data: selectedUnits.map((unit) => ({
        reservationId: reservation.id,
        storageUnitId: unit.id,
        plannedStartDate: start,
        plannedEndDate: end,
      })),
    });
    const updated = await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), availabilitySnapshot: availability as unknown as Prisma.InputJsonValue },
      include: { customer: true, storageType: true, units: { include: { storageUnit: true }, orderBy: { createdAt: 'asc' } } },
    });
    await this.contracts.ensureForConfirmedReservation(tx, updated.id);
    await this.billing.ensureInitialInvoice(tx, updated.id);
    return this.toManagerReservation(updated);
  }

  private draftFromReservation(record: any): ReservationDraft {
    const periodMode = record.periodMode === 'CUSTOM_DATES' ? 'dates' as const : 'duration' as const;
    const snapshot = record.quoteSnapshot as { paymentPlan?: PaymentPlan };
    return {
      productId: record.storageTypeId,
      startDate: this.isoDate(record.startDate),
      ...(periodMode === 'dates' ? { endDate: this.isoDate(record.endDate) } : { durationMonths: record.durationMonths }),
      periodMode,
      quantity: record.quantity,
      adjacencyPreference: record.adjacentPreference,
      addonIds: [],
      paymentChoice: 'pay-later',
      paymentPlan: snapshot.paymentPlan ?? 'PAY_MONTHLY',
    };
  }

  private selectPreferredUnits(units: LockedStorageUnit[], quantity: number, adjacentPreference: boolean) {
    const ordered = [...units].sort((first, second) => this.compareUnitLocation(first, second));
    if (!adjacentPreference || quantity === 1) return ordered.slice(0, quantity);

    const groups = new Map<string, LockedStorageUnit[]>();
    for (const unit of ordered) {
      const key = [unit.floor ?? '', unit.zone ?? '', unit.row ?? ''].join('|');
      groups.set(key, [...(groups.get(key) ?? []), unit]);
    }
    let best: { units: LockedStorageUnit[]; score: number } | undefined;
    for (const group of groups.values()) {
      if (group.length < quantity) continue;
      for (let index = 0; index <= group.length - quantity; index += 1) {
        const window = group.slice(index, index + quantity);
        const positions = window.map((unit) => unit.position).filter((position): position is number => position !== null);
        const score = positions.length === quantity ? Math.max(...positions) - Math.min(...positions) : Number.MAX_SAFE_INTEGER;
        if (!best || score < best.score) best = { units: window, score };
      }
    }
    return best?.units ?? ordered.slice(0, quantity);
  }

  private compareUnitLocation(first: LockedStorageUnit, second: LockedStorageUnit) {
    return (first.floor ?? '').localeCompare(second.floor ?? '')
      || (first.zone ?? '').localeCompare(second.zone ?? '')
      || (first.row ?? Number.MAX_SAFE_INTEGER) - (second.row ?? Number.MAX_SAFE_INTEGER)
      || (first.position ?? Number.MAX_SAFE_INTEGER) - (second.position ?? Number.MAX_SAFE_INTEGER)
      || first.unitNumber.localeCompare(second.unitNumber);
  }

  private async checkAvailabilityForDraft(db: DbClient, draft: ReservationDraft, historicalQuote?: QuoteSnapshot, knownStorageType?: any): Promise<AvailabilityResult> {
    const endDateExclusive = this.getEndDateExclusive(draft);
    const quote = historicalQuote ?? await this.calculateCurrentQuote(db, draft, endDateExclusive, knownStorageType);
    const start = this.date(draft.startDate);
    const end = this.date(endDateExclusive);
    const units = await db.storageUnit.findMany({
      where: { storageTypeId: draft.productId, status: 'AVAILABLE' },
      select: { id: true },
    });
    const unitIds = units.map((unit) => unit.id);
    const allocations = unitIds.length ? await db.reservationUnit.findMany({
      where: {
        storageUnitId: { in: unitIds },
        releasedAt: null,
        plannedStartDate: { lt: end },
        plannedEndDate: { gt: start },
        reservation: { status: 'CONFIRMED' },
      },
      select: { storageUnitId: true },
    }) : [];
    const blocked = new Set(allocations.map((allocation) => allocation.storageUnitId));
    for (const unitId of await this.approvedRenewalBlockedUnitIds(db, unitIds, start, end)) blocked.add(unitId);
    const availableUnits = unitIds.filter((id) => !blocked.has(id)).length;
    if (availableUnits >= draft.quantity) {
      return {
        available: true,
        startDate: draft.startDate,
        endDateExclusive,
        periodStatus: quote.periodStatus,
        reasonCode: 'AVAILABLE',
        message: `Còn ${availableUnits} kho vật lý phù hợp cho toàn bộ khoảng thuê. Kết quả này chưa giữ kho.`,
        quote,
      };
    }
    const occupiedCount = await db.storageUnit.count({ where: { storageTypeId: draft.productId, status: 'OCCUPIED' } });
    const reasonCode = unitIds.length === 0 && occupiedCount > 0 ? 'OCCUPIED' : allocations.length > 0 ? 'CONFLICT' : 'INSUFFICIENT_INVENTORY';
    const message = reasonCode === 'OCCUPIED'
      ? 'Các kho vật lý phù hợp vẫn đang ở trạng thái OCCUPIED và chỉ được mở lại khi nhân viên xác nhận trả kho.'
      : reasonCode === 'CONFLICT'
        ? 'Không đủ kho cho toàn bộ khoảng thuê vì có reservation đã xác nhận bị trùng thời gian.'
        : `Chỉ còn ${availableUnits} kho phù hợp, ít hơn số lượng ${draft.quantity} đang yêu cầu.`;
    return { available: false, startDate: draft.startDate, endDateExclusive, periodStatus: quote.periodStatus, reasonCode, message, quote };
  }

  private async approvedRenewalBlockedUnitIds(db: DbClient, candidateUnitIds: string[], start: Date, end: Date) {
    if (candidateUnitIds.length === 0) return [];
    const renewals = await db.renewalRequest.findMany({
      where: {
        status: 'APPROVED_PENDING_PAYMENT',
        previousEndDate: { lt: end },
        requestedEndDate: { gt: start },
        reservation: { units: { some: { storageUnitId: { in: candidateUnitIds }, releasedAt: null } } },
      },
      select: { reservation: { select: { units: { where: { storageUnitId: { in: candidateUnitIds }, releasedAt: null }, select: { storageUnitId: true } } } } },
    });
    return renewals.flatMap((renewal) => renewal.reservation.units.map((unit) => unit.storageUnitId));
  }

  private async calculateCurrentQuote(db: DbClient, draft: ReservationDraft, endDateExclusive: string, knownStorageType?: any) {
    const storageType = knownStorageType ?? await db.storageType.findUnique({ where: { id: draft.productId } });
    if (!storageType) throw new BadRequestException('Mã sản phẩm không hợp lệ.');
    return this.pricing.calculate(storageType, {
      storageTypeId: draft.productId,
      quantity: draft.quantity,
      startDate: draft.startDate,
      endDate: endDateExclusive,
      paymentPlan: draft.paymentPlan,
    });
  }

  private async validateDraft(input: Record<string, unknown>) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Dữ liệu đặt kho không hợp lệ.');
    const productId = typeof input.productId === 'string' ? input.productId : '';
    const product = await this.prisma.storageType.findUnique({ where: { id: productId } });
    if (!product) throw new BadRequestException('Mã sản phẩm không hợp lệ.');
    const startDate = typeof input.startDate === 'string' ? input.startDate : '';
    if (!this.isDate(startDate) || startDate < new Date().toISOString().slice(0, 10)) throw new BadRequestException('Ngày bắt đầu không hợp lệ.');
    const periodMode = input.periodMode === 'dates' ? 'dates' as const : 'duration' as const;
    const durationMonths = Number(input.durationMonths);
    const endDate = typeof input.endDate === 'string' ? input.endDate : undefined;
    if (periodMode === 'duration' && !approvedDurations.includes(durationMonths as (typeof approvedDurations)[number])) throw new BadRequestException('Thời hạn thuê không nằm trong danh sách được duyệt.');
    if (periodMode === 'dates' && (!endDate || !this.isDate(endDate) || endDate <= startDate)) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu.');
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 3) throw new BadRequestException('Số lượng phải từ 1 đến 3.');
    const adjacencyPreference = input.adjacencyPreference === true && quantity > 1;
    const addonIds = Array.isArray(input.addonIds) ? input.addonIds.filter((value): value is string => typeof value === 'string') : [];
    if (addonIds.length > 0) throw new BadRequestException('Chưa có dịch vụ bổ sung nào được WDP duyệt.');
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : undefined;
    const paymentChoice = input.paymentChoice === 'pay-now' ? 'pay-now' as const : 'pay-later' as const;
    const paymentPlanInput = input.paymentPlan;
    if (!['PAY_MONTHLY', 'PREPAID'].includes(paymentPlanInput as string)) throw new BadRequestException('paymentPlan phải là PAY_MONTHLY hoặc PREPAID.');
    const paymentPlan = paymentPlanInput as PaymentPlan;
    const draft: ReservationDraft = { productId, startDate, ...(endDate ? { endDate } : {}), periodMode, ...(periodMode === 'duration' ? { durationMonths } : {}), quantity, adjacencyPreference, addonIds, ...(note ? { note } : {}), paymentChoice, paymentPlan };
    return { draft, product };
  }

  private validateGuestContact(input: Record<string, unknown>): GuestContact {
    const fullName = this.requiredText(input.fullName, 'Họ và tên', 2);
    const phone = this.requiredText(input.phone, 'Số điện thoại', 8);
    const email = this.requiredText(input.email, 'Email', 5).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestException('Email không hợp lệ.');
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : undefined;
    return { fullName, phone, email, ...(note ? { note } : {}) };
  }

  private assertPayLater(draft: ReservationDraft) {
    if (draft.paymentChoice === 'pay-now') throw new BadRequestException('Thanh toán ngay chưa được mở vì WDP chưa tích hợp gateway được xác minh và chưa có tổng tiền cuối.');
  }

  private getEndDateExclusive(draft: ReservationDraft) {
    return draft.periodMode === 'dates' ? draft.endDate! : this.addMonths(draft.startDate, draft.durationMonths!);
  }

  private toProduct(record: any): BookingProduct & Record<string, unknown> {
    return {
      id: record.id,
      code: record.code,
      name: record.name,
      sizeId: record.sizeId,
      condition: record.condition === 'AIR_CONDITIONED' ? 'climate' : 'standard',
      status: record.catalogStatus === 'LIMITED' ? 'limited' : 'available',
      floor: record.floor,
      access: record.access,
      monthlyPrice: record.monthlyRate === null ? null : Number(record.monthlyRate),
      depositMonths: record.depositMonths,
      minRentalDays: record.minRentalDays,
      allowDailyRental: record.allowDailyRental,
      features: this.stringArray(record.features),
      image: record.image,
      dimensions: this.dimensions(record),
      floorArea: this.floorArea(record),
      volume: this.volume(record),
    };
  }

  private toReservation(record: any): PendingReservation {
    const quote = record.quoteSnapshot as QuoteSnapshot;
    return {
      productId: record.storageTypeId,
      startDate: this.isoDate(record.startDate),
      endDate: this.isoDate(record.endDate),
      periodMode: record.periodMode === 'CUSTOM_DATES' ? 'dates' : 'duration',
      ...(record.durationMonths ? { durationMonths: record.durationMonths } : {}),
      quantity: record.quantity,
      adjacencyPreference: record.adjacentPreference,
      addonIds: [],
      ...(record.notes ? { note: record.notes } : {}),
      paymentChoice: 'pay-later',
      paymentPlan: quote.paymentPlan ?? 'PAY_MONTHLY',
      id: record.reservationCode,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      endDateExclusive: this.isoDate(record.endDate),
      customer: { id: record.customer.id, fullName: record.customer.fullName, email: record.customer.email, phone: record.customer.phone ?? '', role: record.customer.role },
      product: this.toProduct(record.storageType),
      quote,
      unitAssignment: null,
      paymentStatus: 'NOT_STARTED',
      persistence: 'DATABASE',
    };
  }

  private toInquiry(record: any, accessToken?: string): GuestInquiry {
    const quote = record.quoteSnapshot as QuoteSnapshot;
    return {
      productId: record.storageTypeId,
      startDate: this.isoDate(record.startDate),
      endDate: this.isoDate(record.endDate),
      periodMode: record.periodMode === 'CUSTOM_DATES' ? 'dates' : 'duration',
      ...(record.durationMonths ? { durationMonths: record.durationMonths } : {}),
      quantity: record.quantity,
      adjacencyPreference: record.adjacentPreference,
      addonIds: [],
      ...(record.customerNotes ? { note: record.customerNotes } : {}),
      paymentChoice: 'pay-later',
      paymentPlan: quote.paymentPlan ?? 'PAY_MONTHLY',
      id: record.inquiryCode,
      status: 'PENDING_CONTACT',
      createdAt: record.createdAt.toISOString(),
      endDateExclusive: this.isoDate(record.endDate),
      customer: { fullName: record.fullName, phone: record.phone, email: record.email, ...(record.customerNotes ? { note: record.customerNotes } : {}) },
      product: this.toProduct(record.storageType),
      quote,
      inventoryGuarantee: false,
      persistence: 'DATABASE',
      ...(accessToken ? { accessToken } : {}),
    };
  }

  private toManagerInquiry(record: any) {
    return {
      id: record.inquiryCode,
      reference: record.inquiryCode,
      requestType: 'INQUIRY',
      customer: { fullName: record.fullName, email: record.email, phone: record.phone },
      product: this.toProduct(record.storageType),
      quantity: record.quantity,
      startDate: this.isoDate(record.startDate),
      endDateExclusive: this.isoDate(record.endDate),
      periodMode: record.periodMode === 'CUSTOM_DATES' ? 'dates' : 'duration',
      durationMonths: record.durationMonths,
      adjacencyPreference: record.adjacentPreference,
      availability: record.availabilitySnapshot,
      quote: record.quoteSnapshot,
      customerNotes: record.customerNotes,
      internalNotes: record.internalNotes,
      status: record.status,
      contactedAt: record.contactedAt?.toISOString() ?? null,
      processedBy: record.processedBy ? { id: record.processedBy.id, fullName: record.processedBy.fullName } : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toManagerReservation(record: any) {
    return {
      id: record.reservationCode,
      reference: record.reservationCode,
      requestType: 'RESERVATION',
      customer: { fullName: record.customer.fullName, email: record.customer.email, phone: record.customer.phone ?? '' },
      product: this.toProduct(record.storageType),
      quantity: record.quantity,
      startDate: this.isoDate(record.startDate),
      endDateExclusive: this.isoDate(record.endDate),
      periodMode: record.periodMode === 'CUSTOM_DATES' ? 'dates' : 'duration',
      durationMonths: record.durationMonths,
      adjacencyPreference: record.adjacentPreference,
      availability: record.availabilitySnapshot,
      quote: record.quoteSnapshot,
      customerNotes: record.notes,
      internalNotes: record.notes,
      status: record.status,
      contactedAt: null,
      processedBy: null,
      confirmedAt: record.confirmedAt?.toISOString() ?? null,
      allocatedUnits: (record.units ?? []).map((allocation: any) => ({
        id: allocation.id,
        unitId: allocation.storageUnitId,
        unitNumber: allocation.storageUnit.unitNumber,
        floor: allocation.storageUnit.floor,
        zone: allocation.storageUnit.zone,
        row: allocation.storageUnit.row,
        position: allocation.storageUnit.position,
        physicalStatus: allocation.storageUnit.status,
        plannedStartDate: this.isoDate(allocation.plannedStartDate),
        plannedEndDate: this.isoDate(allocation.plannedEndDate),
        releasedAt: allocation.releasedAt?.toISOString() ?? null,
      })),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private dimensions(record: { widthCm: number; lengthCm: number; heightCm: number }) {
    return `${this.meters(record.widthCm)} × ${this.meters(record.lengthCm)} × ${this.meters(record.heightCm)} m`;
  }

  private floorArea(record: { widthCm: number; lengthCm: number }) {
    return this.decimal(record.widthCm * record.lengthCm / 10000) + ' m²';
  }

  private volume(record: { widthCm: number; lengthCm: number; heightCm: number }) {
    return 'Khoảng ' + this.decimal(record.widthCm * record.lengthCm * record.heightCm / 1000000) + ' m³';
  }

  private meters(value: number) { return (value / 100).toFixed(1).replace('.', ','); }
  private decimal(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ','); }
  private stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
  private isoDate(value: Date) { return value.toISOString().slice(0, 10); }
  private date(value: string) { return new Date(value + 'T00:00:00.000Z'); }
  private createReference(prefix: 'WDP' | 'WDPQ') { return `${prefix}-${new Date().getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`; }
  private fingerprint(...parts: unknown[]) { return createHash('sha256').update(JSON.stringify(parts)).digest('hex'); }
  private tokenHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private inquiryAccessToken(idempotencyKey: string) {
    const secret = process.env.INQUIRY_LOOKUP_SECRET;
    if (!secret || secret.length < 32) throw new Error('INQUIRY_LOOKUP_SECRET must contain at least 32 characters.');
    return createHmac('sha256', secret).update(idempotencyKey).digest('hex');
  }
  private safeEqual(first: string, second: string) {
    const a = Buffer.from(first);
    const b = Buffer.from(second);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  private isUniqueError(error: unknown) { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'; }
  private isPrismaCode(error: unknown, code: string) { return typeof error === 'object' && error !== null && 'code' in error && error.code === code; }
  private isDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00.000Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  private addMonths(startDate: string, months: number) {
    const start = this.date(startDate);
    const day = start.getUTCDate();
    const result = new Date(start);
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const daysInMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, daysInMonth));
    return this.isoDate(result);
  }
  private requiredText(value: unknown, label: string, minimumLength: number) {
    if (typeof value !== 'string' || value.trim().length < minimumLength) throw new BadRequestException(label + ' phải có ít nhất ' + minimumLength + ' ký tự.');
    return value.trim();
  }
}
