import { evidencePhotos } from '../../evidence-photos.js';
import { recordTaskEvent } from '../dispatch/task-exception.js';
import { assertCanStartDirectWork, workPhase } from '../dispatch/work-phase.js';
import { managerReservationScope } from '../facility-access/record-access.js';
import { recordAssignment } from '../facility-access/assignment-audit.js';
import { assertAssignmentVersion } from '../facility-access/operational-assignment.js';
import { taskFacilityId, assertTaskFacility, supportTaskScope, supportTaskReference } from '../facility-access/task-access.js';
import { assertAssignmentAccess } from '../facility-access/facility-access.service.js';

import { EARLY_RETURN_SUBJECT, earlyReturnApprovalNote } from '../returns/early-return-classification.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { businessDate } from '../../business-date.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { assertTransferIntakeAvailable, createLinkedTransfer, isTransferSubject, legacyTransferFilter, transferSubjectFilter } from '../transfers/transfer-intake.js';
import { parseTransferProposal, transferProposalView } from '../transfers/transfer-schedule.js';
import { businessToday } from '../../business-date.js';

type SupportStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED';
type SupportPriority = 'LOW' | 'MEDIUM' | 'HIGH';
type SupportCategory = 'UNIT_ISSUE' | 'LOCK_OR_KEY_ISSUE' | 'ACCESS_CODE_ISSUE' | 'FACILITY_EQUIPMENT_FAILURE' | 'PAYMENT_SUPPORT' | 'STORED_ITEM_CONCERN' | 'OTHER';
type ViewMode = 'STORAGE_CUSTOMER' | 'FACILITY_STAFF' | 'FACILITY_MANAGER';

export interface SupportListQuery { page: number; limit: number; status?: SupportStatus; priority?: SupportPriority; category?: SupportCategory; assignedToMe?: boolean; search?: string }

const operationalCategories: SupportCategory[] = ['UNIT_ISSUE', 'LOCK_OR_KEY_ISSUE', 'ACCESS_CODE_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'STORED_ITEM_CONCERN'];
const staffResolutions = ['ON_SITE_RESOLVED', 'CUSTOMER_GUIDANCE', 'ACCESS_RESTORED', 'PAYMENT_GUIDANCE', 'NO_ACTION_REQUIRED', 'OTHER'] as const;
const managerResolutions = ['MANAGER_RESOLVED', 'TRANSFER_RECOMMENDED', 'NO_ACTION_REQUIRED', 'OTHER'] as const;

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async createCustomer(actor: PublicUser, input: Record<string, unknown>, key: string | undefined) {
    if (actor.role !== 'STORAGE_CUSTOMER') throw new ForbiddenException('Chỉ Customer được tạo Support Request.');
    const parsed = this.createInput(input, key);
    const retry = await this.prisma.supportRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include('STORAGE_CUSTOMER') });
    if (retry) return this.assertCreateRetry(retry, parsed, actor.id);
    const identity = await this.prisma.reservation.findFirst({ where: { customerId: actor.id, OR: [{ id: parsed.reservationId }, { reservationCode: parsed.reservationId }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy Reservation thuộc Customer.');
    try {
      return await this.serializable(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Reservation" WHERE "id" = ${identity.id} FOR UPDATE`);
        const duplicate = await tx.supportRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include('STORAGE_CUSTOMER') });
        if (duplicate) return this.assertCreateRetry(duplicate, { ...parsed, reservationId: identity.id }, actor.id);
        const reservation = await tx.reservation.findUnique({ where: { id: identity.id }, include: {
          contracts: { include: { reservationUnit: { include: { storageUnit: true } } } },
          invoices: { select: { id: true } },
        } });
        if (!reservation || reservation.customerId !== actor.id) throw new NotFoundException('Không tìm thấy Reservation thuộc Customer.');
        const early = parsed.subject === EARLY_RETURN_SUBJECT;
        const contract = parsed.rentalContractId ? reservation.contracts.find((item) => item.id === parsed.rentalContractId || item.contractCode === parsed.rentalContractId)
          : early && reservation.contracts.length === 1 ? reservation.contracts[0] : null;
        if (parsed.rentalContractId && !contract) throw new BadRequestException('RentalContract không thuộc Reservation đã chọn.');
        const activeContracts = reservation.contracts.filter((item) => item.status === 'ACTIVE' && item.reservationUnit.releasedAt === null && item.reservationUnit.storageUnit.status === 'OCCUPIED');
        if (early) {
          if (parsed.category !== 'OTHER' || !contract || parsed.storageUnitId || parsed.invoiceId) throw new BadRequestException('Hãy chọn hợp đồng của kho muốn trả trước hạn.');
          if (reservation.status !== 'CONFIRMED' || !activeContracts.includes(contract)) throw new ConflictException('Chỉ đề nghị trả sớm đối với kho đang sử dụng.');
          const endDate = this.date(contract.endDate);
          if (endDate <= businessDate(new Date())) throw new ConflictException('Hợp đồng đã đến hạn. Bạn có thể gửi yêu cầu trả kho.');
          if (parsed.earlyReturn?.requestedDate && (parsed.earlyReturn.requestedDate < businessDate(new Date()) || parsed.earlyReturn.requestedDate >= endDate)) throw new BadRequestException('Chọn ngày trả từ hôm nay đến trước ngày hết hạn thuê.');
          const previous = await tx.supportRequest.findFirst({ where: {
            reservationId: reservation.id, subject: parsed.subject, category: 'OTHER',
            AND: [
              { OR: [{ rentalContractId: contract.id }, { rentalContractId: null }] },
              { OR: [{ status: { not: 'RESOLVED' } }, { lastAction: 'EARLY_RETURN_APPROVED', lastActionIdempotencyKey: { endsWith: `:${endDate}` }, resolvedBy: { role: 'FACILITY_MANAGER' } }] },
            ],
          }, select: { id: true } });
          if (previous) throw new ConflictException('Kho đã có đề nghị trả sớm đang chờ hoặc đã được chấp thuận.');
        }
        if (operationalCategories.includes(parsed.category)) {
          if (reservation.status !== 'CONFIRMED' || activeContracts.length === 0 || (contract && !activeContracts.some((item) => item.id === contract.id))) {
            throw new ConflictException({ code: 'ACTIVE_RENTAL_REQUIRED', message: 'Loại Support này yêu cầu rental đang ACTIVE và unit còn OCCUPIED.' });
          }
        }
        const requestedUnit = parsed.storageUnitId;
        const unit = requestedUnit ? activeContracts.find((item) => item.reservationUnit.storageUnitId === requestedUnit || item.reservationUnit.storageUnit.unitNumber.toLowerCase() === requestedUnit.toLowerCase())?.reservationUnit.storageUnit : null;
        if (parsed.storageUnitId && !unit) throw new BadRequestException('StorageUnit không thuộc active allocation của Reservation.');
        if (contract && unit && contract.reservationUnit.storageUnitId !== unit.id) throw new BadRequestException('RentalContract và StorageUnit không khớp nhau.');
        const invoice = parsed.invoiceId ? reservation.invoices.find((item) => item.id === parsed.invoiceId) : null;
        if (parsed.invoiceId && !invoice) throw new BadRequestException('Invoice không thuộc Reservation đã chọn.');
        const transfer = isTransferSubject(parsed.subject);
        const candidates = transfer ? activeContracts.filter(item => (!contract || contract.id === item.id) && (!unit || item.reservationUnit.storageUnitId === unit.id)) : [];
        const transferContract = candidates.length === 1 ? candidates[0] : null;
        if (transfer) {
          if (reservation.status !== 'CONFIRMED' || !transferContract || transferContract.endDate <= businessToday()) throw new ConflictException('Hãy chọn một kho đang thuê còn thời hạn để chuyển.');
          if (parsed.proposal && (parsed.proposal.calendarDay < transferContract.startDate || parsed.proposal.calendarDay >= transferContract.endDate)) {
            throw new BadRequestException('Chọn ngày chuyển kho trong thời hạn của hợp đồng.');
          }
          if (parsed.proposal && parsed.proposal.startAt <= new Date()) throw new BadRequestException('Khung giờ đã qua. Hãy chọn khung giờ khác.');
          await assertTransferIntakeAvailable(tx, reservation.id, transferContract.id);
          const legacy = await tx.supportRequest.findFirst({ where: { reservationId: reservation.id, status: { not: 'RESOLVED' }, AND: [transferSubjectFilter, { OR: [{ rentalContractId: transferContract.id }, { rentalContractId: null, OR: [{ storageUnitId: transferContract.reservationUnit.storageUnitId }, { storageUnitId: null }] }] }], transferRequests: { none: {} } }, select: { id: true } });
          if (legacy) throw new ConflictException('Kho đã có yêu cầu chuyển đang xử lý. Xem tiến độ trong Chuyển đổi kho.');
        }
        const created = await tx.supportRequest.create({ data: {
          supportCode: this.code(), customerUserId: actor.id, reservationId: reservation.id,
          rentalContractId: transferContract?.id ?? contract?.id, storageUnitId: transferContract?.reservationUnit.storageUnitId ?? unit?.id ?? contract?.reservationUnit.storageUnitId, invoiceId: invoice?.id,
          category: parsed.category, priority: 'MEDIUM', status: 'OPEN' as const, subject: parsed.subject, description: parsed.description,
          idempotencyKey: parsed.idempotencyKey,
          ...(parsed.earlyReturn ? { earlyReturnFinancialReview: parsed.earlyReturn } : {}),
          transferRequestedStartAt: parsed.proposal?.startAt,
          transferRequestedEndAt: parsed.proposal?.endAt,
        }, include: this.include('STORAGE_CUSTOMER') });
        if (!transferContract) return this.toView(created, 'STORAGE_CUSTOMER');
        await createLinkedTransfer(tx, transferContract, created);
        return this.toView(await tx.supportRequest.findUniqueOrThrow({ where: { id: created.id }, include: this.include('STORAGE_CUSTOMER') }), 'STORAGE_CUSTOMER');
      }, 'Support Request vừa được tạo bởi thao tác khác.');
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const duplicate = await this.prisma.supportRequest.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.include('STORAGE_CUSTOMER') });
        if (duplicate) return this.assertCreateRetry(duplicate, { ...parsed, reservationId: identity.id }, actor.id);
        if (isTransferSubject(parsed.subject)) throw new ConflictException('Kho đã có yêu cầu chuyển đang xử lý hoặc yêu cầu vừa được cập nhật.');
      }
      throw error;
    }
  }

  listCustomer(customerId: string, query: SupportListQuery) { return this.list({ customerUserId: customerId }, query, 'STORAGE_CUSTOMER'); }
  listStaff(query: SupportListQuery, actor: PublicUser) { return this.list({ ...supportTaskScope(actor), closurePlanId: null, assignedStaffUserId: actor.id, subject: { not: EARLY_RETURN_SUBJECT }, NOT: transferSubjectFilter }, query, 'FACILITY_STAFF'); }
  listManager(query: SupportListQuery, actor:PublicUser, assignedStaffUserId?: string) {
    managerReservationScope(actor);
 return this.list({...supportTaskScope(actor),closurePlanId:null,...(assignedStaffUserId ? { assignedStaffUserId } : {})}, query, 'FACILITY_MANAGER'); }
  listLegacyTransfers(query: SupportListQuery, actor:PublicUser) { return this.list({AND:[legacyTransferFilter,supportTaskScope(actor)]}, query, 'FACILITY_MANAGER'); }

  async getCustomer(customerId: string, id: string) {
    const record = await this.prisma.supportRequest.findFirst({ where: { customerUserId: customerId, OR: [{ id }, { supportCode: id }] }, include: this.include('STORAGE_CUSTOMER') });
    if (!record) throw new NotFoundException('Không tìm thấy Support Request.');
    return this.toView(record, 'STORAGE_CUSTOMER');
  }
  async getStaff(id: string, actor: PublicUser) {
    const record = await this.prisma.supportRequest.findFirst({ where: { AND: [supportTaskScope(actor), { OR: [{ id }, { supportCode: id }] }], assignedStaffUserId: actor.id, subject: { not: EARLY_RETURN_SUBJECT }, NOT: transferSubjectFilter }, include: this.include('FACILITY_STAFF') });
    if (!record) throw new NotFoundException('Không tìm thấy Support Request.');
    return { ...this.toView(record, 'FACILITY_STAFF'), resolutionPhotos: record.resolutionPhotos ?? [] };
  }
  async getManager(id: string, actor:PublicUser) {
    managerReservationScope(actor);
 const row=await this.find(id,this.prisma); await assertTaskFacility(this.prisma,actor,supportTaskReference(row)); return this.toView(row,'FACILITY_MANAGER'); }

  assign(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const staffUserId = this.id(input.staffUserId, 'staffUserId');
    return this.transition(id, key, 'ASSIGN', actor, 'FACILITY_MANAGER', async (tx, current, safeKey) => {
      this.assertUnresolved(current);
      const staff = await assertAssignmentAccess(tx,actor,staffUserId,supportTaskReference(current));
      if (!staff || staff.role !== 'FACILITY_STAFF' || staff.accountStatus !== 'ACTIVE') throw new BadRequestException('Chỉ giao công việc cho nhân viên đang hoạt động.');
      assertAssignmentVersion(input, current.assignedStaffUserId);
      if (current.assignedStaffUserId === staff.id) {
        if (current.status === 'ESCALATED') throw new ConflictException('Chọn nhân viên khác để giao lại hồ sơ đã chuyển cấp.');
        return current;
      }
      await recordAssignment(tx,actor,"support-requests",current.id,current.assignedStaffUserId,staff.id,
        { facilityId: staff.facilityId, ...(current.status === 'ESCALATED' ? {
          previousStatus: 'ESCALATED', nextStatus: 'ASSIGNED',
          escalatedAt: current.escalatedAt?.toISOString() ?? null,
          escalatedByUserId: current.escalatedByUserId ?? null,
          escalationReason: current.escalationReason ?? null,
        } : {}) });
      return tx.supportRequest.update({ where: { id: current.id }, data: {
        assignedStaffUserId: staff.id, status: ['OPEN', 'ESCALATED'].includes(current.status) ? 'ASSIGNED' : current.status,
        ...(current.status === 'ESCALATED' ? { startedAt: null } : {}),
        lastAction: 'ASSIGN', lastActionIdempotencyKey: safeKey,
      }, include: this.include() });
    });
  }

  priority(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const priority = input.priority;
    if (typeof priority !== 'string' || !['LOW', 'MEDIUM', 'HIGH'].includes(priority)) throw new BadRequestException('priority không hợp lệ.');
    return this.transition(id, key, 'PRIORITY', actor, 'FACILITY_MANAGER', async (tx, current, safeKey) => {
      this.assertUnresolved(current);
      return tx.supportRequest.update({ where: { id: current.id }, data: { priority: priority as SupportPriority, lastAction: 'PRIORITY', lastActionIdempotencyKey: safeKey }, include: this.include() });
    });
  }

  start(id: string, key: string | undefined, actor: PublicUser) {
    return this.transition(id, key, 'START', actor, 'FACILITY_STAFF', async (tx, current, safeKey) => {
      if (current.status !== 'ASSIGNED') throw new ConflictException('Chỉ Support Request ASSIGNED mới có thể bắt đầu.');
      await assertCanStartDirectWork(tx, actor.id, 'support-requests', current.id);
      return tx.supportRequest.update({ where: { id: current.id }, data: { status: 'IN_PROGRESS', startedAt: new Date(), lastAction: 'START', lastActionIdempotencyKey: safeKey }, include: this.include() });
    });
  }

  customerWait(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser, resume = false) {
    const reason = resume ? null : this.text(input.reason, 1000, 'reason');
    const action = resume ? 'RESUME' : 'WAIT_CUSTOMER';
    return this.transition(id, key, action, actor, 'FACILITY_STAFF', async (tx, current, safeKey) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.id} FOR UPDATE`;
      const facilityId = await assertTaskFacility(tx, actor, supportTaskReference(current));
      if (current.status !== 'IN_PROGRESS' || Boolean(current.customerWaitReason) !== resume) {
        throw new ConflictException('Trạng thái chờ của công việc đã thay đổi.');
      }
      if (resume) await assertCanStartDirectWork(tx, actor.id, 'support-requests', current.id);
      await tx.auditEvent.create({ data: {
        category: 'ACTIVITY', action, outcome: 'SUCCESS', resource: 'support-requests', resourceId: current.id,
        route: '/staff/support-requests/' + current.id + (resume ? '/resume' : '/wait-customer'), method: 'POST', httpStatus: 201,
        actorId: actor.id, actorName: actor.fullName, actorEmail: actor.email, actorRole: actor.role,
        metadata: { facilityId, reason: reason ?? current.customerWaitReason },
      } });
      return tx.supportRequest.update({ where: { id: current.id }, data: {
        customerWaitReason: reason, lastAction: action, lastActionIdempotencyKey: safeKey,
      }, include: this.include() });
    });
  }

  resolveAssignedRequest(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const parsed = this.resolutionInput(input, staffResolutions);
    const photos = evidencePhotos(input.resolutionPhotos);
    return this.transition(id, key, 'STAFF_RESOLVE', actor, 'FACILITY_STAFF', async (tx, current, safeKey) => {
      if (current.status !== 'IN_PROGRESS' || current.customerWaitReason) throw new ConflictException('Tiếp tục xử lý trước khi ghi kết quả hỗ trợ.');
      if (current.category === 'PAYMENT_SUPPORT') throw new ConflictException('Chuyển yêu cầu thanh toán cho quản lý xem xét.');
      const accessIssue = ['LOCK_OR_KEY_ISSUE', 'ACCESS_CODE_ISSUE'].includes(current.category);
      const facilityId = await taskFacilityId(tx, supportTaskReference(current));
      if (parsed.resolutionType === 'ACCESS_RESTORED' || accessIssue && parsed.resolutionType === 'ON_SITE_RESOLVED') {
        if (input.identityVerified !== true) throw new BadRequestException('Cần xác nhận đã đối chiếu danh tính khách và quyền truy cập kho.');
        const entitled = await tx.rentalContract.findFirst({ where: { status: 'ACTIVE', reservationId: current.reservationId,
          ...(current.rentalContractId ? { id: current.rentalContractId } : {}),
          reservation: { customerId: current.customerUserId },
          reservationUnit: { releasedAt: null, ...(current.storageUnitId ? { storageUnitId: current.storageUnitId } : {}),
            storageUnit: { storageType: { facilityId } } },
        }, select: { id: true } });
        if (!entitled) throw new ConflictException('Khách không có quyền truy cập kho đang hiệu lực tại cơ sở.');
      }
      await recordTaskEvent(tx, actor, 'TASK_STAFF_COMPLETED', 'support-requests', current.id, { facilityId, identityVerified: input.identityVerified === true });
      return tx.supportRequest.update({ where: { id: current.id }, data: { status: 'RESOLVED', resolutionType: parsed.resolutionType, resolutionNote: parsed.resolutionNote, ...(photos.length ? { resolutionPhotos: photos } : {}), resolvedByUserId: actor.id, resolvedAt: new Date(), lastAction: 'STAFF_RESOLVE', lastActionIdempotencyKey: safeKey }, include: this.include() });
    });
  }

  escalate(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const reason = this.text(input.reason, 4000, 'reason');
    return this.transition(id, key, 'ESCALATE', actor, 'FACILITY_STAFF', async (tx, current, safeKey) => {
      if (current.status !== 'IN_PROGRESS') throw new ConflictException('Chỉ Support Request IN_PROGRESS mới được escalate.');
      await recordTaskEvent(tx, actor, 'TASK_ESCALATED', 'support-requests', current.id,
        { reason, facilityId: await taskFacilityId(tx, supportTaskReference(current)) });
      return tx.supportRequest.update({ where: { id: current.id }, data: { status: 'ESCALATED', customerWaitReason: null, escalatedAt: new Date(), escalatedByUserId: actor.id, escalationReason: reason, lastAction: 'ESCALATE', lastActionIdempotencyKey: safeKey }, include: this.include() });
    });
  }

  resolveManager(id: string, input: Record<string, unknown>, key: string | undefined, actor: PublicUser) {
    const parsed = this.resolutionInput(input, managerResolutions);
    return this.transition(id, key, 'MANAGER_RESOLVE', actor, 'FACILITY_MANAGER', async (tx, current, safeKey) => {
      if (current.status !== 'ESCALATED') throw new ConflictException('Manager chỉ resolve Support Request ESCALATED.');
      return tx.supportRequest.update({ where: { id: current.id }, data: { status: 'RESOLVED', resolutionType: parsed.resolutionType, resolutionNote: parsed.resolutionNote, resolvedByUserId: actor.id, resolvedAt: new Date(), lastAction: 'MANAGER_RESOLVE', lastActionIdempotencyKey: safeKey }, include: this.include() });
    });
  }

  private async transition(id: string, key: string | undefined, action: string, actor: PublicUser, role: 'FACILITY_STAFF' | 'FACILITY_MANAGER', operation: (tx: Prisma.TransactionClient, current: any, key: string) => Promise<any>) {
    const managerAction = role === 'FACILITY_MANAGER';
    const permitted = managerAction ? actor.role === 'FACILITY_MANAGER' : actor.role === 'FACILITY_STAFF';
    if (!permitted) throw new ForbiddenException(managerAction ? 'Chỉ quản lý cơ sở được thực hiện thao tác này.' : 'Chỉ Staff được thực hiện thao tác này.');
    const safeKey = this.key(key); const identity = await this.identity(id);
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SupportRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.supportRequest.findUnique({ where: { id: identity.id }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy Support Request.');
      if (current.closurePlanId) throw new ForbiddenException('Xử lý nhiệm vụ này tại hồ sơ hỗ trợ di dời.');
      await assertTaskFacility(tx,actor,supportTaskReference(current));
      if (current.subject === EARLY_RETURN_SUBJECT) throw new ForbiddenException('Đề nghị trả trước hạn do quản lý xem xét tại mục Đề nghị trả sớm; không xử lý như hỗ trợ thông thường.');
      if (isTransferSubject(current.subject)) throw new ForbiddenException('Yêu cầu này được xử lý trong hồ sơ chuyển kho.');
      if (role === 'FACILITY_STAFF') this.assertAssigned(current, actor);
      if (current.lastAction === action && current.lastActionIdempotencyKey === safeKey) return this.toView(current, role);
      if (await tx.supportRequest.findUnique({ where: { lastActionIdempotencyKey: safeKey }, select: { id: true } })) throw new ConflictException('Idempotency-Key đã được dùng cho thao tác khác.');
      const updated = await operation(tx, current, safeKey);
      return this.toView(updated, role);
    }, 'Support Request vừa được cập nhật bởi thao tác khác.');
  }

  private async list(base: Prisma.SupportRequestWhereInput, query: SupportListQuery, mode: ViewMode) {
    const { OR: scopeOr, AND: scopeAnd, ...baseFields } = base;
    const scopes = [...(Array.isArray(scopeAnd) ? scopeAnd : scopeAnd ? [scopeAnd] : []), ...(scopeOr ? [{ OR: scopeOr }] : [])];
    const where: Prisma.SupportRequestWhereInput = { ...baseFields, ...(scopes.length ? { AND: scopes } : {}), ...(query.status ? { status: query.status } : {}), ...(query.priority ? { priority: query.priority } : {}), ...(query.category ? { category: query.category } : {}), ...(query.search ? { OR: [
      { supportCode: { contains: query.search, mode: 'insensitive' } }, { subject: { contains: query.search, mode: 'insensitive' } },
      { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } }, { customer: { fullName: { contains: query.search, mode: 'insensitive' } } },
      { customer: { email: { contains: query.search, mode: 'insensitive' } } }, { storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } },
    ] } : {}) };
    const total = await this.prisma.supportRequest.count({ where });
    const records = await this.prisma.supportRequest.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: this.include(mode),
    });
    return { page: query.page, limit: query.limit, total, items: records.map((item) => this.toView(item, mode)) };
  }

  private include(mode: ViewMode = 'FACILITY_MANAGER'): Prisma.SupportRequestInclude { return {
    transferRequests: { orderBy: { createdAt: 'desc' }, select: { id: true, transferCode: true, status: true, rejectionReason: true, ...(mode === 'STORAGE_CUSTOMER' ? {} : { assignedStaffUserId: true }), rentalContractId: true, customerAcceptedAt: true, commercialSnapshot: true, handoverReport: true, createdAt: true, approvedAt: true, completedAt: true, fromStorageUnit: { select: { id: true, unitNumber: true } }, toStorageUnit: { select: { id: true, unitNumber: true } } } },
    customer: { select: { id: true, fullName: true, email: true, phone: true } },
    reservation: { select: { id: true, reservationCode: true, status: true, ...(mode !== 'STORAGE_CUSTOMER' ? { facility: { select: { id: true, name: true } } } : {}), ...(mode === 'STORAGE_CUSTOMER' ? { _count: { select: { contracts: true } } } : {}) } },
    rentalContract: { select: { id: true, contractCode: true, status: true, startDate: true, endDate: true } },
    storageUnit: { include: {
      storageType: { select: { id: true, code: true, name: true } },
      ...(mode === 'FACILITY_MANAGER' ? {
        maintenanceRequests: { where: { status: { in: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION'] } }, take: 1, select: { id: true, maintenanceCode: true, status: true, priority: true } },
        reservationUnits: { where: { releasedAt: null, reservation: { status: 'CONFIRMED' }, plannedStartDate: { gt: new Date() } }, include: { reservation: { select: { reservationCode: true } } }, orderBy: { plannedStartDate: 'asc' } },
      } : {}),
    } },
    invoice: { select: { id: true, invoiceCode: true, status: true } }, assignedStaff: { select: { id: true, fullName: true, role: true, accountStatus: true } },
    escalatedBy: { select: { id: true, fullName: true, role: true } }, resolvedBy: { select: { id: true, fullName: true, role: true } },
  } }

  private toView(record: any, mode: ViewMode) {
    const earlyReturnDecision = record.subject === EARLY_RETURN_SUBJECT && record.resolvedBy?.role === 'FACILITY_MANAGER'
      ? (record.lastAction === 'EARLY_RETURN_APPROVED' ? 'APPROVED' : record.lastAction === 'EARLY_RETURN_REJECTED' ? 'REJECTED' : null)
      : null;
    const resolutionNote = earlyReturnDecision === 'APPROVED'
      ? earlyReturnApprovalNote(record.resolutionNote)
      : record.resolutionNote;
    const base = { id: record.id, supportCode: record.supportCode, category: record.category, priority: record.priority, status: record.status, subject: record.subject, description: record.description, reservation: { id: record.reservation.id, reference: record.reservation.reservationCode, status: record.reservation.status }, contract: record.rentalContract, unit: record.storageUnit ? { id: record.storageUnit.id, unitCode: record.storageUnit.unitNumber, status: record.storageUnit.status, floor: record.storageUnit.floor, zone: record.storageUnit.zone, row: record.storageUnit.row, position: record.storageUnit.position, storageType: record.storageUnit.storageType } : null, invoice: record.invoice, startedAt: record.startedAt?.toISOString() ?? null, resolvedAt: record.resolvedAt?.toISOString() ?? null, resolutionType: record.resolutionType, resolutionNote, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(), earlyReturnFinancialReview: record.earlyReturnFinancialReview ?? null, earlyReturnDecision, earlyReturnForEndDate: record.lastActionIdempotencyKey?.startsWith('early-return:') ? record.lastActionIdempotencyKey.slice(-10) : null, transfers: (record.transferRequests ?? []).filter((transfer: { status: string; assignedStaffUserId: string | null }) =>
      mode !== 'FACILITY_STAFF' || Boolean(record.assignedStaffUserId && transfer.assignedStaffUserId === record.assignedStaffUserId && ['APPROVED', 'COMPLETED'].includes(transfer.status)),
    ).map((transfer: any) => ({ id: transfer.id, transferCode: transfer.transferCode, status: transfer.status, rejectionReason: transfer.rejectionReason ?? null, contractId: transfer.rentalContractId, hasCommercialAppendix: Boolean(transfer.commercialSnapshot), requiresAcceptance: Boolean(transfer.commercialSnapshot && !transfer.customerAcceptedAt),
      customerMoveAction: transfer.status !== 'APPROVED' || transfer.handoverReport?.stagedHandover !== true ? null
        : transfer.handoverReport.customerMoveReadyAt ? 'REPORTED'
        : transfer.handoverReport.destinationAccessDeliveredAt ? 'READY_TO_REPORT' : 'WAITING_FOR_DESTINATION',
      fromUnit: { id: transfer.fromStorageUnit.id, unitCode: transfer.fromStorageUnit.unitNumber }, toUnit: transfer.toStorageUnit ? { id: transfer.toStorageUnit.id, unitCode: transfer.toStorageUnit.unitNumber } : null, createdAt: transfer.createdAt.toISOString(), approvedAt: transfer.approvedAt?.toISOString() ?? null, completedAt: transfer.completedAt?.toISOString() ?? null })) };
    const view = { ...base, transferRequestedSchedule: transferProposalView(record) };
    if (mode === 'STORAGE_CUSTOMER') return { ...view, waitingForCustomer: Boolean(record.customerWaitReason) };
    const operational = { ...view, coordination: workPhase('support-requests', record), customerWaitReason: record.customerWaitReason, customer: record.customer, assignedStaff: record.assignedStaff, escalatedAt: record.escalatedAt?.toISOString() ?? null, escalationReason: record.escalationReason, escalatedBy: record.escalatedBy, resolvedBy: record.resolvedBy };
    if (mode === 'FACILITY_STAFF') return {
      ...operational,
      facility: record.reservation.facility,
      hasTransferOrder: (record.transferRequests ?? []).some((transfer: { status: string }) => transfer.status !== 'REJECTED'),
    };
    const future = record.storageUnit?.reservationUnits.map((item: any) => ({ reservationReference: item.reservation.reservationCode, startDate: this.date(item.plannedStartDate), endDate: this.date(item.plannedEndDate) })) ?? [];
    return { ...operational, facility: record.reservation.facility, activeMaintenance: record.storageUnit?.maintenanceRequests[0] ?? null, hasFutureAllocation: future.length > 0, nextConfirmedAllocation: future[0] ?? null, futureAllocations: future };
  }

  private createInput(input: Record<string, unknown>, key: string | undefined) {
    const category = input.category;
    if (typeof category !== 'string' || ![...operationalCategories, 'PAYMENT_SUPPORT', 'OTHER'].includes(category as SupportCategory)) throw new BadRequestException('category không hợp lệ.');
    const subject = this.text(input.subject, 200, 'subject');
    const requestedDate = input.earlyReturnRequestedDate;
    const reason = input.earlyReturnReason;
    let earlyReturn: { requestedDate: string | null; reason: string | null } | undefined;
    if (subject === EARLY_RETURN_SUBJECT && (requestedDate !== undefined || reason !== undefined)) {
      const parsedDate = typeof requestedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? new Date(`${requestedDate}T00:00:00Z`) : null;
      if (requestedDate !== undefined && (!parsedDate || !Number.isFinite(+parsedDate) || this.date(parsedDate) !== requestedDate)) throw new BadRequestException('Ngày muốn trả kho không hợp lệ.');
      if (reason !== undefined && (typeof reason !== 'string' || !['NO_LONGER_NEEDED', 'RELOCATION', 'PERSONAL', 'FACILITY_ISSUE', 'OTHER'].includes(reason))) throw new BadRequestException('Lý do trả kho không hợp lệ.');
      earlyReturn = { requestedDate: typeof requestedDate === 'string' ? requestedDate : null, reason: typeof reason === 'string' ? reason : null };
    }
    return { reservationId: this.id(input.reservationId, 'reservationId'), rentalContractId: this.optionalId(input.rentalContractId, 'rentalContractId'), storageUnitId: this.optionalId(input.storageUnitId, 'storageUnitId'), invoiceId: this.optionalId(input.invoiceId, 'invoiceId'), category: category as SupportCategory, subject, description: this.text(input.description, 4000, 'description'), idempotencyKey: this.key(key), earlyReturn, proposal: parseTransferProposal(input, isTransferSubject(subject)) };
  }
  private resolutionInput(input: Record<string, unknown>, allowed: readonly string[]) { const type = input.resolutionType; if (typeof type !== 'string' || !allowed.includes(type)) throw new BadRequestException('resolutionType không được phép.'); return { resolutionType: type as any, resolutionNote: this.text(input.resolutionNote, 4000, 'resolutionNote') }; }
  private assertCreateRetry(record: any, parsed: ReturnType<SupportService['createInput']>, customerId: string) {
    const reservationMatches = record.reservationId === parsed.reservationId || record.reservation.reservationCode === parsed.reservationId;
    const contractMatches = parsed.rentalContractId
      ? [record.rentalContractId, record.rentalContract?.contractCode].includes(parsed.rentalContractId)
      : parsed.subject !== EARLY_RETURN_SUBJECT || !record.rentalContractId || record.reservation._count?.contracts === 1;
    if (record.customerUserId !== customerId || !reservationMatches || !contractMatches || record.category !== parsed.category
      || record.subject !== parsed.subject || record.description !== parsed.description
      || (record.earlyReturnFinancialReview?.requestedDate ?? null) !== (parsed.earlyReturn?.requestedDate ?? null)
      || (record.earlyReturnFinancialReview?.reason ?? null) !== (parsed.earlyReturn?.reason ?? null)
      || record.transferRequestedStartAt?.getTime() !== parsed.proposal?.startAt.getTime()
      || record.transferRequestedEndAt?.getTime() !== parsed.proposal?.endAt.getTime()
      || (parsed.storageUnitId && ![record.storageUnitId, record.storageUnit?.unitNumber].includes(parsed.storageUnitId))
      || (parsed.invoiceId && record.invoiceId !== parsed.invoiceId)) throw new ConflictException('Idempotency-Key đã được dùng cho Support Request khác.');
    return this.toView(record, 'STORAGE_CUSTOMER');
  }
  private assertAssigned(record: any, actor: PublicUser) { if (!record.assignedStaffUserId || record.assignedStaffUserId !== actor.id) throw new ForbiddenException('Chỉ Staff được assign mới có thể xử lý request này.'); }
  private assertUnresolved(record: any) { if (record.status === 'RESOLVED') throw new ConflictException('Support Request RESOLVED là trạng thái cuối.'); }
  private async identity(id: string) { const item = await this.prisma.supportRequest.findFirst({ where: { OR: [{ id }, { supportCode: id }] }, select: { id: true } }); if (!item) throw new NotFoundException('Không tìm thấy Support Request.'); return item; }
  private async find(id: string, db: PrismaService | Prisma.TransactionClient) { const item = await db.supportRequest.findFirst({ where: { OR: [{ id }, { supportCode: id }] }, include: this.include() }); if (!item) throw new NotFoundException('Không tìm thấy Support Request.'); return item; }
  private id(value: unknown, label: string) { if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) throw new BadRequestException(`${label} không hợp lệ.`); return value.trim(); }
  private optionalId(value: unknown, label: string) { return value === undefined || value === null || value === '' ? null : this.id(value, label); }
  private text(value: unknown, max: number, label: string) { if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > max) throw new BadRequestException(`${label} phải dài từ 3–${max} ký tự.`); return value.trim(); }
  private key(value: string | undefined) { const key = value?.trim() ?? ''; if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự và chỉ chứa ký tự an toàn.'); return key; }
  private code() { return `WDP-SUP-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`; }
  private date(value: Date) { return value.toISOString().slice(0, 10); }
  private isPrismaCode(error: unknown, code: string) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code; }
  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, message: string) { for (let attempt = 0; attempt < 3; attempt += 1) { try { return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 }); } catch (error) { if (this.isPrismaCode(error, 'P2034') && attempt < 2) continue; if (this.isPrismaCode(error, 'P2034')) throw new ConflictException(message); throw error; } } throw new ConflictException(message); }
}
