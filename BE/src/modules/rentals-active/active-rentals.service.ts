import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { deriveOverdueState } from './overdue-state.js';

export interface ActiveRentalListQuery {
  page: number;
  limit: number;
  search?: string;
  storageType?: string;
  unitCode?: string;
  customer?: string;
  overdue?: boolean;
}

type ViewMode = 'CUSTOMER' | 'MANAGER' | 'STAFF';

@Injectable()
export class ActiveRentalsService {
  constructor(private readonly prisma: PrismaService) {}

  listCustomerRentals(customerId: string, query: ActiveRentalListQuery) {
    return this.page({ customerId }, query, 'CUSTOMER');
  }

  async getCustomerRental(customerId: string, id: string) {
    const record = await this.prisma.reservation.findFirst({ where: { ...this.activeWhere(), customerId, OR: [{ id }, { reservationCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy Active Rental.');
    return this.toRental(record, 'CUSTOMER', new Date());
  }

  listManagerRentals(query: ActiveRentalListQuery) {
    return this.page({}, query, 'MANAGER');
  }

  async getManagerRental(id: string) {
    const record = await this.prisma.reservation.findFirst({ where: { ...this.activeWhere(), OR: [{ id }, { reservationCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy Active Rental.');
    return this.toRental(record, 'MANAGER', new Date());
  }

  listStaffRentals(query: ActiveRentalListQuery) {
    return this.page({}, query, 'STAFF');
  }

  async getStaffRental(id: string) {
    const record = await this.prisma.reservation.findFirst({ where: { ...this.activeWhere(), OR: [{ id }, { reservationCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy Active Rental.');
    return this.toRental(record, 'STAFF', new Date());
  }

  private async page(baseWhere: Prisma.ReservationWhereInput, query: ActiveRentalListQuery, mode: ViewMode) {
    const now = new Date();
    const filters: Prisma.ReservationWhereInput[] = [];
    if (query.search) filters.push({ OR: [
      { reservationCode: { contains: query.search, mode: 'insensitive' } },
      { customer: { fullName: { contains: query.search, mode: 'insensitive' } } },
      { customer: { email: { contains: query.search, mode: 'insensitive' } } },
      { contracts: { some: { contractCode: { contains: query.search, mode: 'insensitive' } } } },
      { contracts: { some: { reservationUnit: { storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } } } } },
    ] });
    if (query.storageType) filters.push({ OR: [
      { storageTypeId: query.storageType },
      { storageType: { code: { contains: query.storageType, mode: 'insensitive' } } },
    ] });
    if (query.unitCode) filters.push({ contracts: { some: { reservationUnit: { storageUnit: { unitNumber: { contains: query.unitCode, mode: 'insensitive' } } } } } });
    if (query.customer) filters.push({ OR: [
      { customer: { fullName: { contains: query.customer, mode: 'insensitive' } } },
      { customer: { email: { contains: query.customer, mode: 'insensitive' } } },
    ] });
    if (query.overdue !== undefined) filters.push(query.overdue
      ? { contracts: { every: { endDate: { lte: now } } } }
      : { contracts: { some: { endDate: { gt: now } } } });
    const where: Prisma.ReservationWhereInput = { ...this.activeWhere(), ...baseWhere, ...(filters.length ? { AND: filters } : {}) };
    const [total, records] = await Promise.all([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], include: this.include() }),
    ]);
    return { page: query.page, limit: query.limit, total, items: records.map((record) => this.toRental(record, mode, now)) };
  }

  private activeWhere(): Prisma.ReservationWhereInput {
    return { contracts: { some: { status: 'ACTIVE' }, every: { status: 'ACTIVE' } } };
  }

  private include() {
    return {
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      storageType: { select: { id: true, code: true, name: true, sizeId: true, sizeName: true, condition: true } },
      contracts: {
        where: { status: 'ACTIVE' as const },
        include: { reservationUnit: { include: { storageUnit: { select: {
          id: true, unitNumber: true, floor: true, zone: true, row: true, position: true, status: true,
          reservationUnits: {
            where: { releasedAt: null, reservation: { status: 'CONFIRMED' as const } },
            select: { id: true, reservationId: true, plannedStartDate: true, plannedEndDate: true, reservation: { select: { reservationCode: true, customer: { select: { id: true, fullName: true, email: true, phone: true } } } } },
            orderBy: [{ plannedStartDate: 'asc' as const }, { id: 'asc' as const }],
          },
        } } } } },
        orderBy: { contractCode: 'asc' as const },
      },
      invoices: { include: { payments: { select: { id: true, paymentCode: true, amount: true, method: true, receivedAt: true }, orderBy: { receivedAt: 'asc' as const } } }, orderBy: { billingCycle: 'asc' as const } },
      renewals: { include: { invoices: { select: { status: true, totalAmount: true, amountPaid: true, balanceDue: true, renewalCycle: true }, orderBy: { renewalCycle: 'asc' as const } } }, orderBy: { createdAt: 'desc' as const } },
    };
  }

  private toRental(record: any, mode: ViewMode, now: Date) {
    const effectiveEndDate = this.effectiveEndDate(record.contracts);
    const overdue = deriveOverdueState(effectiveEndDate, now);
    const snapshot = record.quoteSnapshot as Record<string, unknown>;
    const invoices = record.invoices.map((invoice: any) => this.invoiceSummary(invoice));
    const outstanding = record.invoices.reduce((sum: bigint, invoice: any) => sum + invoice.balanceDue, 0n);
    const totalInvoiced = record.invoices.reduce((sum: bigint, invoice: any) => sum + invoice.totalAmount, 0n);
    const totalPaid = record.invoices.reduce((sum: bigint, invoice: any) => sum + invoice.amountPaid, 0n);
    const nextInvoice = record.invoices
      .filter((invoice: any) => invoice.balanceDue > 0n)
      .sort((first: any, second: any) => this.invoiceOrder(first, second))[0];
    const contracts = record.contracts.map((contract: any) => {
      const future = contract.reservationUnit.storageUnit.reservationUnits
        .filter((allocation: any) => allocation.reservationId !== record.id && allocation.plannedEndDate > now)[0];
      const unit = {
        id: contract.reservationUnit.storageUnit.id,
        unitCode: contract.reservationUnit.storageUnit.unitNumber,
        status: contract.reservationUnit.storageUnit.status,
        floor: contract.reservationUnit.storageUnit.floor,
        zone: contract.reservationUnit.storageUnit.zone,
        row: contract.reservationUnit.storageUnit.row,
        position: contract.reservationUnit.storageUnit.position,
      };
      const nextConfirmedAllocation = future ? {
        reservationReference: future.reservation.reservationCode,
        startDate: this.isoDate(future.plannedStartDate), endDate: this.isoDate(future.plannedEndDate),
        ...(mode === 'MANAGER' ? { customer: future.reservation.customer } : {}),
      } : null;
      return {
        id: contract.id, contractCode: contract.contractCode, status: contract.status,
        startDate: this.isoDate(contract.startDate), endDate: this.isoDate(contract.endDate), activatedAt: contract.activatedAt?.toISOString() ?? null,
        unit: mode === 'CUSTOMER' ? unit : { ...unit, nextConfirmedAllocation },
        ...(mode === 'CUSTOMER' ? {} : { hasCurrentAllocationConflict: overdue.isOverdue && future !== undefined && future.plannedStartDate <= now }),
      };
    });
    const hasFutureAllocation = contracts.some((contract: any) => contract.unit.nextConfirmedAllocation !== null && contract.unit.nextConfirmedAllocation !== undefined);
    const hasCurrentAllocationConflict = contracts.some((contract: any) => contract.hasCurrentAllocationConflict === true);
    const pendingRenewal = record.renewals.find((renewal: any) => ['PENDING', 'APPROVED_PENDING_PAYMENT'].includes(renewal.status));
    const base = {
      reservationId: record.id,
      reservationReference: record.reservationCode,
      storageType: record.storageType,
      quantity: record.quantity,
      startDate: this.isoDate(record.startDate),
      endDate: this.isoDate(record.endDate),
      ...overdue,
      contractCount: record.contracts.length,
      unitCount: record.contracts.length,
      customer: record.customer,
      contracts,
    };
    const renewalHistory = record.renewals.map((renewal: any) => ({
      id: renewal.id, renewalCode: renewal.renewalCode, status: renewal.status,
      previousEndDate: this.isoDate(renewal.previousEndDate), requestedEndDate: this.isoDate(renewal.requestedEndDate),
      termMonths: renewal.termMonths, paymentPlan: renewal.paymentPlan,
    }));
    const pendingRenewalSummary = pendingRenewal ? { renewalCode: pendingRenewal.renewalCode, status: pendingRenewal.status, requestedEndDate: this.isoDate(pendingRenewal.requestedEndDate) } : null;
    if (mode === 'STAFF') return { ...base, pendingRenewal: pendingRenewalSummary, futureAllocationRisk: { hasFutureAllocation, hasCurrentAllocationConflict }, renewalHistory: renewalHistory.map(({ paymentPlan: _paymentPlan, ...renewal }: any) => renewal), billingReadiness: { hasUnpaidInvoices: outstanding > 0n } };
    return {
      ...base,
      paymentPlan: snapshot.paymentPlan ?? null,
      historicalPricing: snapshot,
      invoices,
      pendingRenewal: pendingRenewalSummary,
      ...(mode === 'MANAGER' ? { futureAllocationRisk: { hasFutureAllocation, hasCurrentAllocationConflict } } : {}),
      renewalHistory: record.renewals.map((renewal: any) => ({
        ...renewalHistory.find((item: any) => item.id === renewal.id), quoteSnapshot: renewal.quoteSnapshot,
        billingSummary: {
          totalInvoiced: renewal.invoices.reduce((sum: number, invoice: any) => sum + this.money(invoice.totalAmount), 0),
          totalPaid: renewal.invoices.reduce((sum: number, invoice: any) => sum + this.money(invoice.amountPaid), 0),
          totalOutstanding: renewal.invoices.reduce((sum: number, invoice: any) => sum + this.money(invoice.balanceDue), 0),
        },
      })),
      billingSummary: {
        totalInvoiced: this.money(totalInvoiced),
        totalPaid: this.money(totalPaid),
        totalOutstanding: this.money(outstanding),
        nextInvoice: nextInvoice ? this.invoiceSummary(nextInvoice) : null,
      },
    };
  }

  private invoiceSummary(invoice: any) {
    return {
      id: invoice.id,
      invoiceCode: invoice.invoiceCode,
      type: invoice.type,
      billingCycle: invoice.billingCycle,
      billingPeriodStart: this.isoDate(invoice.billingPeriodStart),
      billingPeriodEnd: this.isoDate(invoice.billingPeriodEnd),
      dueAt: this.isoDate(invoice.dueAt),
      isPastDue: invoice.dueAt !== null && invoice.dueAt < new Date() && invoice.status !== 'PAID',
      status: invoice.status,
      rentalAmount: this.money(invoice.rentalAmount),
      depositAmount: this.money(invoice.depositAmount),
      totalAmount: this.money(invoice.totalAmount),
      amountPaid: this.money(invoice.amountPaid),
      balanceDue: this.money(invoice.balanceDue),
      payments: invoice.payments.map((payment: any) => ({ ...payment, amount: this.money(payment.amount), receivedAt: payment.receivedAt.toISOString() })),
    };
  }

  private effectiveEndDate(contracts: any[]) {
    if (contracts.length === 0) throw new ConflictException({ code: 'ACTIVE_RENTAL_CONTRACTS_MISSING', message: 'Active Rental không có RentalContract ACTIVE.' });
    const timestamps = new Set(contracts.map((contract) => contract.endDate.getTime()));
    if (timestamps.size !== 1) throw new ConflictException({ code: 'ACTIVE_RENTAL_END_DATE_MISMATCH', message: 'Các RentalContract ACTIVE có endDate không đồng nhất.' });
    return contracts[0].endDate as Date;
  }

  private invoiceOrder(first: any, second: any) {
    const firstDue = first.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const secondDue = second.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return firstDue - secondDue || first.billingCycle - second.billingCycle;
  }

  private money(value: bigint) {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Stored money is outside the supported range.');
    return Number(value);
  }

  private isoDate(value: Date | null) {
    return value?.toISOString().slice(0, 10) ?? null;
  }
}
