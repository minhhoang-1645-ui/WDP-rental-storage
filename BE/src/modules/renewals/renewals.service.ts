import { assertListedPrice, lockPriceRange } from '../pricing/monthly-price-range.js';
import { managerReservationScope, assertManagerRecordAccess } from '../facility-access/record-access.js';
import { renewalTaskScope } from '../facility-access/task-access.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { isScheduledRenewalInvoice } from '../billing/renewal-invoice-schedule.js';
import { ONLINE_PAYMENT_TTL_MS } from '../billing/online-payment-policy.js';
import { homogeneousInvoiceUnits, invoiceBreakdown } from '../billing/invoice-breakdown.js';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { PricingService } from '../pricing/pricing.service.js';
import { loadPricingPolicy, type PricingPolicySnapshot } from '../policies/pricing-policy.js';
import { snapshotHash, validateSignature } from '../contracts/signature.js';
import { SigningOtpService, signedDocument, signedEnvelope, signatureVerification } from '../signing/signing-otp.service.js';
import { DocumentPolicy } from '../documents/document-policy.js';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../guest-booking/email.service.js';
import { businessToday } from '../../business-date.js';
import { contractReturnReadiness, returnInvoiceFields } from '../returns/contract-return-finance.js';
import { closeoutPaymentAllowed, closeoutReservationSelect } from '../billing/renewal-invoice-schedule.js';
import { openRenewalStatuses, renewalOverlapsUnits } from './renewal-scope.js';
import { assertFacilityAllowsRenewal } from '../facilities/facility-booking.js';

type DbClient = PrismaService | Prisma.TransactionClient;
type PaymentPlan = 'PAY_MONTHLY' | 'PREPAID';
type RenewalStatus = 'PENDING' | 'APPROVED_PENDING_PAYMENT' | 'COMPLETED' | 'REJECTED';

export interface RenewalListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: RenewalStatus;
}

type RenewalSnapshot = {
  pricingPolicy?: PricingPolicySnapshot;
  facilityId?: string;
  scope?: { reservationId: string; rentalContractId: string; contractCode: string; reservationUnitId: string; storageUnitId: string; unitCode: string };
  currency: 'VND';
  storageTypeId: string;
  storageTypeName: string;
  quantity: number;
  previousEndDate: string;
  renewalStartDate: string;
  requestedEndDate: string;
  termMonths: number;
  paymentPlan: PaymentPlan;
  monthlyUnitPrice: number;
  baseRentalAmount: number;
  discountPercent: number;
  discountAmount: number;
  rentalAmount: number;
  depositAmount: 0;
  totalAmount: number;
};

const renewalRentalInclude = {
  customer: { select: { id: true, fullName: true, email: true, phone: true } },
  storageType: true,
  contracts: { include: { reservationUnit: { include: { storageUnit: { include: { storageType: true } } } } }, orderBy: { contractCode: 'asc' } },
} satisfies Prisma.ReservationInclude;
type RenewalRental = Prisma.ReservationGetPayload<{ include: typeof renewalRentalInclude }>;
type RenewalContract = RenewalRental['contracts'][number];

@Injectable()
export class RenewalsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RenewalsService.name);
  private invoiceTimer?: ReturnType<typeof setInterval>;
  private issuingInvoices = false;

  onModuleInit() {
    void this.issueDueInvoices();
    this.invoiceTimer = setInterval(() => void this.issueDueInvoices(), 60_000);
    this.invoiceTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.invoiceTimer);
  }

  async issueDueInvoices(now = new Date(), renewalId?: string) {
    if (this.issuingInvoices) return;
    this.issuingInvoices = true;
    const eligible = {
      id: renewalId,
      status: 'COMPLETED',
      paymentPlan: 'PAY_MONTHLY',
      previousEndDate: { lt: now },
      reservation: { status: 'CONFIRMED', contracts: { some: { status: 'ACTIVE' } } },
    } satisfies Prisma.RenewalRequestWhereInput;
    try {
      const renewals = await this.prisma.renewalRequest.findMany({ where: eligible, select: { id: true } });
      for (const { id } of renewals) {
        try {
          await this.prisma.$transaction(async tx => {
            const renewal = await tx.renewalRequest.findFirst({
              where: { ...eligible, id },
              include: {
                reservation: { include: { ...renewalRentalInclude, supportRequests: closeoutReservationSelect.supportRequests } },
                invoices: { select: { renewalCycle: true } },
              },
            });
            if (!renewal) return;
            const snapshot = this.snapshot(renewal);
            this.assertSnapshot(renewal, snapshot);
            const contracts = this.targetContracts(renewal.reservation, renewal.rentalContractId);
            await this.createInvoices(tx, renewal, snapshot, contracts, businessToday(now), new Set(renewal.invoices.map(invoice => invoice.renewalCycle)));
          }, { isolationLevel: 'Serializable' });
        } catch (error) {
          this.logger.warn(`Không thể phát hành hóa đơn gia hạn ${id}: ${String(error)}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Không thể kiểm tra kỳ gia hạn đến hạn: ${String(error)}`);
    } finally {
      this.issuingInvoices = false;
    }
  }

  async issueStartedPeriodsForReturn(tx: Prisma.TransactionClient, reservationId: string, contractId: string, cutoff: Date) {
    const renewals = await tx.renewalRequest.findMany({ where: {
      reservationId, status: 'COMPLETED', paymentPlan: 'PAY_MONTHLY', previousEndDate: { lt: cutoff },
      OR: [{ rentalContractId: contractId }, { rentalContractId: null }],
    }, include: { reservation: { include: renewalRentalInclude }, invoices: { select: { renewalCycle: true } } } });
    for (const renewal of renewals) {
      const snapshot = this.snapshot(renewal);
      this.assertSnapshot(renewal, snapshot);
      await this.createInvoices(tx, renewal, snapshot, this.targetContracts(renewal.reservation, renewal.rentalContractId),
        new Date(+cutoff - 86400000), new Set(renewal.invoices.map(invoice => invoice.renewalCycle)));
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService = new PricingService(prisma),
    private readonly signing: SigningOtpService = new SigningOtpService(new EmailService(new ConfigService())),
    private readonly policy: DocumentPolicy = new DocumentPolicy(new ConfigService()),
  ) {}

  async requestSignatureOtp(customer: PublicUser, id: string, input: Record<string, unknown>) {
    const record = await this.getCustomerRenewal(customer.id, id);
    if (!record.appendix || record.appendix.acceptedAt || !['APPROVED_PENDING_PAYMENT', 'COMPLETED'].includes(record.status)) throw new ConflictException('Phụ lục chưa sẵn sàng hoặc đã ký.');
    const signatureImage = validateSignature(input);
    const acceptanceName = typeof input.acceptanceName === 'string' ? input.acceptanceName.trim() : '';
    if (acceptanceName.length < 2 || acceptanceName.length > 120) throw new BadRequestException('Họ tên xác nhận phải dài 2–120 ký tự.');
    if (input.snapshotHash !== record.appendix.snapshotHash) throw new ConflictException('Phụ lục đã thay đổi. Vui lòng tải lại.');
    return this.signing.issue({ userId: customer.id, email: customer.email, kind: 'appendix', documentId: record.id, documentHash: record.appendix.snapshotHash, signatureImage, acceptanceName }, `phụ lục ${record.appendix.code}`);
  }

  async createCustomerRenewal(customerId: string, input: Record<string, unknown>, idempotencyKey: string | undefined) {
    const parsed = { ...this.quoteInput(input), idempotencyKey: this.requestKey(idempotencyKey) };
    const identity = await this.prisma.reservation.findFirst({
      where: { customerId, OR: [{ id: parsed.reservationId }, { reservationCode: parsed.reservationId }] },
      select: { id: true },
    });
    if (!identity) throw new NotFoundException('Không tìm thấy Active Rental thuộc khách hàng.');

    const duplicate = await this.prisma.renewalRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include() });
    if (duplicate) {
      this.assertMatchingRetry(duplicate, customerId, parsed, identity.id);
      return this.tryAutomaticRenewalApproval(duplicate.id);
    }

    try {
      const created = await this.serializable(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Reservation" WHERE "id" = ${identity.id} FOR UPDATE`);
        const retry = await tx.renewalRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include() });
        if (retry) {
          this.assertMatchingRetry(retry, customerId, parsed, identity.id);
          return retry;
        }
        const reservation = await tx.reservation.findUnique({ where: { id: identity.id, customerId }, include: renewalRentalInclude });
        if (!reservation) throw new NotFoundException('Không tìm thấy đơn thuê.');
        const contract = this.customerContract(reservation, parsed.rentalContractId);
        const rental = this.assertActiveRental(reservation, contract.id);
        const type = contract.reservationUnit.storageUnit.storageType;
        await assertFacilityAllowsRenewal(tx, type.facilityId, true);
        await lockPriceRange(tx, type.facilityId, true);
        await tx.$queryRaw`SELECT id FROM "StorageType" WHERE id = ${type.id} FOR SHARE`;
        await this.lockUnits(tx, rental.unitIds);
        const requestedEndDate = this.addCalendarMonths(contract.endDate, parsed.termMonths);
        await this.assertNoAllocationConflict(tx, rental.contracts, contract.endDate, requestedEndDate);
        await this.assertNoOperationalConflict(tx, reservation, rental.contracts);
        const snapshot = await this.contractQuote(tx, reservation, contract, parsed.termMonths, parsed.paymentPlan, true);
        if (input.expectedTotalAmount !== undefined && input.expectedTotalAmount !== snapshot.totalAmount
            || input.expectedEndDate !== undefined && input.expectedEndDate !== snapshot.requestedEndDate
            || input.expectedPricingVersion !== undefined && input.expectedPricingVersion !== this.quoteVersion(snapshot)) {
          throw new ConflictException({ code: 'RENEWAL_QUOTE_CHANGED', message: 'Giá hoặc hạn thuê đã thay đổi. Vui lòng tải lại báo giá.' });
        }
        const created = await tx.renewalRequest.create({
          data: {
            renewalCode: this.reference(), reservationId: reservation.id, rentalContractId: contract.id, previousEndDate: rental.endDate, requestedEndDate,
            termMonths: parsed.termMonths, paymentPlan: parsed.paymentPlan, quoteSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            requestedByUserId: customerId, activeKey: `RENEWAL:${contract.id}`, idempotencyKey: parsed.idempotencyKey,
          },
          include: this.include(),
        });
        return created;
      });
      return this.tryAutomaticRenewalApproval(created.id);
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const retry = await this.prisma.renewalRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include() });
        if (retry) {
          this.assertMatchingRetry(retry, customerId, parsed, identity.id);
          return this.tryAutomaticRenewalApproval(retry.id);
        }
        throw new ConflictException({ code: 'ACTIVE_RENEWAL_EXISTS', message: 'Kho này đã có yêu cầu gia hạn chưa được xử lý.' });
      }
      if (this.isPrismaCode(error, 'P2034')) throw new ConflictException('Rental vừa được cập nhật. Vui lòng tải lại và thử lại.');
      throw error;
    }
  }

  async quoteCustomerRenewal(customerId: string, input: Record<string, unknown>) {
    const parsed = this.quoteInput(input);
    const reservation = await this.prisma.reservation.findFirst({
      where: { customerId, OR: [{ id: parsed.reservationId }, { reservationCode: parsed.reservationId }] },
      include: renewalRentalInclude,
    });
    if (!reservation) throw new NotFoundException('Không tìm thấy đơn thuê.');
    const contract = this.customerContract(reservation, parsed.rentalContractId);
    const rental = this.assertActiveRental(reservation, contract.id);
    await assertFacilityAllowsRenewal(this.prisma, contract.reservationUnit.storageUnit.storageType.facilityId);
    const quote = await this.contractQuote(this.prisma, reservation, contract, parsed.termMonths, parsed.paymentPlan);
    await this.assertNoAllocationConflict(this.prisma, rental.contracts, rental.endDate, this.addCalendarMonths(rental.endDate, parsed.termMonths));
    await this.assertNoOperationalConflict(this.prisma, reservation, rental.contracts);
    return { ...quote, pricingVersion: this.quoteVersion(quote) };
  }

  listCustomerRenewals(customerId: string, page: number, limit: number) {
    return this.page({ reservation: { customerId } }, { page, limit }, false);
  }

  async getCustomerRenewal(customerId: string, id: string) {
    const record = await this.prisma.renewalRequest.findFirst({ where: { OR: [{ id }, { renewalCode: id }], reservation: { customerId } }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
    return this.toRenewal(record, false);
  }

  async acceptCustomerAppendix(customer: PublicUser, id: string, input: Record<string, unknown>) {
    if (customer.role !== 'STORAGE_CUSTOMER') throw new ForbiddenException('Chỉ Customer được xác nhận phụ lục của mình.');
    const acceptanceName = typeof input.acceptanceName === 'string' ? input.acceptanceName.trim() : '';
    if (acceptanceName.length < 2 || acceptanceName.length > 120) throw new BadRequestException('Họ tên xác nhận phải dài 2–120 ký tự.');
    const identity = await this.prisma.renewalRequest.findFirst({ where: { OR: [{ id }, { renewalCode: id }], reservation: { customerId: customer.id } }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn thuộc tài khoản này.');
    const current = await this.prisma.renewalRequest.findUnique({ where: { id: identity.id }, include: this.include() });
    if (!current) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
    if (!['APPROVED_PENDING_PAYMENT', 'COMPLETED'].includes(current.status) || !current.appendixCode || !current.appendixSnapshot) throw new ConflictException('Phụ lục chưa sẵn sàng để xác nhận.');
    if (current.appendixAcceptedAt) {
      if (current.appendixAcceptedByUserId !== customer.id) throw new ConflictException('Phụ lục đã được xác nhận bởi tài khoản khác.');
      return this.toRenewal(current, false);
    }
    const signatureImage = validateSignature(input);
    const document = signedDocument(current.appendixSnapshot);
    if (input.snapshotHash !== snapshotHash(document)) throw new ConflictException('Nội dung phụ lục đã thay đổi. Vui lòng tải lại trước khi ký.');
    await this.signing.verifyAndSave({ userId: customer.id, email: customer.email, kind: 'appendix', documentId: current.id, documentHash: snapshotHash(document), signatureImage, acceptanceName }, input, async (evidence, transaction) => {
      const changed = await (transaction ?? this.prisma).renewalRequest.updateMany({ where: { id: current.id, appendixAcceptedAt: null, updatedAt: current.updatedAt, status: { in: ['APPROVED_PENDING_PAYMENT', 'COMPLETED'] } }, data: { appendixAcceptedAt: new Date(), appendixAcceptedByUserId: customer.id, appendixAcceptanceName: acceptanceName, appendixSignatureImage: signatureImage, appendixSnapshot: signedEnvelope(document, evidence) as unknown as Prisma.InputJsonValue } });
      if (changed.count !== 1) throw new ConflictException('Phụ lục vừa được cập nhật. Vui lòng tải lại.');
    });
    const updated = await this.prisma.renewalRequest.findUniqueOrThrow({ where: { id: current.id }, include: this.include() });
    return this.toRenewal(updated, false);
  }

  private async tryAutomaticRenewalApproval(renewalId: string) {
    try {
      const record = await this.serializable(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RenewalRequest" WHERE "id" = ${renewalId} FOR UPDATE`);
        const current = await tx.renewalRequest.findUnique({ where: { id: renewalId }, include: this.include() });
        if (!current) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
        if (current.status !== 'PENDING') return current;
        await this.lockReservation(tx, current.reservationId);
        const rental = this.assertActiveRental(current.reservation, current.rentalContractId);
        for (const contract of rental.contracts) await assertFacilityAllowsRenewal(tx,contract.reservationUnit.storageUnit.storageType.facilityId,true);
        this.assertExpectedEnd(current, rental.endDate);
        await this.lockUnits(tx, rental.unitIds);
        await this.assertNoAllocationConflict(tx, rental.contracts, current.previousEndDate, current.requestedEndDate, current.id);
        await this.assertNoOperationalConflict(tx, current.reservation, rental.contracts, current.id);
        const snapshot = this.snapshot(current);
        this.assertSnapshot(current, snapshot);
        await this.createInvoices(tx, current, snapshot, rental.contracts);
        return tx.renewalRequest.update({
          where: { id: current.id },
          data: { status: 'APPROVED_PENDING_PAYMENT', reviewedByUserId: null, reviewedAt: new Date(), approvedAt: new Date(), ...this.appendixDocument(current) },
          include: this.include(),
        });
      });
      return this.toRenewal(record, false);
    } catch (error) {
      if (!(error instanceof ConflictException) && !(error instanceof BadRequestException) && !this.isPrismaCode(error, 'P2034')) throw error;
      return this.toRenewal(await this.find(renewalId, this.prisma), false);
    }
  }

  listManagerRenewals(query: RenewalListQuery, actor: PublicUser) {
    managerReservationScope(actor);
    const filters: Prisma.RenewalRequestWhereInput[] = [renewalTaskScope(actor)];
    if (query.status) filters.push({ status: query.status });
    if (query.search) filters.push({ OR: [
      { renewalCode: { contains: query.search, mode: 'insensitive' } },
      { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } },
      { reservation: { customer: { fullName: { contains: query.search, mode: 'insensitive' } } } },
      { reservation: { customer: { email: { contains: query.search, mode: 'insensitive' } } } },
      { rentalContract: { contractCode: { contains: query.search, mode: 'insensitive' } } },
      { rentalContract: { reservationUnit: { storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } } } },
      { rentalContractId: null, reservation: { units: { some: { storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } } } } },
    ] });
    return this.page(filters.length ? { AND: filters } : {}, query, true);
  }

  async getManagerRenewal(id: string, actor: PublicUser) {
    const record = await this.find(id, this.prisma);
    await assertManagerRecordAccess(this.prisma,actor,record.rentalContractId ? {rentalContractId:record.rentalContractId} : {reservationId:record.reservationId});
    return this.toRenewal(record, true);
  }

  async approve(id: string, actor: PublicUser) {
    this.assertManager(actor);
    const identity = await this.prisma.renewalRequest.findFirst({ where: { OR: [{ id }, { renewalCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RenewalRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
        const current = await tx.renewalRequest.findUnique({ where: { id: identity.id }, include: this.include() });
        if (!current) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
      await assertManagerRecordAccess(tx,actor,current.rentalContractId ? {rentalContractId:current.rentalContractId} : {reservationId:current.reservationId});
        if (['APPROVED_PENDING_PAYMENT', 'COMPLETED'].includes(current.status)) return this.toRenewal(current, true);
        if (current.status !== 'PENDING') throw new ConflictException('Chỉ Renewal PENDING mới được duyệt.');
        await this.lockReservation(tx, current.reservationId);
        const rental = this.assertActiveRental(current.reservation, current.rentalContractId);
        for (const contract of rental.contracts) await assertFacilityAllowsRenewal(tx,contract.reservationUnit.storageUnit.storageType.facilityId,true);
        this.assertExpectedEnd(current, rental.endDate);
        await this.lockUnits(tx, rental.unitIds);
        await this.assertNoAllocationConflict(tx, rental.contracts, current.previousEndDate, current.requestedEndDate, current.id);
        await this.assertNoOperationalConflict(tx, current.reservation, rental.contracts, current.id);
        const snapshot = this.snapshot(current);
        this.assertSnapshot(current, snapshot);
        await this.createInvoices(tx, current, snapshot, rental.contracts);
        const updated = await tx.renewalRequest.update({
          where: { id: current.id },
          data: { status: 'APPROVED_PENDING_PAYMENT', reviewedByUserId: actor.id, reviewedAt: new Date(), approvedAt: new Date(), ...this.appendixDocument(current) },
          include: this.include(),
        });
        return this.toRenewal(updated, true);
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if (this.isPrismaCode(error, 'P2034')) throw new ConflictException('Yêu cầu gia hạn vừa được cập nhật hoặc có allocation cạnh tranh. Vui lòng thử lại.');
      throw error;
    }
  }

  async reject(id: string, input: Record<string, unknown>, actor: PublicUser) {
    this.assertManager(actor);
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (reason.length < 3 || reason.length > 2000) throw new BadRequestException('Lý do từ chối phải dài 3–2000 ký tự.');
    const identity = await this.prisma.renewalRequest.findFirst({ where: { OR: [{ id }, { renewalCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RenewalRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.renewalRequest.findUnique({ where: { id: identity.id } });
      if (!current) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
      await assertManagerRecordAccess(tx,actor,current.rentalContractId ? {rentalContractId:current.rentalContractId} : {reservationId:current.reservationId});
      if (current.status === 'REJECTED') return this.toRenewal(await this.find(current.id, tx), true);
      if (current.status !== 'PENDING') throw new ConflictException('Chỉ Renewal PENDING mới được từ chối.');
      const updated = await tx.renewalRequest.update({
        where: { id: current.id },
        data: { status: 'REJECTED', activeKey: null, reviewedByUserId: actor.id, reviewedAt: new Date(), rejectedAt: new Date(), rejectionReason: reason },
        include: this.include(),
      });
      return this.toRenewal(updated, true);
    }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
  }

  async cancelCustomerRenewal(customerId: string, id: string) {
    const identity = await this.prisma.renewalRequest.findFirst({
      where: { reservation: { customerId }, OR: [{ id }, { renewalCode: id }] },
      select: { id: true },
    });
    if (!identity) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
    return this.prisma.$transaction(async tx => {
      // Match the invoice-before-renewal lock order used by payment confirmation.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Invoice" WHERE "renewalRequestId" = ${identity.id} ORDER BY "id" FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RenewalRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const renewal = await this.find(identity.id, tx);
      if (renewal.status === 'CANCELLED') return this.toRenewal(renewal, false);
      if (!['PENDING', 'APPROVED_PENDING_PAYMENT'].includes(renewal.status) ||
          renewal.invoices.some(invoice => invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID' ||
            invoice.amountPaid > 0n || invoice.payments.length)) {
        throw new ConflictException('Chỉ có thể hủy yêu cầu gia hạn chưa ghi nhận thanh toán.');
      }
      const pending = await tx.invoice.findFirst({
        where: { renewalRequestId: renewal.id, OR: [
          { onlinePaymentTransactions: { some: {
            status: 'PENDING', createdAt: { gt: new Date(Date.now() - ONLINE_PAYMENT_TTL_MS) },
          } } },
          { onlinePaymentTransactions: { some: { reconciliation: { status: { not: 'RECONCILED' } } } } },
          { paymentSubmissions: { some: { status: 'PENDING_VERIFICATION' } } },
        ] },
        select: { id: true },
      });
      if (pending) throw new ConflictException('Đang chờ xác nhận thanh toán. Hãy kiểm tra giao dịch trên hóa đơn trước khi hủy.');
      await tx.invoice.updateMany({
        where: { renewalRequestId: renewal.id, status: 'OPEN', amountPaid: 0n },
        data: { status: 'VOID', balanceDue: 0n },
      });
      await tx.renewalRequest.update({ where: { id: renewal.id }, data: { status: 'CANCELLED', activeKey: null } });
      return this.toRenewal(await this.find(renewal.id, tx), false);
    }, { isolationLevel: 'Serializable' });
  }

  async completeAfterPayment(tx: Prisma.TransactionClient, renewalRequestId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RenewalRequest" WHERE "id" = ${renewalRequestId} FOR UPDATE`);
    const renewal = await tx.renewalRequest.findUnique({ where: { id: renewalRequestId }, include: this.include() });
    if (!renewal || renewal.status === 'COMPLETED') return;
    if (renewal.status !== 'APPROVED_PENDING_PAYMENT') return;
    const snapshot = this.snapshot(renewal);
    this.assertSnapshot(renewal, snapshot);
    const activationInvoice = renewal.invoices.find((invoice: any) => invoice.renewalCycle === 1);
    if (!activationInvoice || activationInvoice.status !== 'PAID') return;

    if (renewal.rentalContractId && !renewal.appendixAcceptedAt) throw new ConflictException('Cần ký phụ lục trước khi kích hoạt gia hạn.');
    await this.lockReservation(tx, renewal.reservationId);
    const rental = this.assertActiveRental(renewal.reservation, renewal.rentalContractId);
    this.assertExpectedEnd(renewal, rental.endDate);
    await this.lockUnits(tx, rental.unitIds);
    await this.assertNoAllocationConflict(tx, rental.contracts, renewal.previousEndDate, renewal.requestedEndDate, renewal.id);
    await this.assertNoOperationalConflict(tx, renewal.reservation, rental.contracts, renewal.id);

    const contracts = await tx.rentalContract.updateMany({
      where: { reservationId: renewal.reservationId, id: { in: rental.contracts.map(contract => contract.id) }, status: 'ACTIVE', endDate: renewal.previousEndDate },
      data: { endDate: renewal.requestedEndDate },
    });
    if (contracts.count !== rental.contracts.length) throw new ConflictException('Hợp đồng cần gia hạn vừa thay đổi.');
    const allocations = await tx.reservationUnit.updateMany({
      where: { reservationId: renewal.reservationId, id: { in: rental.contracts.map(contract => contract.reservationUnitId) }, releasedAt: null, plannedEndDate: renewal.previousEndDate },
      data: { plannedEndDate: renewal.requestedEndDate },
    });
    if (allocations.count !== rental.contracts.length) throw new ConflictException('Phân bổ kho cần gia hạn vừa thay đổi.');
    const aggregate = await tx.rentalContract.aggregate({
      where: { reservationId: renewal.reservationId, status: 'ACTIVE', reservationUnit: { releasedAt: null } }, _max: { endDate: true },
    });
    await tx.reservation.update({ where: { id: renewal.reservationId }, data: { endDate: aggregate._max.endDate ?? renewal.requestedEndDate } });
    const appendixSnapshot = {
      version: 'WDP-RENEWAL-APPENDIX-V1', renewalCode: renewal.renewalCode,
      reservationReference: renewal.reservation.reservationCode,
      previousEndDate: this.isoDate(renewal.previousEndDate), requestedEndDate: this.isoDate(renewal.requestedEndDate),
      termMonths: renewal.termMonths, paymentPlan: renewal.paymentPlan, quote: this.snapshot(renewal),
      generatedAt: new Date().toISOString(),
    };
    await tx.renewalRequest.update({ where: { id: renewal.id }, data: {
      status: 'COMPLETED', activeKey: null,
      appendixCode: renewal.appendixCode ?? `${renewal.renewalCode}-PL01`,
      appendixVersion: renewal.appendixVersion ?? 'WDP-RENEWAL-APPENDIX-V1',
      appendixSnapshot: renewal.appendixSnapshot ?? appendixSnapshot as unknown as Prisma.InputJsonValue,
    } });
  }

  private async createInvoices(tx: Prisma.TransactionClient, renewal: { id: string; renewalCode: string; reservationId: string; previousEndDate: Date; requestedEndDate: Date }, snapshot: RenewalSnapshot, contracts: RenewalContract[], dueThrough?: Date, existingCycles = new Set<number | null>()) {
    const count = snapshot.paymentPlan === 'PREPAID' ? 1 : snapshot.termMonths;
    for (let cycle = 1; cycle <= count; cycle += 1) {
      const start = this.addCalendarMonths(renewal.previousEndDate, cycle - 1);
      if (cycle > 1 && (!dueThrough || start > dueThrough)) break;
      if (existingCycles.has(cycle)) continue;
      const end = snapshot.paymentPlan === 'PREPAID'
        ? renewal.requestedEndDate
        : cycle === count ? renewal.requestedEndDate : this.addCalendarMonths(renewal.previousEndDate, cycle);
      if (contracts.length !== snapshot.quantity || (cycle > 1 && contracts.some(contract => contract.endDate < end))) {
        throw new ConflictException('Các hợp đồng không còn bao phủ đủ kỳ gia hạn. Cần đối soát trước khi lập hóa đơn.');
      }
      const monthlyRate = BigInt(snapshot.monthlyUnitPrice);
      const billed = contracts.filter(contract => contract.status === 'ACTIVE'
        || contract.status === 'COMPLETED' && contract.completedAt && businessToday(contract.completedAt) > start);
      if (contracts.some(contract => !billed.includes(contract) && !(contract.status === 'COMPLETED'
        && contract.completedAt && businessToday(contract.completedAt) <= start))) {
        throw new ConflictException('Thời điểm trả kho cắt ngang kỳ gia hạn. Cần đối soát trước khi lập hóa đơn.');
      }
      if (!billed.length) continue;
      const rentalAmount = snapshot.paymentPlan === 'PREPAID' ? BigInt(snapshot.rentalAmount) : monthlyRate * BigInt(billed.length);
      const units = homogeneousInvoiceUnits(billed, monthlyRate, rentalAmount, 0n, snapshot.storageTypeName).map(unit => ({
        ...unit, ...(snapshot.scope ? { reservationUnitId: snapshot.scope.reservationUnitId, storageUnitId: snapshot.scope.storageUnitId,
          unitCode: snapshot.scope.unitCode, storageTypeId: snapshot.storageTypeId } : {}),
        ...(snapshot.paymentPlan === 'PREPAID' && snapshot.scope ? { discountAmount: snapshot.discountAmount } : {}),
      }));
      const breakdown = invoiceBreakdown(start, end, units, [], { rentalAmount, depositAmount: 0n, serviceAmount: 0n, totalAmount: rentalAmount });
      await tx.invoice.upsert({
        where: { renewalRequestId_renewalCycle: { renewalRequestId: renewal.id, renewalCycle: cycle } },
        update: {},
        create: {
          invoiceCode: `${renewal.renewalCode}-I${String(cycle).padStart(2, '0')}`,
          reservationId: renewal.reservationId, renewalRequestId: renewal.id, type: 'RENEWAL', billingCycle: null, renewalCycle: cycle,
          storageTypeIdSnapshot: snapshot.storageTypeId, facilityIdSnapshot: snapshot.facilityId ?? null, pricingSnapshot: { ...snapshot, breakdown },
          billingPeriodStart: start, billingPeriodEnd: end, dueAt: start, status: 'OPEN', rentalAmount,
          depositAmount: 0n, totalAmount: rentalAmount, amountPaid: 0n, balanceDue: rentalAmount, currency: 'VND',
        },
      });
    }
  }

  private customerContract(reservation: RenewalRental, ref: string | null) {
    if (!ref && (reservation.quantity !== 1 || reservation.contracts.length !== 1)) {
      throw new BadRequestException('Hãy chọn hợp đồng của kho muốn gia hạn.');
    }
    const contract = reservation.contracts.find(item => !ref || item.id === ref || item.contractCode === ref);
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng trong đơn thuê này.');
    return contract;
  }

  private targetContracts(reservation: RenewalRental, contractId: string | null) {
    const contracts = contractId ? reservation.contracts.filter(contract => contract.id === contractId) : reservation.contracts;
    if (contracts.length !== (contractId ? 1 : reservation.quantity) || !contracts.length) {
      throw new ConflictException('Phạm vi hợp đồng của yêu cầu gia hạn chưa khớp hồ sơ thuê.');
    }
    return contracts;
  }

  private assertActiveRental(reservation: RenewalRental, contractId: string | null) {
    if (reservation.status !== 'CONFIRMED') throw new ConflictException('Chỉ đơn thuê đã xác nhận mới được gia hạn.');
    const original = reservation.quoteSnapshot as Record<string, unknown>;
    if (original?.billingMode !== 'MONTHLY') throw new ConflictException('Gia hạn áp dụng cho hợp đồng thuê theo tháng.');
    const contracts = this.targetContracts(reservation, contractId);
    const endDate = contracts[0].endDate;
    if (contracts.some(contract => contract.status !== 'ACTIVE' || contract.reservationUnit.reservationId !== reservation.id
      || contract.reservationUnit.releasedAt || contract.reservationUnit.storageUnit.status !== 'OCCUPIED'
      || +contract.reservationUnit.plannedEndDate !== +contract.endDate)) {
      throw new ConflictException('Hợp đồng hoặc phân bổ kho đang thuê chưa đủ điều kiện gia hạn.');
    }
    if (contracts.some(contract => +contract.endDate !== +endDate)) {
      throw new ConflictException({ code: 'RENEWAL_END_DATE_MISMATCH', message: 'Hồ sơ gia hạn toàn đơn cũ có nhiều hạn thuê. Cần đối soát trước khi xử lý.' });
    }
    return { contracts, endDate, unitIds: contracts.map(contract => contract.reservationUnit.storageUnitId) };
  }

  private async contractQuote(db: DbClient, reservation: RenewalRental, contract: RenewalContract, termMonths: number, paymentPlan: PaymentPlan, lockVersion = false): Promise<RenewalSnapshot> {
    const now = new Date();
    const policy = await loadPricingPolicy(db, now);
    const start = contract.endDate;
    const end = this.addCalendarMonths(start, termMonths);
    const renewalPolicy = policy.renewal.value;
    const daysBeforeEnd = (+start - +businessToday(now)) / 86_400_000;
    if (daysBeforeEnd <= 0 || daysBeforeEnd < renewalPolicy.closesDaysBefore || daysBeforeEnd > renewalPolicy.opensDaysBefore) {
      throw new ConflictException({ code: 'RENEWAL_WINDOW_CLOSED', message: 'Hợp đồng đang ngoài thời gian cho phép gửi yêu cầu gia hạn.' });
    }
    const original = reservation.quoteSnapshot as { monthlyUnitPrice?: unknown };
    const effective = contract.rateEffectiveFrom;
    if (renewalPolicy.priceMode === 'CONTRACT_RATE' && effective && effective > start && effective < end) {
      throw new ConflictException('Đơn giá thay đổi giữa kỳ đề nghị gia hạn. Cần đối soát báo giá.');
    }
    const allocation = contract.reservationUnit;
    const unit = allocation.storageUnit;
    const product = unit.storageType;
    const previousRenewal = renewalPolicy.priceMode === 'CONTRACT_RATE' ? await db.renewalRequest.findFirst({
      where: {
        reservationId: reservation.id, status: 'COMPLETED', previousEndDate: { lte: start },
        OR: [{ rentalContractId: contract.id }, { rentalContractId: null }],
      },
      orderBy: [{ previousEndDate: 'desc' }, { id: 'desc' }],
      select: { previousEndDate: true, quoteSnapshot: true },
    }) : null;
    const transferRateEffective = Boolean(effective && effective <= start);
    const renewalRate = (previousRenewal?.quoteSnapshot as { monthlyUnitPrice?: unknown } | undefined)?.monthlyUnitPrice;
    const contractRate = previousRenewal && (!transferRateEffective || previousRenewal.previousEndDate >= effective!)
      ? renewalRate : transferRateEffective ? Number(contract.currentMonthlyRate) : original.monthlyUnitPrice;
    const rate = renewalPolicy.priceMode === 'CURRENT_LIST_PRICE' ? Number(product.monthlyRate) : contractRate;
    if (renewalPolicy.priceMode === 'CURRENT_LIST_PRICE') await assertListedPrice(db, product, lockVersion);
    if (!Number.isSafeInteger(rate) || Number(rate) <= 0 ||
        renewalPolicy.priceMode === 'CONTRACT_RATE' && contract.currentMonthlyRate !== null && !effective) {
      throw new ConflictException('Chưa xác định được đơn giá hiệu lực của hợp đồng.');
    }
    const startDate = this.isoDate(start);
    const endDate = this.isoDate(end);
    const quote = this.pricing.calculate({ ...product, monthlyRate: new Prisma.Decimal(Number(rate)) }, {
      storageTypeId: product.id, quantity: 1, startDate, endDate, paymentPlan,
    }, [], policy, true);
    if (quote.billingMode !== 'MONTHLY' || quote.termMonths !== termMonths) throw new ConflictException('Không thể lập báo giá gia hạn theo tháng.');
    return {
      scope: { reservationId: reservation.id, rentalContractId: contract.id, contractCode: contract.contractCode,
        reservationUnitId: allocation.id, storageUnitId: unit.id, unitCode: unit.unitNumber },
      currency: 'VND', pricingPolicy: policy, storageTypeId: product.id, storageTypeName: product.name, quantity: 1, facilityId: product.facilityId,
      previousEndDate: startDate, renewalStartDate: startDate, requestedEndDate: endDate, termMonths, paymentPlan,
      monthlyUnitPrice: quote.monthlyUnitPrice, baseRentalAmount: quote.baseRentalAmount, discountPercent: quote.discountPercent,
      discountAmount: quote.discountAmount, rentalAmount: quote.rentalAmount, depositAmount: 0, totalAmount: quote.rentalAmount,
    };
  }

  private quoteVersion(snapshot: RenewalSnapshot) {
    return snapshotHash(snapshot);
  }

  private async assertNoOperationalConflict(tx: Prisma.TransactionClient, reservation: RenewalRental, contracts: RenewalContract[], renewalId?: string) {
    const ids = contracts.map(contract => contract.id);
    const existing = await tx.renewalRequest.findFirst({ where: {
      id: { not: renewalId }, reservationId: reservation.id, status: { in: [...openRenewalStatuses] },
      OR: [{ rentalContractId: null }, { rentalContractId: { in: ids } }],
    }, select: { id: true } });
    if (existing) throw new ConflictException({ code: 'ACTIVE_RENEWAL_EXISTS', message: 'Kho này đã có yêu cầu gia hạn chưa được xử lý.' });
    const returning = await tx.returnRequest.findFirst({ where: {
      reservationId: reservation.id, status: { not: 'COMPLETED' },
      OR: [{ activeKey: `RETURN:${reservation.id}` }, { inspections: { some: { rentalContractId: { in: ids } } } }],
    }, select: { id: true } });
    if (returning) throw new ConflictException({ code: 'RENEWAL_RETURN_IN_PROGRESS', message: 'Kho này đang có yêu cầu trả. Vui lòng xử lý hồ sơ trả kho trước.' });
    if (await tx.transferRequest.count({ where: { rentalContractId: { in: ids }, status: { in: ['REQUESTED', 'APPROVED'] } } })) {
      throw new ConflictException('Cần xử lý yêu cầu chuyển kho trước khi gia hạn hợp đồng này.');
    }
    const invoices = await tx.invoice.findMany({ where: {
      reservationId: reservation.id, balanceDue: { gt: 0 }, status: { not: 'VOID' },
      OR: [{ dueAt: null }, { dueAt: { lte: businessToday() } }],
      ...(renewalId ? { NOT: { renewalRequestId: renewalId, type: 'RENEWAL' } } : {}),
    }, select: { ...returnInvoiceFields, renewalRequest: { select: { rentalContractId: true } } } });
    const readiness = contractReturnReadiness(invoices, ids, reservation.contracts.map(contract => contract.id));
    if (!readiness.canReturn) throw new ConflictException({ code: 'RENEWAL_OUTSTANDING_BALANCE',
      message: readiness.requiresReconciliation ? 'Cần đối soát công nợ đến hạn trên hóa đơn chung trước khi gia hạn.' : 'Cần thanh toán các hóa đơn đến hạn của kho trước khi gia hạn.',
    });
  }

  private async assertNoAllocationConflict(db: DbClient, contracts: RenewalContract[], start: Date, end: Date, renewalId?: string) {
    const unitIds = contracts.map(contract => contract.reservationUnit.storageUnitId);
    const allocation = await db.reservationUnit.findFirst({ where: {
      id: { notIn: contracts.map(contract => contract.reservationUnitId) }, storageUnitId: { in: unitIds }, releasedAt: null,
      plannedStartDate: { lt: end }, plannedEndDate: { gt: start },
    }, select: { id: true } });
    const approved = await db.renewalRequest.findFirst({ where: {
      id: { not: renewalId }, status: 'APPROVED_PENDING_PAYMENT', previousEndDate: { lt: end }, requestedEndDate: { gt: start },
      ...renewalOverlapsUnits(unitIds),
    }, select: { id: true } });
    if (allocation || approved) {
      throw new ConflictException({ code: 'RENEWAL_ALLOCATION_CONFLICT', message: 'Kho đã có phân bổ hoặc gia hạn giữ chỗ trùng với kỳ đề nghị.' });
    }
  }

  private include() {
    return {
      requestedBy: { select: { id: true, fullName: true, email: true } },
      reviewedBy: { select: { id: true, fullName: true, role: true } },
      reservation: { include: { ...renewalRentalInclude, supportRequests: closeoutReservationSelect.supportRequests } },
      invoices: { include: { payments: { select: { id: true, paymentCode: true, amount: true, method: true, receivedAt: true }, orderBy: { receivedAt: 'asc' as const } } }, orderBy: { renewalCycle: 'asc' as const } },
    };
  }

  private async find(id: string, db: DbClient) {
    const record = await db.renewalRequest.findFirst({ where: { OR: [{ id }, { renewalCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu gia hạn.');
    return record;
  }

  private async page(where: Prisma.RenewalRequestWhereInput, query: { page: number; limit: number }, manager: boolean) {
    const [total, records] = await Promise.all([
      this.prisma.renewalRequest.count({ where }),
      this.prisma.renewalRequest.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.include() }),
    ]);
    return { page: query.page, limit: query.limit, total, items: records.map((record) => this.toRenewal(record, manager)) };
  }

  private toRenewal(record: any, manager: boolean) {
    const scope = this.snapshot(record).scope;
    const contracts = (record.reservation.contracts as RenewalContract[]).filter(contract => !record.rentalContractId || contract.id === record.rentalContractId);
    const invoices = record.invoices.filter((invoice: any) => invoice.amountPaid > 0n || !isScheduledRenewalInvoice(invoice)
      || closeoutPaymentAllowed(record.reservation, record.rentalContractId)).map((invoice: any) => ({
      id: invoice.id, invoiceCode: invoice.invoiceCode, type: invoice.type, renewalCycle: invoice.renewalCycle,
      billingPeriodStart: this.isoDate(invoice.billingPeriodStart), billingPeriodEnd: this.isoDate(invoice.billingPeriodEnd), dueAt: this.isoDate(invoice.dueAt),
      status: invoice.status, rentalAmount: this.money(invoice.rentalAmount), depositAmount: this.money(invoice.depositAmount), totalAmount: this.money(invoice.totalAmount),
      amountPaid: this.money(invoice.amountPaid), balanceDue: this.money(invoice.balanceDue),
      payments: invoice.payments.map((payment: any) => ({ ...payment, amount: this.money(payment.amount), receivedAt: payment.receivedAt.toISOString() })),
    }));
    return {
      id: record.id, renewalCode: record.renewalCode, status: record.status,
      rentalContractId: record.rentalContractId ?? null,
      contracts: contracts.map(contract => ({ id: contract.id, contractCode: contract.contractCode, status: contract.status,
        endDate: this.isoDate(contract.endDate), unitCode: scope?.unitCode ?? contract.reservationUnit.storageUnit.unitNumber })),
      reservation: { id: record.reservation.id, reference: record.reservation.reservationCode, quantity: record.rentalContractId ? 1 : record.reservation.quantity,
        currentEndDate: this.isoDate(record.rentalContractId ? contracts[0]?.endDate ?? record.previousEndDate : record.reservation.endDate),
        storageType: { id: scope ? this.snapshot(record).storageTypeId : record.reservation.storageType.id, code: contracts[0]?.reservationUnit.storageUnit.storageType?.code ?? record.reservation.storageType.code,
          name: scope ? this.snapshot(record).storageTypeName : record.reservation.storageType.name } },
      previousEndDate: this.isoDate(record.previousEndDate), requestedEndDate: this.isoDate(record.requestedEndDate), termMonths: record.termMonths, paymentPlan: record.paymentPlan,
      quoteSnapshot: record.quoteSnapshot, invoices,
      billingSummary: { totalInvoiced: invoices.reduce((sum: number, invoice: any) => sum + invoice.totalAmount, 0), totalPaid: invoices.reduce((sum: number, invoice: any) => sum + invoice.amountPaid, 0), totalOutstanding: invoices.reduce((sum: number, invoice: any) => sum + invoice.balanceDue, 0) },
      rejectionReason: record.rejectionReason, requestedAt: record.requestedAt.toISOString(), reviewedAt: record.reviewedAt?.toISOString() ?? null, approvedAt: record.approvedAt?.toISOString() ?? null, rejectedAt: record.rejectedAt?.toISOString() ?? null, updatedAt: record.updatedAt.toISOString(),
      appendix: record.appendixCode ? { code: record.appendixCode, version: record.appendixVersion, snapshot: signedDocument(record.appendixSnapshot), snapshotHash: snapshotHash(signedDocument(record.appendixSnapshot)), verification: signatureVerification(record.appendixSnapshot), otp: this.signing.availability(), acceptedAt: record.appendixAcceptedAt?.toISOString() ?? null, acceptanceName: record.appendixAcceptanceName ?? null, signatureImage: record.appendixSignatureImage ?? null } : null,
      ...(manager ? { customer: record.reservation.customer, requestedBy: record.requestedBy, reviewedBy: record.reviewedBy } : {}),
    };
  }

  private quoteInput(input: Record<string, unknown>) {
    if (['contractId', 'storageUnitId', 'reservationUnitId', 'rentalContractIds', 'contractIds', 'storageUnitIds', 'reservationUnitIds'].some(key => input[key] != null)) {
      throw new BadRequestException('Chọn một kho bằng rentalContractId.');
    }
    const reservationId = typeof input.reservationId === 'string' ? input.reservationId.trim() : '';
    if (!reservationId) throw new BadRequestException('reservationId là bắt buộc.');
    const rentalContractId = typeof input.rentalContractId === 'string' ? input.rentalContractId.trim() : null;
    if (input.rentalContractId != null && (!rentalContractId || rentalContractId.length > 200)) throw new BadRequestException('rentalContractId không hợp lệ.');
    const termMonths = Number(input.termMonths);
    if (!Number.isSafeInteger(termMonths) || termMonths < 1 || termMonths > 120) throw new BadRequestException('termMonths phải là số nguyên từ 1 đến 120.');
    const paymentPlan = typeof input.paymentPlan === 'string' ? input.paymentPlan : '';
    if (!['PAY_MONTHLY', 'PREPAID'].includes(paymentPlan)) throw new BadRequestException('paymentPlan phải là PAY_MONTHLY hoặc PREPAID.');
    return { reservationId, rentalContractId, termMonths, paymentPlan: paymentPlan as PaymentPlan };
  }

  private requestKey(idempotencyKey?: string) {
    const key = idempotencyKey?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự và chỉ chứa ký tự an toàn.');
    return key;
  }

  private appendixDocument(renewal: any) {
    const contracts = this.targetContracts(renewal.reservation, renewal.rentalContractId);
    return {
      appendixCode: `${renewal.renewalCode}-PL01`, appendixVersion: 'NESTBOX-RENEWAL-APPENDIX-V2',
      appendixSnapshot: { issuer: this.policy.issuer(), customer: renewal.reservation.customer, version: 'NESTBOX-RENEWAL-APPENDIX-V2', renewalCode: renewal.renewalCode, reservationReference: renewal.reservation.reservationCode, previousEndDate: this.isoDate(renewal.previousEndDate), requestedEndDate: this.isoDate(renewal.requestedEndDate), termMonths: renewal.termMonths, paymentPlan: renewal.paymentPlan, quote: this.snapshot(renewal), contracts: contracts.map(contract => ({ contractCode: contract.contractCode, unitCode: contract.reservationUnit.storageUnit.unitNumber })) } as unknown as Prisma.InputJsonValue,
    };
  }

  private snapshot(record: any) {
    return record.quoteSnapshot as RenewalSnapshot;
  }

  private assertSnapshot(record: any, snapshot: RenewalSnapshot) {
    const scope = snapshot?.scope;
    const contract = record.rentalContractId ? (record.reservation.contracts as RenewalContract[]).find(item => item.id === record.rentalContractId) : undefined;
    const scopedMatch = record.rentalContractId
      ? !!scope && !!contract && snapshot.quantity === 1 && scope.reservationId === record.reservationId
        && scope.rentalContractId === contract.id && scope.contractCode === contract.contractCode
        && (record.status === 'COMPLETED' || scope.reservationUnitId === contract.reservationUnitId
          && scope.storageUnitId === contract.reservationUnit.storageUnitId && snapshot.storageTypeId === contract.reservationUnit.storageUnit.storageTypeId)
      : !scope && snapshot?.storageTypeId === record.reservation.storageTypeId && snapshot?.quantity === record.reservation.quantity;
    const valid = scopedMatch && snapshot.currency === 'VND' && snapshot.previousEndDate === this.isoDate(record.previousEndDate)
      && snapshot.requestedEndDate === this.isoDate(record.requestedEndDate) && snapshot.termMonths === record.termMonths
      && snapshot.paymentPlan === record.paymentPlan && snapshot.depositAmount === 0
      && [snapshot.monthlyUnitPrice, snapshot.baseRentalAmount, snapshot.discountPercent, snapshot.discountAmount, snapshot.rentalAmount, snapshot.totalAmount].every(Number.isSafeInteger)
      && snapshot.monthlyUnitPrice > 0 && snapshot.totalAmount > 0 && snapshot.totalAmount === snapshot.rentalAmount
      && snapshot.discountAmount >= 0 && snapshot.baseRentalAmount - snapshot.discountAmount === snapshot.totalAmount
      && (snapshot.paymentPlan !== 'PAY_MONTHLY' || snapshot.discountAmount === 0
        && BigInt(snapshot.monthlyUnitPrice) * BigInt(snapshot.termMonths) * BigInt(snapshot.quantity) === BigInt(snapshot.totalAmount));
    if (!valid) throw new ConflictException('Renewal quoteSnapshot không hợp lệ hoặc không khớp yêu cầu.');
  }

  private assertExpectedEnd(record: any, actual: Date) {
    if (record.previousEndDate.getTime() !== actual.getTime()) throw new ConflictException({ code: 'RENEWAL_EFFECTIVE_END_CHANGED', message: 'Ngày kết thúc hiện tại đã thay đổi; yêu cầu gia hạn cần được xem xét lại.' });
  }

  private assertMatchingRetry(record: any, customerId: string, parsed: { termMonths: number; paymentPlan: PaymentPlan; rentalContractId: string | null }, reservationId: string) {
    const scope = this.snapshot(record).scope;
    const matchesScope = parsed.rentalContractId ? !!scope && [scope.rentalContractId, scope.contractCode].includes(parsed.rentalContractId)
      : !record.rentalContractId || record.reservation.quantity === 1;
    if (!matchesScope || record.requestedByUserId !== customerId || record.reservationId !== reservationId || record.termMonths !== parsed.termMonths || record.paymentPlan !== parsed.paymentPlan) {
      throw new ConflictException('Idempotency-Key đã được dùng cho yêu cầu gia hạn khác.');
    }
  }

  private assertManager(actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý được quyết định yêu cầu gia hạn chờ xử lý.');
  }

  private lockUnits(tx: Prisma.TransactionClient, unitIds: string[]) {
    return tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" IN (${Prisma.join(unitIds)}) ORDER BY "id" FOR UPDATE`);
  }

  private lockReservation(tx: Prisma.TransactionClient, id: string) {
    return tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Reservation" WHERE "id" = ${id} FOR UPDATE`);
  }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
      } catch (error) {
        if (attempt >= 3 || !this.isPrismaCode(error, 'P2034')) throw error;
      }
    }
  }

  private addCalendarMonths(original: Date, months: number) {
    const day = original.getUTCDate();
    const result = new Date(Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + months, 1));
    const days = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, days));
    return result;
  }

  private reference() {
    return `WDPR-${new Date().getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`;
  }

  private isoDate(value: Date) { return value.toISOString().slice(0, 10); }
  private money(value: bigint) {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ConflictException('Giá trị tiền tệ lưu trữ không hợp lệ.');
    return Number(value);
  }
  private isPrismaCode(error: unknown, code: string) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code; }
}
