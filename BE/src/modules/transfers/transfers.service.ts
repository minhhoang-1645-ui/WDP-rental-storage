import { evidencePhotos } from '../../evidence-photos.js';
import { recordTaskEvent } from '../dispatch/task-exception.js';
import { assertListedPrice, resolveMonthlyRange, priceInRange, lockPriceRange } from '../pricing/monthly-price-range.js';
import { assertCanStartDirectWork, transferWork, workPhase } from '../dispatch/work-phase.js';
import { managerReservationScope } from '../facility-access/record-access.js';
import { recordAssignment } from '../facility-access/assignment-audit.js';
import { assertTaskFacility, assertTaskExecution, transferTaskScope, supportTaskReference } from '../facility-access/task-access.js';
import { assertActiveAssignee, assertAssignmentVersion, managerAssignmentInput, operationalAssignee, physicalHandoff } from '../facility-access/operational-assignment.js';
import { assertTransferIntakeAvailable, createLinkedTransfer, isTransferSubject } from './transfer-intake.js';
import { Optional } from '@nestjs/common';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { businessToday } from '../../business-date.js';
import { transferProposalView } from './transfer-schedule.js';
import { transferAddendumContent } from './transfer-addendum-content.js';
import { TransferCommercialService, transferDebtWhere } from './transfer-commercial.service.js';
import { SigningOtpService, signedDocument, signedEnvelope, signatureVerification } from '../signing/signing-otp.service.js';
import { snapshotHash, validateSignature } from '../contracts/signature.js';
import type { PublicUser } from '../auth/auth.types.js';
import type { PricingPolicySnapshot } from '../policies/pricing-policy.js';

const commercialPolicyApplies = (transfer: { closurePlanId?: string | null; reason: string; reservation: { quantity?: number; quoteSnapshot: unknown } }) =>
  transfer.reservation.quantity === 1 && !transfer.closurePlanId && transfer.reason === 'OTHER' &&
  Boolean((transfer.reservation.quoteSnapshot as { pricingPolicy?: PricingPolicySnapshot } | null)?.pricingPolicy?.transferFee);

const statuses = ['REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'] as const;
const destinationMaintenance = { where: { activeKey: { not: null } }, select: { id: true }, take: 1 } as const;
function liveDestinationConflicts(reservationId: string, start: Date, end: Date): Prisma.ReservationUnitWhereInput {
  return { releasedAt: null, OR: [
    { reservationId },
    { plannedStartDate: { lt: end }, plannedEndDate: { gt: start } },
  ] };
}
const renewalAwaitingCurrentInvoice = (today = businessToday()): Prisma.RenewalRequestWhereInput => ({
  status: 'COMPLETED', paymentPlan: 'PAY_MONTHLY', previousEndDate: { lte: today }, requestedEndDate: { gt: today },
  invoices: { none: { type: 'RENEWAL', status: 'PAID', balanceDue: 0n, billingPeriodStart: { lte: today }, billingPeriodEnd: { gt: today } } },
});
const staffTransferReady = (): Prisma.TransferRequestWhereInput => ({ OR: [
  { status: 'COMPLETED' },
  { commercialSnapshot: { equals: Prisma.DbNull } },
  { customerAcceptedAt: { not: null }, commercialSnapshot: { path: ['adjustmentTerms', 'invoiceId'], not: Prisma.AnyNull } },
] });

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly commercial?: TransferCommercialService, @Optional() private readonly signing?: SigningOtpService) {}

  async listCustomer(customer: PublicUser) {
    const rows = await this.prisma.transferRequest.findMany({ where: { reservation: { customerId: customer.id }, commercialSnapshot: { not: Prisma.DbNull } }, omit: { assignedStaffUserId: true }, include: this.include(false), orderBy: { createdAt: 'desc' } });
    return { items: rows.map(row => this.toTransfer(row, { customer: true })), total: rows.length, page: 1, limit: Math.max(1, rows.length) };
  }
  async getCustomerOrder(customer: PublicUser, id: string) {
    const row = await this.prisma.transferRequest.findFirst({ where: { id, reservation: { customerId: customer.id } }, omit: { assignedStaffUserId: true }, include: this.include(false) });
    if (!row?.commercialSnapshot) throw new NotFoundException('Không tìm thấy phụ lục thuộc tài khoản này.');
    return { ...this.toTransfer(row, { customer: true }), addendumContent: transferAddendumContent(row.commercialSnapshot, row.transferCode) };
  }
  async previewCommercial(id: string, destinationId: string,actor:PublicUser) {
    const transfer = await this.prisma.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, include: this.include() });
    if (!transfer || transfer.status !== 'REQUESTED') throw new NotFoundException('Không có lệnh chuyển đang chọn kho đích.');
    await assertTaskFacility(this.prisma,actor,{storageUnitId:transfer.fromStorageUnitId});
    const destination = await this.prisma.storageUnit.findUnique({ where: { id: destinationId }, include: { storageType: true } });
    if (!destination) throw new NotFoundException('Không tìm thấy kho đích.');
    await assertTaskFacility(this.prisma, actor, { storageUnitId: destination.id });
    if (destination.storageTypeId !== transfer.fromStorageUnit.storageTypeId) throw new ConflictException('Chỉ chuyển sang kho cùng loại tại cùng cơ sở.');
    if (transfer.reason === 'OTHER' && !transfer.closurePlanId) await assertListedPrice(this.prisma, destination.storageType);
    if (!commercialPolicyApplies(transfer as never)) return { sameType: true, message: 'Cùng loại, giữ giá và thời hạn.' };
    if (!this.commercial) throw new ConflictException('Chưa lập được phụ lục đổi loại.');
    const snapshot = await this.prisma.$transaction(tx => this.commercial!.prepare(tx, transfer, destination), { isolationLevel: 'RepeatableRead' });
    return { sameType: false, snapshot, reviewHash: this.commercialReviewHash(snapshot) };
  }
  private commercialReviewHash({ generatedAt: _generatedAt, ...terms }: Awaited<ReturnType<TransferCommercialService['prepare']>>) {
    return snapshotHash(terms);
  }
  private async customerOrder(customer: PublicUser, id: string) {
    const row = await this.prisma.transferRequest.findFirst({ where: { id, reservation: { customerId: customer.id } }, omit: { assignedStaffUserId: true }, include: this.include(false) });
    if (!row || !row.commercialSnapshot) throw new NotFoundException('Không tìm thấy phụ lục chuyển kho của bạn.');
    if (row.status !== 'APPROVED') throw new ConflictException('Phụ lục không còn ở bước xác nhận trước khi chuyển.');
    return row;
  }
  async requestCommercialOtp(customer: PublicUser, id: string, input: Record<string, unknown>) {
    const row = await this.customerOrder(customer, id);
    if (!this.signing || row.customerAcceptedAt) throw new ConflictException('Phụ lục đã được xác nhận hoặc chưa sẵn sàng.');
    const signatureImage = validateSignature(input), acceptanceName = this.text(input.acceptanceName, 'Họ tên xác nhận'), documentHash = snapshotHash(row.commercialSnapshot);
    if (acceptanceName.length < 2 || acceptanceName.length > 120 || input.snapshotHash !== documentHash) throw new ConflictException('Kiểm tra lại họ tên và phiên bản phụ lục.');
    return this.signing.issue({ userId: customer.id, email: customer.email, kind: 'transfer', documentId: row.id, documentHash, signatureImage, acceptanceName }, `phụ lục chuyển ${row.transferCode}`);
  }
  async acceptCommercial(customer: PublicUser, id: string, input: Record<string, unknown>) {
    const row = await this.customerOrder(customer, id);
    if (row.customerAcceptedAt) return this.toTransfer(row, { customer: true });
    if (!this.signing) throw new ConflictException('Chưa sẵn sàng xác thực chữ ký.');
    const signatureImage = validateSignature(input), acceptanceName = this.text(input.acceptanceName, 'Họ tên xác nhận'), documentHash = snapshotHash(row.commercialSnapshot);
    if (acceptanceName.length < 2 || acceptanceName.length > 120 || input.snapshotHash !== documentHash) throw new ConflictException('Phụ lục đã thay đổi. Tải lại và kiểm tra trước khi ký.');
    await this.signing.verifyAndSave({ userId: customer.id, email: customer.email, kind: 'transfer', documentId: row.id, documentHash, signatureImage, acceptanceName }, input, async (evidence, tx) => {
      const changed = await (tx ?? this.prisma).transferRequest.updateMany({ where: { id: row.id, updatedAt: row.updatedAt, status: 'APPROVED', customerAcceptedAt: null }, data: { customerAcceptedAt: new Date(), customerAcceptanceName: acceptanceName, customerSignatureImage: signatureImage, commercialSignedSnapshot: signedEnvelope(row.commercialSnapshot, evidence) as unknown as Prisma.InputJsonValue } });
      if (changed.count !== 1) throw new ConflictException('Phụ lục vừa được cập nhật. Tải lại.');
    });
    return this.getCustomerOrder(customer, row.id);
  }

  async create(_input: Record<string, unknown>, _key: string | undefined, _actor: PublicUser) {
    throw new ForbiddenException('Chỉ khách hàng gửi yêu cầu chuyển kho qua hồ sơ thuê.');
  }

  async intakeLegacy(id: string, actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý tiếp nhận yêu cầu chuyển kho cũ.');
    return this.serializable(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SupportRequest" WHERE "id" = ${id} FOR UPDATE`);
      const support = await tx.supportRequest.findUnique({ where: { id }, include: { transferRequests: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } } } });
      if (!support || !isTransferSubject(support.subject)) throw new NotFoundException('Không tìm thấy yêu cầu chuyển kho của khách.');
      await assertTaskFacility(tx,actor,supportTaskReference(support));
      if (support.transferRequests[0]) return support.transferRequests[0];
      if (support.status === 'RESOLVED') throw new ConflictException('Yêu cầu đã được xử lý.');
      const contracts = await tx.rentalContract.findMany({
        where: { reservationId: support.reservationId, reservation: { customerId: support.customerUserId, status: 'CONFIRMED' },
          ...(support.rentalContractId ? { id: support.rentalContractId } : {}), status: 'ACTIVE', endDate: { gt: this.today() },
          reservationUnit: { releasedAt: null, storageUnit: { status: 'OCCUPIED' }, ...(support.storageUnitId ? { storageUnitId: support.storageUnitId } : {}) } },
        include: { reservationUnit: true }, take: 2,
      });
      if (contracts.length !== 1) throw new ConflictException('Không xác định được một hợp đồng đang thuê khớp với yêu cầu cũ.');
      await assertTransferIntakeAvailable(tx, support.reservationId, contracts[0].id);
      return createLinkedTransfer(tx, contracts[0], support);
    }, 'Yêu cầu vừa thay đổi. Tải lại trước khi tiếp nhận.');
  }

  async list(query: Record<string, unknown>,actor:PublicUser) {
    managerReservationScope(actor);

    return this.listFiltered(query,[],undefined,actor);
  }

  private async listFiltered(query: Record<string, unknown>, allowedStatuses: readonly (typeof statuses)[number][] = [], assignedStaffUserId:string|undefined, actor:PublicUser) {
    const page = this.integer(query.page, 1, 100000, 'page'); const limit = this.integer(query.limit, 20, 100, 'limit');
    const status = typeof query.status === 'string' && query.status ? query.status : undefined;
    if (status && !statuses.includes(status as never)) throw new BadRequestException('Transfer status không hợp lệ.');
    if (status && allowedStatuses.length && !allowedStatuses.includes(status as (typeof statuses)[number])) throw new BadRequestException('Transfer status không hợp lệ cho vai trò hiện tại.');
    const search = typeof query.search === 'string' && query.search.trim() ? query.search.trim() : undefined;
    if (search && search.length > 120) throw new BadRequestException('search tối đa 120 ký tự.');
    const reviewQueue = actor.role === 'FACILITY_MANAGER' && query.reviewQueue === 'true';
    const flagged = reviewQueue ? await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "TransferRequest"
      WHERE "status" = 'APPROVED'
        AND CASE WHEN jsonb_typeof("handoverReport"->'problems') = 'array'
          THEN jsonb_array_length("handoverReport"->'problems') > 0
            AND jsonb_array_length("handoverReport"->'problems')::text
              IS DISTINCT FROM "handoverReport"#>>'{problemReview,problemCount}'
          ELSE false END
    `) : [];
    const where: Prisma.TransferRequestWhereInput = {
      closurePlanId: null,
      ...transferTaskScope(actor),
      ...(reviewQueue ? { AND: [{ OR: [
        { status: 'REQUESTED' }, { status: 'APPROVED', id: { in: flagged.map(item => item.id) } },
      ] }] } : {}),
      ...(assignedStaffUserId ? { assignedStaffUserId, AND: [staffTransferReady()] } : {}),
      ...(status ? { status: status as (typeof statuses)[number] } : allowedStatuses.length ? { status: { in: [...allowedStatuses] } } : {}),
      ...(search ? { OR: [
        { transferCode: { contains: search, mode: 'insensitive' } },
        { reservation: { reservationCode: { contains: search, mode: 'insensitive' } } },
        ...(assignedStaffUserId ? [{ reservation: { customer: { fullName: { contains: search, mode: 'insensitive' as const } } } }] : []),
        { rentalContract: { contractCode: { contains: search, mode: 'insensitive' } } },
        { fromStorageUnit: { unitNumber: { contains: search, mode: 'insensitive' } } },
        { toStorageUnit: { unitNumber: { contains: search, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.transferRequest.count({ where }),
      this.prisma.transferRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: this.include() }),
    ]);
    return { page, limit, total, items: records.map(record => this.toTransfer(record, { staffId: assignedStaffUserId })) };
  }

  async get(id: string,actor:PublicUser) {
    managerReservationScope(actor);

    const record = await this.prisma.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }],...transferTaskScope(actor) }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy TransferRequest.');
    return this.toTransfer(record);
  }

  async destinations(id: string, query: Record<string, unknown>,actor:PublicUser) {
    const page = this.integer(query.page, 1, 100000, 'page');
    const limit = this.integer(query.limit, 20, 100, 'limit');
    const transfer = await this.prisma.transferRequest.findFirst({
      where: { OR: [{ id }, { transferCode: id }] },
      include: { fromStorageUnit: true, rentalContract: true },
    });
    if (!transfer) throw new NotFoundException('Không tìm thấy yêu cầu chuyển kho.');
    await assertTaskFacility(this.prisma,actor,{storageUnitId:transfer.fromStorageUnitId});
    const start = this.today(), end = transfer.rentalContract.endDate;
    const where = { storageTypeId: transfer.fromStorageUnit.storageTypeId, id: { not: transfer.fromStorageUnitId } };
    const total = await this.prisma.storageUnit.count({ where });
    const units = await this.prisma.storageUnit.findMany({
      where, skip: (page - 1) * limit, take: limit, orderBy: [{ unitNumber: 'asc' }, { id: 'asc' }],
      include: { storageType: true, maintenanceRequests: destinationMaintenance,
        incidentBlocks: { where: { releasedAt: null }, select: { id: true }, take: 1 }, reservationUnits: {
        where: liveDestinationConflicts(transfer.reservationId, start, end),
        select: { reservationId: true, plannedStartDate: true, plannedEndDate: true }, orderBy: { plannedStartDate: 'asc' },
      } },
    });
    const type = units[0]?.storageType;
    const bounds = transfer.reason === 'OTHER' && !transfer.closurePlanId && type
      ? await resolveMonthlyRange(this.prisma, type.facilityId, type.sizeId) : undefined;
    const priceBlocked = bounds !== undefined && (!bounds || type.bookingEnabled === false || !priceInRange(bounds, Number(type.monthlyRate)));
    return { page, limit, total, items: units.map(unit => {
      const reason = transfer.status !== 'REQUESTED' ? 'Yêu cầu đã được xử lý. Mở lại hồ sơ để xem kết quả.'
        : transfer.rentalContract.status !== 'ACTIVE' || end <= start ? 'Hợp đồng không còn kỳ thuê đang hoạt động.'
        : transfer.rentalContract.reservationUnitId !== transfer.fromReservationUnitId || transfer.fromStorageUnit.status !== 'OCCUPIED' ? 'Kho nguồn đã thay đổi. Vui lòng kiểm tra lại hồ sơ trước khi chuyển.'
        : unit.incidentBlocks?.length ? 'Ô kho đang tạm ngừng nhận thuê vì sự cố.'
        : unit.status === 'MAINTENANCE' || unit.maintenanceRequests?.length ? 'Kho đang bảo trì.' : unit.status === 'OCCUPIED' ? 'Kho đang có khách sử dụng.'
        : unit.status !== 'AVAILABLE' ? 'Kho đang được giữ cho đơn khác.'
        : unit.reservationUnits.some(allocation => allocation.reservationId === transfer.reservationId) ? 'Ô đích đã có phân bổ còn hiệu lực trong đơn này.'
        : unit.reservationUnits.length ? 'Kho có lịch đặt trùng thời gian thuê còn lại.'
        : priceBlocked ? 'Loại kho đích đang tạm dừng giao dịch theo khung giá.' : '';
      return { id: unit.id, unitCode: unit.unitNumber, floor: unit.floor, zone: unit.zone, row: unit.row, position: unit.position,
        storageType: { id: unit.storageType.id, code: unit.storageType.code, name: unit.storageType.name },
        dimensions: { widthCm: unit.storageType.widthCm, lengthCm: unit.storageType.lengthCm, heightCm: unit.storageType.heightCm },
        status: unit.status, eligible: !reason, unavailableReason: reason,
        monthlyRate: unit.storageType.monthlyRate === null ? null : Number(unit.storageType.monthlyRate),
        checkedFrom: this.iso(start), checkedUntil: this.iso(end),
        conflicts: unit.reservationUnits.map(allocation => ({ startDate: this.iso(allocation.plannedStartDate), endDate: this.iso(allocation.plannedEndDate) })),
      };
    }) };
  }

  async listForStaff(query: Record<string, unknown>, actor: PublicUser) {
    return this.listFiltered(query, ['APPROVED', 'COMPLETED', 'REJECTED'], actor.id,actor);
  }

  async getForStaff(id: string, actor: PublicUser) {
    const record = await this.prisma.transferRequest.findFirst({
      where: { closurePlanId: null, OR: [{ id }, { transferCode: id }], status: { in: ['APPROVED', 'COMPLETED', 'REJECTED'] }, assignedStaffUserId: actor.id,...transferTaskScope(actor), AND: [staffTransferReady()] },
      include: this.include(),
    });
    if (!record) throw new NotFoundException('Không tìm thấy lệnh chuyển kho dành cho Staff.');
    return this.toTransfer(record, { staffId: actor.id });
  }

  async assign(id: string, input: Record<string, unknown>, actor: PublicUser) {
    const staffId = managerAssignmentInput(actor, input);
    return this.serializable(async tx => {
      const identity = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, select: { id: true } });
      if (!identity) throw new NotFoundException('Không tìm thấy lệnh chuyển kho.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TransferRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.transferRequest.findUniqueOrThrow({ where: { id: identity.id }, include: this.include() });
      if (current.closurePlanId) throw new ConflictException('Sử dụng hồ sơ hỗ trợ di dời liên cơ sở.');
      const facilityId = await assertTaskFacility(tx,actor,{storageUnitId:current.fromStorageUnitId});
      if (current.status !== 'APPROVED') throw new ConflictException('Chỉ phân công lệnh chuyển kho đã duyệt.');
      await assertActiveAssignee(tx, staffId, actor, {storageUnitId:current.fromStorageUnitId});
      assertAssignmentVersion(input, current.assignedStaffUserId);
      if (current.assignedStaffUserId === staffId) return this.toTransfer(current);
      const progress = this.handoverData(current.handoverReport);
      await recordAssignment(tx,actor,"transfers",current.id,current.assignedStaffUserId,staffId,
        { ...physicalHandoff(input, Boolean(current.assignedStaffUserId && progress.destinationAccessDeliveredAt)), facilityId });
      return this.toTransfer(await tx.transferRequest.update({ where: { id: current.id }, data: { assignedStaffUserId: staffId }, include: this.include() }));
    }, 'Phân công vừa thay đổi. Vui lòng tải lại.');
  }

  async approve(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý được duyệt chuyển kho.');
    const toStorageUnitId = this.text(input.toStorageUnitId, 'toStorageUnitId');
    const requestedStaffId = input.staffUserId === undefined || input.staffUserId === ''
      ? undefined : managerAssignmentInput(actor, input);
    return this.serializable(async (tx) => {
      const identity = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, select: { id: true } });
      if (!identity) throw new NotFoundException('Không tìm thấy TransferRequest.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TransferRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.transferRequest.findUniqueOrThrow({ where: { id: identity.id }, include: this.include() });
      if (current.closurePlanId) throw new ConflictException('Sử dụng hồ sơ hỗ trợ di dời liên cơ sở.');
      const facilityId = await assertTaskFacility(tx,actor,{storageUnitId:current.fromStorageUnitId});
      if (['APPROVED', 'COMPLETED'].includes(current.status) && current.approvedByUserId === actor.id
        && current.toStorageUnitId === toStorageUnitId && (!requestedStaffId || current.assignedStaffUserId === requestedStaffId)) return this.toTransfer(current);
      if (current.status !== 'REQUESTED') throw new ConflictException('Chỉ Transfer REQUESTED mới được duyệt.');
      if (current.rentalContract.status !== 'ACTIVE' || current.rentalContract.reservationUnitId !== current.fromReservationUnitId || current.fromReservationUnit?.releasedAt || current.fromStorageUnit.status !== 'OCCUPIED') throw new ConflictException('Hợp đồng hoặc kho nguồn đã thay đổi. Vui lòng tải lại hồ sơ chuyển kho.');
      const staffId = requestedStaffId ?? current.assignedStaffUserId;
      if (staffId) await assertActiveAssignee(tx, staffId, actor, {storageUnitId:current.fromStorageUnitId});
      if (current.reason === 'OTHER') {
        const sourceType = await tx.storageType.findUniqueOrThrow({ where: { id: current.fromStorageUnit.storageTypeId }, select: { facilityId: true } });
        await lockPriceRange(tx, sourceType.facilityId, true);
        await tx.$queryRaw`SELECT id FROM "StorageType" WHERE id = ${current.fromStorageUnit.storageTypeId} FOR SHARE`;
      }
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${toStorageUnitId} FOR UPDATE`);
      const destination = await tx.storageUnit.findUnique({
        where: { id: toStorageUnitId }, include: { storageType: true, maintenanceRequests: destinationMaintenance,
          incidentBlocks: { where: { releasedAt: null }, select: { id: true }, take: 1 } },
      });
      if (!destination) throw new NotFoundException('Không tìm thấy unit đích.');
      if (destination.incidentBlocks?.length) throw new ConflictException('Ô đích đang tạm ngừng nhận thuê vì sự cố.');
      if (destination.status !== 'AVAILABLE') throw new ConflictException('Unit đích không còn AVAILABLE.');
      if (destination.maintenanceRequests?.length) throw new ConflictException('Kho đích có hồ sơ bảo trì đang mở.');
      if (destination.id === current.fromStorageUnitId) throw new ConflictException('Unit đích phải khác unit nguồn.');
      if (destination.storageTypeId !== current.fromStorageUnit.storageTypeId) throw new ConflictException('Chỉ chuyển sang kho cùng loại tại cùng cơ sở.');
      if (current.reason === 'OTHER') await assertListedPrice(tx, destination.storageType, true);
      const commercial = commercialPolicyApplies(current as never) ? await this.commercial?.prepare(tx, current, destination) : undefined;
      if (commercialPolicyApplies(current as never) && (!commercial || !commercial.adjustmentTerms || input.commercialReviewHash !== this.commercialReviewHash(commercial))) {
        throw new ConflictException('Xem và xác nhận lại phương án tài chính mới nhất trước khi duyệt.');
      }
      const start = this.today(); const end = current.rentalContract.endDate;
      if (end <= start) throw new ConflictException('Contract không còn khoảng thuê tương lai để chuyển unit.');
      const conflicting = await tx.reservationUnit.count({
        where: { storageUnitId: destination.id, ...liveDestinationConflicts(current.reservationId, start, end) },
      });
      if (conflicting) throw new ConflictException('Ô đích đã có phân bổ trong đơn này hoặc có lịch đặt trùng thời gian thuê.');
      const targetAllocation = await tx.reservationUnit.create({ data: { reservationId: current.reservationId, storageUnitId: destination.id, plannedStartDate: start, plannedEndDate: end } });
      const reserved = await tx.storageUnit.updateMany({ where: { id: destination.id, status: 'AVAILABLE' }, data: { status: 'RESERVED' } });
      if (reserved.count !== 1) throw new ConflictException('Unit đích vừa được sử dụng bởi thao tác khác.');
      await recordAssignment(tx,actor,'transfers',current.id,current.assignedStaffUserId,staffId, { facilityId });
      const updated = await tx.transferRequest.update({ where: { id: current.id }, data: { status: 'APPROVED', toStorageUnitId: destination.id, toReservationUnitId: targetAllocation.id, approvedByUserId: actor.id, assignedStaffUserId: staffId, approvedAt: new Date(), ...(commercial ? { commercialSnapshot: commercial } : { handoverReport: { stagedHandover: true } }) }, include: this.include() });
      return this.toTransfer(updated);
    }, 'Không thể duyệt Transfer do xung đột đồng thời.');
  }

  async reject(id: string, actor: PublicUser, input: Record<string, unknown> = {}) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý được từ chối chuyển kho.');
    const rejectionReason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (rejectionReason.length < 3 || rejectionReason.length > 2000) throw new BadRequestException('Ghi rõ lý do từ chối chuyển kho từ 3–2000 ký tự.');
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TransferRequest" WHERE "id" = ${id} OR "transferCode" = ${id} FOR UPDATE`);
      const current = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy TransferRequest.');
      if (current.closurePlanId) throw new ConflictException('Sử dụng hồ sơ hỗ trợ di dời liên cơ sở.');
      await assertTaskFacility(tx,actor,{storageUnitId:current.fromStorageUnitId});
      if (current.status === 'REJECTED' && current.rejectionReason === rejectionReason && current.approvedByUserId === actor.id) return this.toTransfer(current);
      if (current.status !== 'REQUESTED') throw new ConflictException('Chỉ Transfer REQUESTED mới được từ chối.');
      const updated = await tx.transferRequest.update({ where: { id: current.id }, data: { status: 'REJECTED', rejectionReason, approvedByUserId: actor.id, approvedAt: new Date() }, include: this.include() });
      if (current.supportRequestId) await tx.supportRequest.updateMany({ where: { id: current.supportRequestId, reservationId: current.reservationId, OR: [{ status: { not: 'RESOLVED' } }, { resolutionType: 'TRANSFER_RECOMMENDED' }] }, data: { status: 'RESOLVED', resolutionType: 'OTHER', resolutionNote: `Từ chối chuyển kho: ${rejectionReason}`, resolvedByUserId: actor.id, resolvedAt: new Date(), lastAction: 'TRANSFER_REJECTED' } });
      return this.toTransfer(updated);
    }, 'Không thể từ chối Transfer do xung đột đồng thời.');
  }

  async reportStaffProblem(id: string, actor: PublicUser, value: unknown) {
    const note = typeof value === 'string' ? value.trim() : '';
    if (note.length < 3 || note.length > 2000) throw new BadRequestException('Mô tả vướng mắc từ 3–2000 ký tự.');
    return this.serializable(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TransferRequest" WHERE "id" = ${id} OR "transferCode" = ${id} FOR UPDATE`);
      const current = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy lệnh chuyển kho.');
      if (current.closurePlanId) throw new ConflictException('Sử dụng hồ sơ hỗ trợ di dời liên cơ sở.');
      const facilityId = await assertTaskExecution(tx, actor, current.assignedStaffUserId, { storageUnitId: current.fromStorageUnitId });
      if (current.status !== 'APPROVED' || !current.toStorageUnitId || current.commercialSnapshot && !current.customerAcceptedAt) throw new ConflictException('Lệnh chuyển kho hiện không thể ghi nhận vướng mắc.');
      await assertTaskFacility(tx, actor, { storageUnitId: current.toStorageUnitId });
      const report = this.handoverData(current.handoverReport);
      const problems = Array.isArray(report.problems) ? report.problems : [];
      const latest = problems.at(-1);
      if (this.problemPending(report) && latest && typeof latest === 'object' && !Array.isArray(latest) && latest.note === note && latest.staffId === actor.id) {
        return this.toTransfer(current, { staffId: actor.id });
      }
      if (problems.length >= 50) throw new ConflictException('Đã đạt giới hạn ghi nhận. Hãy liên hệ quản lý về hồ sơ này.');
      const updated = await tx.transferRequest.update({ where: { id: current.id }, data: { handoverReport: {
        ...report, problems: [...problems, { note, staffId: actor.id, staffName: actor.fullName, reportedAt: new Date().toISOString() }],
      } as Prisma.InputJsonObject }, include: this.include() });
      await recordTaskEvent(tx, actor, 'TASK_ESCALATED', 'transfers', current.id, { reason: note, facilityId });
      return this.toTransfer(updated, { staffId: actor.id });
    }, 'Không thể lưu vướng mắc do hồ sơ vừa thay đổi.');
  }

  private handoverData(value: Prisma.JsonValue | null) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  private problemPending(report: Prisma.JsonObject) {
    return Array.isArray(report.problems) && report.problems.length > 0
      && this.handoverData(report.problemReview ?? null).problemCount !== report.problems.length;
  }

  advanceMove(id: string, actor: PublicUser, action: 'DELIVER_DESTINATION' | 'CUSTOMER_READY' | 'START_SOURCE', input: Record<string, unknown> = {}) {
    return this.serializable(async tx => {
      await tx.$queryRaw`SELECT id FROM "TransferRequest" WHERE id = ${id} FOR UPDATE`;
      const customer = action === 'CUSTOMER_READY';
      if (customer && actor.role !== 'STORAGE_CUSTOMER') throw new ForbiddenException();
      const row = await tx.transferRequest.findFirst({ where: { id, ...(customer ? { reservation: { customerId: actor.id } } : {}) },
        include: this.include() });
      if (!row) {
        throw new NotFoundException('Không tìm thấy hồ sơ chuyển kho.');
      }
      if (!customer) await assertTaskExecution(tx, actor, row.assignedStaffUserId, { storageUnitId: row.fromStorageUnitId });
      const report = this.handoverData(row.handoverReport);
      if (row.status !== 'APPROVED' || row.closurePlanId || row.commercialSnapshot || !row.toStorageUnitId || report.stagedHandover !== true) {
        throw new ConflictException('Hồ sơ chưa ở bước chuyển đồ.');
      }
      const field = customer ? 'customerMoveReadyAt' : action === 'START_SOURCE' ? 'sourceInspectionStartedAt' : 'destinationAccessDeliveredAt';
      if (report[field]) return customer ? { id, customerMoveReadyAt: report[field] } : this.toTransfer(row, { staffId: actor.id });
      if (this.problemPending(report)) throw new ConflictException('Hồ sơ đang chờ quản lý xử lý vướng mắc.');
      if (customer) {
        if (!report.destinationAccessDeliveredAt) throw new ConflictException('Chờ nhân viên bàn giao kho mới.');
      } else if (action === 'START_SOURCE') {
        if (!report.destinationAccessDeliveredAt || !report.customerMoveReadyAt) throw new ConflictException('Chờ khách báo đã chuyển đồ.');
        await assertCanStartDirectWork(tx, actor.id, 'transfers', id);
        await assertRoutineAccess(tx, [row.fromStorageUnitId, row.toStorageUnitId]);
      } else {
        if (input.destinationReady !== true || input.accessDelivered !== true) throw new BadRequestException('Xác nhận kho đích sẵn sàng và đã bàn giao quyền truy cập.');
        await assertTaskFacility(tx, actor, { storageUnitId: row.toStorageUnitId });
        await assertCanStartDirectWork(tx, actor.id, 'transfers', id);
        await tx.$queryRaw`SELECT id FROM "StorageUnit" WHERE id = ${row.toStorageUnitId} FOR UPDATE`;
        const destination = await tx.storageUnit.findUniqueOrThrow({ where: { id: row.toStorageUnitId },
          select: { status: true, incidentBlocks: { where: { releasedAt: null }, take: 1 },
            maintenanceRequests: { where: { activeKey: { not: null } }, take: 1 } } });
        await assertRoutineAccess(tx, [row.fromStorageUnitId, row.toStorageUnitId]);
        if (destination.status !== 'RESERVED' || destination.incidentBlocks.length || destination.maintenanceRequests.length) {
          throw new ConflictException('Kho đích chưa an toàn hoặc không còn được giữ cho hồ sơ này.');
        }
      }
      const at = new Date().toISOString();
      const updated = await tx.transferRequest.update({ where: { id }, data: { handoverReport: { ...report, [field]: at } }, include: this.include() });
      return customer ? { id, customerMoveReadyAt: at } : this.toTransfer(updated, { staffId: actor.id });
    }, 'Hồ sơ chuyển kho vừa thay đổi. Vui lòng tải lại.');
  }

  async reviewProblem(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý được xử lý vướng mắc chuyển kho.');
    const decision = input.decision;
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    const expected = input.expectedProblemCount;
    if ((decision !== 'CONTINUE' && decision !== 'CANCEL') || note.length < 3 || note.length > 2000
      || typeof expected !== 'number' || !Number.isInteger(expected) || expected < 1) {
      throw new BadRequestException('Cần quyết định, ghi chú và phiên bản báo cáo vướng mắc.');
    }
    return this.serializable(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TransferRequest" WHERE "id" = ${id} OR "transferCode" = ${id} FOR UPDATE`);
      const current = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy lệnh chuyển kho.');
      if (current.closurePlanId) throw new ConflictException('Sử dụng hồ sơ hỗ trợ di dời liên cơ sở.');
      await assertTaskFacility(tx, actor, { storageUnitId: current.fromStorageUnitId });
      const report = this.handoverData(current.handoverReport);
      const previous = this.handoverData(report.problemReview ?? null);
      const count = Array.isArray(report.problems) ? report.problems.length : 0;
      if (count === expected && previous.problemCount === expected && previous.decision === decision
        && previous.note === note && previous.managerId === actor.id) return this.toTransfer(current);
      if (current.status !== 'APPROVED' || count !== expected || !this.problemPending(report)) {
        throw new ConflictException('Hồ sơ vướng mắc đã thay đổi. Vui lòng tải lại.');
      }
      if (!current.toStorageUnitId || !current.toReservationUnitId || current.fromStorageUnitId === current.toStorageUnitId
        || current.fromStorageUnit.storageTypeId !== current.toStorageUnit?.storageTypeId) {
        throw new ConflictException('Không xác định được kho đích cùng loại của lệnh chuyển.');
      }
      await assertTaskFacility(tx, actor, { storageUnitId: current.toStorageUnitId });
      const now = new Date();
      if (decision === 'CANCEL') {
        if (report.destinationAccessDeliveredAt && (input.destinationAccessRevoked !== true || input.destinationEmpty !== true)) {
          throw new ConflictException('Xác nhận kho đích đã trống và đã thu hồi quyền truy cập trước khi hủy.');
        }
        const unitId = current.toStorageUnitId;
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${unitId} FOR UPDATE`);
        const released = await tx.reservationUnit.updateMany({
          where: { id: current.toReservationUnitId, reservationId: current.reservationId, storageUnitId: unitId, releasedAt: null,
            contract: null, outgoingTransfers: { none: { status: { in: ['REQUESTED', 'APPROVED'] } } } },
          data: { releasedAt: now },
        });
        if (released.count !== 1) throw new ConflictException('Kho đích không còn là phân bổ giữ riêng của lệnh chuyển.');
        const otherHold = await tx.reservationUnit.count({ where: { storageUnitId: unitId, releasedAt: null } });
        if (!otherHold) {
          const maintenance = await tx.maintenanceRequest.count({ where: { storageUnitId: unitId, activeKey: { not: null } } });
          await tx.storageUnit.updateMany({ where: { id: unitId, status: 'RESERVED' }, data: { status: maintenance ? 'MAINTENANCE' : 'AVAILABLE' } });
        }
        if (current.supportRequestId) await tx.supportRequest.updateMany({
          where: { id: current.supportRequestId, reservationId: current.reservationId,
            OR: [{ status: { not: 'RESOLVED' } }, { resolutionType: 'TRANSFER_RECOMMENDED' }] },
          data: { status: 'RESOLVED', resolutionType: 'OTHER', resolutionNote: 'Đã hủy chuyển kho: ' + note,
            resolvedByUserId: actor.id, resolvedAt: now, lastAction: 'TRANSFER_CANCELLED' },
        });
      }
      const review = { decision, note, problemCount: count, managerId: actor.id, managerName: actor.fullName, reviewedAt: now.toISOString(),
        ...(decision === 'CANCEL' && report.destinationAccessDeliveredAt ? { destinationAccessRevoked: true, destinationEmpty: true } : {}) };
      const history = Array.isArray(report.problemReviewHistory) ? report.problemReviewHistory : [];
      return this.toTransfer(await tx.transferRequest.update({ where: { id: current.id }, data: {
        ...(decision === 'CANCEL' ? { status: 'REJECTED', rejectionReason: note } : {}),
        handoverReport: { ...report, problemReview: review, problemReviewHistory: [...history, review] },
      }, include: this.include() }));
    }, 'Hồ sơ vừa thay đổi. Vui lòng tải lại.');
  }

  async complete(id: string, actor: PublicUser, input: Record<string, unknown> = {}) {
    return this.serializable(async (tx) => {
      const identity = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, select: { id: true } });
      if (!identity) throw new NotFoundException('Không tìm thấy TransferRequest.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TransferRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.transferRequest.findUniqueOrThrow({ where: { id: identity.id }, include: this.include() });
      if (current.closurePlanId) throw new ConflictException('Sử dụng hồ sơ hỗ trợ di dời liên cơ sở.');
      await assertTaskFacility(tx,actor,{storageUnitId:current.fromStorageUnitId});
      const facilityId = await assertTaskExecution(tx,actor,current.assignedStaffUserId,{storageUnitId:current.fromStorageUnitId});
      if(current.toStorageUnitId) await assertTaskFacility(tx,actor,{storageUnitId:current.toStorageUnitId});
      if (current.status === 'COMPLETED') {
        await this.resolveLinkedTransferSupport(tx, current, actor);
        await this.ensureSourceMaintenance(tx, current, actor);
        return this.toTransfer(await tx.transferRequest.findUniqueOrThrow({ where: { id: current.id }, include: this.include() }), { staffId: actor.id });
      }
      if (current.status !== 'APPROVED' || !current.toStorageUnitId || !current.toReservationUnitId) throw new ConflictException('Chỉ Transfer APPROVED mới được hoàn tất.');
      if (this.problemPending(this.handoverData(current.handoverReport))) throw new ConflictException('Chờ quản lý xử lý vướng mắc trước khi bàn giao.');
      const progress = this.handoverData(current.handoverReport);
      if (progress.stagedHandover === true && (!progress.destinationAccessDeliveredAt || !progress.customerMoveReadyAt || !progress.sourceInspectionStartedAt)) {
        throw new ConflictException('Cần bàn giao kho đích, nhận thông báo của khách và bắt đầu kiểm tra kho nguồn.');
      }
      if (progress.stagedHandover === true) await assertCanStartDirectWork(tx, actor.id, 'transfers', current.id);
      if (current.fromStorageUnit.storageTypeId !== current.toStorageUnit?.storageTypeId) throw new ConflictException('Chỉ bàn giao chuyển kho cùng loại tại đây.');
      if (input.destinationReady !== true) throw new BadRequestException('Cần xác nhận kho đích đã sẵn sàng.');
      await assertRoutineAccess(tx, [current.fromStorageUnitId, current.toStorageUnitId]);
      const handover = transferHandover(input);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RentalContract" WHERE "id" = ${current.rentalContractId} FOR UPDATE`);

      // Personal-item records remain historical and do not gate a physical unit transfer.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" IN (${current.fromStorageUnitId}, ${current.toStorageUnitId}) FOR UPDATE`);
      if (current.fromStorageUnit.status !== 'OCCUPIED' || current.toStorageUnit?.status !== 'RESERVED') throw new ConflictException('Trạng thái vật lý của unit đã thay đổi.');
      if (await tx.maintenanceRequest.count({ where: { storageUnitId: current.toStorageUnitId, activeKey: { not: null } } })
        || await tx.incidentUnitBlock.count({ where: { storageUnitId: current.toStorageUnitId, releasedAt: null } })) {
        throw new ConflictException('Kho đích có hồ sơ bảo trì đang mở. Báo vướng mắc cho quản lý trước khi bàn giao.');
      }
      const now = new Date();
      let commercialSettlement;
      if (current.commercialSnapshot) {
        if (!this.handoverData(current.commercialSnapshot).adjustmentTerms || !this.commercial || !current.customerAcceptedAt || !current.commercialSignedSnapshot ||
          snapshotHash(signedDocument(current.commercialSignedSnapshot)) !== snapshotHash(current.commercialSnapshot)) {
          throw new ConflictException('Khách cần ký đúng phụ lục trước khi bàn giao.');
        }
        commercialSettlement = await this.commercial.apply(tx, current);
      }
      await tx.rentalContract.update({ where: { id: current.rentalContractId }, data: { reservationUnitId: current.toReservationUnitId } });
      await tx.reservationUnit.update({ where: { id: current.fromReservationUnitId }, data: { releasedAt: now, actualVacatedAt: now } });
      await tx.storageUnit.update({ where: { id: current.fromStorageUnitId }, data: { status: 'MAINTENANCE' } });
      await tx.storageUnit.update({ where: { id: current.toStorageUnitId }, data: { status: 'OCCUPIED' } });
      const completed = await tx.transferRequest.update({ where: { id: current.id }, data: { status: 'COMPLETED', completedByUserId: actor.id, completedAt: now, ...(commercialSettlement ? { commercialSettlement } : {}), handoverReport: { ...this.handoverData(current.handoverReport), ...handover, recordedByUserId: actor.id, recordedByName: actor.fullName, recordedAt: now.toISOString() } as Prisma.InputJsonObject }, include: this.include() });
      await recordTaskEvent(tx, actor, 'TASK_STAFF_COMPLETED', 'transfers', current.id, { facilityId });
      await this.resolveLinkedTransferSupport(tx, completed, actor);
      await this.ensureSourceMaintenance(tx, completed, actor);
      return this.toTransfer(await tx.transferRequest.findUniqueOrThrow({ where: { id: current.id }, include: this.include() }), { staffId: actor.id });
    }, 'Không thể hoàn tất Transfer do xung đột đồng thời.');
  }

  async confirmCommercialRefund(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    const reference = typeof input.reference === 'string' ? input.reference.trim() : '';
    if (input.refunded !== true || reference.length < 3 || reference.length > 120) throw new BadRequestException('Cần xác nhận đã chuyển tiền và mã giao dịch thực tế.');
    return this.serializable(async tx => {
      await tx.$queryRaw`SELECT id FROM "TransferRequest" WHERE id=${id} OR "transferCode"=${id} FOR UPDATE`;
      const current = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }], status: 'COMPLETED', closurePlanId: null } });
      if (!current) throw new NotFoundException('Không tìm thấy hồ sơ chuyển kho đã bàn giao.');
      await assertTaskFacility(tx, actor, { storageUnitId: current.fromStorageUnitId });
      const terms = current.commercialSettlement as (Prisma.JsonObject & { refundAmount?: number; refundState?: string; refundReference?: string }) | null;
      if (!terms?.refundAmount || terms.refundAmount !== input.amount) throw new ConflictException('Số tiền cần hoàn vừa thay đổi.');
      if (terms.refundState === 'REFUNDED' && terms.refundReference === reference) return terms;
      if (terms.refundState !== 'PENDING') throw new ConflictException('Hồ sơ đã xử lý khoản hoàn.');
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`booking-refund:${reference}`}))`;
      const reused = await tx.transferRequest.count({ where: { id: { not: current.id }, commercialSettlement: { path: ['refundReference'], equals: reference } } });
      if (reused || await tx.reservation.count({ where: { paidCancellation: { path: ['refundReference'], equals: reference } } })) throw new ConflictException('Mã giao dịch hoàn tiền đã được dùng.');
      const settlement = { ...terms, refundState: 'REFUNDED', refundReference: reference, refundedAt: new Date().toISOString(), refundedBy: actor.id };
      await tx.transferRequest.update({ where: { id: current.id }, data: { commercialSettlement: settlement } });
      await tx.auditEvent.create({ data: { action: 'TRANSFER_REFUND_CONFIRMED', category: 'ACTIVITY', outcome: 'SUCCESS', actorId: actor.id,
        actorRole: actor.role, actorName: actor.fullName, actorEmail: actor.email, resource: 'transfers', resourceId: current.id, method: 'POST', route: '/manager/transfers/:id/commercial-refund', httpStatus: 201,
        metadata: { amount: terms.refundAmount, reference } } });
      return settlement;
    }, 'Hồ sơ hoàn tiền vừa thay đổi.');
  }

  private async ensureSourceMaintenance(tx: Prisma.TransactionClient, transfer: any, actor: PublicUser) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${transfer.fromStorageUnitId} FOR UPDATE`);
    const source = await tx.storageUnit.findUnique({ where: { id: transfer.fromStorageUnitId }, select: { id: true, status: true } });
    if (source?.status !== 'MAINTENANCE') return;
    const activeKey = `MAINTENANCE:${source.id}`;
    const createIdempotencyKey = `TRANSFER:${transfer.id}`;
    if (await tx.maintenanceRequest.findUnique({ where: { activeKey } })) return;
    if (await tx.maintenanceRequest.findUnique({ where: { createIdempotencyKey } })) return;
    await tx.maintenanceRequest.create({ data: {
      maintenanceCode: `${transfer.transferCode}-MNT`, storageUnitId: source.id, source: 'MANUAL',
      category: transfer.reason === 'FACILITY_EQUIPMENT_FAILURE' ? 'FACILITY_EQUIPMENT' : transfer.reason === 'OPERATIONAL_RELOCATION' ? 'CLEANING' : 'UNIT_DAMAGE',
      priority: 'MEDIUM', status: 'OPEN', description: `Kiểm tra kho ${transfer.fromStorageUnit.unitNumber} sau lệnh chuyển ${transfer.transferCode}.`,
      reportedByUserId: actor.id, activeKey, createIdempotencyKey,
    } });
  }

  private async resolveLinkedTransferSupport(tx: Prisma.TransactionClient, transfer: any, actor: PublicUser) {
    if (!transfer.supportRequestId) return;
    const support = await tx.supportRequest.findUnique({ where: { id: transfer.supportRequestId } });
    if (!support || support.reservationId !== transfer.reservationId || (support.rentalContractId && support.rentalContractId !== transfer.rentalContractId)) throw new ConflictException('Yêu cầu gốc không khớp hợp đồng chuyển kho.');
    const transferSubject = isTransferSubject(support.subject);
    if (!transferSubject && support.resolutionType !== 'TRANSFER_RECOMMENDED') return;
    if (support.status === 'RESOLVED' && support.resolutionType !== 'TRANSFER_RECOMMENDED') return;
    const resolutionNote = `Đã hoàn tất chuyển kho từ ${transfer.fromStorageUnit.unitNumber} sang ${transfer.toStorageUnit.unitNumber}. Lệnh ${transfer.transferCode}, hợp đồng ${transfer.rentalContract.contractCode}.`;
    await tx.supportRequest.updateMany({
      where: { id: support.id, reservationId: transfer.reservationId, OR: [{ status: { not: 'RESOLVED' } }, { resolutionType: 'TRANSFER_RECOMMENDED' }] },
      data: { status: 'RESOLVED', resolutionType: 'ON_SITE_RESOLVED', resolutionNote, resolvedByUserId: actor.id, resolvedAt: transfer.completedAt ?? new Date(), lastAction: 'TRANSFER_COMPLETED', lastActionIdempotencyKey: null },
    });
  }

  private include(includeAssignee = true): Prisma.TransferRequestInclude { return {
    reservation: { select: { id: true, reservationCode: true, quantity: true, startDate: true, endDate: true, facility: { select: { id: true, name: true } }, quoteSnapshot: true, customer: { select: { fullName: true } },
      invoices: { where: transferDebtWhere(), select: { id: true, invoiceCode: true, balanceDue: true }, orderBy: { dueAt: 'asc' } },
      renewals: { where: renewalAwaitingCurrentInvoice(), select: { id: true }, take: 1 } } },
    rentalContract: { select: { id: true, contractCode: true, status: true, startDate: true, endDate: true, reservationUnitId: true } },
    fromReservationUnit: { select: { releasedAt: true } },
    fromStorageUnit: { include: { storageType: { select: { id: true, code: true, name: true, facility: { select: { id: true, name: true } } } }, maintenanceRequests: { where: { activeKey: { not: null } }, select: { id: true, maintenanceCode: true, status: true, assignedStaffUserId: true }, take: 1 } } },
    toStorageUnit: { include: { storageType: { select: { id: true, code: true, name: true, facility: { select: { id: true, name: true } } } } } },
    ...(includeAssignee ? { assignedStaff: { select: operationalAssignee } } : {}),
    requestedBy: { select: { id: true, fullName: true, role: true } }, approvedBy: { select: { id: true, fullName: true, role: true } }, completedBy: { select: { id: true, fullName: true, role: true } },
    supportRequest: { select: { id: true, supportCode: true, status: true, resolutionType: true, assignedStaffUserId: true, subject: true, description: true, transferRequestedStartAt: true, transferRequestedEndAt: true } },
  }; }
  private toTransfer(record: any, { staffId, customer = false }: { staffId?: string; customer?: boolean } = {}) {
    const support = record.supportRequest;
    const maintenance = record.fromStorageUnit.maintenanceRequests?.[0];
    const commercialPayment = record.commercialSnapshot && record.status === 'APPROVED' ? {
      dueInvoices: (record.reservation.invoices ?? []).map((invoice: { id: string; invoiceCode: string; balanceDue: bigint }) => ({ id: invoice.id, code: invoice.invoiceCode, balanceDue: Number(invoice.balanceDue) })),
      pendingRenewalInvoice: Boolean(record.reservation.renewals?.length),
    } : null;
    const { problems: _problems, problemReview: _review, problemReviewHistory: _history, photos: _photos, ...customerReport } = this.handoverData(record.handoverReport);
    const handoverReport = customer ? Object.keys(customerReport).length ? customerReport : null : record.handoverReport ?? null;
    return { ...(staffId && record.reservation.facility ? { facility: record.reservation.facility } : {}), id: record.id, transferCode: record.transferCode, status: record.status, commercialSettlement: staffId ? null : this.settlementView(record.commercialSettlement, customer), commercialPayment: staffId ? null : commercialPayment, transferRequestedSchedule: transferProposalView(support), rejectionReason: record.rejectionReason ?? null, handoverReport, ...(customer ? {} : { assignedStaff: record.assignedStaff, coordination: workPhase('transfers', { ...record, ...transferWork(record) }) }), reason: record.reason, requestDescription: support?.description ?? null, ...(!customer && record.reservation.customer ? { customer: record.reservation.customer } : {}), commercial: record.commercialSnapshot ? staffId ? { acceptedAt: record.customerAcceptedAt?.toISOString() ?? null } : { snapshot: record.commercialSnapshot, snapshotHash: snapshotHash(record.commercialSnapshot), acceptedAt: record.customerAcceptedAt?.toISOString() ?? null, acceptanceName: record.customerAcceptanceName, signatureImage: record.customerSignatureImage, verification: signatureVerification(record.commercialSignedSnapshot), otp: this.signing?.availability() ?? { emailConfigured: false } } : null, reservation: { id: record.reservation.id, reference: record.reservation.reservationCode, startDate: this.iso(record.reservation.startDate), endDate: this.iso(record.reservation.endDate) }, contract: { id: record.rentalContract.id, contractCode: record.rentalContract.contractCode, status: record.rentalContract.status, startDate: this.iso(record.rentalContract.startDate), endDate: this.iso(record.rentalContract.endDate) }, fromUnit: this.unit(record.fromStorageUnit, Boolean(staffId), !customer), toUnit: record.toStorageUnit ? this.unit(record.toStorageUnit, Boolean(staffId), !customer) : null, supportRequest: !customer && support && (!staffId || support.assignedStaffUserId === staffId && !isTransferSubject(support.subject ?? '')) ? { id: support.id, supportCode: support.supportCode, status: support.status, resolutionType: support.resolutionType } : null, sourceMaintenance: !customer && maintenance && (!staffId || maintenance.assignedStaffUserId === staffId) ? { id: maintenance.id, maintenanceCode: maintenance.maintenanceCode, status: maintenance.status } : null, sourceMaintenanceMissing: !customer && record.fromStorageUnit.status === 'MAINTENANCE' && !record.fromStorageUnit.maintenanceRequests?.length, requestedBy: record.requestedBy, approvedBy: record.approvedBy, completedBy: record.completedBy, approvedAt: record.approvedAt?.toISOString() ?? null, completedAt: record.completedAt?.toISOString() ?? null, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() }; }
  private unit(unit: any, includeLocation = false, includeFacility = false) {
    const { facility, ...storageType } = unit.storageType ?? {};
    return { id: unit.id, unitCode: unit.unitNumber, status: unit.status, storageType: unit.storageType ? storageType : unit.storageType,
      ...(includeFacility && facility ? { facility } : {}),
      ...(includeLocation ? { floor: unit.floor, zone: unit.zone, row: unit.row, position: unit.position } : {}) };
  }
  private text(value: unknown, label: string) { if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${label} là bắt buộc.`); return value.trim(); }
  private integer(value: unknown, fallback: number, max: number, label: string) { if (value === undefined) return fallback; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new BadRequestException(`${label} không hợp lệ.`); return parsed; }
  private today() { return businessToday(); }
  private iso(value: Date) { return value.toISOString().slice(0, 10); }
  private prismaCode(error: unknown, code: string) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code; }
  private postgresState(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
    const adapter = error.meta?.driverAdapterError as { cause?: { originalCode?: string } } | undefined;
    return adapter?.cause?.originalCode ?? error.meta?.code;
  }

  private settlementView(value: Prisma.JsonValue | undefined, customer: boolean) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!customer) return value;
    const { amountDue, refundAmount, refundState, refundedAt, depositAdjustment, fee, rentalAdjustment, invoiceId, moveDate } = value;
    return { amountDue, refundAmount, refundState, refundedAt, depositAdjustment, fee, rentalAdjustment, invoiceId, moveDate };
  }
  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, message: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
      } catch (error) {
        const sqlState = this.postgresState(error);
        // A raw SELECT FOR UPDATE can surface PostgreSQL's serialization failure as P2010.
        const concurrent = this.prismaCode(error, 'P2034') || sqlState === '40001' || sqlState === '40P01';
        if (concurrent && attempt < 2) continue;
        if (concurrent || this.prismaCode(error, 'P2002') || sqlState === '23P01') throw new ConflictException(message);
        throw error;
      }
    }
    throw new ConflictException(message);
  }
}

export function transferHandover(input: Record<string, unknown>) {
  if (input.oldKeysReturned !== true || input.newKeysDelivered !== true || input.goodsMoved !== true) throw new BadRequestException('Cần xác nhận kho cũ đã trống, đã thu quyền truy cập cũ và đã bàn giao quyền truy cập kho mới.');
  const recipientName = typeof input.recipientName === 'string' ? input.recipientName.trim() : '';
  if (recipientName.length < 2 || recipientName.length > 120) throw new BadRequestException('Nhập tên người nhận kho mới, từ 2 đến 120 ký tự.');
  const returnedKeyCount = input.returnedKeyCount, deliveredKeyCount = input.deliveredKeyCount;
  for (const count of [returnedKeyCount, deliveredKeyCount]) if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > 50) throw new BadRequestException('Số chìa khóa/thẻ phải là số nguyên từ 0 đến 50.');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 2000 || ((returnedKeyCount === 0 || deliveredKeyCount === 0) && note.length < 3)) throw new BadRequestException('Nếu không có chìa khóa/thẻ vật lý, ghi rõ việc thu hồi và cấp lại quyền truy cập.');
  const photos = evidencePhotos(input.photos);
  return { ...(photos.length ? { photos } : {}), oldKeysReturned: true, newKeysDelivered: true, goodsMoved: true, recipientName, returnedKeyCount: returnedKeyCount as number, deliveredKeyCount: deliveredKeyCount as number, note };
}
import { assertRoutineAccess } from '../facilities/facility-safety.js';
