import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PaymentPlan, PricingInput, PricingQuote } from './pricing.types.js';

type PricedStorageType = {
  id: string;
  name: string;
  sizeId: string;
  monthlyRate: Prisma.Decimal | null;
  minRentalDays: number | null;
  allowDailyRental: boolean;
};

const paymentPlans = ['PAY_MONTHLY', 'PREPAID'] as const;
const prepaidDiscounts: Record<number, number> = { 3: 5, 6: 10, 12: 15 };

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(input: Record<string, unknown>) {
    const parsed = this.validateInput(input);
    const storageType = await this.prisma.storageType.findUnique({ where: { id: parsed.storageTypeId } });
    if (!storageType) throw new NotFoundException({ code: 'STORAGE_TYPE_NOT_FOUND', message: 'Không tìm thấy loại kho.' });
    return this.calculate(storageType, parsed);
  }

  calculate(storageType: PricedStorageType, input: PricingInput): PricingQuote {
    if (storageType.id !== input.storageTypeId) throw new BadRequestException({ code: 'INVALID_STORAGE_TYPE', message: 'Loại kho không khớp yêu cầu báo giá.' });
    const monthlyPrice = this.monthlyPrice(storageType);
    const start = this.date(input.startDate);
    const end = this.date(input.endDate);
    if (end <= start) throw new BadRequestException({ code: 'INVALID_DATE_RANGE', message: 'Ngày kết thúc phải sau ngày bắt đầu.' });

    const termMonths = this.wholeCalendarMonths(input.startDate, input.endDate);
    const billableDays = this.daysBetween(start, end);
    let billingMode: 'DAILY' | 'MONTHLY';
    let baseRental: bigint;
    if (termMonths !== null) {
      billingMode = 'MONTHLY';
      baseRental = monthlyPrice * BigInt(termMonths) * BigInt(input.quantity);
    } else if (end < this.date(this.addMonths(input.startDate, 1))) {
      if (!storageType.allowDailyRental) {
        throw new BadRequestException({ code: 'MINIMUM_RENTAL_TERM', message: 'Loại kho này yêu cầu thời hạn tối thiểu một tháng theo lịch.' });
      }
      if (!storageType.minRentalDays || billableDays < storageType.minRentalDays) {
        throw new BadRequestException({ code: 'MINIMUM_RENTAL_TERM', message: `Thời hạn thuê tối thiểu là ${storageType.minRentalDays ?? 1} ngày.` });
      }
      billingMode = 'DAILY';
      baseRental = this.roundDivide(monthlyPrice * BigInt(billableDays) * BigInt(input.quantity), 30n);
    } else {
      throw new BadRequestException({ code: 'UNSUPPORTED_RENTAL_TERM', message: 'Thời hạn phải là thuê ngắn ngày hợp lệ hoặc đúng số tháng theo lịch.' });
    }

    const discountPercent = input.paymentPlan === 'PREPAID' && termMonths !== null ? (prepaidDiscounts[termMonths] ?? 0) : 0;
    const discount = this.roundDivide(baseRental * BigInt(discountPercent), 100n);
    const rental = baseRental - discount;
    const deposit = storageType.sizeId === 'locker'
      ? 0n
      : billingMode === 'DAILY' && storageType.sizeId === 'small'
        ? rental
        : monthlyPrice * BigInt(input.quantity);
    const total = rental + deposit;
    const baseRentalAmount = this.money(baseRental);
    const discountAmount = this.money(discount);
    const rentalAmount = this.money(rental);
    const depositAmount = this.money(deposit);
    const quotedTotalAmount = this.money(total);
    const basis = billingMode === 'MONTHLY' ? `${termMonths} tháng` : `${billableDays} ngày`;
    return {
      currency: 'VND',
      storageTypeId: storageType.id,
      storageTypeName: storageType.name,
      quantity: input.quantity,
      startDate: input.startDate,
      endDate: input.endDate,
      billingMode,
      billableDays: billingMode === 'DAILY' ? billableDays : null,
      termMonths: billingMode === 'MONTHLY' ? termMonths : null,
      paymentPlan: input.paymentPlan,
      monthlyUnitPrice: this.money(monthlyPrice),
      dailyUnitPrice: billingMode === 'DAILY' ? this.dailyRateDisplay(monthlyPrice) : null,
      baseRentalAmount,
      discountPercent,
      discountAmount,
      rentalAmount,
      depositAmount,
      quotedTotalAmount,
      status: 'PRICED',
      periodStatus: billingMode === 'MONTHLY' ? 'APPROVED_DURATION' : 'SHORT_DURATION_APPROVED',
      lineItems: [
        { code: 'storage-rent', label: 'Tiền thuê kho', basis: `${basis} × ${input.quantity} kho`, amount: baseRentalAmount, status: 'INCLUDED' },
        ...(discountAmount > 0 ? [{ code: 'prepaid-discount', label: `Chiết khấu trả trước ${discountPercent}%`, basis, amount: -discountAmount, status: 'INCLUDED' as const }] : []),
        { code: 'deposit', label: 'Tiền đặt cọc', basis: storageType.sizeId === 'locker' ? 'Không áp dụng cho tủ lưu trữ' : 'Không áp dụng chiết khấu', amount: depositAmount, status: 'INCLUDED' },
      ],
      rentalSubtotal: baseRentalAmount,
      deposit: depositAmount,
      applicableFees: null,
      taxes: null,
      discounts: discountAmount,
      grandTotal: quotedTotalAmount,
      amountPayableNow: null,
      message: 'Báo giá này chưa tạo giao dịch thanh toán, hợp đồng hoặc giữ kho.',
    };
  }

  private validateInput(input: Record<string, unknown>): PricingInput {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException({ code: 'INVALID_QUOTE_REQUEST', message: 'Dữ liệu báo giá không hợp lệ.' });
    const storageTypeId = typeof input.storageTypeId === 'string' ? input.storageTypeId.trim() : '';
    if (!storageTypeId) throw new BadRequestException({ code: 'INVALID_STORAGE_TYPE', message: 'storageTypeId là bắt buộc.' });
    const quantity = Number(input.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new BadRequestException({ code: 'INVALID_QUANTITY', message: 'Số lượng phải là số nguyên từ 1 trở lên.' });
    const startDate = typeof input.startDate === 'string' ? input.startDate : '';
    const endDate = typeof input.endDate === 'string' ? input.endDate : '';
    if (!this.isDate(startDate) || !this.isDate(endDate)) throw new BadRequestException({ code: 'INVALID_DATE', message: 'Ngày thuê phải có định dạng YYYY-MM-DD hợp lệ.' });
    if (startDate < new Date().toISOString().slice(0, 10)) throw new BadRequestException({ code: 'INVALID_START_DATE', message: 'Ngày bắt đầu không được ở trong quá khứ.' });
    const paymentPlan = typeof input.paymentPlan === 'string' ? input.paymentPlan : '';
    if (!paymentPlans.includes(paymentPlan as PaymentPlan)) throw new BadRequestException({ code: 'INVALID_PAYMENT_PLAN', message: 'paymentPlan phải là PAY_MONTHLY hoặc PREPAID.' });
    return { storageTypeId, quantity, startDate, endDate, paymentPlan: paymentPlan as PaymentPlan };
  }

  private monthlyPrice(storageType: PricedStorageType) {
    if (storageType.monthlyRate === null) throw new BadRequestException({ code: 'PRICING_UNAVAILABLE', message: 'Loại kho này chưa có cấu hình giá hợp lệ.' });
    const value = storageType.monthlyRate.toString();
    if (!/^\d+(?:\.0+)?$/.test(value)) throw new BadRequestException({ code: 'PRICING_UNAVAILABLE', message: 'Giá tháng phải là số VND nguyên hợp lệ.' });
    const amount = BigInt(value.split('.')[0]!);
    if (amount <= 0n || (storageType.allowDailyRental && (!storageType.minRentalDays || storageType.minRentalDays < 1))) {
      throw new BadRequestException({ code: 'PRICING_UNAVAILABLE', message: 'Loại kho này chưa có cấu hình giá hợp lệ.' });
    }
    return amount;
  }

  private wholeCalendarMonths(startDate: string, endDate: string) {
    const start = this.date(startDate);
    const end = this.date(endDate);
    const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
    return months >= 1 && this.addMonths(startDate, months) === endDate ? months : null;
  }

  private addMonths(startDate: string, months: number) {
    const start = this.date(startDate);
    const day = start.getUTCDate();
    const result = new Date(start);
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const daysInMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, daysInMonth));
    return result.toISOString().slice(0, 10);
  }

  private dailyRateDisplay(monthlyPrice: bigint) {
    return monthlyPrice % 30n === 0n ? String(monthlyPrice / 30n) : `${monthlyPrice}/30`;
  }

  private roundDivide(numerator: bigint, denominator: bigint) {
    return (numerator + denominator / 2n) / denominator;
  }

  private money(value: bigint) {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestException({ code: 'AMOUNT_TOO_LARGE', message: 'Giá trị báo giá vượt giới hạn hỗ trợ.' });
    return Number(value);
  }

  private daysBetween(start: Date, end: Date) {
    return Number((end.getTime() - start.getTime()) / 86400000);
  }

  private date(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private isDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = this.date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
}
