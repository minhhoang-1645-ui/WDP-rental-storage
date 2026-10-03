import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import type { BookingProduct } from './booking.catalog.js';
import { approvedDurations, type AvailabilityResult, type GuestContact, type GuestInquiry, type PendingReservation, type QuoteSnapshot, type ReservationDraft } from './booking.types.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const sizeOrder = ['locker', 'small', 'medium', 'large'];
const illustrationScale: Record<string, number> = { locker: 28, small: 44, medium: 66, large: 88 };
const managerInquiryStatuses = ['PENDING_CONTACT', 'CONTACTED', 'IN_REVIEW', 'CLOSED', 'CANCELLED'] as const;
const managerReservationStatuses = ['PENDING', 'CANCELLED', 'EXPIRED'] as const;

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) {}

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
      pricingPolicy: 'QUOTE_REQUIRED' as const,
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
          const availability = await this.checkAvailabilityForDraft(tx, draft);
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
        });
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
          const availability = await this.checkAvailabilityForDraft(tx, draft);
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
        });
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
    const currentReservation = await this.prisma.reservation.findFirst({ where: { OR: [{ id }, { reservationCode: id }] } });
    if (!currentReservation) throw new NotFoundException('Không tìm thấy yêu cầu.');
    if (!managerReservationStatuses.includes(status as (typeof managerReservationStatuses)[number])) {
      throw new BadRequestException('Trạng thái Reservation không hợp lệ.');
    }
    const record = await this.prisma.reservation.update({
      where: { id: currentReservation.id },
      data: { status: status as (typeof managerReservationStatuses)[number], ...(internalNotes !== undefined ? { notes: internalNotes || null } : {}) },
      include: { customer: true, storageType: true },
    });
    return this.toManagerReservation(record);
  }

  private async checkAvailabilityForDraft(db: DbClient, draft: ReservationDraft): Promise<AvailabilityResult> {
    const endDateExclusive = this.getEndDateExclusive(draft);
    const quote = this.buildQuote(draft, endDateExclusive);
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
    const draft: ReservationDraft = { productId, startDate, ...(endDate ? { endDate } : {}), periodMode, ...(periodMode === 'duration' ? { durationMonths } : {}), quantity, adjacencyPreference, addonIds, ...(note ? { note } : {}), paymentChoice };
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

  private buildQuote(draft: ReservationDraft, endDateExclusive: string): QuoteSnapshot {
    const days = Math.round((Date.parse(endDateExclusive + 'T00:00:00.000Z') - Date.parse(draft.startDate + 'T00:00:00.000Z')) / 86400000);
    const periodStatus = draft.periodMode === 'duration' ? 'APPROVED_DURATION' as const : days < 28 ? 'SHORT_DURATION_UNDECIDED' as const : 'DATE_RANGE_QUOTE_REQUIRED' as const;
    return {
      status: 'QUOTE_REQUIRED',
      periodStatus,
      lineItems: [
        { code: 'storage-rent', label: 'Tiền thuê kho', basis: draft.periodMode === 'duration' ? String(draft.durationMonths) + ' tháng' : String(days) + ' ngày', amount: null, status: 'QUOTE_REQUIRED' },
        { code: 'deposit', label: 'Tiền đặt cọc', basis: 'Theo báo giá được xác nhận', amount: null, status: 'QUOTE_REQUIRED' },
        { code: 'fees', label: 'Phí và thuế áp dụng', basis: 'Chưa có chính sách được duyệt', amount: null, status: 'QUOTE_REQUIRED' },
      ],
      rentalSubtotal: null,
      deposit: null,
      applicableFees: null,
      taxes: null,
      discounts: null,
      grandTotal: null,
      amountPayableNow: null,
      message: periodStatus === 'SHORT_DURATION_UNDECIDED' ? 'Thời hạn dưới một tháng chưa có chính sách giá. WDP cần xác nhận báo giá, không thanh toán ngay.' : 'Giá thuê, tiền cọc, phí, thuế và chiết khấu chưa có chính sách được phê duyệt. WDP sẽ báo giá riêng.',
    };
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
      id: record.reservationCode,
      status: 'PENDING',
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
