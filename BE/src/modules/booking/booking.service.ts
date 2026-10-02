import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { PublicUser } from '../auth/auth.types.js';
import { bookingProducts } from './booking.catalog.js';
import { storageSizes } from '../storage/storage.catalog.js';
import { approvedDurations, type AvailabilityResult, type GuestContact, type GuestInquiry, type PendingReservation, type QuoteSnapshot, type ReservationDraft } from './booking.types.js';

@Injectable()
export class BookingService {
  private readonly reservations: PendingReservation[] = [];
  private readonly inquiries: GuestInquiry[] = [];
  // Prototype inventory: a physical occupancy remains blocked until an operator clears it explicitly.
  private readonly physicallyOccupiedProducts = new Set<string>();

  getCatalog() {
    return {
      products: bookingProducts,
      sizes: storageSizes,
      approvedDurations,
      addons: [],
      pricingPolicy: 'QUOTE_REQUIRED' as const,
      inventoryPolicy: 'DEMO_SINGLE_UNIT' as const,
    };
  }

  checkAvailability(input: Record<string, unknown>): AvailabilityResult {
    const draft = this.validateDraft(input);
    const endDateExclusive = this.getEndDateExclusive(draft);
    const quote = this.buildQuote(draft, endDateExclusive);
    if (draft.quantity > 1) {
      return { available: false, startDate: draft.startDate, endDateExclusive, periodStatus: quote.periodStatus, reasonCode: 'DEMO_INVENTORY_UNCONFIGURED', message: 'Dữ liệu prototype hiện chỉ xác minh được 1 kho vật lý cho mỗi mã sản phẩm. WDP cần kiểm tra thủ công yêu cầu nhiều kho và vị trí liền kề.', quote };
    }
    if (this.physicallyOccupiedProducts.has(draft.productId)) {
      return { available: false, startDate: draft.startDate, endDateExclusive, periodStatus: quote.periodStatus, reasonCode: 'OCCUPIED', message: 'Kho vật lý đang được ghi nhận là đã sử dụng. Chỉ nhân viên tại cơ sở mới có thể xác nhận đã trả kho và mở lại khả dụng.', quote };
    }
    const hasConflict = this.reservations.some((reservation) => reservation.product.id === draft.productId && draft.startDate < reservation.endDateExclusive && endDateExclusive > reservation.startDate);
    if (hasConflict) {
      return { available: false, startDate: draft.startDate, endDateExclusive, periodStatus: quote.periodStatus, reasonCode: 'CONFLICT', message: 'Kho có reservation chính thức trùng toàn bộ hoặc một phần thời gian yêu cầu.', quote };
    }
    return { available: true, startDate: draft.startDate, endDateExclusive, periodStatus: quote.periodStatus, reasonCode: 'AVAILABLE', message: 'Không phát hiện kho đã chiếm dụng hoặc reservation chính thức trùng toàn bộ khoảng thuê trong dữ liệu prototype.', quote };
  }

  createReservation(user: PublicUser, input: Record<string, unknown>): PendingReservation {
    const draft = this.validateDraft(input);
    this.assertPayLater(draft);
    const availability = this.checkAvailability(input);
    if (!availability.available) throw new ConflictException({ message: availability.message, availability });
    const product = bookingProducts.find((candidate) => candidate.id === draft.productId)!;
    const reservation: PendingReservation = {
      ...draft,
      id: this.createId('WDP'),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      endDateExclusive: availability.endDateExclusive,
      customer: user,
      product,
      quote: availability.quote,
      unitAssignment: null,
      paymentStatus: 'NOT_STARTED',
      persistence: 'DEMO_VOLATILE',
    };
    this.reservations.push(reservation);
    return reservation;
  }

  createInquiry(input: Record<string, unknown>): GuestInquiry {
    const draft = this.validateDraft(input);
    this.assertPayLater(draft);
    const customer = this.validateGuestContact(input);
    const availability = this.checkAvailability(input);
    if (!availability.available) throw new ConflictException({ message: availability.message, availability });
    const product = bookingProducts.find((candidate) => candidate.id === draft.productId)!;
    const duplicate = this.inquiries.some((inquiry) => inquiry.customer.email === customer.email && inquiry.product.id === product.id && inquiry.startDate === draft.startDate && inquiry.endDateExclusive === availability.endDateExclusive && inquiry.quantity === draft.quantity);
    if (duplicate) throw new ConflictException('Yêu cầu liên hệ giống nhau đã được gửi. Vui lòng chờ WDP phản hồi.');
    const inquiry: GuestInquiry = {
      ...draft,
      id: this.createId('WDPQ'),
      status: 'PENDING_CONTACT',
      createdAt: new Date().toISOString(),
      endDateExclusive: availability.endDateExclusive,
      customer,
      product,
      quote: availability.quote,
      inventoryGuarantee: false,
      persistence: 'DEMO_VOLATILE',
    };
    this.inquiries.push(inquiry);
    return inquiry;
  }

  /** Test-only hook; production staff workflows must own physical check-in and check-out. */
  setPhysicalOccupancyForTesting(productId: string, occupied: boolean) {
    if (!bookingProducts.some((product) => product.id === productId)) throw new NotFoundException('Không tìm thấy kho để cập nhật trạng thái vật lý.');
    if (occupied) this.physicallyOccupiedProducts.add(productId);
    else this.physicallyOccupiedProducts.delete(productId);
  }
  listReservations(userId: string) {
    return this.reservations.filter((reservation) => reservation.customer.id === userId);
  }

  getReservation(userId: string, id: string) {
    const reservation = this.reservations.find((candidate) => candidate.id === id && candidate.customer.id === userId);
    if (!reservation) throw new NotFoundException('Không tìm thấy yêu cầu đặt kho.');
    return reservation;
  }

  getInquiry(id: string) {
    const inquiry = this.inquiries.find((candidate) => candidate.id === id);
    if (!inquiry) throw new NotFoundException('Không tìm thấy yêu cầu liên hệ.');
    return inquiry;
  }

  private validateDraft(input: Record<string, unknown>): ReservationDraft {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Dữ liệu đặt kho không hợp lệ.');
    const productId = typeof input.productId === 'string' ? input.productId : '';
    if (!bookingProducts.some((product) => product.id === productId)) throw new BadRequestException('Mã sản phẩm không hợp lệ.');
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
    return { productId, startDate, ...(endDate ? { endDate } : {}), periodMode, ...(periodMode === 'duration' ? { durationMonths } : {}), quantity, adjacencyPreference, addonIds, ...(note ? { note } : {}), paymentChoice };
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
    if (draft.periodMode === 'dates') return draft.endDate!;
    return this.addMonths(draft.startDate, draft.durationMonths!);
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

  private createId(prefix: 'WDP' | 'WDPQ') {
    let id = '';
    do id = prefix + '-' + new Date().getUTCFullYear() + '-' + randomBytes(3).toString('hex').toUpperCase();
    while (this.reservations.some((item) => item.id === id) || this.inquiries.some((item) => item.id === id));
    return id;
  }

  private isDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00.000Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  private addMonths(startDate: string, months: number) {
    const start = new Date(startDate + 'T00:00:00.000Z');
    const day = start.getUTCDate();
    const result = new Date(start);
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const daysInMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, daysInMonth));
    return result.toISOString().slice(0, 10);
  }

  private requiredText(value: unknown, label: string, minimumLength: number) {
    if (typeof value !== 'string' || value.trim().length < minimumLength) throw new BadRequestException(label + ' phải có ít nhất ' + minimumLength + ' ký tự.');
    return value.trim();
  }
}
