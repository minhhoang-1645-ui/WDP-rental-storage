import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

type DbClient = PrismaService | Prisma.TransactionClient;
type SettlementStatus = 'PENDING_REVIEW' | 'APPROVED' | 'AWAITING_OUTSTANDING_PAYMENT' | 'SETTLED';
type IssueType = 'NORMAL_WEAR' | 'FACILITY_FAULT' | 'CUSTOMER_DAMAGE' | 'CLEANING_REQUIRED' | 'LOST_KEY_OR_ACCESS_ITEM' | 'OTHER';

export interface SettlementListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: SettlementStatus;
}

type ReviewedIssue = { inspectionId: string; issueType: IssueType; approvedChargeAmount: bigint; reason: string | null };

@Injectable()
export class DepositSettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  listCustomer(customerId: string, page: number, limit: number) {
    return this.page({ returnRequest: { reservation: { customerId } } }, { page, limit }, false);
  }

  async getCustomer(customerId: string, id: string) {
    const record = await this.prisma.depositSettlement.findFirst({
      where: { OR: [{ id }, { settlementCode: id }], returnRequest: { reservation: { customerId } } },
      include: this.include(),
    });
    if (!record) throw new NotFoundException('Không tìm thấy quyết toán deposit.');
    return this.toSettlement(record, false);
  }

  listManager(query: SettlementListQuery) {
    const filters: Prisma.DepositSettlementWhereInput[] = [];
    if (query.status) filters.push({ status: query.status });
    if (query.search) filters.push({ OR: [
      { settlementCode: { contains: query.search, mode: 'insensitive' } },
      { returnRequest: { returnCode: { contains: query.search, mode: 'insensitive' } } },
      { returnRequest: { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } } },
      { returnRequest: { reservation: { customer: { fullName: { contains: query.search, mode: 'insensitive' } } } } },
      { returnRequest: { reservation: { customer: { email: { contains: query.search, mode: 'insensitive' } } } } },
      { returnRequest: { inspections: { some: { storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } } } } },
    ] });
    return this.page(filters.length ? { AND: filters } : {}, query, true);
  }

  async getManager(id: string) {
    return this.toSettlement(await this.find(id, this.prisma), true);
  }

  async review(id: string, input: Record<string, unknown>, idempotencyKey: string | undefined, actor: PublicUser) {
    this.assertManager(actor);
    const parsed = this.reviewInput(input, idempotencyKey);
    const identity = await this.identity(id);
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "DepositSettlement" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.depositSettlement.findUnique({ where: { id: identity.id }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy quyết toán deposit.');
      if (current.reviewIdempotencyKey !== null) {
        this.assertMatchingReviewRetry(current, parsed);
        return this.toSettlement(current, true);
      }
      if (current.status !== 'PENDING_REVIEW') throw new ConflictException('Chỉ settlement PENDING_REVIEW mới được duyệt issue.');
      if (current.returnRequest.status !== 'PENDING_SETTLEMENT' || current.returnRequest.physicallyReturnedAt === null) {
        throw new ConflictException('Chưa hoàn tất trả kho vật lý.');
      }
      const issueInspections = current.returnRequest.inspections.filter((inspection) => inspection.result === 'ISSUE_FOUND');
      this.assertCompleteIssueReview(issueInspections, parsed.issues);
      const total = parsed.issues.reduce((sum, issue) => sum + issue.approvedChargeAmount, 0n);
      const deduction = total < current.depositAmount ? total : current.depositAmount;
      const refund = current.depositAmount - deduction;
      const outstanding = total > current.depositAmount ? total - current.depositAmount : 0n;
      const now = new Date();

      await tx.depositSettlementIssue.createMany({ data: parsed.issues.map((issue) => ({
        depositSettlementId: current.id,
        returnInspectionId: issue.inspectionId,
        issueType: issue.issueType,
        approvedChargeAmount: issue.approvedChargeAmount,
        reason: issue.reason,
        reviewedByUserId: actor.id,
        reviewedAt: now,
      })) });

      let status: SettlementStatus = outstanding > 0n ? 'AWAITING_OUTSTANDING_PAYMENT' : refund > 0n ? 'APPROVED' : 'SETTLED';
      if (outstanding > 0n) {
        await tx.invoice.create({ data: {
          invoiceCode: `${current.settlementCode}-I01`,
          reservationId: current.returnRequest.reservationId,
          type: 'SETTLEMENT',
          billingCycle: null,
          depositSettlementId: current.id,
          status: 'OPEN',
          rentalAmount: 0n,
          depositAmount: 0n,
          chargeAmount: outstanding,
          totalAmount: outstanding,
          amountPaid: 0n,
          balanceDue: outstanding,
          currency: 'VND',
        } });
      }
      await tx.depositSettlement.update({ where: { id: current.id }, data: {
        status,
        totalApprovedCharges: total,
        deductionAmount: deduction,
        refundAmount: refund,
        outstandingAmount: outstanding,
        reviewedByUserId: actor.id,
        reviewedAt: now,
        reviewNote: parsed.note,
        reviewIdempotencyKey: parsed.idempotencyKey,
        ...(status === 'SETTLED' ? { settledByUserId: actor.id, settledAt: now } : {}),
      } });
      if (status === 'SETTLED') await this.completeReturn(tx, current.returnRequestId, actor.id, now);
      return this.toSettlement(await this.find(current.id, tx), true);
    }, 'Settlement vừa được cập nhật bởi thao tác khác. Vui lòng tải lại.');
  }

  async refund(id: string, input: Record<string, unknown>, idempotencyKey: string | undefined, actor: PublicUser) {
    this.assertManager(actor);
    const parsed = this.refundInput(input, idempotencyKey);
    const identity = await this.identity(id);
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "DepositSettlement" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.depositSettlement.findUnique({ where: { id: identity.id }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy quyết toán deposit.');
      if (current.refundIdempotencyKey !== null) {
        this.assertMatchingRefundRetry(current, parsed);
        return this.toSettlement(current, true);
      }
      if (current.status !== 'APPROVED' || current.refundAmount <= 0n || current.outstandingAmount !== 0n || current.refundedAt !== null) {
        throw new ConflictException('Settlement chưa đủ điều kiện ghi nhận refund.');
      }
      const now = new Date();
      await tx.depositSettlement.update({ where: { id: current.id }, data: {
        status: 'SETTLED',
        refundMethod: parsed.method,
        refundReference: parsed.reference,
        refundNote: parsed.note,
        refundIdempotencyKey: parsed.idempotencyKey,
        refundedAt: now,
        settledByUserId: actor.id,
        settledAt: now,
      } });
      await this.completeReturn(tx, current.returnRequestId, actor.id, now);
      return this.toSettlement(await this.find(current.id, tx), true);
    }, 'Refund vừa được ghi nhận bởi thao tác khác. Vui lòng tải lại.');
  }

  private async completeReturn(tx: Prisma.TransactionClient, returnRequestId: string, actorId: string, now: Date) {
    const updated = await tx.returnRequest.updateMany({
      where: { id: returnRequestId, status: 'PENDING_SETTLEMENT', physicallyReturnedAt: { not: null } },
      data: { status: 'COMPLETED', completedAt: now, completedByUserId: actorId, activeKey: null },
    });
    if (updated.count !== 1) throw new ConflictException('Không thể hoàn tất ReturnRequest sau quyết toán.');
  }

  private include() {
    return {
      reviewedBy: { select: { id: true, fullName: true, role: true } },
      settledBy: { select: { id: true, fullName: true, role: true } },
      issues: {
        include: {
          reviewedBy: { select: { id: true, fullName: true, role: true } },
          returnInspection: { include: { storageUnit: { select: { id: true, unitNumber: true, status: true } }, rentalContract: { select: { id: true, contractCode: true, status: true } } } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
      outstandingInvoice: { include: { payments: { select: { id: true, paymentCode: true, amount: true, method: true, receivedAt: true }, orderBy: { receivedAt: 'asc' as const } } } },
      returnRequest: { include: {
        requestedBy: { select: { id: true, fullName: true } },
        reservation: { include: {
          customer: { select: { id: true, fullName: true, email: true, phone: true } },
          storageType: { select: { id: true, code: true, name: true, condition: true } },
        } },
        inspections: { include: { storageUnit: { select: { id: true, unitNumber: true, status: true } }, rentalContract: { select: { id: true, contractCode: true, status: true } } }, orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
      } },
    };
  }

  private async page(where: Prisma.DepositSettlementWhereInput, query: { page: number; limit: number }, manager: boolean) {
    const [total, records] = await Promise.all([
      this.prisma.depositSettlement.count({ where }),
      this.prisma.depositSettlement.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.include() }),
    ]);
    return { page: query.page, limit: query.limit, total, items: records.map((record) => this.toSettlement(record, manager)) };
  }

  private toSettlement(record: any, manager: boolean) {
    const issues = record.issues.map((issue: any) => ({
      inspectionId: issue.returnInspectionId,
      unit: { id: issue.returnInspection.storageUnit.id, unitCode: issue.returnInspection.storageUnit.unitNumber, status: issue.returnInspection.storageUnit.status },
      contract: { id: issue.returnInspection.rentalContract.id, contractCode: issue.returnInspection.rentalContract.contractCode, status: issue.returnInspection.rentalContract.status },
      observedIssueType: issue.returnInspection.issueType,
      approvedIssueType: issue.issueType,
      approvedChargeAmount: this.money(issue.approvedChargeAmount),
      reason: issue.reason,
      ...(manager ? { reviewedBy: issue.reviewedBy, reviewedAt: issue.reviewedAt.toISOString() } : {}),
    }));
    const base = {
      id: record.id,
      settlementCode: record.settlementCode,
      returnCode: record.returnRequest.returnCode,
      status: record.status,
      depositAmount: this.money(record.depositAmount),
      totalApprovedCharges: this.money(record.totalApprovedCharges),
      deductionAmount: this.money(record.deductionAmount),
      refundAmount: this.money(record.refundAmount),
      outstandingAmount: this.money(record.outstandingAmount),
      reservation: {
        id: record.returnRequest.reservation.id,
        reference: record.returnRequest.reservation.reservationCode,
        storageType: record.returnRequest.reservation.storageType,
        ...(manager ? { customer: record.returnRequest.reservation.customer } : {}),
      },
      issues,
      refundedAt: record.refundedAt?.toISOString() ?? null,
      settledAt: record.settledAt?.toISOString() ?? null,
      outstandingInvoice: record.outstandingInvoice ? {
        id: record.outstandingInvoice.id,
        invoiceCode: record.outstandingInvoice.invoiceCode,
        status: record.outstandingInvoice.status,
        chargeAmount: this.money(record.outstandingInvoice.chargeAmount),
        totalAmount: this.money(record.outstandingInvoice.totalAmount),
        amountPaid: this.money(record.outstandingInvoice.amountPaid),
        balanceDue: this.money(record.outstandingInvoice.balanceDue),
      } : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
    if (!manager) return base;
    return {
      ...base,
      reviewNote: record.reviewNote,
      reviewedBy: record.reviewedBy,
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
      refundMethod: record.refundMethod,
      refundReference: record.refundReference,
      refundNote: record.refundNote,
      settledBy: record.settledBy,
      physicalInspections: record.returnRequest.inspections.map((inspection: any) => ({
        id: inspection.id, result: inspection.result, issueType: inspection.issueType, conditionNote: inspection.conditionNote, issueNote: inspection.issueNote,
        unit: { unitCode: inspection.storageUnit.unitNumber, status: inspection.storageUnit.status },
        contract: { contractCode: inspection.rentalContract.contractCode, status: inspection.rentalContract.status },
      })),
    };
  }

  private reviewInput(input: Record<string, unknown>, key: string | undefined) {
    const idempotencyKey = this.idempotencyKey(key);
    if (!Array.isArray(input.issues) || input.issues.length === 0) throw new BadRequestException('issues phải là mảng không rỗng.');
    const issues = input.issues.map((raw, index) => this.issueInput(raw, index));
    if (new Set(issues.map((issue) => issue.inspectionId)).size !== issues.length) throw new BadRequestException('inspectionId không được trùng.');
    const note = this.optionalText(input.note, 2000, 'note');
    return { issues, note, idempotencyKey };
  }

  private issueInput(raw: unknown, index: number): ReviewedIssue {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException(`issues[${index}] không hợp lệ.`);
    const input = raw as Record<string, unknown>;
    const inspectionId = typeof input.inspectionId === 'string' ? input.inspectionId.trim() : '';
    if (!inspectionId) throw new BadRequestException(`issues[${index}].inspectionId là bắt buộc.`);
    const issueType = input.issueType;
    const types: IssueType[] = ['NORMAL_WEAR', 'FACILITY_FAULT', 'CUSTOMER_DAMAGE', 'CLEANING_REQUIRED', 'LOST_KEY_OR_ACCESS_ITEM', 'OTHER'];
    if (typeof issueType !== 'string' || !types.includes(issueType as IssueType)) throw new BadRequestException(`issues[${index}].issueType không hợp lệ.`);
    const amount = Number(input.approvedChargeAmount);
    if (!Number.isSafeInteger(amount) || amount < 0) throw new BadRequestException(`issues[${index}].approvedChargeAmount phải là số nguyên VND không âm.`);
    const reason = this.optionalText(input.reason, 2000, `issues[${index}].reason`);
    if (['NORMAL_WEAR', 'FACILITY_FAULT'].includes(issueType) && amount !== 0) throw new BadRequestException(`${issueType} bắt buộc approvedChargeAmount = 0.`);
    if (issueType === 'LOST_KEY_OR_ACCESS_ITEM' && amount !== 200000) throw new BadRequestException('LOST_KEY_OR_ACCESS_ITEM bắt buộc approvedChargeAmount = 200000.');
    if (issueType === 'OTHER' && (!reason || reason.length < 3)) throw new BadRequestException('OTHER bắt buộc có reason.');
    if (['CUSTOMER_DAMAGE', 'CLEANING_REQUIRED'].includes(issueType) && amount > 0 && (!reason || reason.length < 3)) throw new BadRequestException(`${issueType} có charge bắt buộc có reason.`);
    return { inspectionId, issueType: issueType as IssueType, approvedChargeAmount: BigInt(amount), reason };
  }

  private refundInput(input: Record<string, unknown>, key: string | undefined): { method: 'BANK_TRANSFER' | 'CASH'; reference: string; note: string | null; idempotencyKey: string } {
    const method = input.method;
    if (method !== 'BANK_TRANSFER' && method !== 'CASH') throw new BadRequestException('method phải là BANK_TRANSFER hoặc CASH.');
    const reference = this.optionalText(input.reference, 200, 'reference');
    if (!reference || reference.length < 2) throw new BadRequestException('reference là bắt buộc khi ghi nhận refund.');
    return { method, reference, note: this.optionalText(input.note, 2000, 'note'), idempotencyKey: this.idempotencyKey(key) };
  }

  private assertCompleteIssueReview(inspections: any[], issues: ReviewedIssue[]) {
    const expected = new Set(inspections.map((inspection) => inspection.id));
    const supplied = new Set(issues.map((issue) => issue.inspectionId));
    if (expected.size === 0 || expected.size !== supplied.size || [...expected].some((id) => !supplied.has(id))) {
      throw new BadRequestException('Phải review chính xác một resolution cho mỗi inspection ISSUE_FOUND.');
    }
  }

  private assertMatchingReviewRetry(current: any, parsed: { issues: ReviewedIssue[]; note: string | null; idempotencyKey: string }) {
    if (current.reviewIdempotencyKey !== parsed.idempotencyKey || (current.reviewNote ?? null) !== parsed.note || current.issues.length !== parsed.issues.length) {
      throw new ConflictException('Settlement đã được review hoặc Idempotency-Key đã dùng cho payload khác.');
    }
    const stored = new Map(current.issues.map((issue: any) => [issue.returnInspectionId, issue]));
    if (parsed.issues.some((issue) => {
      const value: any = stored.get(issue.inspectionId);
      return !value || value.issueType !== issue.issueType || value.approvedChargeAmount !== issue.approvedChargeAmount || (value.reason ?? null) !== issue.reason;
    })) throw new ConflictException('Idempotency-Key đã dùng cho payload review khác.');
  }

  private assertMatchingRefundRetry(current: any, parsed: { method: 'BANK_TRANSFER' | 'CASH'; reference: string; note: string | null; idempotencyKey: string }) {
    if (current.refundIdempotencyKey !== parsed.idempotencyKey || current.refundMethod !== parsed.method || current.refundReference !== parsed.reference || (current.refundNote ?? null) !== parsed.note) {
      throw new ConflictException('Idempotency-Key đã dùng cho refund khác.');
    }
  }

  private assertManager(actor: PublicUser) {
    if (!['MANAGER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Chỉ Manager hoặc Admin được xử lý quyết toán deposit.');
  }

  private idempotencyKey(value: string | undefined) {
    const key = value?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự và chỉ chứa ký tự an toàn.');
    return key;
  }

  private optionalText(value: unknown, maximum: number, label: string) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > maximum) throw new BadRequestException(`${label} không hợp lệ.`);
    return value.trim();
  }

  private async identity(id: string) {
    const identity = await this.prisma.depositSettlement.findFirst({ where: { OR: [{ id }, { settlementCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy quyết toán deposit.');
    return identity;
  }

  private async find(id: string, db: DbClient) {
    const record = await db.depositSettlement.findFirst({ where: { OR: [{ id }, { settlementCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy quyết toán deposit.');
    return record;
  }

  private money(value: bigint) {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ConflictException('Giá trị tiền tệ lưu trữ không hợp lệ.');
    return Number(value);
  }

  private isPrismaCode(error: unknown, code: string) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, message: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
      } catch (error) {
        if (this.isPrismaCode(error, 'P2034') && attempt < 2) continue;
        if (this.isPrismaCode(error, 'P2034')) throw new ConflictException(message);
        if (this.isPrismaCode(error, 'P2002')) throw new ConflictException('Idempotency-Key hoặc settlement record đã được tạo bởi thao tác khác.');
        throw error;
      }
    }
    throw new ConflictException(message);
  }
}
