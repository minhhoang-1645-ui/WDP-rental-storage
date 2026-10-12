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

type PricedService = { id: string; code: string; name: string; kind: 'PURCHASE' | 'RENTAL'; billingUnit: 'ONE_TIME' | 'DAY' | 'MONTH'; unitPrice: bigint | null; isActive: boolean };

const paymentPlans = ['PAY_MONTHLY', 'PREPAID'] as const;
const prepaidDiscounts: Record<number, number> = { 3: 5, 6: 10, 12: 15 };

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(input: Record<string, unknown>) {
    const parsed = this.validateInput(input);
    const storageType = await this.prisma.storageType.findUnique({ where: { id: parsed.storageTypeId } });
    if (!storageType) throw new NotFoundException({ code: 'STORAGE_TYPE_NOT_FOUND', message: 'Không tìm thấy loại kho.' });
    const services = await this.loadServices(parsed.serviceSelections ?? []);
    return this.calculate(storageType, parsed, services);
  }

  calculate(storageType: PricedStorageType, input: PricingInput, services: PricedService[] = []): PricingQuote {
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
    const selectedServices = this.priceServices(input.serviceSelections ?? [], services, input.startDate, input.endDate);
    const oneTimeServices = selectedServices.filter((service) => service.kind === 'PURCHASE').reduce((sum, service) => sum + service.amountValue, 0n);
    const recurringServices = selectedServices.filter((service) => service.kind === 'RENTAL').reduce((sum, service) => sum + service.amountValue, 0n);
    const serviceTotal = oneTimeServices + recurringServices;
    const total = rental + deposit + serviceTotal;
    const baseRentalAmount = this.money(baseRental);
    const discountAmount = this.money(discount);
    const rentalAmount = this.money(rental);
    const depositAmount = this.money(deposit);
    const quotedTotalAmount = this.money(total);
    const firstCycleEnd = billingMode === 'MONTHLY' ? this.addMonths(input.startDate, 1) : input.endDate;
    const firstCycleRental = selectedServices.filter((service) => service.kind === 'RENTAL').reduce((sum, service) => sum + this.serviceChargeForBillingPeriod(service, input.startDate, firstCycleEnd), 0n);
    const estimatedInitial = billingMode === 'MONTHLY' && input.paymentPlan === 'PAY_MONTHLY' ? monthlyPrice * BigInt(input.quantity) + deposit + oneTimeServices + firstCycleRental : total;
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
      storageRentalAmount: rentalAmount,
      storageDiscountAmount: discountAmount,
      purchaseAddOnAmount: this.money(oneTimeServices),
      rentalAddOnAmount: this.money(recurringServices),
      addOnTotalAmount: this.money(serviceTotal),
      estimatedInitialAmountDue: this.money(estimatedInitial),
      services: selectedServices.map(({ amountValue, unitPriceValue, ...service }) => ({ ...service, unitPrice: this.money(unitPriceValue), amount: this.money(amountValue) })),
      status: 'PRICED',
      periodStatus: billingMode === 'MONTHLY' ? 'APPROVED_DURATION' : 'SHORT_DURATION_APPROVED',
      lineItems: [
        { code: 'storage-rent', label: 'Tiền thuê kho', basis: `${basis} × ${input.quantity} kho`, amount: baseRentalAmount, status: 'INCLUDED' },
        ...(discountAmount > 0 ? [{ code: 'prepaid-discount', label: `Chiết khấu trả trước ${discountPercent}%`, basis, amount: -discountAmount, status: 'INCLUDED' as const }] : []),
        { code: 'deposit', label: 'Tiền đặt cọc', basis: storageType.sizeId === 'locker' ? 'Không áp dụng cho tủ lưu trữ' : 'Không áp dụng chiết khấu', amount: depositAmount, status: 'INCLUDED' },
        ...selectedServices.map((service) => ({ code: `service-${service.code}`, label: service.name, basis: service.billingUnit === 'ONE_TIME' ? `${service.quantity} × mua một lần` : service.billingUnit === 'DAY' ? `${service.serviceStartDate} đến ${service.serviceEndDate} theo ngày` : `${service.serviceStartDate} đến ${service.serviceEndDate} theo tháng`, amount: this.money(service.amountValue), status: 'INCLUDED' as const })),
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
    return { storageTypeId, quantity, startDate, endDate, paymentPlan: paymentPlan as PaymentPlan, serviceSelections: this.parseServiceSelections(input) };
  }

  parseServiceSelections(input: Record<string, unknown>) {
    const raw = Array.isArray(input.services) ? input.services : Array.isArray(input.addonIds) ? input.addonIds.map((serviceId) => ({ serviceId, quantity: 1 })) : [];
    if (raw.length > 20) throw new BadRequestException({ code: 'TOO_MANY_SERVICES', message: 'Tối đa 20 dịch vụ bổ sung.' });
    const selections = raw.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException({ code: 'INVALID_SERVICE_SELECTION', message: 'Dịch vụ bổ sung không hợp lệ.' });
      const serviceId = typeof (item as any).serviceId === 'string' ? (item as any).serviceId.trim() : '';
      const quantity = Number((item as any).quantity);
      if (!serviceId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) throw new BadRequestException({ code: 'INVALID_SERVICE_SELECTION', message: 'serviceId và quantity dịch vụ không hợp lệ.' });
      const serviceStartDate = typeof (item as any).serviceStartDate === 'string' ? (item as any).serviceStartDate : undefined;
      const serviceEndDate = typeof (item as any).serviceEndDate === 'string' ? (item as any).serviceEndDate : undefined;
      return { serviceId, quantity, ...(serviceStartDate ? { serviceStartDate } : {}), ...(serviceEndDate ? { serviceEndDate } : {}) };
    });
    if (new Set(selections.map((item) => item.serviceId)).size !== selections.length) throw new BadRequestException({ code: 'DUPLICATE_SERVICE_SELECTION', message: 'Mỗi dịch vụ chỉ được chọn một lần.' });
    return selections;
  }

  private async loadServices(selections: Array<{ serviceId: string; quantity: number }>) {
    if (selections.length === 0) return [];
    const records = await this.prisma.additionalService.findMany({ where: { id: { in: selections.map((item) => item.serviceId) } } });
    return records.map((record) => ({ ...record, unitPrice: record.unitPrice })) as PricedService[];
  }

  private priceServices(selections: Array<{ serviceId: string; quantity: number; serviceStartDate?: string; serviceEndDate?: string }>, services: PricedService[], reservationStart: string, reservationEnd: string) {
    if (services.length !== selections.length) throw new BadRequestException({ code: 'ADDITIONAL_SERVICE_NOT_FOUND', message: 'Có dịch vụ bổ sung không tồn tại.' });
    return selections.map((selection) => {
      const service = services.find((record) => record.id === selection.serviceId);
      if (!service) throw new BadRequestException({ code: 'ADDITIONAL_SERVICE_NOT_FOUND', message: 'Không tìm thấy dịch vụ bổ sung.' });
      if (!service.isActive) throw new BadRequestException({ code: 'ADDITIONAL_SERVICE_INACTIVE', message: `Dịch vụ ${service.name} hiện không hoạt động.` });
      if (service.unitPrice === null) throw new BadRequestException({ code: 'ADDITIONAL_SERVICE_PRICE_UNAVAILABLE', message: `Dịch vụ ${service.name} chưa có giá được phê duyệt.` });
      const unitPriceValue = service.unitPrice;
      if (unitPriceValue <= 0n) throw new BadRequestException({ code: 'INVALID_SERVICE_PRICE', message: `Giá dịch vụ ${service.name} không hợp lệ.` });
      const base = unitPriceValue * BigInt(selection.quantity);
      if (service.kind === 'PURCHASE') {
        if (service.billingUnit !== 'ONE_TIME') throw new BadRequestException({ code: 'INVALID_ADDITIONAL_SERVICE_BILLING_UNIT', message: `Sản phẩm ${service.name} phải dùng đơn vị ONE_TIME.` });
        return { serviceId: service.id, code: service.code, name: service.name, kind: service.kind, billingUnit: service.billingUnit, quantity: selection.quantity, serviceStartDate: null, serviceEndDate: null, unitPriceValue, amountValue: base };
      }
      if (!['DAY', 'MONTH'].includes(service.billingUnit)) throw new BadRequestException({ code: 'INVALID_ADDITIONAL_SERVICE_BILLING_UNIT', message: `Thiết bị ${service.name} phải dùng đơn vị DAY hoặc MONTH.` });
      const serviceStartDate = selection.serviceStartDate ?? '', serviceEndDate = selection.serviceEndDate ?? '';
      if (!this.isDate(serviceStartDate) || !this.isDate(serviceEndDate) || serviceStartDate < reservationStart || serviceEndDate > reservationEnd || serviceEndDate <= serviceStartDate) throw new BadRequestException({ code: 'INVALID_ADDON_RENTAL_INTERVAL', message: `Khoảng thuê ${service.name} phải nằm trong thời hạn thuê kho.` });
      const amountValue = this.rentalAmount(service.billingUnit as 'DAY' | 'MONTH', unitPriceValue, selection.quantity, serviceStartDate, serviceEndDate);
      return { serviceId: service.id, code: service.code, name: service.name, kind: service.kind, billingUnit: service.billingUnit, quantity: selection.quantity, serviceStartDate, serviceEndDate, unitPriceValue, amountValue };
    });
  }

  private rentalAmount(billingUnit: 'DAY' | 'MONTH', unitPrice: bigint, quantity: number, startDate: string, endDate: string) {
    if (billingUnit === 'DAY') return unitPrice * BigInt(quantity) * BigInt(this.daysBetween(this.date(startDate), this.date(endDate)));
    const months = this.wholeCalendarMonths(startDate, endDate);
    if (months !== null) return unitPrice * BigInt(quantity) * BigInt(months);
    throw new BadRequestException({ code: 'INVALID_MONTHLY_ADDON_RENTAL_TERM', message: 'Thiết bị tính theo tháng phải có khoảng thuê là số tháng lịch chính xác.' });
  }

  private serviceChargeForBillingPeriod(service: { billingUnit: 'ONE_TIME' | 'DAY' | 'MONTH'; unitPriceValue: bigint; quantity: number; serviceStartDate: string | null; serviceEndDate: string | null }, periodStart: string, periodEnd: string) {
    if (!service.serviceStartDate || !service.serviceEndDate) return 0n;
    if (service.billingUnit === 'ONE_TIME') return 0n;
    if (service.billingUnit === 'DAY') {
      const start = service.serviceStartDate > periodStart ? service.serviceStartDate : periodStart;
      const end = service.serviceEndDate < periodEnd ? service.serviceEndDate : periodEnd;
      return end > start ? service.unitPriceValue * BigInt(service.quantity) * BigInt(this.daysBetween(this.date(start), this.date(end))) : 0n;
    }
    let amount = 0n;
    let cursor = service.serviceStartDate;
    while (cursor < service.serviceEndDate) {
      const next = this.addMonths(cursor, 1);
      if (cursor >= periodStart && cursor < periodEnd) amount += service.unitPriceValue * BigInt(service.quantity);
      cursor = next;
    }
    return amount;
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
