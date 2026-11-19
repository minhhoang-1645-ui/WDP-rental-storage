import { assertActiveAssignee, assertTaskAssignee, managerAssignmentInput, operationalAssignee } from '../unit-staff/operational-assignment.js';
import { assertTransferIntakeAvailable, createLinkedTransfer, isTransferSubject } from './transfer-intake.js';
import { Optional } from '@nestjs/common';
import { UnitStaffService } from '../unit-staff/unit-staff.service.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { businessToday } from '../../business-date.js';
import { transferProposalView } from './transfer-schedule.js';
import { TransferCommercialService } from './transfer-commercial.service.js';
import { SigningOtpService, signedEnvelope, signatureVerification } from '../signing/signing-otp.service.js';
import { snapshotHash, validateSignature } from '../contracts/signature.js';
import type { PublicUser } from '../auth/auth.types.js';

const statuses = ['REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'] as const;

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly unitStaff?: UnitStaffService, @Optional() private readonly commercial?: TransferCommercialService, @Optional() private readonly signing?: SigningOtpService) {}

  async listCustomer(customer: PublicUser) {
    const rows = await this.prisma.transferRequest.findMany({ where: { reservation: { customerId: customer.id }, commercialSnapshot: { not: Prisma.DbNull } }, omit: { assignedStaffUserId: true }, include: this.include(false), orderBy: { createdAt: 'desc' } });
    return { items: rows.map(row => this.toTransfer(row, { customer: true })), total: rows.length, page: 1, limit: Math.max(1, rows.length) };
  }
  async getCustomerOrder(customer: PublicUser, id: string) {
    const row = await this.prisma.transferRequest.findFirst({ where: { id, reservation: { customerId: customer.id } }, omit: { assignedStaffUserId: true }, include: this.include(false) });
    if (!row?.commercialSnapshot) throw new NotFoundException('Không tìm thấy phụ lục thuộc tài khoản này.');
    return this.toTransfer(row, { customer: true });
  }
  async previewCommercial(id: string, destinationId: string) {
    const transfer = await this.prisma.transferRequest.findFirst({ where: { id }, include: this.include() });
    if (!transfer || transfer.status !== 'REQUESTED') throw new NotFoundException('Không có lệnh chuyển đang chọn kho đích.');
    const destination = await this.prisma.storageUnit.findUnique({ where: { id: destinationId } });
    if (!destination) throw new NotFoundException('Không tìm thấy kho đích.');
    if (destination.storageTypeId === transfer.fromStorageUnit.storageTypeId) return { sameType: true, message: 'Cùng loại, giữ giá và thời hạn.' };
    if (!this.commercial) throw new ConflictException('Chưa lập được phụ lục đổi loại.');
    return { sameType: false, snapshot: await this.prisma.$transaction(tx => this.commercial!.prepare(tx, transfer, destination)) };
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
    if (actor.role !== 'MANAGER') throw new ForbiddenException('Chỉ quản lý tiếp nhận yêu cầu chuyển kho cũ.');
    return this.serializable(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SupportRequest" WHERE "id" = ${id} FOR UPDATE`);
      const support = await tx.supportRequest.findUnique({ where: { id }, include: { transferRequests: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } } } });
      if (!support || !isTransferSubject(support.subject)) throw new NotFoundException('Không tìm thấy yêu cầu chuyển kho của khách.');
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

  async list(query: Record<string, unknown>) {
    return this.listFiltered(query);
  }

  private async listFiltered(query: Record<string, unknown>, allowedStatuses: readonly (typeof statuses)[number][] = [], assignedStaffUserId?: string) {
    const page = this.integer(query.page, 1, 100000, 'page'); const limit = this.integer(query.limit, 20, 100, 'limit');
    const status = typeof query.status === 'string' && query.status ? query.status : undefined;
    if (status && !statuses.includes(status as never)) throw new BadRequestException('Transfer status không hợp lệ.');
    if (status && allowedStatuses.length && !allowedStatuses.includes(status as (typeof statuses)[number])) throw new BadRequestException('Transfer status không hợp lệ cho vai trò hiện tại.');
    const search = typeof query.search === 'string' && query.search.trim() ? query.search.trim() : undefined;
    if (search && search.length > 120) throw new BadRequestException('search tối đa 120 ký tự.');
    const where: Prisma.TransferRequestWhereInput = {
      ...(assignedStaffUserId ? { assignedStaffUserId } : {}),
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

  async get(id: string) {
    const record = await this.prisma.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, include: this.include() });
    if (!record) throw new NotFoundException('Không tìm thấy TransferRequest.');
    return this.toTransfer(record);
  }

  async destinations(id: string, query: Record<string, unknown>) {
    const page = this.integer(query.page, 1, 100000, 'page');
    const limit = this.integer(query.limit, 20, 100, 'limit');
    const transfer = await this.prisma.transferRequest.findFirst({
      where: { OR: [{ id }, { transferCode: id }] },
      include: { fromStorageUnit: true, rentalContract: true },
    });
    if (!transfer) throw new NotFoundException('Không tìm thấy yêu cầu chuyển kho.');
    const start = this.today(), end = transfer.rentalContract.endDate;
    const sourceType = query.includeOtherTypes === 'true' ? await this.prisma.storageType.findUniqueOrThrow({ where: { id: transfer.fromStorageUnit.storageTypeId }, select: { facilityId: true } }) : null;
    const where = { ...(query.includeOtherTypes === 'true' ? { storageType: { facilityId: sourceType!.facilityId } } : { storageTypeId: transfer.fromStorageUnit.storageTypeId }), id: { not: transfer.fromStorageUnitId } };
    const total = await this.prisma.storageUnit.count({ where });
    const units = await this.prisma.storageUnit.findMany({
      where, skip: (page - 1) * limit, take: limit, orderBy: [{ unitNumber: 'asc' }, { id: 'asc' }],
      include: { storageType: true, reservationUnits: {
        where: { releasedAt: null, plannedStartDate: { lt: end }, plannedEndDate: { gt: start }, reservation: { status: 'CONFIRMED' } },
        select: { plannedStartDate: true, plannedEndDate: true }, orderBy: { plannedStartDate: 'asc' },
      } },
    });
    return { page, limit, total, items: units.map(unit => {
      const reason = transfer.status !== 'REQUESTED' ? 'Yêu cầu đã được xử lý. Mở lại hồ sơ để xem kết quả.'
        : transfer.rentalContract.status !== 'ACTIVE' || end <= start ? 'Hợp đồng không còn kỳ thuê đang hoạt động.'
        : transfer.rentalContract.reservationUnitId !== transfer.fromReservationUnitId || transfer.fromStorageUnit.status !== 'OCCUPIED' ? 'Kho nguồn đã thay đổi. Vui lòng kiểm tra lại hồ sơ trước khi chuyển.'
        : unit.status === 'MAINTENANCE' ? 'Kho đang bảo trì.' : unit.status === 'OCCUPIED' ? 'Kho đang có khách sử dụng.'
        : unit.status !== 'AVAILABLE' ? 'Kho đang được giữ cho đơn khác.'
        : unit.reservationUnits.length ? 'Kho có lịch đặt trùng thời gian thuê còn lại.' : '';
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
    return this.listFiltered(query, ['APPROVED', 'COMPLETED'], actor.id);
  }

  async getForStaff(id: string, actor: PublicUser) {
    const record = await this.prisma.transferRequest.findFirst({
      where: { OR: [{ id }, { transferCode: id }], status: { in: ['APPROVED', 'COMPLETED'] }, assignedStaffUserId: actor.id },
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
      if (current.status !== 'APPROVED') throw new ConflictException('Chỉ phân công lệnh chuyển kho đã duyệt.');
      await assertActiveAssignee(tx, staffId);
      if (current.assignedStaffUserId === staffId) return this.toTransfer(current);
      return this.toTransfer(await tx.transferRequest.update({ where: { id: current.id }, data: { assignedStaffUserId: staffId }, include: this.include() }));
    }, 'Phân công vừa thay đổi. Vui lòng tải lại.');
  }

  async approve(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'MANAGER') throw new ForbiddenException('Chỉ quản lý được duyệt chuyển kho.');
    const toStorageUnitId = this.text(input.toStorageUnitId, 'toStorageUnitId');
    const requestedStaffId = input.staffUserId === undefined || input.staffUserId === ''
      ? undefined : managerAssignmentInput(actor, input);
    return this.serializable(async (tx) => {
      const identity = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, select: { id: true } });
      if (!identity) throw new NotFoundException('Không tìm thấy TransferRequest.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TransferRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${toStorageUnitId} FOR UPDATE`);
      const current = await tx.transferRequest.findUniqueOrThrow({ where: { id: identity.id }, include: this.include() });
      if (['APPROVED', 'COMPLETED'].includes(current.status) && current.approvedByUserId === actor.id
        && current.toStorageUnitId === toStorageUnitId && (!requestedStaffId || current.assignedStaffUserId === requestedStaffId)) return this.toTransfer(current);
      if (current.status !== 'REQUESTED') throw new ConflictException('Chỉ Transfer REQUESTED mới được duyệt.');
      if (current.rentalContract.status !== 'ACTIVE' || current.rentalContract.reservationUnitId !== current.fromReservationUnitId || current.fromReservationUnit?.releasedAt || current.fromStorageUnit.status !== 'OCCUPIED') throw new ConflictException('Hợp đồng hoặc kho nguồn đã thay đổi. Vui lòng tải lại hồ sơ chuyển kho.');
      const staffId = requestedStaffId ?? (await this.unitStaff?.resolveStaff(tx, [current.fromStorageUnitId]))?.staffUserId;
      if (!staffId) throw new BadRequestException('Kho nguồn chưa có người phụ trách đang hoạt động. Hãy chọn nhân viên thực hiện.');
      await assertActiveAssignee(tx, staffId);
      const destination = await tx.storageUnit.findUnique({ where: { id: toStorageUnitId }, include: { storageType: true } });
      if (!destination) throw new NotFoundException('Không tìm thấy unit đích.');
      if (destination.status !== 'AVAILABLE') throw new ConflictException('Unit đích không còn AVAILABLE.');
      if (destination.id === current.fromStorageUnitId) throw new ConflictException('Unit đích phải khác unit nguồn.');
      const differentType = destination.storageTypeId !== current.fromStorageUnit.storageTypeId;
      let commercialSnapshot: Prisma.InputJsonValue | undefined;
      if (differentType) {
        if (!this.commercial) throw new ConflictException('Chưa bật lập phụ lục đổi loại.');
        const sourceType = await tx.storageType.findUniqueOrThrow({ where: { id: current.fromStorageUnit.storageTypeId } });
        if (sourceType.facilityId !== destination.storageType.facilityId) throw new ConflictException('Kho đích phải cùng cơ sở.');
        commercialSnapshot = await this.commercial.prepare(tx, current, destination) as unknown as Prisma.InputJsonValue;
      }
      const start = this.today(); const end = current.rentalContract.endDate;
      if (end <= start) throw new ConflictException('Contract không còn khoảng thuê tương lai để chuyển unit.');
      const conflicting = await tx.reservationUnit.count({ where: { storageUnitId: destination.id, releasedAt: null, plannedStartDate: { lt: end }, plannedEndDate: { gt: start }, reservation: { status: 'CONFIRMED' } } });
      if (conflicting) throw new ConflictException('Unit đích có confirmed allocation trùng khoảng thuê còn lại.');
      const targetAllocation = await tx.reservationUnit.create({ data: { reservationId: current.reservationId, storageUnitId: destination.id, plannedStartDate: start, plannedEndDate: end } });
      const reserved = await tx.storageUnit.updateMany({ where: { id: destination.id, status: 'AVAILABLE' }, data: { status: 'RESERVED' } });
      if (reserved.count !== 1) throw new ConflictException('Unit đích vừa được sử dụng bởi thao tác khác.');
      const updated = await tx.transferRequest.update({ where: { id: current.id }, data: { status: 'APPROVED', toStorageUnitId: destination.id, toReservationUnitId: targetAllocation.id, approvedByUserId: actor.id, assignedStaffUserId: staffId, approvedAt: new Date(), ...(commercialSnapshot ? { commercialSnapshot } : {}) }, include: this.include() });
      return this.toTransfer(updated);
    }, 'Không thể duyệt Transfer do xung đột đồng thời.');
  }

  async reject(id: string, actor: PublicUser, input: Record<string, unknown> = {}) {
    if (actor.role !== 'MANAGER') throw new ForbiddenException('Chỉ quản lý được từ chối chuyển kho.');
    const rejectionReason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (rejectionReason.length < 3 || rejectionReason.length > 2000) throw new BadRequestException('Ghi rõ lý do từ chối chuyển kho từ 3–2000 ký tự.');
    return this.serializable(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TransferRequest" WHERE "id" = ${id} OR "transferCode" = ${id} FOR UPDATE`);
      const current = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, include: this.include() });
      if (!current) throw new NotFoundException('Không tìm thấy TransferRequest.');
      if (current.status === 'REJECTED' && current.rejectionReason === rejectionReason && current.approvedByUserId === actor.id) return this.toTransfer(current);
      if (current.status !== 'REQUESTED') throw new ConflictException('Chỉ Transfer REQUESTED mới được từ chối.');
      const updated = await tx.transferRequest.update({ where: { id: current.id }, data: { status: 'REJECTED', rejectionReason, approvedByUserId: actor.id, approvedAt: new Date() }, include: this.include() });
      if (current.supportRequestId) await tx.supportRequest.updateMany({ where: { id: current.supportRequestId, reservationId: current.reservationId, OR: [{ status: { not: 'RESOLVED' } }, { resolutionType: 'TRANSFER_RECOMMENDED' }] }, data: { status: 'RESOLVED', resolutionType: 'OTHER', resolutionNote: `Từ chối chuyển kho: ${rejectionReason}`, resolvedByUserId: actor.id, resolvedAt: new Date(), lastAction: 'TRANSFER_REJECTED' } });
      return this.toTransfer(updated);
    }, 'Không thể từ chối Transfer do xung đột đồng thời.');
  }

  async complete(id: string, actor: PublicUser, input: Record<string, unknown> = {}) {
    return this.serializable(async (tx) => {
      const identity = await tx.transferRequest.findFirst({ where: { OR: [{ id }, { transferCode: id }] }, select: { id: true } });
      if (!identity) throw new NotFoundException('Không tìm thấy TransferRequest.');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TransferRequest" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.transferRequest.findUniqueOrThrow({ where: { id: identity.id }, include: this.include() });
      assertTaskAssignee(actor, current.assignedStaffUserId);
      if (current.status === 'COMPLETED') {
        await this.resolveLinkedTransferSupport(tx, current, actor);
        await this.ensureSourceMaintenance(tx, current, actor);
        return this.toTransfer(await tx.transferRequest.findUniqueOrThrow({ where: { id: current.id }, include: this.include() }), { staffId: actor.id });
      }
      if (current.status !== 'APPROVED' || !current.toStorageUnitId || !current.toReservationUnitId) throw new ConflictException('Chỉ Transfer APPROVED mới được hoàn tất.');
      const handover = transferHandover(input);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RentalContract" WHERE "id" = ${current.rentalContractId} FOR UPDATE`);
      const pendingGoods = await tx.stockMovement.count({ where: { rentalContractId: current.rentalContractId, status: { in: ['REQUESTED', 'ASSIGNED'] } } });
      if (pendingGoods) throw new ConflictException('Còn phiếu nhập/xuất tại kho cũ. Hoàn tất hoặc xử lý các phiếu trước khi xác nhận chuyển kho.');
      if (current.commercialSnapshot) {
        if (!this.commercial) throw new ConflictException('Chưa sẵn sàng áp dụng phụ lục.');
        await this.commercial.apply(tx, current);
      }
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" IN (${current.fromStorageUnitId}, ${current.toStorageUnitId}) FOR UPDATE`);
      if (current.fromStorageUnit.status !== 'OCCUPIED' || current.toStorageUnit?.status !== 'RESERVED') throw new ConflictException('Trạng thái vật lý của unit đã thay đổi.');
      const now = new Date();
      await tx.rentalContract.update({ where: { id: current.rentalContractId }, data: { reservationUnitId: current.toReservationUnitId } });
      await tx.reservationUnit.update({ where: { id: current.fromReservationUnitId }, data: { releasedAt: now, actualVacatedAt: now } });
      await tx.storageUnit.update({ where: { id: current.fromStorageUnitId }, data: { status: 'MAINTENANCE' } });
      await tx.storageUnit.update({ where: { id: current.toStorageUnitId }, data: { status: 'OCCUPIED' } });
      const completed = await tx.transferRequest.update({ where: { id: current.id }, data: { status: 'COMPLETED', completedByUserId: actor.id, completedAt: now, handoverReport: { ...handover, recordedByUserId: actor.id, recordedByName: actor.fullName, recordedAt: now.toISOString() } }, include: this.include() });
      await this.resolveLinkedTransferSupport(tx, completed, actor);
      await this.ensureSourceMaintenance(tx, completed, actor);
      return this.toTransfer(await tx.transferRequest.findUniqueOrThrow({ where: { id: current.id }, include: this.include() }), { staffId: actor.id });
    }, 'Không thể hoàn tất Transfer do xung đột đồng thời.');
  }

  private async ensureSourceMaintenance(tx: Prisma.TransactionClient, transfer: any, actor: PublicUser) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${transfer.fromStorageUnitId} FOR UPDATE`);
    const source = await tx.storageUnit.findUnique({ where: { id: transfer.fromStorageUnitId }, select: { id: true, status: true } });
    if (source?.status !== 'MAINTENANCE') return;
    const activeKey = `MAINTENANCE:${source.id}`;
    const createIdempotencyKey = `TRANSFER:${transfer.id}`;
    if (await tx.maintenanceRequest.findUnique({ where: { activeKey } })) return;
    if (await tx.maintenanceRequest.findUnique({ where: { createIdempotencyKey } })) return;
    const responsibility = await this.unitStaff?.resolveStaff(tx, [source.id]);
    await tx.maintenanceRequest.create({ data: {
      maintenanceCode: `${transfer.transferCode}-MNT`, storageUnitId: source.id, source: 'MANUAL',
      category: transfer.reason === 'FACILITY_EQUIPMENT_FAILURE' ? 'FACILITY_EQUIPMENT' : transfer.reason === 'OPERATIONAL_RELOCATION' ? 'CLEANING' : 'UNIT_DAMAGE',
      priority: 'MEDIUM', status: 'OPEN', description: `Kiểm tra kho ${transfer.fromStorageUnit.unitNumber} sau lệnh chuyển ${transfer.transferCode}.`,
      assignedStaffUserId: responsibility?.staffUserId, reportedByUserId: actor.id, activeKey, createIdempotencyKey,
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
    reservation: { select: { id: true, reservationCode: true, startDate: true, endDate: true, quoteSnapshot: true, customer: { select: { fullName: true } } } },
    rentalContract: { select: { id: true, contractCode: true, status: true, startDate: true, endDate: true, reservationUnitId: true } },
    fromReservationUnit: { select: { releasedAt: true } },
    fromStorageUnit: { include: { storageType: { select: { id: true, code: true, name: true } }, maintenanceRequests: { where: { activeKey: { not: null } }, select: { id: true, maintenanceCode: true, status: true, assignedStaffUserId: true }, take: 1 } } },
    toStorageUnit: { include: { storageType: { select: { id: true, code: true, name: true } } } },
    ...(includeAssignee ? { assignedStaff: { select: operationalAssignee } } : {}),
    requestedBy: { select: { id: true, fullName: true, role: true } }, approvedBy: { select: { id: true, fullName: true, role: true } }, completedBy: { select: { id: true, fullName: true, role: true } },
    supportRequest: { select: { id: true, supportCode: true, status: true, resolutionType: true, assignedStaffUserId: true, subject: true, description: true, transferRequestedStartAt: true, transferRequestedEndAt: true } },
  }; }
  private toTransfer(record: any, { staffId, customer = false }: { staffId?: string; customer?: boolean } = {}) {
    const support = record.supportRequest;
    const maintenance = record.fromStorageUnit.maintenanceRequests?.[0];
    return { id: record.id, transferCode: record.transferCode, status: record.status, transferRequestedSchedule: transferProposalView(support), rejectionReason: record.rejectionReason ?? null, handoverReport: record.handoverReport ?? null, ...(customer ? {} : { assignedStaff: record.assignedStaff }), reason: record.reason, requestDescription: support?.description ?? null, ...(!customer && record.reservation.customer ? { customer: record.reservation.customer } : {}), commercial: record.commercialSnapshot ? staffId ? { acceptedAt: record.customerAcceptedAt?.toISOString() ?? null } : { snapshot: record.commercialSnapshot, snapshotHash: snapshotHash(record.commercialSnapshot), acceptedAt: record.customerAcceptedAt?.toISOString() ?? null, acceptanceName: record.customerAcceptanceName, signatureImage: record.customerSignatureImage, verification: signatureVerification(record.commercialSignedSnapshot), otp: this.signing?.availability() ?? { emailConfigured: false } } : null, reservation: { id: record.reservation.id, reference: record.reservation.reservationCode, startDate: this.iso(record.reservation.startDate), endDate: this.iso(record.reservation.endDate) }, contract: { id: record.rentalContract.id, contractCode: record.rentalContract.contractCode, status: record.rentalContract.status, startDate: this.iso(record.rentalContract.startDate), endDate: this.iso(record.rentalContract.endDate) }, fromUnit: this.unit(record.fromStorageUnit, Boolean(staffId)), toUnit: record.toStorageUnit ? this.unit(record.toStorageUnit, Boolean(staffId)) : null, supportRequest: !customer && support && (!staffId || support.assignedStaffUserId === staffId && !isTransferSubject(support.subject ?? '')) ? { id: support.id, supportCode: support.supportCode, status: support.status, resolutionType: support.resolutionType } : null, sourceMaintenance: !customer && maintenance && (!staffId || maintenance.assignedStaffUserId === staffId) ? { id: maintenance.id, maintenanceCode: maintenance.maintenanceCode, status: maintenance.status } : null, sourceMaintenanceMissing: !customer && record.fromStorageUnit.status === 'MAINTENANCE' && !record.fromStorageUnit.maintenanceRequests?.length, requestedBy: record.requestedBy, approvedBy: record.approvedBy, completedBy: record.completedBy, approvedAt: record.approvedAt?.toISOString() ?? null, completedAt: record.completedAt?.toISOString() ?? null, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() }; }
  private unit(unit: any, includeLocation = false) { return { id: unit.id, unitCode: unit.unitNumber, status: unit.status, storageType: unit.storageType, ...(includeLocation ? { floor: unit.floor, zone: unit.zone, row: unit.row, position: unit.position } : {}) }; }
  private text(value: unknown, label: string) { if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${label} là bắt buộc.`); return value.trim(); }
  private integer(value: unknown, fallback: number, max: number, label: string) { if (value === undefined) return fallback; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new BadRequestException(`${label} không hợp lệ.`); return parsed; }
  private today() { return businessToday(); }
  private iso(value: Date) { return value.toISOString().slice(0, 10); }
  private prismaCode(error: unknown, code: string) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code; }
  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, message: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
      } catch (error) {
        if (this.prismaCode(error, 'P2034') && attempt < 2) continue;
        if (this.prismaCode(error, 'P2034') || this.prismaCode(error, 'P2002')) throw new ConflictException(message);
        throw error;
      }
    }
    throw new ConflictException(message);
  }
}

export function transferHandover(input: Record<string, unknown>) {
  if (input.oldKeysReturned !== true || input.newKeysDelivered !== true || input.goodsMoved !== true) throw new BadRequestException('Cần xác nhận đã chuyển hết hàng, thu chìa khóa/mã truy cập cũ và bàn giao chìa khóa/mã truy cập mới.');
  const recipientName = typeof input.recipientName === 'string' ? input.recipientName.trim() : '';
  if (recipientName.length < 2 || recipientName.length > 120) throw new BadRequestException('Nhập tên người nhận kho mới, từ 2 đến 120 ký tự.');
  const returnedKeyCount = input.returnedKeyCount, deliveredKeyCount = input.deliveredKeyCount;
  for (const count of [returnedKeyCount, deliveredKeyCount]) if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > 50) throw new BadRequestException('Số chìa khóa/thẻ phải là số nguyên từ 0 đến 50.');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 2000 || ((returnedKeyCount === 0 || deliveredKeyCount === 0) && note.length < 3)) throw new BadRequestException('Nếu không có chìa khóa/thẻ vật lý, ghi rõ việc thu hồi và cấp lại quyền truy cập.');
  return { oldKeysReturned: true, newKeysDelivered: true, goodsMoved: true, recipientName, returnedKeyCount: returnedKeyCount as number, deliveredKeyCount: deliveredKeyCount as number, note };
}
