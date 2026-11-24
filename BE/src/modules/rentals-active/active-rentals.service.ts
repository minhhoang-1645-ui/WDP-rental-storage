import { managerReservationScope, assertManagerRecordAccess } from '../facility-access/record-access.js';
import { staffContractScope as assignedContractScope } from '../facility-access/task-access.js';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isScheduledRenewalInvoice } from '../billing/renewal-invoice-schedule.js';
import { deriveOverdueState } from './overdue-state.js';
import { rentalAccountSummary } from '../billing/rental-account-summary.js';
import { returnReadiness } from '../returns/early-return-finance.js';
import { contractReturnReadiness, recordedContractDeposit, returnInvoiceFields } from '../returns/contract-return-finance.js';
import { hasStartedUnissuedRenewal, planEarlyReturn, summarizeEarlyReturn, PERIOD_CLOSEOUT } from '../returns/return-period-closeout.js';
import { EARLY_RETURN_SUBJECT, earlyReturnScope } from '../returns/early-return-classification.js';
import { businessToday } from '../../business-date.js';
import { hasUnissuedRenewalInstallments, openRenewalStatuses, renewalAppliesTo } from '../renewals/renewal-scope.js';
import type { PublicUser } from '../auth/auth.types.js';
import { staffRentalSelect, staffRentalView, staffRentalWhere } from './staff-active-rentals.js';

export interface ActiveRentalListQuery {
  page: number;
  limit: number;
  search?: string;
  storageType?: string;
  unitCode?: string;
  customer?: string;
  overdue?: boolean;
}

type ViewMode = 'STORAGE_CUSTOMER' | 'FACILITY_MANAGER';
const activeContract = { status: 'ACTIVE', reservationUnit: { releasedAt: null } } satisfies Prisma.RentalContractWhereInput;

@Injectable()
export class ActiveRentalsService {
  constructor(private readonly prisma: PrismaService) {}

  listCustomerRentals(customerId: string, query: ActiveRentalListQuery) {
    return this.page({ customerId }, query, 'STORAGE_CUSTOMER');
  }

  async getCustomerRental(customerId: string, id: string) {
    const record = await this.prisma.reservation.findFirst({ where: { ...this.activeWhere(), customerId, OR: [{ id }, { reservationCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy Active Rental.');
    const units = record.contracts.map(contract => contract.reservationUnit.storageUnit);
    const areas = units.filter(unit => unit.floor && unit.zone);
    const locationUnits = areas.length ? await this.prisma.storageUnit.findMany({
      where: { OR: areas.map(({ storageTypeId, floor, zone }) => ({ storageTypeId, floor, zone })) },
      select: { id: true, unitNumber: true, floor: true, zone: true, row: true, position: true, storageTypeId: true },
    }) : [];
    return {
      ...this.toRental(record, 'STORAGE_CUSTOMER', new Date()),
      unitLayouts: units.map(unit => ({
        unitId: unit.id,
        units: locationUnits.filter(other => other.storageTypeId === unit.storageTypeId && other.floor === unit.floor && other.zone === unit.zone)
          .map(({ id, unitNumber, row, position }) => ({ id, code: unitNumber, row, position })),
      })),
    };
  }

  listManagerRentals(query: ActiveRentalListQuery, actor: PublicUser) {
    return this.page(managerReservationScope(actor), query, 'FACILITY_MANAGER');
  }

  async getManagerRental(id: string, actor: PublicUser) {
    const record = await this.prisma.reservation.findFirst({ where: { ...this.activeWhere(), AND:[managerReservationScope(actor)], OR: [{ id }, { reservationCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy Active Rental.');
    return this.toRental(record, 'FACILITY_MANAGER', new Date());
  }

  async listStaffRentals(actor: PublicUser, query: ActiveRentalListQuery) {
    const scope = this.staffContractScope(actor);
    const { page, limit } = query;
    if (!scope) return { page, limit, total: 0, items: [], assignmentsEnabled: false };
    const now = new Date();
    const where = staffRentalWhere(scope, query, now);
    return this.prisma.$transaction(async tx => {
      const total = await tx.reservation.count({ where });
      const records = await tx.reservation.findMany({
        where, select: staffRentalSelect(scope), skip: (page - 1) * limit, take: limit,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      });
      return { page, limit, total, items: records.map(record => staffRentalView(record, now)), assignmentsEnabled: true };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async getStaffRental(actor: PublicUser, id: string) {
    const scope = this.staffContractScope(actor);
    const notFound = () => new NotFoundException('Không tìm thấy hồ sơ thuê thuộc nhiệm vụ được giao.');
    if (!scope) throw notFound();
    const record = await this.prisma.reservation.findFirst({
      where: { OR: [{ id }, { reservationCode: id }], contracts: { some: scope } },
      select: staffRentalSelect(scope),
    });
    if (!record?.contracts.length) throw notFound();
    return staffRentalView(record, new Date());
  }

  private staffContractScope(actor: PublicUser): Prisma.RentalContractWhereInput | null {
    if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ nhân viên được dùng chức năng này.');
    return { ...assignedContractScope(actor), status: 'ACTIVE', reservationUnit: { releasedAt: null } };
  }

  private async page(baseWhere: Prisma.ReservationWhereInput, query: ActiveRentalListQuery, mode: ViewMode) {
    const now = new Date();
    const filters: Prisma.ReservationWhereInput[] = [];
    if (query.search) filters.push({ OR: [
      { reservationCode: { contains: query.search, mode: 'insensitive' } },
      { customer: { fullName: { contains: query.search, mode: 'insensitive' } } },
      { customer: { email: { contains: query.search, mode: 'insensitive' } } },
      { contracts: { some: { ...activeContract, contractCode: { contains: query.search, mode: 'insensitive' } } } },
      { contracts: { some: { ...activeContract, reservationUnit: { ...activeContract.reservationUnit, storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } } } } },
    ] });
    if (query.storageType) filters.push({ contracts: { some: { ...activeContract, reservationUnit: { ...activeContract.reservationUnit, storageUnit: { OR: [
      { storageTypeId: query.storageType },
      { storageType: { code: { contains: query.storageType, mode: 'insensitive' } } },
    ] } } } } });
    if (query.unitCode) filters.push({ contracts: { some: { ...activeContract, reservationUnit: { ...activeContract.reservationUnit, storageUnit: { unitNumber: { contains: query.unitCode, mode: 'insensitive' } } } } } });
    if (query.customer) filters.push({ OR: [
      { customer: { fullName: { contains: query.customer, mode: 'insensitive' } } },
      { customer: { email: { contains: query.customer, mode: 'insensitive' } } },
    ] });
    if (query.overdue !== undefined) {
      const hasLaterEnd = { ...activeContract, endDate: { gt: businessToday(now) } };
      filters.push(query.overdue
        ? { contracts: { none: hasLaterEnd } }
        : { contracts: { some: hasLaterEnd } });
    }
    const where: Prisma.ReservationWhereInput = { ...this.activeWhere(), ...baseWhere, ...(filters.length ? { AND: filters } : {}) };
    const [total, records] = await this.prisma.$transaction([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], include: this.include() }),
    ], { isolationLevel: 'RepeatableRead' });
    return { page: query.page, limit: query.limit, total, items: records.map((record) => this.toRental(record, mode, now)) };
  }

  private activeWhere(): Prisma.ReservationWhereInput {
    return { status: 'CONFIRMED', contracts: { some: activeContract } };
  }

  private include() {
    return {
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      storageType: { select: { id: true, code: true, name: true, sizeId: true, sizeName: true, condition: true } },
      contracts: {
        include: {
          returnInspections: { where: { returnRequest: { status: { not: 'COMPLETED' as const } } }, take: 1, select: { id: true } },
          storedItems: { where: { balance: { gt: 0 } }, select: { id: true, itemCode: true, name: true, unit: true, balance: true }, orderBy: { name: 'asc' as const } },
          transferRequests: { where: { status: 'COMPLETED' as const }, include: { fromStorageUnit: true, toStorageUnit: true }, orderBy: { completedAt: 'desc' as const } },
          reservationUnit: { include: { storageUnit: { select: {
          id: true, unitNumber: true, floor: true, zone: true, row: true, position: true, status: true, storageTypeId: true,
          storageType: { select: { id: true, name: true, widthCm: true, lengthCm: true, heightCm: true,
            facility: { select: { id: true, name: true, address: true } } } },
          reservationUnits: {
            where: { releasedAt: null, reservation: { status: 'CONFIRMED' as const } },
            select: { id: true, reservationId: true, plannedStartDate: true, plannedEndDate: true, reservation: { select: { reservationCode: true, customer: { select: { id: true, fullName: true, email: true, phone: true } } } } },
            orderBy: [{ plannedStartDate: 'asc' as const }, { id: 'asc' as const }],
          },
        } } } } },
        orderBy: { contractCode: 'asc' as const },
      },
      supportRequests: { where: { subject: EARLY_RETURN_SUBJECT, status: 'RESOLVED' as const, lastAction: 'EARLY_RETURN_APPROVED', resolvedBy: { role: 'FACILITY_MANAGER' as const } },
        select: { id: true, rentalContractId: true, lastActionIdempotencyKey: true, earlyReturnFinancialReview: true } },
      services: { select: { id: true, serviceStartDate: true, serviceEndDate: true } },
      invoices: { include: { depositSettlement: returnInvoiceFields.depositSettlement, renewalRequest: returnInvoiceFields.renewalRequest,
        payments: { select: { id: true, paymentCode: true, amount: true, method: true, receivedAt: true }, orderBy: { receivedAt: 'asc' as const } } }, orderBy: { billingCycle: 'asc' as const } },
      renewals: { include: { invoices: { select: { status: true, totalAmount: true, amountPaid: true, balanceDue: true, renewalCycle: true }, orderBy: { renewalCycle: 'asc' as const } } }, orderBy: { createdAt: 'desc' as const } },
    };
  }

  private toRental(record: any, mode: ViewMode, now: Date) {
    const active: typeof record.contracts = record.contracts.filter((contract: { status: string; reservationUnit: { releasedAt: Date | null } }) => contract.status === 'ACTIVE' && contract.reservationUnit.releasedAt === null);
    const allContractIds = record.contracts.map((contract: { id: string }) => contract.id);
    const effectiveEndDate = this.effectiveEndDate(active);
    const overdue = deriveOverdueState(effectiveEndDate, now);
    const snapshot = record.quoteSnapshot as Record<string, unknown>;
    const invoices = record.invoices.map((invoice: any) => this.invoiceSummary(invoice));
    const outstanding: bigint = record.invoices.reduce((sum: bigint, invoice: any) => sum + invoice.balanceDue, 0n);
    const scheduledBalance: bigint = record.invoices.reduce((sum: bigint, invoice: any) =>
      sum + (isScheduledRenewalInvoice(invoice, now) ? invoice.balanceDue : 0n), 0n);
    const totalInvoiced = record.invoices.reduce((sum: bigint, invoice: any) => sum + invoice.totalAmount, 0n);
    const totalPaid = record.invoices.reduce((sum: bigint, invoice: any) => sum + invoice.amountPaid, 0n);
    const nextInvoice = record.invoices
      .filter((invoice: any) => invoice.balanceDue > 0n)
      .sort((first: any, second: any) => this.invoiceOrder(first, second))[0];
    const pending = record.renewals.filter((renewal: { status: string }) => openRenewalStatuses.some(status => renewal.status === status));
    const pendingSummary = (renewal: any) => renewal ? { id: renewal.id, renewalCode: renewal.renewalCode, status: renewal.status, requestedEndDate: this.isoDate(renewal.requestedEndDate) } : null;
    const contracts = active.map((contract: any) => {
      const future = contract.reservationUnit.storageUnit.reservationUnits
        .filter((allocation: any) => allocation.reservationId !== record.id && allocation.plannedEndDate > now)[0];
      const unit = {
        id: contract.reservationUnit.storageUnit.id,
        unitCode: contract.reservationUnit.storageUnit.unitNumber,
        status: contract.reservationUnit.storageUnit.status,
        storageType: contract.reservationUnit.storageUnit.storageType,
        floor: contract.reservationUnit.storageUnit.floor,
        zone: contract.reservationUnit.storageUnit.zone,
        row: contract.reservationUnit.storageUnit.row,
        position: contract.reservationUnit.storageUnit.position,
      };
      const nextConfirmedAllocation = future ? {
        reservationReference: future.reservation.reservationCode,
        startDate: this.isoDate(future.plannedStartDate), endDate: this.isoDate(future.plannedEndDate),
        ...(mode === 'FACILITY_MANAGER' ? { customer: future.reservation.customer } : {}),
      } : null;
      const returnReadiness = contractReturnReadiness(record.invoices, [contract.id], allContractIds);
      const cutoff = businessToday(now);
      const endDate = this.isoDate(contract.endDate)!;
      const approval = cutoff < contract.endDate ? record.supportRequests?.find((request: any) =>
        (request.rentalContractId === contract.id || (!request.rentalContractId && record.contracts.every((item: { endDate: Date }) => +item.endDate === +contract.endDate)))
        && request.lastActionIdempotencyKey === earlyReturnScope(request.id, endDate)) : null;
      const earlyApproved = Boolean(approval);
      const pendingRenewal = pending.find((renewal: { rentalContractId: string | null }) => renewalAppliesTo(renewal, [contract.id]));
      const awaitingRenewalInvoices = !earlyApproved && hasUnissuedRenewalInstallments(record.renewals, [contract.id]);
      const depositVerified = allContractIds.length === record.quantity && recordedContractDeposit(record.invoices, [contract.id], allContractIds, record.quoteSnapshot, false) !== null;
      if (returnReadiness.canReturn && !depositVerified) {
        returnReadiness.canReturn = false;
        returnReadiness.requiresReconciliation = true;
      }
      let earlyReturnEstimate = null;
      if (mode === 'STORAGE_CUSTOMER' && cutoff < contract.endDate && !hasStartedUnissuedRenewal(record.renewals, contract.id, cutoff)) {
        try { earlyReturnEstimate = summarizeEarlyReturn(planEarlyReturn(record.invoices, contract.id, allContractIds, cutoff, false, record.services), this.isoDate(cutoff)!); }
        catch (error) { if (!(error instanceof ConflictException)) throw error; }
      }
      return {
        id: contract.id, contractCode: contract.contractCode, status: contract.status,
        startDate: this.isoDate(contract.startDate), endDate: this.isoDate(contract.endDate), activatedAt: contract.activatedAt?.toISOString() ?? null,
        returnReadiness: {
          ...returnReadiness,
          awaitingRenewalInvoices,
          ...(earlyApproved ? { policy: PERIOD_CLOSEOUT, requiresFullSettlement: false, earlyReturnBlockReason: pendingRenewal ? 'RENEWAL_IN_PROGRESS' : !depositVerified ? 'DEPOSIT_RECONCILIATION_REQUIRED' : null } : {}),
          canReturn: earlyApproved ? depositVerified && !pendingRenewal : returnReadiness.canReturn && !awaitingRenewalInvoices,
        },
        pendingRenewal: pendingSummary(pendingRenewal),
        returnInProgress: contract.returnInspections.length > 0,
        unit: mode === 'STORAGE_CUSTOMER' ? unit : { ...unit, nextConfirmedAllocation },
        ...(mode === 'STORAGE_CUSTOMER' ? { storedItems: contract.storedItems ?? [], earlyReturnEstimate,
        transfers: (contract.transferRequests ?? []).map((transfer: any) => ({
          code: transfer.transferCode, from: transfer.fromStorageUnit.unitNumber, to: transfer.toStorageUnit?.unitNumber ?? '', completedAt: transfer.completedAt?.toISOString() ?? null,
        })) } : {}),
        ...(mode === 'STORAGE_CUSTOMER' ? {} : { hasCurrentAllocationConflict: deriveOverdueState(contract.endDate, now).isOverdue && future !== undefined && future.plannedStartDate <= now }),
      };
    });
    const hasFutureAllocation = contracts.some((contract: any) => contract.unit.nextConfirmedAllocation !== null && contract.unit.nextConfirmedAllocation !== undefined);
    const hasCurrentAllocationConflict = contracts.some((contract: any) => contract.hasCurrentAllocationConflict === true);
    const base = {
      reservationId: record.id,
      returnReadiness: returnReadiness(record.invoices),
      reservationReference: record.reservationCode,
      storageType: record.storageType,
      quantity: contracts.length,
      canRenewTogether: record.quantity === contracts.length && allContractIds.length === contracts.length
        && contracts.every((contract: { endDate: string | null; returnInProgress: boolean }) => !contract.returnInProgress && contract.endDate === this.isoDate(effectiveEndDate)),
      startDate: this.isoDate(record.startDate),
      endDate: this.isoDate(effectiveEndDate),
      ...overdue,
      contractCount: contracts.length,
      unitCount: contracts.length,
      customer: record.customer,
      contracts,
    };
    const renewalHistory = record.renewals.map((renewal: any) => ({
      id: renewal.id, renewalCode: renewal.renewalCode, status: renewal.status,
      rentalContractId: renewal.rentalContractId ?? null,
      previousEndDate: this.isoDate(renewal.previousEndDate), requestedEndDate: this.isoDate(renewal.requestedEndDate),
      termMonths: renewal.termMonths, paymentPlan: renewal.paymentPlan,
    }));
    const pendingRenewalSummary = pendingSummary(pending.find((renewal: { rentalContractId: string | null }) => !renewal.rentalContractId));
    return {
      ...base,
      paymentPlan: snapshot.paymentPlan ?? null,
      historicalPricing: snapshot,
      invoices,
      pendingRenewal: pendingRenewalSummary,
      ...(mode === 'FACILITY_MANAGER' ? { futureAllocationRisk: { hasFutureAllocation, hasCurrentAllocationConflict } } : {}),
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
        payableBalance: this.money(outstanding - scheduledBalance),
        scheduledBalance: this.money(scheduledBalance),
        nextInvoice: nextInvoice ? this.invoiceSummary(nextInvoice) : null,
      },
      ...(mode === 'STORAGE_CUSTOMER' ? rentalAccountSummary({ ...record, contracts: active }, now) : {}),
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
    return contracts.reduce<Date>((latest, contract) => contract.endDate > latest ? contract.endDate : latest, contracts[0].endDate);
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
