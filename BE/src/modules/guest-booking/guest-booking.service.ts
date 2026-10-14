import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { BookingService } from '../booking/booking.service.js';
import { EmailService } from './email.service.js';

@Injectable()
export class GuestBookingService {
  constructor(private readonly prisma: PrismaService, private readonly booking: BookingService, private readonly email: EmailService, private readonly config: ConfigService) {}

  async create(input: Record<string, unknown>, keyInput?: string) {
    const parsed = this.parse(input);
    const key = this.key(keyInput);
    const availability = await this.booking.checkAvailability({ productId: parsed.storageTypeId, startDate: parsed.startDate, endDate: parsed.endDate, periodMode: 'dates', quantity: parsed.quantity, adjacencyPreference: false, services: parsed.services, addonIds: [], paymentChoice: 'pay-later', paymentPlan: parsed.paymentPlan });
    if (!availability.available) throw new ConflictException({ code: 'REQUESTED_STORAGE_NOT_AVAILABLE', message: availability.message, availability });
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.tokenTtlMinutes() * 60_000);
    let record = await this.prisma.guestBookingRequest.findUnique({ where: { idempotencyKey: key }, include: { storageType: true, services: true } });
    if (record && !this.sameRequest(record, parsed)) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key đã dùng cho yêu cầu khác.' });
    if (record && record.status !== 'PENDING_VERIFICATION') return this.view(record);
    if (record) {
      record = await this.prisma.guestBookingRequest.update({ where: { id: record.id }, data: { claimTokenHash: this.hash(token), claimTokenExpiresAt: expiresAt }, include: { storageType: true, services: true } });
    } else {
      for (let attempt = 0; attempt < 3 && !record; attempt += 1) {
        try {
          const product = await this.prisma.storageType.findUniqueOrThrow({ where: { id: parsed.storageTypeId } });
          record = await this.prisma.guestBookingRequest.create({ data: { bookingCode: this.code(), fullName: parsed.fullName, email: parsed.email, phone: parsed.phone, storageTypeId: parsed.storageTypeId, quantity: parsed.quantity, startDate: new Date(`${parsed.startDate}T00:00:00.000Z`), endDate: new Date(`${parsed.endDate}T00:00:00.000Z`), paymentPlan: parsed.paymentPlan, facilityId: product.facilityId, quoteSnapshot: availability.quote as unknown as Prisma.InputJsonValue, availabilitySnapshot: availability as unknown as Prisma.InputJsonValue, claimTokenHash: this.hash(token), claimTokenExpiresAt: expiresAt, idempotencyKey: key, services: { create: parsed.services.map((service) => ({ additionalServiceId: service.serviceId, quantity: service.quantity, serviceStartDate: service.serviceStartDate ? new Date(`${service.serviceStartDate}T00:00:00.000Z`) : null, serviceEndDate: service.serviceEndDate ? new Date(`${service.serviceEndDate}T00:00:00.000Z`) : null })) } }, include: { storageType: true, services: true } });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        }
      }
    }
    if (!record) throw new ConflictException({ code: 'BOOKING_CODE_GENERATION_FAILED', message: 'Không thể tạo mã booking.' });
    const quote = record.quoteSnapshot as any;
    const initialAmountDue = quote.estimatedInitialAmountDue;
    const delivery = await this.email.sendBookingClaim({ to: record.email, fullName: record.fullName, bookingCode: record.bookingCode, storageName: record.storageType.name, startDate: this.iso(record.startDate), endDate: this.iso(record.endDate), rentalAmount: quote.rentalAmount, discountAmount: quote.discountAmount, depositAmount: quote.depositAmount, initialAmountDue, quantity: record.quantity, paymentPlan: record.paymentPlan as 'PAY_MONTHLY' | 'PREPAID', claimToken: token });
    return { ...this.view(record), message: delivery.delivered ? 'Vui lòng kiểm tra email để xác minh yêu cầu đặt kho.' : 'Development email adapter đang hoạt động; email thật chưa được gửi.', ...(delivery.adapter === 'development' ? { developmentClaimUrl: delivery.claimUrl } : {}) };
  }

  async verify(input: Record<string, unknown>) {
    const token = typeof input.token === 'string' ? input.token.trim() : '';
    if (token.length < 32) throw new BadRequestException({ code: 'INVALID_CLAIM_TOKEN', message: 'Claim token không hợp lệ.' });
    const record = await this.prisma.guestBookingRequest.findUnique({ where: { claimTokenHash: this.hash(token) }, include: { storageType: true } });
    if (!record) throw new BadRequestException({ code: 'INVALID_CLAIM_TOKEN', message: 'Claim token không hợp lệ.' });
    if (record.status === 'CLAIMED') throw new ConflictException({ code: 'BOOKING_ALREADY_CLAIMED', message: 'Booking đã được nhận.' });
    if (record.status === 'CANCELLED' || record.status === 'EXPIRED') throw new ConflictException({ code: 'BOOKING_NOT_CLAIMABLE', message: 'Booking không còn hiệu lực.' });
    if (!record.claimTokenExpiresAt || record.claimTokenExpiresAt <= new Date()) {
      await this.prisma.guestBookingRequest.update({ where: { id: record.id }, data: { status: 'EXPIRED', claimTokenHash: null } });
      throw new ConflictException({ code: 'CLAIM_TOKEN_EXPIRED', message: 'Liên kết xác minh đã hết hạn.' });
    }
    const verified = record.status === 'VERIFIED' ? record : await this.prisma.guestBookingRequest.update({ where: { id: record.id }, data: { status: 'VERIFIED', emailVerifiedAt: new Date(), claimTokenHash: null, claimTokenExpiresAt: null }, include: { storageType: true } });
    return { ...this.view(verified), message: 'Email đã được xác minh. Hãy đăng nhập hoặc đăng ký bằng cùng email để nhận booking.' };
  }

  async claim(bookingCode: string, customer: PublicUser) {
    if (customer.role !== 'CUSTOMER') throw new ForbiddenException('Chỉ tài khoản CUSTOMER được nhận booking.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const identity = await tx.guestBookingRequest.findUnique({ where: { bookingCode }, select: { id: true } });
        if (!identity) throw new NotFoundException('Không tìm thấy booking.');
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "GuestBookingRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
        const current = await tx.guestBookingRequest.findUnique({ where: { id: identity.id }, include: { storageType: true, reservation: true, services: true } });
        if (!current) throw new NotFoundException('Không tìm thấy booking.');
        if (current.status === 'CLAIMED' && current.claimedByUserId === customer.id && current.reservation) return { bookingCode, status: 'CLAIMED', reservationCode: current.reservation.reservationCode };
        if (current.status !== 'VERIFIED') throw new ConflictException({ code: 'BOOKING_NOT_VERIFIED', message: 'Booking chưa được xác minh hoặc không còn có thể nhận.' });
        if (current.email.toLowerCase() !== customer.email.toLowerCase()) throw new ForbiddenException({ code: 'BOOKING_EMAIL_MISMATCH', message: 'Email tài khoản không khớp email đã xác minh.' });
        const reservation = await this.booking.createConfirmedReservationFromGuest(tx, current, customer);
        await tx.guestBookingRequest.update({ where: { id: current.id }, data: { status: 'CLAIMED', claimedByUserId: customer.id, reservationId: reservation.databaseId } });
        return { bookingCode, status: 'CLAIMED', reservationCode: reservation.reference, reservation };
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException({ code: 'BOOKING_CLAIM_CONFLICT', message: 'Booking vừa được xử lý. Vui lòng thử lại.' });
      throw error;
    }
  }

  private parse(input: Record<string, unknown>) {
    const text = (value: unknown, label: string, min: number, max: number) => { if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new BadRequestException(`${label} không hợp lệ.`); return value.trim(); };
    const fullName = text(input.fullName, 'fullName', 2, 120);
    const email = text(input.email, 'email', 5, 254).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestException('email không hợp lệ.');
    const phone = text(input.phone, 'phone', 8, 25);
    const storageTypeId = text(input.storageTypeId, 'storageTypeId', 1, 100);
    const quantity = Number(input.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 3) throw new BadRequestException('quantity phải từ 1 đến 3.');
    const startDate = text(input.startDate, 'startDate', 10, 10), endDate = text(input.endDate, 'endDate', 10, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate <= startDate) throw new BadRequestException('Khoảng ngày không hợp lệ.');
    const paymentPlan = input.paymentPlan;
    if (!['PAY_MONTHLY', 'PREPAID'].includes(String(paymentPlan))) throw new BadRequestException('paymentPlan không hợp lệ.');
    const rawServices = Array.isArray(input.services) ? input.services : [];
    const services = rawServices.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException('Dịch vụ bổ sung không hợp lệ.');
      const serviceId = typeof (item as any).serviceId === 'string' ? (item as any).serviceId.trim() : '';
      const serviceQuantity = Number((item as any).quantity);
      if (!serviceId || !Number.isSafeInteger(serviceQuantity) || serviceQuantity < 1 || serviceQuantity > 100) throw new BadRequestException('Dịch vụ bổ sung không hợp lệ.');
      const serviceStartDate = typeof (item as any).serviceStartDate === 'string' ? (item as any).serviceStartDate : undefined;
      const serviceEndDate = typeof (item as any).serviceEndDate === 'string' ? (item as any).serviceEndDate : undefined;
      return { serviceId, quantity: serviceQuantity, ...(serviceStartDate ? { serviceStartDate } : {}), ...(serviceEndDate ? { serviceEndDate } : {}) };
    });
    if (new Set(services.map((service) => service.serviceId)).size !== services.length) throw new BadRequestException('Dịch vụ bổ sung bị trùng.');
    return { fullName, email, phone, storageTypeId, quantity, startDate, endDate, paymentPlan: paymentPlan as 'PAY_MONTHLY' | 'PREPAID', services };
  }

  private sameRequest(record: any, parsed: any) { const stored = record.services.map((service: any) => ({ serviceId: service.additionalServiceId, quantity: service.quantity, ...(service.serviceStartDate ? { serviceStartDate: this.iso(service.serviceStartDate) } : {}), ...(service.serviceEndDate ? { serviceEndDate: this.iso(service.serviceEndDate) } : {}) })); return record.fullName === parsed.fullName && record.email === parsed.email && record.phone === parsed.phone && record.storageTypeId === parsed.storageTypeId && record.quantity === parsed.quantity && this.iso(record.startDate) === parsed.startDate && this.iso(record.endDate) === parsed.endDate && record.paymentPlan === parsed.paymentPlan && JSON.stringify(stored) === JSON.stringify(parsed.services); }
  private key(value?: string) { const key = value?.trim() ?? ''; if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự.'); return key; }
  private tokenTtlMinutes() { const value = Number(this.config.get<string>('GUEST_CLAIM_TOKEN_TTL_MINUTES') ?? 60); return Number.isSafeInteger(value) && value >= 5 && value <= 10080 ? value : 60; }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private code() { return `WDPG-${new Date().getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`; }
  private iso(value: Date) { return value.toISOString().slice(0, 10); }
  private view(record: any) { return { bookingCode: record.bookingCode, status: record.status, storage: { id: record.storageType.id, code: record.storageType.code, name: record.storageType.name, condition: record.storageType.condition }, quantity: record.quantity, startDate: this.iso(record.startDate), endDate: this.iso(record.endDate), paymentPlan: record.paymentPlan, quote: record.quoteSnapshot, emailVerifiedAt: record.emailVerifiedAt?.toISOString() ?? null, reservationCode: record.reservation?.reservationCode ?? null }; }
}
