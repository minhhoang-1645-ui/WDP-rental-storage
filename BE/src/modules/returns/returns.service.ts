import { Optional } from '@nestjs/common';
import { UnitStaffService } from '../unit-staff/unit-staff.service.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { assertActiveAssignee, assertTaskAssignee, managerAssignmentInput, operationalAssignee } from '../unit-staff/operational-assignment.js';
import { EARLY_RETURN_SUBJECT, earlyReturnScope } from './early-return-classification.js';
import { businessDate } from '../../business-date.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { assertFullSettlementPolicyInput, assertReturnFullyPaid, returnReadiness } from './early-return-finance.js';
import { contractDeposit, contractReturnReadiness, recordedContractDeposit, returnInvoiceFields } from './contract-return-finance.js';
import { hasUnissuedRenewalInstallments, openRenewalStatuses, renewalAppliesTo } from '../renewals/renewal-scope.js';

type DbClient = PrismaService | Prisma.TransactionClient;
type ViewMode = 'CUSTOMER' | 'MANAGER' | 'STAFF';
type ReturnStatus = 'REQUESTED' | 'INSPECTION_IN_PROGRESS' | 'ISSUE_FOUND' | 'PENDING_SETTLEMENT' | 'COMPLETED';
type IssueType = 'NORMAL_WEAR' | 'FACILITY_FAULT' | 'CUSTOMER_DAMAGE' | 'CLEANING_REQUIRED' | 'LOST_KEY_OR_ACCESS_ITEM' | 'OTHER';

export interface ReturnListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: ReturnStatus;
  date?: string;
}

type ReturnContract = {
  id: string; contractCode: string; status: string; endDate: Date; reservationUnitId: string;
  reservationUnit: { id: string; reservationId: string; storageUnitId: string; releasedAt: Date | null; storageUnit: { status: string; unitNumber: string } };
};
type ReturnRental = { id: string; quantity: number; status: string; contracts: ReturnContract[] };

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly unitStaff?: UnitStaffService) {}

  async createCustomerReturn(customer: PublicUser, input: Record<string, unknown>, idempotencyKey: string | undefined) {
    if (customer.role !== 'CUSTOMER') throw new ForbiddenException('Chỉ Customer được gửi yêu cầu trả kho qua endpoint này.');
    const parsed = this.createInput(input, idempotencyKey);
    const identity = await this.prisma.reservation.findFirst({
      where: { customerId: customer.id, OR: [{ id: parsed.reservationId }, { reservationCode: parsed.reservationId }] },
      select: { id: true },
    });
    if (!identity) throw new NotFoundException('Không tìm thấy Active Rental thuộc khách hàng.');

    try {
      return await this.serializable(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Reservation" WHERE "id" = ${identity.id} FOR UPDATE`);
        const duplicate = await tx.returnRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include() });
        if (duplicate) {
          this.assertMatchingRetry(duplicate, customer.id, identity.id, parsed.note, parsed.rentalContractId);
          return this.toReturn(duplicate, 'CUSTOMER');
        }
        const reservation = await tx.reservation.findUnique({ where: { id: identity.id }, include: this.eligibilityInclude() });
        const now = new Date();
        const rental = this.assertReturnEligible(reservation, customer.id, now, parsed.rentalContractId);
        await this.lockUnits(tx, rental.unitIds);
        await this.lockContracts(tx, [rental.contractId]);
        await this.assertNoActiveReturn(tx, identity.id, [rental.contractId]);
        await this.assertNoConflictingWork(tx, [rental.contractId]);
        contractDeposit(reservation!.invoices, [rental.contractId], reservation!.contracts.map(contract => contract.id), reservation!.quoteSnapshot, false);
        const sequence = await tx.returnRequest.count({ where: { reservationId: identity.id } }) + 1;
        const responsibility = await this.unitStaff?.resolveStaff(tx, rental.unitIds);
        const created = await tx.returnRequest.create({
          data: {
            returnCode: `${reservation!.reservationCode}-RT${String(sequence).padStart(2, '0')}`,
            reservationId: identity.id,
            requestedByUserId: customer.id,
            assignedStaffUserId: responsibility?.staffUserId,
            note: parsed.note,
            idempotencyKey: parsed.idempotencyKey,
            activeKey: this.contractKey(rental.contractId),
            inspections: {
              create: { rentalContractId: rental.contractId, storageUnitId: rental.unitIds[0] },
            },
          },
          include: this.include(),
        });
        return this.toReturn(created, 'CUSTOMER');
      }, 'Yêu cầu trả kho vừa được cập nhật. Vui lòng tải lại và thử lại.');
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const duplicate = await this.prisma.returnRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include() });
        if (duplicate) {
          this.assertMatchingRetry(duplicate, customer.id, identity.id, parsed.note, parsed.rentalContractId);
          return this.toReturn(duplicate, 'CUSTOMER');
        }
        throw new ConflictException({ code: 'ACTIVE_RETURN_EXISTS', message: 'Kho đã có yêu cầu trả chưa hoàn tất hoặc vừa được cập nhật.' });
      }
      throw error;
    }
  }

  listCustomerReturns(customerId: string, query: Pick<ReturnListQuery, 'page' | 'limit'>) {
    return this.page({ reservation: { customerId } }, query, 'CUSTOMER');
  }

  async getCustomerReturn(customerId: string, id: string) {
    const record = await this.prisma.returnRequest.findFirst({
      where: { reservation: { customerId }, OR: [{ id }, { returnCode: id }] },
      omit: { assignedStaffUserId: true },
      include: this.include(false),
    });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
    return this.toReturn(record, 'CUSTOMER');
  }

  listManagerReturns(query: ReturnListQuery) {
    return this.page(this.operationalWhere(query), query, 'MANAGER');
  }

  listStaffReturns(query: ReturnListQuery, actor: PublicUser) {
    return this.page({ ...this.operationalWhere(query), assignedStaffUserId: actor.id }, query, 'STAFF');
  }

  async getManagerReturn(id: string) {
    return this.toReturn(await this.find(id, this.prisma), 'MANAGER');
  }

  async getStaffReturn(id: string, actor: PublicUser) {
    const record = await this.prisma.returnRequest.findFirst({ where: { OR: [{ id }, { returnCode: id }], assignedStaffUserId: actor.id }, include: this.include(true, actor.id) });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
    return this.toReturn(record, 'STAFF');
  }

  async assign(id: string, input: Record<string, unknown>, actor: PublicUser) {
    const staffId = managerAssignmentInput(actor, input);
    const identity = await this.identity(id);
    return this.serializable(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.returnRequest.findUniqueOrThrow({ where: { id: identity.id }, include: this.include() });
      if (!['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(current.status)) throw new ConflictException('Phiếu trả kho đã được tiếp nhận.');
      await assertActiveAssignee(tx, staffId);
      if (current.assignedStaffUserId === staffId) return this.toReturn(current, 'MANAGER');
      return this.toReturn(await tx.returnRequest.update({ where: { id: current.id }, data: { assignedStaffUserId: staffId }, include: this.include() }), 'MANAGER');
    }, 'Phân công vừa thay đổi. Vui lòng tải lại.');
  }

  async startInspection(id: string, actor: PublicUser) {
    this.assertOperational(actor);
    const identity = await this.identity(id);
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.returnRequest.findUnique({ where: { id: identity.id }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
      assertTaskAssignee(actor, current.assignedStaffUserId);
      if (current.status === 'INSPECTION_IN_PROGRESS') return this.toReturn(current, 'STAFF');
      if (current.status !== 'REQUESTED') throw new ConflictException(`Không thể bắt đầu kiểm tra ở trạng thái ${current.status}.`);
      this.requestContracts(current);
      const updated = await tx.returnRequest.update({
        where: { id: current.id },
        data: { status: 'INSPECTION_IN_PROGRESS', inspectionStartedAt: new Date(), inspectionStartedById: actor.id },
        include: this.include(),
      });
      return this.toReturn(updated, 'STAFF');
    }, 'Yêu cầu trả kho vừa được xử lý bởi thao tác khác. Vui lòng tải lại.');
  }

  async updateInspection(returnId: string, inspectionId: string, input: Record<string, unknown>, actor: PublicUser) {
    this.assertOperational(actor);
    const parsed = this.inspectionInput(input);
    const identity = await this.identity(returnId);
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.returnRequest.findUnique({ where: { id: identity.id }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
      assertTaskAssignee(actor, current.assignedStaffUserId);
      if (!['INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(current.status)) throw new ConflictException('Chỉ yêu cầu đang kiểm tra mới được ghi kết quả.');
      const inspection = current.inspections.find((item) => item.id === inspectionId);
      if (!inspection) throw new NotFoundException('Inspection không thuộc yêu cầu trả kho này.');
      if (inspection.result === 'ISSUE_FOUND' && parsed.result !== 'ISSUE_FOUND') {
        throw new ConflictException('Return V1 không cho phép tự xóa kết quả ISSUE_FOUND.');
      }
      if (inspection.result === parsed.result && inspection.issueType === parsed.issueType && (inspection.conditionNote ?? null) === parsed.conditionNote && (inspection.issueNote ?? null) === parsed.issueNote) {
        return this.toReturn(current, 'STAFF');
      }
      const now = new Date();
      await tx.returnInspection.update({
        where: { id: inspection.id },
        data: {
          result: parsed.result,
          issueType: parsed.issueType,
          conditionNote: parsed.conditionNote,
          issueNote: parsed.issueNote,
          inspectedByUserId: actor.id,
          inspectedAt: now,
        },
      });
      if (parsed.result === 'ISSUE_FOUND' && current.status !== 'ISSUE_FOUND') {
        await tx.returnRequest.update({ where: { id: current.id }, data: { status: 'ISSUE_FOUND' } });
      }
      return this.toReturn(await this.find(current.id, tx), 'STAFF');
    }, 'Kết quả kiểm tra vừa được cập nhật bởi thao tác khác. Vui lòng tải lại.');
  }

  async finalize(id: string, actor: PublicUser) {
    this.assertOperational(actor);
    const identity = await this.identity(id);
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      let current = await tx.returnRequest.findUnique({ where: { id: identity.id }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
      assertTaskAssignee(actor, current.assignedStaffUserId);
      if (['PENDING_SETTLEMENT', 'COMPLETED'].includes(current.status)) return this.toReturn(current, 'STAFF');
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Reservation" WHERE id = ${current.reservationId} FOR UPDATE`);
      if (!['INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(current.status)) throw new ConflictException('Yêu cầu phải đang kiểm tra trước khi hoàn tất trả kho vật lý.');
      if (current.inspections.some((inspection) => inspection.result === 'PENDING')) {
        throw new ConflictException({ code: 'RETURN_INSPECTIONS_INCOMPLETE', message: 'Tất cả kho phải được ghi kết quả kiểm tra trước khi hoàn tất.' });
      }
      if (current.inspections.some((inspection) => inspection.result === 'ISSUE_FOUND' && inspection.issueType === null)) {
        throw new ConflictException({ code: 'RETURN_ISSUE_TYPE_REQUIRED', message: 'Mọi inspection ISSUE_FOUND phải có issueType.' });
      }
      const unitIds = current.inspections.map((inspection) => inspection.storageUnitId).sort();
      const contractIds = current.inspections.map(inspection => inspection.rentalContractId);
      await this.lockUnits(tx, unitIds);
      await this.lockContracts(tx, contractIds);
      current = await tx.returnRequest.findUniqueOrThrow({ where: { id: current.id }, include: this.include() });
      const targets = this.requestContracts(current);
      const legacy = current.activeKey === this.activeKey(current.reservationId);
      const allContractIds = current.reservation.contracts.map(contract => contract.id);
      this.assertDebt(current.reservation.invoices, contractIds, allContractIds, false, legacy);
      this.assertRenewalsSettled(current.reservation.renewals, contractIds);
      await this.assertNoConflictingWork(tx, contractIds);
      const previousCredit = await tx.returnInspection.findFirst({ where: {
        rentalContractId: { in: contractIds }, returnRequestId: { not: current.id }, returnRequest: { depositSettlement: { isNot: null } },
      }, select: { id: true } });
      if (previousCredit) throw new ConflictException('Tiền cọc của hợp đồng đã được ghi nhận trong một quyết toán khác.');
      const depositAmount = contractDeposit(current.reservation.invoices, contractIds, allContractIds, current.reservation.quoteSnapshot, legacy);
      const remainingGoods = await tx.storedItem.count({ where: { rentalContractId: { in: contractIds }, balance: { gt: 0 } } });
      if (remainingGoods) throw new ConflictException({ code: 'RETURN_STORED_ITEMS_REMAIN', message: 'Còn hàng đang lưu trên hợp đồng. Khách cần tạo phiếu xuất, nhân viên kiểm đếm và hoàn tất lấy hàng trước khi trả kho.' });

      const now = new Date();
      const contracts = await tx.rentalContract.updateMany({
        where: { id: { in: current.inspections.map((inspection) => inspection.rentalContractId) }, reservationId: current.reservationId, status: 'ACTIVE' },
        data: { status: 'COMPLETED', completedAt: now },
      });
      if (contracts.count !== targets.length) throw new ConflictException('Hợp đồng của yêu cầu đã thay đổi. Vui lòng tải lại.');
      const allocations = await tx.reservationUnit.updateMany({
        where: { reservationId: current.reservationId, id: { in: targets.map(contract => contract.reservationUnitId) }, releasedAt: null },
        data: { releasedAt: now, actualVacatedAt: now },
      });
      if (allocations.count !== targets.length) throw new ConflictException('Phân bổ kho của yêu cầu đã thay đổi. Vui lòng tải lại.');
      const remaining = await tx.rentalContract.aggregate({ where: {
        reservationId: current.reservationId, status: 'ACTIVE', reservationUnit: { releasedAt: null },
      }, _max: { endDate: true } });
      if (remaining._max.endDate && +remaining._max.endDate !== +current.reservation.endDate) {
        await tx.reservation.update({ where: { id: current.reservationId }, data: { endDate: remaining._max.endDate } });
      }
      const passUnitIds = current.inspections.filter((inspection) => inspection.result === 'PASS').map((inspection) => inspection.storageUnitId);
      const issueUnitIds = current.inspections.filter((inspection) => inspection.result === 'ISSUE_FOUND').map((inspection) => inspection.storageUnitId);
      const availableUnits = await tx.storageUnit.updateMany({
        where: { id: { in: passUnitIds }, status: 'OCCUPIED' },
        data: { status: 'AVAILABLE' },
      });
      const maintenanceUnits = await tx.storageUnit.updateMany({
        where: { id: { in: issueUnitIds }, status: 'OCCUPIED' },
        data: { status: 'MAINTENANCE' },
      });
      if (availableUnits.count !== passUnitIds.length || maintenanceUnits.count !== issueUnitIds.length) throw new ConflictException('Không thể cập nhật đầy đủ trạng thái vật lý StorageUnit.');

      const issueInspections = current.inspections.filter((inspection) => inspection.result === 'ISSUE_FOUND');
      if (issueInspections.length && await tx.maintenanceRequest.findFirst({ where: {
        activeKey: { in: issueUnitIds.map(id => `MAINTENANCE:${id}`) },
      }, select: { id: true } })) throw new ConflictException('Kho đã có phiếu bảo trì đang xử lý. Cần quản lý kiểm tra trước khi nhận trả.');
      for (const [index, inspection] of issueInspections.entries()) {
        const responsibility = await this.unitStaff?.resolveStaff(tx, [inspection.storageUnitId]);
        await tx.maintenanceRequest.create({
          data: {
            maintenanceCode: `${current.returnCode}-MNT${String(index + 1).padStart(2, '0')}`,
            storageUnitId: inspection.storageUnitId,
            source: 'RETURN_INSPECTION',
            returnInspectionId: inspection.id,
            category: this.maintenanceCategory(inspection.issueType!),
            priority: 'MEDIUM',
            status: 'OPEN',
            description: inspection.issueNote ?? inspection.conditionNote ?? 'Return inspection requires maintenance.',
            reportedByUserId: actor.id,
            assignedStaffUserId: responsibility?.staffUserId,
            activeKey: `MAINTENANCE:${inspection.storageUnitId}`,
            createIdempotencyKey: `RETURN_INSPECTION:${inspection.id}`,
          },
        });
      }

      const allPass = issueUnitIds.length === 0;
      const autoSettled = allPass && depositAmount === 0n;
      await tx.depositSettlement.create({
        data: {
          settlementCode: `${current.returnCode}-DS01`,
          returnRequestId: current.id,
          status: allPass ? (autoSettled ? 'SETTLED' : 'APPROVED') : 'PENDING_REVIEW',
          depositAmount,
          totalApprovedCharges: 0n,
          deductionAmount: 0n,
          refundAmount: allPass ? depositAmount : 0n,
          outstandingAmount: 0n,
          ...(autoSettled ? { settledByUserId: actor.id, settledAt: now } : {}),
        },
      });
      const updated = await tx.returnRequest.update({
        where: { id: current.id },
        data: {
          status: autoSettled ? 'COMPLETED' : 'PENDING_SETTLEMENT',
          physicallyReturnedAt: now,
          physicallyReturnedById: actor.id,
          ...(autoSettled ? { completedAt: now, completedByUserId: actor.id, activeKey: null } : {}),
        },
        include: this.include(),
      });
      return this.toReturn(updated, 'STAFF');
    }, 'Yêu cầu trả kho vừa được hoàn tất hoặc thay đổi bởi thao tác khác. Vui lòng tải lại.');
  }

  async listEarlyReturnRequests(page: number, limit: number) {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Phân trang không hợp lệ.');
    const where = { subject: EARLY_RETURN_SUBJECT, category: 'OTHER' as const };
    const total = await this.prisma.supportRequest.count({ where });
    const items = await this.prisma.supportRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.earlyReturnInclude() });
    return { page, limit, total, items: items.map(item => this.toEarlyReturn(item)) };
  }

  async reviewEarlyReturnFinance(_id: string, _input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'MANAGER') throw new ForbiddenException('Chỉ quản lý được xem xét đề nghị trả trước hạn.');
    throw new ConflictException({ code: 'RETURN_DEBT_WAIVER_DISABLED', message: 'Quy định hiện tại yêu cầu thanh toán đủ toàn bộ công nợ trước khi trả kho. Chức năng miễn công nợ khi trả trước hạn đã được ngừng.' });
  }

  async decideEarlyReturn(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'MANAGER') throw new ForbiddenException('Chỉ quản lý được quyết định đề nghị trả trước hạn.');
    assertFullSettlementPolicyInput(input);
    const decision = input.decision;
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (!['APPROVED', 'REJECTED'].includes(String(decision)) || note.length < 3 || note.length > 3000) throw new BadRequestException('Cần quyết định hợp lệ và ghi rõ điều kiện hoặc lý do.');
    if (decision === 'APPROVED' && input.financialReviewConfirmed !== true) throw new BadRequestException('Cần xác nhận đã đối chiếu công nợ, cọc và điều kiện trả sớm.');
    return this.serializable(async tx => {
      const identity = await tx.supportRequest.findFirst({ where: { OR: [{ id }, { supportCode: id }], subject: EARLY_RETURN_SUBJECT, category: 'OTHER' }, select: { id: true, reservationId: true } });
      if (!identity) throw new NotFoundException('Không tìm thấy đề nghị trả trước hạn.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Reservation" WHERE "id" = ${identity.reservationId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SupportRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const request = await tx.supportRequest.findUniqueOrThrow({ where: { id: identity.id }, include: this.earlyReturnInclude() });
      const action = decision === 'APPROVED' ? 'EARLY_RETURN_APPROVED' : 'EARLY_RETURN_REJECTED';
      const resolutionNote = (decision === 'APPROVED' ? (request.rentalContractId
        ? 'Đã chấp thuận trả trước hạn. Khách phải thanh toán đủ hóa đơn liên quan đến kho này, kể cả các kỳ chưa đến hạn, trước khi gửi yêu cầu và bàn giao lại kho. '
        : 'Đã chấp thuận trả trước hạn. Khách phải thanh toán đủ toàn bộ công nợ, kể cả các kỳ chưa đến hạn, trước khi gửi yêu cầu trả kho và bàn giao lại kho. ')
        : 'Chưa chấp thuận trả trước hạn. ') + note;
      if (request.status === 'RESOLVED') {
        if (request.lastAction === action && request.resolutionNote === resolutionNote) return this.toEarlyReturn(request);
        throw new ConflictException('Đề nghị đã được quyết định. Hãy gửi đề nghị mới nếu cần thay đổi điều kiện.');
      }
      const reservation = request.reservation;
      const targetIds = request.rentalContractId ? [request.rentalContractId] : reservation.contracts.map(contract => contract.id);
      const targets = reservation.contracts.filter(contract => targetIds.includes(contract.id));
      const endDate = targets.length ? this.isoDate(this.effectiveEndDate(targets)) : null;
      if (decision === 'APPROVED') {
        this.assertOperationalIntegrity(reservation, targetIds, !request.rentalContractId);
        if (reservation.renewals.some(renewal => this.renewalIsOpen(renewal) && renewalAppliesTo(renewal, targetIds))) {
          throw new ConflictException('Cần xử lý xong gia hạn của kho trước khi chấp thuận trả sớm.');
        }
        await this.assertNoActiveReturn(tx, reservation.id, targetIds);
        if (input.reviewedEndDate !== endDate) throw new ConflictException('Thời hạn thuê đã thay đổi. Tải lại và đối chiếu điều kiện.');
        const outstanding = reservation.invoices.reduce((sum, invoice) => sum + Number(invoice.balanceDue), 0);
        const paid = reservation.invoices.reduce((sum, invoice) => sum + Number(invoice.amountPaid), 0);
        if (input.reviewedOutstandingAmount !== outstanding || input.reviewedPaidAmount !== paid) throw new ConflictException('Công nợ hoặc số đã thu vừa thay đổi. Tải lại để đối chiếu trước khi quyết định.');
      }
      const updated = await tx.supportRequest.update({ where: { id: request.id }, data: { status: 'RESOLVED', resolutionType: 'MANAGER_RESOLVED', resolutionNote, resolvedByUserId: actor.id, resolvedAt: new Date(), lastAction: action, lastActionIdempotencyKey: earlyReturnScope(request.id, endDate ?? 'no-active-contract') }, include: this.earlyReturnInclude() });
      return this.toEarlyReturn(updated);
    }, 'Đề nghị vừa được cập nhật. Tải lại trước khi quyết định.');
  }

  private earlyReturnInclude() {
    return {
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      resolvedBy: { select: { id: true, fullName: true, role: true } },
      reservation: { include: { ...this.eligibilityInclude(), storageType: true, returns: { where: { physicallyReturnedAt: { not: null } }, select: { physicallyReturnedAt: true, inspections: { select: { rentalContractId: true } } }, orderBy: { physicallyReturnedAt: 'desc' as const } } } },
    };
  }

  private toEarlyReturn(request: any) {
    const reservation = request.reservation;
    const invoices = reservation.invoices ?? [];
    const targets: ReturnContract[] = request.rentalContractId ? reservation.contracts.filter((contract: ReturnContract) => contract.id === request.rentalContractId) : reservation.contracts;
    const returned = reservation.returns?.find((item: { inspections: { rentalContractId: string }[] }) =>
      !request.rentalContractId || item.inspections.some(inspection => inspection.rentalContractId === request.rentalContractId));
    return { id: request.id, supportCode: request.supportCode, subject: request.subject, description: request.description, status: request.status, decision: request.lastAction === 'EARLY_RETURN_APPROVED' ? 'APPROVED' : request.lastAction === 'EARLY_RETURN_REJECTED' ? 'REJECTED' : null, resolutionNote: request.resolutionNote, resolvedAt: request.resolvedAt?.toISOString() ?? null, resolvedBy: request.resolvedBy, createdAt: request.createdAt.toISOString(), customer: request.customer,
      rentalContractId: request.rentalContractId ?? null,
      updatedAt: request.updatedAt?.toISOString() ?? null, financialReview: request.earlyReturnFinancialReview ?? null, physicallyReturnedAt: returned?.physicallyReturnedAt?.toISOString() ?? null,
      returnReadiness: request.rentalContractId ? contractReturnReadiness(invoices, [request.rentalContractId], reservation.contracts.map((contract: ReturnContract) => contract.id)) : returnReadiness(invoices), eligibleUnusedInvoices: [],
      reservation: { id: reservation.id, reference: reservation.reservationCode, storageType: { id: reservation.storageType.id, name: reservation.storageType.name }, effectiveEndDate: targets.length ? this.isoDate(this.effectiveEndDateForRead(targets)) : this.isoDate(reservation.endDate) },
      contracts: targets.map(contract => ({ id: contract.id, contractCode: contract.contractCode, status: contract.status, unitCode: contract.reservationUnit.storageUnit.unitNumber })),
      invoices: invoices.map((invoice: any) => ({ invoiceCode: invoice.invoiceCode, totalAmount: Number(invoice.totalAmount), amountPaid: Number(invoice.amountPaid), balanceDue: Number(invoice.balanceDue) })),
      financialSummary: { outstandingAmount: invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.balanceDue), 0), paidAmount: invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.amountPaid), 0), invoicedDeposit: invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.depositAmount), 0) } };
  }

  private assertReturnEligible(reservation: (ReturnRental & {
    customerId: string; invoices: Prisma.InvoiceGetPayload<{ select: typeof returnInvoiceFields }>[];
    supportRequests?: { id: string; rentalContractId: string | null; status: string; lastAction: string | null; lastActionIdempotencyKey: string | null; resolvedBy?: { role: string } | null }[];
    renewals: Parameters<typeof hasUnissuedRenewalInstallments>[0];
  }) | null, customerId: string, now: Date, contractRef: string | null) {
    if (!reservation || reservation.customerId !== customerId) throw new NotFoundException('Không tìm thấy Active Rental thuộc khách hàng.');
    if (!contractRef && (reservation.quantity !== 1 || reservation.contracts.length !== 1)) throw new BadRequestException('Hãy chọn hợp đồng của kho muốn trả.');
    const target = reservation.contracts.find(contract => !contractRef || contract.id === contractRef || contract.contractCode === contractRef);
    if (!target) throw new NotFoundException('Không tìm thấy hợp đồng thuộc đơn thuê này.');
    this.assertOperationalIntegrity(reservation, [target.id]);
    const endDate = target.endDate;
    const earlyApproval = (reservation.supportRequests ?? []).some(request =>
      (request.rentalContractId === target.id || (request.rentalContractId === null && reservation.contracts.every(contract => +contract.endDate === +endDate)))
      && request.lastAction === 'EARLY_RETURN_APPROVED' && request.status === 'RESOLVED' && request.resolvedBy?.role === 'MANAGER'
      && request.lastActionIdempotencyKey === earlyReturnScope(request.id, this.isoDate(endDate)!));
    if (businessDate(now) < this.isoDate(endDate)! && !earlyApproval) throw new ConflictException({ code: 'EARLY_RETURN_APPROVAL_REQUIRED', message: 'Trả trước hạn cần quản lý chấp thuận đề nghị và điều kiện quyết toán trước.' });
    this.assertRenewalsSettled(reservation.renewals, [target.id]);
    const allContractIds = reservation.contracts.map(contract => contract.id);
    this.assertDebt(reservation.invoices, [target.id], allContractIds, true);
    return { endDate, contractId: target.id, unitIds: [target.reservationUnit.storageUnitId] };
  }

  private assertOperationalIntegrity(reservation: ReturnRental, ids: string[], legacy = false) {
    if (!reservation || reservation.status !== 'CONFIRMED') throw new ConflictException('Reservation phải ở trạng thái CONFIRMED.');
    if (reservation.contracts.length !== reservation.quantity) throw new ConflictException('Số hợp đồng chưa khớp đơn thuê. Cần quản lý đối soát trước khi trả kho.');
    const targets = reservation.contracts.filter(contract => ids.includes(contract.id));
    if (!ids.length || targets.length !== ids.length || (legacy && targets.length !== reservation.quantity)) {
      throw new ConflictException('Hợp đồng trong yêu cầu trả kho không hợp lệ.');
    }
    if (targets.some(contract => contract.status !== 'ACTIVE' || contract.reservationUnit.releasedAt !== null
      || contract.reservationUnit.reservationId !== reservation.id || contract.reservationUnit.storageUnit.status !== 'OCCUPIED')) {
      throw new ConflictException('Kho được chọn phải còn thuộc hợp đồng đang sử dụng.');
    }
    return targets;
  }

  private requestContracts(request: { reservation: ReturnRental; reservationId: string; activeKey: string | null; inspections: { rentalContractId: string; storageUnitId: string }[] }) {
    const ids = request.inspections.map(inspection => inspection.rentalContractId);
    const legacy = request.activeKey === this.activeKey(request.reservationId);
    if (!legacy && (ids.length !== 1 || request.activeKey !== this.contractKey(ids[0]))) throw new ConflictException('Phạm vi yêu cầu trả kho không khớp hợp đồng.');
    const targets = this.assertOperationalIntegrity(request.reservation, ids, legacy);
    const links = new Map(targets.map(contract => [contract.id, contract.reservationUnit.storageUnitId]));
    if (new Set(request.inspections.map(inspection => inspection.storageUnitId)).size !== ids.length
        || request.inspections.some(inspection => links.get(inspection.rentalContractId) !== inspection.storageUnitId)) {
      throw new ConflictException('Inspection không khớp contract và StorageUnit của rental.');
    }
    return targets;
  }

  private effectiveEndDate(contracts: any[]) {
    if (contracts.length === 0) throw new ConflictException('Active Rental không có contract.');
    const timestamps = new Set(contracts.map((contract) => contract.endDate.getTime()));
    if (timestamps.size !== 1) throw new ConflictException({ code: 'RETURN_END_DATE_MISMATCH', message: 'Các RentalContract ACTIVE có endDate không đồng nhất.' });
    return contracts[0].endDate as Date;
  }

  private eligibilityInclude() {
    return {
      invoices: { where: { status: { not: 'VOID' as const } }, select: returnInvoiceFields },
      units: { where: { releasedAt: null }, include: { storageUnit: true } },
      contracts: { include: { reservationUnit: { include: { storageUnit: true } } }, orderBy: { contractCode: 'asc' as const } },
      renewals: { where: { status: { not: 'REJECTED' as const } }, select: {
        rentalContractId: true, status: true, termMonths: true, paymentPlan: true,
        invoices: { select: { renewalCycle: true, status: true } },
      } },
      supportRequests: { where: { subject: EARLY_RETURN_SUBJECT, category: 'OTHER', lastAction: 'EARLY_RETURN_APPROVED', status: 'RESOLVED', resolvedBy: { role: 'MANAGER' } }, select: { id: true, rentalContractId: true, status: true, lastAction: true, lastActionIdempotencyKey: true, resolvedBy: { select: { role: true } } } },
    } satisfies Prisma.ReservationInclude;
  }

  private include(includeAssignee = true, staffDetailId?: string) {
    return {
      ...(includeAssignee ? { assignedStaff: { select: operationalAssignee } } : {}),
      requestedBy: { select: { id: true, fullName: true, role: true } },
      inspectionStartedBy: { select: { id: true, fullName: true, role: true } },
      completedBy: { select: { id: true, fullName: true, role: true } },
      physicallyReturnedBy: { select: { id: true, fullName: true, role: true } },
      depositSettlement: { select: { id: true, settlementCode: true, status: true, depositAmount: true, deductionAmount: true, refundAmount: true, outstandingAmount: true } },
      inspections: {
        include: {
          inspectedBy: { select: { id: true, fullName: true, role: true } },
          ...(staffDetailId ? { maintenanceRequest: { select: { id: true, maintenanceCode: true, assignedStaffUserId: true } } } : {}),
          rentalContract: { select: { id: true, contractCode: true, status: true, startDate: true, endDate: true, completedAt: true } },
          storageUnit: { select: {
            id: true, unitNumber: true, status: true, floor: true, zone: true, row: true, position: true,
            reservationUnits: {
              where: { releasedAt: null, reservation: { status: 'CONFIRMED' as const } },
              select: { reservationId: true, plannedStartDate: true, plannedEndDate: true, reservation: { select: { reservationCode: true } } },
              orderBy: [{ plannedStartDate: 'asc' as const }, { id: 'asc' as const }],
            },
          } },
        },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      },
      reservation: { include: {
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        storageType: { select: { id: true, code: true, name: true, sizeId: true, sizeName: true, condition: true } },
        units: { where: { releasedAt: null }, select: { id: true, storageUnitId: true, releasedAt: true, plannedStartDate: true, plannedEndDate: true } },
        contracts: { include: { storedItems: { where: { balance: { gt: 0 } }, select: { id: true, balance: true } }, stockMovements: { where: { status: { in: ['REQUESTED' as const, 'ASSIGNED' as const] } }, select: { id: true } }, reservationUnit: { include: { storageUnit: { select: { id: true, unitNumber: true, status: true } } } } }, orderBy: { contractCode: 'asc' as const } },
        invoices: { where: { status: { not: 'VOID' as const } }, select: returnInvoiceFields, orderBy: { issuedAt: 'asc' as const } },
        renewals: { select: { id: true, renewalCode: true, rentalContractId: true, status: true, previousEndDate: true, requestedEndDate: true,
          termMonths: true, paymentPlan: true, invoices: { select: { renewalCycle: true, status: true } },
        }, orderBy: { createdAt: 'desc' as const } },
      } },
    };
  }

  private async page(where: Prisma.ReturnRequestWhereInput, query: Pick<ReturnListQuery, 'page' | 'limit'>, mode: ViewMode) {
    const [total, records] = await Promise.all([
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], omit: { assignedStaffUserId: mode === 'CUSTOMER' }, include: this.include(mode !== 'CUSTOMER') }),
    ]);
    return { page: query.page, limit: query.limit, total, items: records.map((record) => this.toReturn(record, mode)) };
  }

  private operationalWhere(query: ReturnListQuery): Prisma.ReturnRequestWhereInput {
    const filters: Prisma.ReturnRequestWhereInput[] = [];
    if (query.status) filters.push({ status: query.status });
    if (query.date) filters.push({ requestedAt: this.dateRange(query.date) });
    if (query.search) filters.push({ OR: [
      { returnCode: { contains: query.search, mode: 'insensitive' } },
      { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } },
      { reservation: { customer: { fullName: { contains: query.search, mode: 'insensitive' } } } },
      { reservation: { customer: { email: { contains: query.search, mode: 'insensitive' } } } },
      { inspections: { some: { storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } } } },
      { inspections: { some: { rentalContract: { contractCode: { contains: query.search, mode: 'insensitive' } } } } },
    ] });
    return filters.length ? { AND: filters } : {};
  }

  private toReturn(record: any, mode: ViewMode) {
    const ids = record.inspections.map((inspection: { rentalContractId: string }) => inspection.rentalContractId);
    const allIds = record.reservation.contracts.map((contract: ReturnContract) => contract.id);
    const contracts = record.reservation.contracts.filter((contract: ReturnContract) => ids.includes(contract.id));
    const effectiveEndDate = contracts.length ? this.effectiveEndDateForRead(contracts) : record.reservation.endDate;
    const collectibleInvoices = record.reservation.invoices.filter((invoice: { status: string }) => invoice.status !== 'VOID');
    const inspections = record.inspections.map((inspection: any) => {
      const future = inspection.storageUnit.reservationUnits.find((allocation: any) => allocation.reservationId !== record.reservationId && allocation.plannedStartDate >= effectiveEndDate);
      const base = {
        id: inspection.id,
        result: inspection.result,
        issueType: inspection.issueType,
        inspectedAt: inspection.inspectedAt?.toISOString() ?? null,
        contract: {
          id: inspection.rentalContract.id,
          contractCode: inspection.rentalContract.contractCode,
          status: inspection.rentalContract.status,
          endDate: this.isoDate(inspection.rentalContract.endDate),
          completedAt: inspection.rentalContract.completedAt?.toISOString() ?? null,
        },
        unit: {
          id: inspection.storageUnit.id,
          unitCode: inspection.storageUnit.unitNumber,
          status: inspection.storageUnit.status,
          floor: inspection.storageUnit.floor,
          zone: inspection.storageUnit.zone,
          row: inspection.storageUnit.row,
          position: inspection.storageUnit.position,
        },
      };
      if (mode === 'CUSTOMER') return { ...base, hasIssue: inspection.result === 'ISSUE_FOUND' };
      return {
        ...base,
        conditionNote: inspection.conditionNote,
        issueNote: inspection.issueNote,
        inspectedBy: inspection.inspectedBy,
        ...(mode === 'STAFF' && inspection.maintenanceRequest?.assignedStaffUserId === record.assignedStaffUserId && inspection.maintenanceRequest
          ? { maintenance: { id: inspection.maintenanceRequest.id, maintenanceCode: inspection.maintenanceRequest.maintenanceCode } } : {}),
        nextConfirmedAllocation: future ? { reference: future.reservation.reservationCode, startDate: this.isoDate(future.plannedStartDate), endDate: this.isoDate(future.plannedEndDate) } : null,
      };
    });
    const wholeOrder = record.activeKey === this.activeKey(record.reservationId) || ids.length !== 1;
    const debt = wholeOrder
      ? returnReadiness(record.reservation.invoices)
      : contractReturnReadiness(record.reservation.invoices, ids, allIds);
    const awaitingRenewalInvoices = !record.physicallyReturnedAt && hasUnissuedRenewalInstallments(record.reservation.renewals, ids);
    const readiness = { ...debt, awaitingRenewalInvoices, canReturn: debt.canReturn && !awaitingRenewalInvoices };
    const base = {
      id: record.id,
      rentalContractId: ids.length === 1 ? ids[0] : null,
      timing: businessDate(record.requestedAt) < this.isoDate(effectiveEndDate)! ? 'EARLY' : 'ON_OR_AFTER_END',
      ...(mode === 'STAFF' ? {} : { remainingUnitCount: record.reservation.contracts.filter((contract: ReturnContract) => !ids.includes(contract.id) && contract.status === 'ACTIVE' && contract.reservationUnit.releasedAt === null).length }),
      returnReadiness: mode === 'STAFF' ? { canReturn: readiness.canReturn } : readiness,
      returnCode: record.returnCode, inventory: { remainingItemTypes: contracts.reduce((total: number, contract: any) => total + (contract.storedItems?.length ?? 0), 0), pendingMovements: contracts.reduce((total: number, contract: any) => total + (contract.stockMovements?.length ?? 0), 0) },
      status: record.status,
      requestedAt: record.requestedAt.toISOString(),
      inspectionStartedAt: record.inspectionStartedAt?.toISOString() ?? null,
      physicallyReturnedAt: record.physicallyReturnedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      note: record.note,
      reservation: {
        id: record.reservation.id,
        reference: record.reservation.reservationCode,
        status: record.reservation.status,
        quantity: inspections.length,
        startDate: this.isoDate(record.reservation.startDate),
        endDate: this.isoDate(effectiveEndDate),
        effectiveEndDate: this.isoDate(effectiveEndDate),
        storageType: record.reservation.storageType,
        ...(mode === 'CUSTOMER' ? {} : { customer: record.reservation.customer }),
      },
      inspections,
      inspectionSummary: {
        total: inspections.length,
        pending: inspections.filter((item: any) => item.result === 'PENDING').length,
        passed: inspections.filter((item: any) => item.result === 'PASS').length,
        issues: inspections.filter((item: any) => item.result === 'ISSUE_FOUND').length,
      },
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      settlementStatus: record.depositSettlement?.status ?? null,
    };
    if (mode === 'CUSTOMER') return { ...base, requestedBy: record.requestedBy, settlementId: record.depositSettlement?.id ?? null };
    const renewals = record.reservation.renewals.filter((renewal: { rentalContractId: string | null }) => renewalAppliesTo(renewal, ids)).map((renewal: any) => ({
      renewalCode: renewal.renewalCode,
      status: renewal.status,
      previousEndDate: this.isoDate(renewal.previousEndDate),
      requestedEndDate: this.isoDate(renewal.requestedEndDate),
    }));
    const operational = {
      ...base,
      requestedBy: record.requestedBy,
      assignedStaff: record.assignedStaff,
      inspectionStartedBy: record.inspectionStartedBy,
      physicallyReturnedBy: record.physicallyReturnedBy,
      completedBy: record.completedBy,
    };
    if (mode === 'STAFF') return { ...operational, renewalHistory: renewals.filter((renewal: { status: string }) => renewal.status === 'COMPLETED') };
    return {
      ...operational,
      renewalHistory: renewals,
      recordedDeposit: (allIds.length === record.reservation.quantity && !record.depositSettlement)
        ? recordedContractDeposit(collectibleInvoices, ids, allIds, record.reservation.quoteSnapshot, wholeOrder)
        : null,
      settlement: record.depositSettlement ? {
        id: record.depositSettlement.id, status: record.depositSettlement.status, depositAmount: Number(record.depositSettlement.depositAmount),
        deductionAmount: Number(record.depositSettlement.deductionAmount), refundAmount: Number(record.depositSettlement.refundAmount),
        outstandingAmount: Number(record.depositSettlement.outstandingAmount),
      } : null,
      billingSummary: {
        totalInvoiced: collectibleInvoices.reduce((sum: number, invoice: any) => sum + this.money(invoice.totalAmount), 0),
        totalPaid: record.reservation.invoices.reduce((sum: number, invoice: any) => sum + this.money(invoice.amountPaid), 0),
        totalOutstanding: record.reservation.invoices.reduce((sum: number, invoice: any) => sum + this.money(invoice.balanceDue), 0),
        invoices: record.reservation.invoices.map((invoice: any) => ({
          id: invoice.id, invoiceCode: invoice.invoiceCode, type: invoice.type, status: invoice.status,
          totalAmount: this.money(invoice.totalAmount), amountPaid: this.money(invoice.amountPaid), balanceDue: this.money(invoice.balanceDue),
        })),
      },
    };
  }

  private createInput(input: Record<string, unknown>, idempotencyKey: string | undefined) {
    if (['contractId', 'storageUnitId', 'reservationUnitId', 'rentalContractIds', 'contractIds', 'storageUnitIds', 'reservationUnitIds'].some(key => input[key] != null)) {
      throw new BadRequestException('Mỗi yêu cầu trả kho cần chọn một rentalContractId.');
    }
    const reservationId = typeof input.reservationId === 'string' ? input.reservationId.trim() : '';
    if (!reservationId) throw new BadRequestException('reservationId là bắt buộc.');
    const note = this.optionalText(input.note, 2000, 'note');
    const rentalContractId = this.optionalText(input.rentalContractId, 200, 'rentalContractId');
    const key = idempotencyKey?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự và chỉ chứa ký tự an toàn.');
    return { reservationId, rentalContractId, note, idempotencyKey: key };
  }

  private inspectionInput(input: Record<string, unknown>): { result: 'PASS' | 'ISSUE_FOUND'; issueType: IssueType | null; conditionNote: string | null; issueNote: string | null } {
    if ('approvedChargeAmount' in input || 'approvedByUserId' in input || 'deductionAmount' in input) {
      throw new BadRequestException('Staff không được gửi quyết định charge hoặc deduction trong inspection.');
    }
    const result = input.result;
    if (result !== 'PASS' && result !== 'ISSUE_FOUND') throw new BadRequestException('result phải là PASS hoặc ISSUE_FOUND.');
    const conditionNote = this.optionalText(input.conditionNote, 2000, 'conditionNote');
    const issueNote = this.optionalText(input.issueNote, 2000, 'issueNote');
    const issueType = typeof input.issueType === 'string' ? input.issueType : null;
    const issueTypes: IssueType[] = ['NORMAL_WEAR', 'FACILITY_FAULT', 'CUSTOMER_DAMAGE', 'CLEANING_REQUIRED', 'LOST_KEY_OR_ACCESS_ITEM', 'OTHER'];
    if (result === 'ISSUE_FOUND' && (!issueNote || issueNote.length < 3)) throw new BadRequestException('issueNote phải dài ít nhất 3 ký tự khi có ISSUE_FOUND.');
    if (result === 'ISSUE_FOUND' && (!issueType || !issueTypes.includes(issueType as IssueType))) throw new BadRequestException('issueType không hợp lệ hoặc còn thiếu.');
    return { result, issueType: result === 'ISSUE_FOUND' ? issueType as IssueType : null, conditionNote, issueNote: result === 'ISSUE_FOUND' ? issueNote : null };
  }

  private maintenanceCategory(issueType: IssueType): 'UNIT_DAMAGE' | 'CLEANING' | 'LOCK_OR_ACCESS' | 'FACILITY_EQUIPMENT' | 'OTHER' {
    if (issueType === 'CUSTOMER_DAMAGE') return 'UNIT_DAMAGE';
    if (issueType === 'CLEANING_REQUIRED') return 'CLEANING';
    if (issueType === 'LOST_KEY_OR_ACCESS_ITEM') return 'LOCK_OR_ACCESS';
    if (issueType === 'FACILITY_FAULT') return 'FACILITY_EQUIPMENT';
    return 'OTHER';
  }

  private assertMatchingRetry(record: any, customerId: string, reservationId: string, note: string | null, contractRef: string | null) {
    const inspected = record.inspections[0]?.rentalContract;
    const scopeMatches = contractRef
      ? record.inspections.length === 1 && (inspected?.id === contractRef || inspected?.contractCode === contractRef)
      : record.reservation.contracts.length === 1 || record.inspections.length > 1;
    if (record.requestedByUserId !== customerId || record.reservationId !== reservationId || (record.note ?? null) !== note || !scopeMatches) {
      throw new ConflictException('Idempotency-Key đã được dùng cho một yêu cầu trả kho khác.');
    }
  }

  private assertOperational(actor: PublicUser) {
    if (actor.role !== 'STAFF') throw new ForbiddenException('Chỉ nhân viên được xử lý kiểm tra trả kho.');
  }

  private async identity(id: string) {
    const identity = await this.prisma.returnRequest.findFirst({ where: { OR: [{ id }, { returnCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
    return identity;
  }

  private async find(id: string, db: DbClient) {
    const record = await db.returnRequest.findFirst({ where: { OR: [{ id }, { returnCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy yêu cầu trả kho.');
    return record;
  }

  private async lockUnits(tx: Prisma.TransactionClient, unitIds: string[]) {
    for (const unitId of [...unitIds].sort()) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${unitId} FOR UPDATE`);
  }

  private async lockContracts(tx: Prisma.TransactionClient, ids: string[]) {
    if (ids.length) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RentalContract" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`);
  }

  private async assertNoActiveReturn(tx: Prisma.TransactionClient, reservationId: string, ids: string[]) {
    const existing = await tx.returnRequest.findFirst({ where: { reservationId, status: { not: 'COMPLETED' },
      OR: [{ activeKey: this.activeKey(reservationId) }, { inspections: { some: { rentalContractId: { in: ids } } } }],
    }, select: { id: true } });
    if (existing) throw new ConflictException({ code: 'ACTIVE_RETURN_EXISTS', message: 'Kho đã có yêu cầu trả chưa hoàn tất.' });
  }

  private async assertNoConflictingWork(tx: Prisma.TransactionClient, ids: string[]) {
    const stock = await tx.stockMovement.count({ where: { rentalContractId: { in: ids }, status: { in: ['REQUESTED', 'ASSIGNED'] } } });
    if (stock) throw new ConflictException({ code: 'RETURN_PENDING_STOCK_MOVEMENTS', message: 'Cần hoàn tất phiếu nhập – xuất của kho trước khi trả.' });
    const transfers = await tx.transferRequest.count({ where: { rentalContractId: { in: ids }, status: { in: ['REQUESTED', 'APPROVED'] } } });
    if (transfers) throw new ConflictException({ code: 'RETURN_PENDING_TRANSFER', message: 'Cần xử lý xong yêu cầu chuyển kho của hợp đồng trước khi trả.' });
  }

  private assertDebt(invoices: Prisma.InvoiceGetPayload<{ select: typeof returnInvoiceFields }>[], ids: string[], allIds: string[], showAmounts: boolean, legacy = false) {
    if (legacy) return assertReturnFullyPaid(invoices, showAmounts);
    const readiness = contractReturnReadiness(invoices, ids, allIds);
    if (readiness.requiresReconciliation) throw new ConflictException({ code: 'RETURN_INVOICE_ALLOCATION_REQUIRED', message: 'Chưa xác định được công nợ của hợp đồng từ hóa đơn chung. Cần quản lý đối soát trước khi trả kho.' });
    if (!readiness.canReturn) throw new ConflictException({ code: 'RETURN_UNPAID_INVOICES',
      message: 'Cần thanh toán đủ các hóa đơn liên quan đến kho trả, kể cả những kỳ đã cam kết chưa đến hạn.',
      ...(showAmounts ? readiness : { canReturn: false }),
    });
  }

  private renewalIsOpen(renewal: { status: string }) {
    return openRenewalStatuses.some(status => renewal.status === status);
  }

  private assertRenewalsSettled(renewals: Parameters<typeof hasUnissuedRenewalInstallments>[0], ids: string[]) {
    if (renewals.some(renewal => this.renewalIsOpen(renewal) && renewalAppliesTo(renewal, ids))) {
      throw new ConflictException({ code: 'UNRESOLVED_RENEWAL_EXISTS', message: 'Cần xử lý yêu cầu gia hạn đang mở của kho trước khi trả.' });
    }
    if (hasUnissuedRenewalInstallments(renewals, ids)) {
      throw new ConflictException({ code: 'RENEWAL_INSTALLMENTS_NOT_ISSUED', message: 'Các kỳ gia hạn đã cam kết đang chờ lập hóa đơn. Vui lòng kiểm tra lại hoặc liên hệ NestBox để đối soát.' });
    }
  }

  private contractKey(id: string) {
    return `RETURN_CONTRACT:${id}`;
  }

  private activeKey(reservationId: string) {
    return `RETURN:${reservationId}`;
  }

  private optionalText(value: unknown, maximum: number, label: string) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > maximum) throw new BadRequestException(`${label} không hợp lệ.`);
    return value.trim();
  }

  private dateRange(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('date phải có định dạng YYYY-MM-DD.');
    const start = new Date(`${value}T00:00:00+07:00`);
    if (Number.isNaN(start.getTime())) throw new BadRequestException('date không hợp lệ.');
    return { gte: start, lt: new Date(start.getTime() + 86400000) };
  }

  private effectiveEndDateForRead(contracts: any[]) {
    if (!contracts.length) return new Date(0);
    const latest = contracts.reduce((value, contract) => contract.endDate > value ? contract.endDate : value, contracts[0].endDate);
    return latest as Date;
  }

  private isoDate(value: Date | null) {
    return value?.toISOString().slice(0, 10) ?? null;
  }

  private money(value: bigint) {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Stored money is outside the supported range.');
    return Number(value);
  }

  private isPrismaCode(error: unknown, code: string) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, conflictMessage: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
      } catch (error) {
        if (this.isPrismaCode(error, 'P2034') && attempt < 2) continue;
        if (this.isPrismaCode(error, 'P2034')) throw new ConflictException(conflictMessage);
        throw error;
      }
    }
    throw new ConflictException(conflictMessage);
  }
}
