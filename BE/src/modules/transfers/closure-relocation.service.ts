import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { businessToday } from '../../business-date.js';
import type { PublicUser } from '../auth/auth.types.js';
import { facilityScope, assertTaskFacility, assertTaskExecution } from '../facility-access/task-access.js';
import { assertActiveAssignee, assertAssignmentVersion, physicalHandoff, managerAssignmentInput } from '../facility-access/operational-assignment.js';
import { recordAssignment } from '../facility-access/assignment-audit.js';
import { assertTransferIntakeAvailable } from './transfer-intake.js';
import { AdditionalServiceInventoryService } from '../additional-services/additional-service-inventory.service.js';
import { serviceFacilityScope } from '../additional-services/service-offerings.js';
import { BillingService } from '../billing/billing.service.js';
import { EARLY_RETURN_SUBJECT } from '../returns/early-return-classification.js';
import { assertFacility } from '../facility-access/facility-access.service.js';
import { CLOSURE_BOOKING_REFUND_PENDING, closureBookingCaseView, resolveClosureBooking } from './closure-booking.js';

const facilityInfo = { id: true, name: true, operationalStatus: true, bookingEnabled: true, closurePlanId: true, closureMode: true, closureReason: true } as const;
const unitInfo = { storageType: { include: { facility: { select: facilityInfo } } } } as const;
const contractInfo = {
  reservationUnit: { include: { storageUnit: { include: unitInfo } } },
  reservation: { select: { id: true, customerId: true, customer: { select: { fullName: true } } } },
} as const;
const transferInfo = {
  fromStorageUnit: { include: unitInfo },
  toStorageUnit: { include: unitInfo },
  rentalContract: { include: contractInfo },
  supportRequest: true,
} as const;
type Transfer = Prisma.TransferRequestGetPayload<{ include: typeof transferInfo }>;
type Contract = Prisma.RentalContractGetPayload<{ include: typeof contractInfo }>;
type Db = Prisma.TransactionClient;

function requiredText(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > 2000)
    throw new BadRequestException(label + ' (3–2000 ký tự).');
  return value.trim();
}

@Injectable()
export class ClosureRelocationService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly inventory?: AdditionalServiceInventoryService, @Optional() private readonly billing?: BillingService) {}

  async affected(actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    const contracts = await this.prisma.rentalContract.findMany({
      where: { status: 'ACTIVE', reservationUnit: { releasedAt: null, storageUnit: { storageType: { facility: { ...facilityScope(actor), operationalStatus: 'CLOSING' } } } } },
      include: { ...contractInfo, supportRequests: { where: { closurePlanId: { not: null } }, select: { id: true, status: true, assignedStaffUserId: true, closurePlanId: true } } },
      orderBy: { contractCode: 'asc' },
    });
    return contracts.map(contract => {
      const facility = contract.reservationUnit.storageUnit.storageType.facility;
      return { ...this.contractView(contract), task: contract.supportRequests.find(task => task.closurePlanId === facility.closurePlanId) ?? null };
    });
  }

  async pendingBookings(actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    const rows = await this.prisma.reservation.findMany({
      where: { facility: facilityScope(actor), OR: [
        { facility:{operationalStatus:'CLOSING'}, status:{in:['PENDING','CONFIRMED']},
          OR:[{status:'PENDING'},{contracts:{none:{}}},{contracts:{some:{status:{in:['PENDING_PAYMENT','READY_FOR_HANDOVER']}}}}] },
        { status:'CANCELLED',supportRequests:{some:{closurePlanId:{not:null},lastAction:CLOSURE_BOOKING_REFUND_PENDING,status:{not:'RESOLVED'}}} },
      ] },
      select: { id:true, reservationCode:true, status:true, startDate:true, endDate:true,
        customer:{select:{fullName:true}},facility:{select:facilityInfo},
        contracts:{select:{status:true,termsAcceptedAt:true}},
        invoices:{where:{status:{not:'VOID'}},select:{amountPaid:true}},
        appointments:{where:{status:{not:'CANCELLED'}},select:{status:true,handoverReport:true}},
        supportRequests:{where:{closurePlanId:{not:null},lastAction:CLOSURE_BOOKING_REFUND_PENDING},select:{status:true,lastAction:true,earlyReturnFinancialReview:true}} },
      orderBy:{createdAt:'asc'},
    });
    return rows.map(({contracts,invoices,appointments,customer,supportRequests,...row}) => ({ ...row, customer:customer.fullName,
      signed:contracts.some(contract=>!!contract.termsAcceptedAt), paid:invoices.some(invoice=>invoice.amountPaid>0n),
      handoverRecorded:appointments.some(appointment=>appointment.status==='COMPLETED' || appointment.handoverReport!==null),
      refund:closureBookingCaseView(supportRequests[0]) }));
  }

  resolveBooking(id: string, actor: PublicUser, input: Record<string, unknown>) {
    return this.transaction(tx=>resolveClosureBooking(tx,id,actor,input));
  }

  async notifyCustomers(facilityId: string, actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    return this.transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', actor.id);
      await assertFacility(tx, actor, facilityId);
      await tx.$queryRaw`SELECT id FROM "Facility" WHERE id=${facilityId} FOR UPDATE`;
      const facility = await tx.facility.findUniqueOrThrow({where:{id:facilityId}});
      if (facility.operationalStatus !== 'CLOSING' || !facility.closurePlanId || !facility.closureMode) throw new ConflictException('Cơ sở chưa có kế hoạch ngừng kinh doanh.');
      const previous = await tx.auditEvent.findFirst({ where: { resource:'facility', resourceId:facilityId, action:'MANAGER_CLOSURE_NOTICE', AND:[
        {metadata:{path:['closurePlanId'],equals:facility.closurePlanId}}, {metadata:{path:['closureMode'],equals:facility.closureMode}},
      ] } });
      if (previous) return { sent: false };
      const customers = await tx.reservation.findMany({ where: { OR:[
        { contracts:{some:{status:{in:['ACTIVE','PENDING_PAYMENT','READY_FOR_HANDOVER']},reservationUnit:{releasedAt:null,storageUnit:{storageType:{facilityId}}}}} },
        {facilityId,status:{in:['PENDING','CONFIRMED']},contracts:{none:{}}},
      ] }, select:{customerId:true}, distinct:['customerId'] });
      await tx.auditEvent.create({data:{category:'ACTIVITY',action:'MANAGER_CLOSURE_NOTICE',outcome:'SUCCESS',actorId:actor.id,actorRole:actor.role,
        resource:'facility',resourceId:facilityId,method:'POST',route:'/relocations/facilities/notify',httpStatus:200,
        metadata:{closurePlanId:facility.closurePlanId,closureMode:facility.closureMode,facilityName:facility.name,facilityCode:facility.code,status:'CLOSING',
          customerRecipientIds:customers.map(customer=>customer.customerId),managerNotice:true}}});
      return {sent:true,count:customers.length};
    });
  }

  async assign(contractId: string, actor: PublicUser, input: Record<string, unknown>) {
    const staffId = managerAssignmentInput(actor, input);
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "RentalContract" WHERE id=${contractId} FOR UPDATE`;
      const contract = await tx.rentalContract.findUnique({ where: { id: contractId }, include: contractInfo });
      if (!contract) throw new NotFoundException();
      const unit = contract.reservationUnit.storageUnit;
      await assertActiveAssignee(tx, staffId, actor, { storageUnitId: unit.id });
      const plan = await this.activePlan(tx, contract, undefined, true);
      const key = `closure:${plan.closurePlanId}:${contract.id}`;
      const existing = await tx.supportRequest.findUnique({ where: { idempotencyKey: key } });
      if (existing && (existing.closurePlanId !== plan.closurePlanId || existing.rentalContractId !== contract.id))
        throw new ConflictException('Mã nhiệm vụ đã được sử dụng bởi một hồ sơ khác.');
      if (existing?.status === 'RESOLVED') throw new ConflictException('Công việc đã kết thúc.');
      const openTransfer = existing ? await tx.transferRequest.findFirst({where:{supportRequestId:existing.id,status:{in:['REQUESTED','APPROVED']}}}) : null;
      assertAssignmentVersion(input, existing?.assignedStaffUserId);
      const handoff = physicalHandoff(input, Boolean(existing?.assignedStaffUserId && existing.assignedStaffUserId !== staffId && (existing.startedAt || openTransfer?.sourceHandover)));
      const task = await tx.supportRequest.upsert({
        where: { idempotencyKey: key },
        create: { idempotencyKey: key, supportCode: 'WDP-SUP-' + randomUUID(), closurePlanId: plan.closurePlanId,
          customerUserId: contract.reservation.customerId, reservationId: contract.reservationId, rentalContractId: contract.id, storageUnitId: unit.id,
          category: 'OTHER', subject: 'Hỗ trợ di dời do ngừng kinh doanh', description: plan.closureReason ?? 'Hỗ trợ khách tại cơ sở đang ngừng kinh doanh.',
          assignedStaffUserId: staffId, status: 'ASSIGNED', priority: plan.closureMode === 'REQUIRED_RELOCATION' ? 'HIGH' : 'MEDIUM' },
        update: { assignedStaffUserId: staffId },
      });
      await recordAssignment(tx, actor, 'support', task.id, existing?.assignedStaffUserId, staffId, handoff);
      if (openTransfer && openTransfer.assignedStaffUserId !== staffId) {
        await recordAssignment(tx,actor,'transfers',openTransfer.id,openTransfer.assignedStaffUserId,staffId,handoff);
        await tx.transferRequest.update({where:{id:openTransfer.id},data:{assignedStaffUserId:staffId}});
      }
      if (existing?.assignedStaffUserId !== staffId) await tx.auditEvent.create({ data: {
        category: 'ACTIVITY', outcome: 'SUCCESS', action: 'RELOCATION_ASSIGNED', actorId: actor.id,
        actorRole: actor.role, resource: 'relocation', resourceId: task.id, method: 'POST', route: '/relocations/contracts/assign', httpStatus: 200,
        metadata: { staffRecipientIds: [staffId], sourceFacilityId: plan.id, code: contract.contractCode },
      } });
      return task;
    });
  }

  async tasks(actor: PublicUser) {
    if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException();
    const tasks = await this.prisma.supportRequest.findMany({
      where: { closurePlanId: { not: null }, assignedStaffUserId: actor.id, status: { not: 'RESOLVED' },
        storageUnit: { storageType: { facility: facilityScope(actor) } } },
      include: { rentalContract: { include: contractInfo }, transferRequests: { select: { id: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return tasks.flatMap(task => task.rentalContract ? [{ id: task.id, status: task.status, description: task.description, contract: this.contractView(task.rentalContract), transfer: task.transferRequests[0] ?? null }] : []);
  }

  async destinations(taskId: string, actor: PublicUser) {
    const { contract } = await this.assignedTask(this.prisma, taskId, actor);
    await this.activePlan(this.prisma, contract);
    const units = await this.prisma.storageUnit.findMany({ where: this.destinationWhere(contract), include: unitInfo, orderBy: { unitNumber: 'asc' }, take: 100 });
    return units.map(unit => this.unitView(unit));
  }

  async propose(taskId: string, actor: PublicUser, input: Record<string, unknown>) {
    const destinationId = requiredText(input.destinationId, 'Chọn kho đích');
    return this.transaction(async tx => {
      const { task, contract } = await this.assignedTask(tx, taskId, actor);
      await tx.$queryRaw`SELECT id FROM "RentalContract" WHERE id=${contract.id} FOR UPDATE`;
      const plan = await this.activePlan(tx, contract);
      await assertTransferIntakeAvailable(tx, contract.reservationId, contract.id);
      await tx.$queryRaw`SELECT id FROM "StorageUnit" WHERE id=${destinationId} FOR UPDATE`;
      const destination = await tx.storageUnit.findFirst({ where: { AND: [{ id: destinationId }, this.destinationWhere(contract)] } });
      if (!destination) throw new ConflictException('Kho đích không còn phù hợp hoặc không còn trống.');
      const row = await tx.transferRequest.create({ data: {
        closurePlanId: plan.closurePlanId, transferCode: 'WDP-TRF-' + randomUUID(),
        reservationId: contract.reservationId, rentalContractId: contract.id, fromReservationUnitId: contract.reservationUnitId,
        fromStorageUnitId: contract.reservationUnit.storageUnitId, toStorageUnitId: destination.id, supportRequestId: task.id,
        reason: 'OPERATIONAL_RELOCATION', status: 'REQUESTED', requestedByUserId: actor.id, assignedStaffUserId: actor.id,
        idempotencyKey: 'closure-transfer:' + randomUUID(),
      }, include: transferInfo });
      await tx.supportRequest.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
      await this.audit(tx, actor, row, 'RELOCATION_PROPOSED');
      return this.view(row, actor);
    });
  }

  async records(actor: PublicUser) {
    const where = this.accessWhere(actor);
    const rows = await this.prisma.transferRequest.findMany({ where, include: transferInfo, orderBy: { createdAt: 'desc' } });
    return rows.map(row => this.view(row, actor));
  }

  async decideDestination(id: string, actor: PublicUser, input: Record<string, unknown>) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    if (input.decision !== 'ACCEPT' && input.decision !== 'REJECT') throw new BadRequestException('Chọn tiếp nhận hoặc từ chối phương án.');
    const note = requiredText(input.note, 'Căn cứ quyết định tiếp nhận');
    return this.transaction(async tx => {
      const row = await this.locked(tx, id);
      if (!row.toStorageUnitId) throw new ConflictException('Chưa chọn kho đích.');
      await assertTaskFacility(tx, actor, { storageUnitId: row.toStorageUnitId });
      if (row.status !== 'REQUESTED' || row.destinationDecision || row.toStorageUnitId !== input.destinationId) {
        throw new ConflictException('Phương án đã thay đổi hoặc đã được cơ sở đích xử lý.');
      }
      if (input.decision === 'ACCEPT') {
        await tx.$queryRaw`SELECT id FROM "StorageUnit" WHERE id=${row.toStorageUnitId} FOR UPDATE`;
        if (!await tx.storageUnit.findFirst({ where: { AND: [{ id: row.toStorageUnitId }, this.destinationWhere(row.rentalContract)] }, select: { id: true } })) {
          throw new ConflictException('Kho đích không còn khả dụng. Hãy từ chối để cơ sở nguồn chọn phương án khác.');
        }
      }
      const accepted = input.decision === 'ACCEPT';
      const updated = await tx.transferRequest.update({ where: { id }, include: transferInfo, data: {
        destinationDecision: { accepted, destinationId: row.toStorageUnitId, by: actor.id, at: new Date().toISOString(), note },
        ...(accepted ? {} : { status: 'REJECTED', rejectionReason: note }),
      } });
      if (!accepted) await this.resolveTask(tx, row, actor, true, note);
      await this.audit(tx, actor, updated, accepted ? 'RELOCATION_DESTINATION_ACCEPTED' : 'RELOCATION_DESTINATION_REJECTED');
      return this.view(updated, actor);
    });
  }

  async consent(id: string, actor: PublicUser, input: Record<string, unknown>) {
    const agreed = input.agreed;
    if (typeof agreed !== 'boolean') throw new BadRequestException('Chọn đồng ý hoặc từ chối phương án.');
    const evidence = actor.role === 'STORAGE_CUSTOMER' ? 'Xác nhận từ tài khoản khách hàng' : requiredText(input.evidence, 'Căn cứ xác nhận của khách');
    return this.transaction(async tx => {
      const row = await this.locked(tx, id);
      if (actor.role === 'STORAGE_CUSTOMER') {
        if (row.rentalContract.reservation.customerId !== actor.id) throw new ForbiddenException();
      } else await assertTaskExecution(tx, actor, row.assignedStaffUserId, { storageUnitId: row.fromStorageUnitId });
      if (input.destinationId !== row.toStorageUnitId) throw new ConflictException('Phương án kho đã thay đổi.');
      if (row.status === 'APPROVED' && agreed && row.consentEvidence) return this.view(row, actor);
      if (row.status !== 'REQUESTED' || !row.toStorageUnitId) throw new ConflictException('Hồ sơ không còn chờ xác nhận.');
      const decision = row.destinationDecision as { accepted?: boolean; destinationId?: string } | null;
      if (!decision?.accepted || decision.destinationId !== row.toStorageUnitId) throw new ConflictException('Cơ sở đích chưa xác nhận tiếp nhận phương án.');
      const plan = await this.activePlan(tx, row.rentalContract, row.closurePlanId);
      if (!agreed) {
        const updated = await tx.transferRequest.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: evidence, consentEvidence: { agreed, by: actor.id, at: new Date().toISOString(), evidence, destinationId: row.toStorageUnitId } }, include: transferInfo });
        await this.resolveTask(tx, row, actor, plan.closureMode === 'REQUIRED_RELOCATION', 'Khách từ chối phương án di dời.');
        await this.audit(tx, actor, updated, 'RELOCATION_DECLINED');
        return this.view(updated, actor);
      }
      await tx.$queryRaw`SELECT id FROM "StorageUnit" WHERE id=${row.toStorageUnitId} FOR UPDATE`;
      const target = await tx.storageUnit.findFirst({ where: { AND: [{ id: row.toStorageUnitId }, this.destinationWhere(row.rentalContract)] }, include: unitInfo });
      if (!target) throw new ConflictException('Kho đích không còn khả dụng. Cần chọn phương án khác.');
      await tx.$queryRaw`SELECT id FROM "Facility" WHERE id=${target.storageType.facilityId} FOR SHARE`;
      const allocation = await tx.reservationUnit.create({ data: { reservationId: row.reservationId, storageUnitId: target.id, plannedStartDate: businessToday(), plannedEndDate: row.rentalContract.endDate } });
      const reserved = await tx.storageUnit.updateMany({ where: { id: target.id, status: 'AVAILABLE' }, data: { status: 'RESERVED' } });
      if (reserved.count !== 1) throw new ConflictException('Kho vừa được giữ bởi giao dịch khác.');
      const updated = await tx.transferRequest.update({ where: { id }, data: { toReservationUnitId: allocation.id, status: 'APPROVED', approvedAt: new Date(),
        consentEvidence: { agreed, by: actor.id, at: new Date().toISOString(), evidence, destinationId: target.id } }, include: transferInfo });
      await this.audit(tx, actor, updated, 'RELOCATION_RESERVED');
      return this.view(updated, actor);
    });
  }

  async assignReceiving(id: string, actor: PublicUser, input: Record<string, unknown>) {
    const staffId = managerAssignmentInput(actor, input);
    return this.transaction(async tx => {
      const row = await this.locked(tx, id);
      if (!row.toStorageUnitId || row.status !== 'APPROVED' || row.destinationHandover) throw new ConflictException('Chưa thể phân công tiếp nhận.');
      await assertActiveAssignee(tx, staffId, actor, { storageUnitId: row.toStorageUnitId });
      assertAssignmentVersion(input, row.receivingStaffId);
      await recordAssignment(tx, actor, 'transfers', row.id, row.receivingStaffId, staffId);
      const updated = await tx.transferRequest.update({ where: { id }, data: { receivingStaffId: staffId }, include: transferInfo });
      if (row.receivingStaffId !== staffId) await this.audit(tx, actor, updated, 'RELOCATION_RECEIVING_ASSIGNED');
      return this.view(updated, actor);
    });
  }

  async safety(id: string, actor: PublicUser, input: Record<string, unknown>) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    const evidence = requiredText(input.evidence, 'Căn cứ xác nhận an toàn');
    return this.transaction(async tx => {
      const row = await this.locked(tx, id);
      await assertTaskFacility(tx, actor, { storageUnitId: row.fromStorageUnitId });
      if (row.status !== 'APPROVED' || row.sourceHandover) throw new ConflictException('Hồ sơ không còn ở bước chuẩn bị di dời.');
      await this.activePlan(tx, row.rentalContract, row.closurePlanId);
      return this.view(await tx.transferRequest.update({ where: { id }, data: { safetyEvidence: { by: actor.id, at: new Date().toISOString(), evidence, planId: row.closurePlanId } }, include: transferInfo }), actor);
    });
  }

  async approveServices(id: string, actor: PublicUser, input: Record<string, unknown>) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    const evidence = requiredText(input.evidence, 'Căn cứ phối hợp và đồng ý của khách');
    return this.transaction(async tx => {
      const row = await this.locked(tx, id);
      if (row.status !== 'APPROVED' || !row.toStorageUnitId || row.sourceHandover) throw new ConflictException('Hồ sơ chưa sẵn sàng đối chiếu dịch vụ.');
      await assertTaskFacility(tx, actor, { storageUnitId: row.toStorageUnitId });
      await this.activePlan(tx, row.rentalContract, row.closurePlanId);
      const lines = await this.serviceLines(tx, row);
      const keepSource = lines.length > 0 && await this.hasOtherSourceContracts(tx,row);
      if (lines.length && !keepSource) await this.checkServiceReplacement(tx, row, lines);
      return this.view(await tx.transferRequest.update({ where: { id }, data: {
        serviceHandling: { by: actor.id, at: new Date().toISOString(), evidence, mode: keepSource ? 'KEEP_SOURCE' : 'MOVE', lineIds: lines.map(line => line.id) },
      }, include: transferInfo }), actor);
    });
  }

  async handover(id: string, actor: PublicUser, input: Record<string, unknown>) {
    const side = input.side;
    if (side !== 'source' && side !== 'destination') throw new BadRequestException('Chọn đầu bàn giao.');
    if (input.confirmed !== true) throw new BadRequestException('Cần xác nhận việc bàn giao và quyền truy cập đã hoàn tất.');
    const note = requiredText(input.note, 'Ghi nhận bàn giao và quyền truy cập');
    return this.transaction(async tx => {
      const row = await this.locked(tx, id);
      if (!row.toStorageUnitId) throw new ConflictException('Chưa có kho đích.');
      await assertTaskExecution(tx, actor, side === 'source' ? row.assignedStaffUserId : row.receivingStaffId, { storageUnitId: side === 'source' ? row.fromStorageUnitId : row.toStorageUnitId });
      if (row.status === 'COMPLETED') return this.view(row, actor);
      if (row.status !== 'APPROVED' || !row.consentEvidence || !row.toReservationUnitId || row.relocationException) throw new ConflictException('Hồ sơ chưa đủ điều kiện bàn giao.');
      if (side === 'source' && !row.receivingStaffId) throw new ConflictException('Cần phân công nhân viên cơ sở đích trước khi bàn giao kho nguồn.');
      if (!row.sourceHandover) {
        const plan = await this.activePlan(tx, row.rentalContract, row.closurePlanId);
        if (plan.closureMode === 'REQUIRED_RELOCATION' && !row.safetyEvidence) throw new ConflictException('Cần quản lý xác nhận điều kiện di dời an toàn.');
      }
      if (row.toStorageUnit?.storageType.facility.operationalStatus !== 'OPEN') throw new ConflictException('Cơ sở đích không còn hoạt động.');
      await tx.$queryRaw`SELECT id FROM "Facility" WHERE id=${row.toStorageUnit.storageType.facilityId} FOR SHARE`;
      if (side === 'destination' && !row.sourceHandover) throw new ConflictException('Cần hoàn tất bàn giao kho nguồn trước.');
      if ((side === 'source' && row.sourceHandover) || (side === 'destination' && row.destinationHandover)) return this.view(row, actor);
      await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id=${row.reservationId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "RentalContract" WHERE id=${row.rentalContractId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "StorageUnit" WHERE id IN (${row.fromStorageUnitId}, ${row.toStorageUnitId}) ORDER BY id FOR UPDATE`;
      if (row.rentalContract.reservationUnitId !== row.fromReservationUnitId || row.fromStorageUnit.status !== 'OCCUPIED' || row.toStorageUnit?.status !== 'RESERVED')
        throw new ConflictException('Phân bổ kho đã thay đổi.');
      const blocked = await tx.incidentUnitBlock.count({ where: { releasedAt: null, storageUnitId: {
        in: side === 'source' ? [row.fromStorageUnitId, row.toStorageUnitId] : [row.toStorageUnitId],
      } } });
      if (blocked || await tx.maintenanceRequest.count({ where: { storageUnitId: row.toStorageUnitId, activeKey: { not: null } } })) {
        throw new ConflictException('Kho đang bị chặn do sự cố hoặc bảo trì. Giữ nguyên phương án và báo quản lý xử lý.');
      }
      const now = new Date();
      const report = { by: actor.id, at: now.toISOString(), note };
      if (side === 'source') {
        await this.moveServices(tx, row, input.servicesConfirmed === true);
        return this.view(await tx.transferRequest.update({ where: { id }, data: { sourceHandover: report }, include: transferInfo }), actor);
      }
      const handling = row.serviceHandling as { lineIds?: string[]; mode?: string } | null;
      if (handling?.lineIds?.length && handling.mode !== 'KEEP_SOURCE') {
        if (input.servicesConfirmed !== true || !this.inventory) throw new ConflictException('Cần xác nhận đã bàn giao thiết bị thay thế và sản phẩm cho khách.');
        await this.inventory.fulfillPurchases(tx, row.reservationId, handling.lineIds);
      }
      if (this.billing) await this.billing.ensureRecurringInvoices(tx, row.reservationId, businessToday(now));
      await tx.rentalContract.update({ where: { id: row.rentalContractId }, data: { reservationUnitId: row.toReservationUnitId } });
      await tx.reservationUnit.update({ where: { id: row.fromReservationUnitId }, data: { actualVacatedAt: now, releasedAt: now } });
      const sourceMaintenance = await tx.maintenanceRequest.count({ where: { storageUnitId: row.fromStorageUnitId, activeKey: { not: null } } });
      await tx.storageUnit.update({ where: { id: row.fromStorageUnitId }, data: { status: sourceMaintenance ? 'MAINTENANCE' : 'AVAILABLE' } });
      await tx.storageUnit.update({ where: { id: row.toStorageUnitId }, data: { status: 'OCCUPIED' } });
      const completed = await tx.transferRequest.update({ where: { id }, data: { destinationHandover: report, status: 'COMPLETED', completedAt: now, completedByUserId: actor.id }, include: transferInfo });
      await this.resolveTask(tx, row, actor, false, 'Đã bàn giao và chuyển sang cơ sở mới.');
      await this.audit(tx, actor, completed, 'RELOCATION_COMPLETED');
      return this.view(completed, actor);
    });
  }

  async exception(taskId: string, actor: PublicUser, input: Record<string, unknown>) {
    const note = requiredText(input.note, 'Mô tả vướng mắc');
    return this.transaction(async tx => {
      const { task } = await this.assignedTask(tx, taskId, actor);
      await tx.supportRequest.update({ where: { id: taskId }, data: { status: 'ESCALATED', escalatedAt: new Date(), escalatedByUserId: actor.id, escalationReason: note } });
      await tx.transferRequest.updateMany({ where: { supportRequestId: task.id, status: { in: ['REQUESTED', 'APPROVED'] } }, data: { relocationException: note } });
      return { status: 'ESCALATED' };
    });
  }

  async reportTransferException(id: string, actor: PublicUser, input: Record<string, unknown>) {
    const note = requiredText(input.note, 'Mô tả vướng mắc bàn giao');
    return this.transaction(async tx => {
      const row = await this.locked(tx,id);
      if (!['REQUESTED','APPROVED'].includes(row.status) || !row.supportRequestId) throw new ConflictException('Hồ sơ đã kết thúc.');
      if (input.side === 'destination' && row.toStorageUnitId) await assertTaskExecution(tx,actor,row.receivingStaffId,{storageUnitId:row.toStorageUnitId});
      else if (input.side === 'source') await assertTaskExecution(tx,actor,row.assignedStaffUserId,{storageUnitId:row.fromStorageUnitId});
      else throw new BadRequestException('Cần chọn đầu bàn giao được phân công.');
      await this.resolveTask(tx,row,actor,true,note);
      const updated = await tx.transferRequest.update({where:{id},data:{relocationException:note},include:transferInfo});
      await this.audit(tx,actor,updated,'RELOCATION_EXCEPTION');
      return this.view(updated,actor);
    });
  }

  async cancel(id: string, actor: PublicUser, input: Record<string, unknown>) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    const note = requiredText(input.note, 'Lý do hủy phương án');
    return this.transaction(async tx => {
      const row = await this.locked(tx, id);
      await assertTaskFacility(tx, actor, { storageUnitId: row.fromStorageUnitId });
      if (row.status === 'REJECTED') return this.view(row, actor);
      if (row.status === 'COMPLETED' || row.sourceHandover || row.destinationHandover)
        throw new ConflictException('Đã bàn giao thực tế. Cần xử lý ngoại lệ theo tình trạng thực tế.');
      if (row.toReservationUnitId && row.toStorageUnitId) {
        await tx.$queryRaw`SELECT id FROM "StorageUnit" WHERE id=${row.toStorageUnitId} FOR UPDATE`;
        const changed = await tx.reservationUnit.updateMany({ where: { id: row.toReservationUnitId, releasedAt: null, contract: null }, data: { releasedAt: new Date() } });
        if (changed.count !== 1) throw new ConflictException('Kho đích đã thay đổi phân bổ.');
        const released = await tx.storageUnit.updateMany({ where: { id: row.toStorageUnitId, status: 'RESERVED' }, data: { status: 'AVAILABLE' } });
        if (released.count !== 1) throw new ConflictException('Kho đích đã thay đổi trạng thái.');
      }
      const updated = await tx.transferRequest.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: note }, include: transferInfo });
      const facility = row.fromStorageUnit.storageType.facility;
      await this.resolveTask(tx, row, actor, facility.operationalStatus === 'CLOSING' && facility.closureMode === 'REQUIRED_RELOCATION', note);
      await this.audit(tx, actor, updated, 'RELOCATION_CANCELLED');
      return this.view(updated, actor);
    });
  }

  async resolveException(taskId: string, actor: PublicUser, input: Record<string, unknown>) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
    const note = requiredText(input.note, 'Căn cứ xử lý ngoại lệ');
    return this.transaction(async tx => {
      const task = await tx.supportRequest.findUnique({ where: { id: taskId }, include: { rentalContract: { include: contractInfo } } });
      if (!task?.closurePlanId || !task.storageUnitId || !task.rentalContract || task.status !== 'ESCALATED') throw new ConflictException('Chưa có nhiệm vụ ngoại lệ cần xử lý.');
      await assertTaskFacility(tx, actor, { storageUnitId: task.storageUnitId });
      const plan = await this.activePlan(tx, task.rentalContract, task.closurePlanId, true);
      if (input.action === 'RETRY') {
        await tx.transferRequest.updateMany({ where: { supportRequestId: task.id, status: { in: ['REQUESTED', 'APPROVED'] } }, data: { relocationException: null } });
        return tx.supportRequest.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS', resolutionNote: note } });
      }
      if (input.action !== 'TERMINATION' || input.customerAgreed !== true) throw new BadRequestException('Cần ghi nhận thỏa thuận của khách về phương án trả kho.');
      if (await tx.transferRequest.count({ where: { supportRequestId: task.id, status: { in: ['REQUESTED', 'APPROVED'] } } })) throw new ConflictException('Cần giải quyết phương án chuyển đang mở trước.');
      const key = 'closure-termination:' + task.id;
      const existing = await tx.supportRequest.findUnique({ where: { idempotencyKey: key } });
      if (existing) return existing;
      const safety = plan.closureMode === 'REQUIRED_RELOCATION' ? requiredText(input.safetyEvidence, 'Căn cứ an toàn thu hồi kho') : null;
      const request = await tx.supportRequest.create({ data: {
        supportCode: 'WDP-SUP-' + randomUUID(), idempotencyKey: key,
        customerUserId: task.customerUserId, reservationId: task.reservationId, rentalContractId: task.rentalContractId, storageUnitId: task.storageUnitId,
        category: 'OTHER', subject: EARLY_RETURN_SUBJECT, description: note, priority: 'HIGH', status: 'OPEN',
        earlyReturnFinancialReview: { reason: 'FACILITY_ISSUE', relocationPlanId: plan.closurePlanId, consentRecordedBy: actor.id, consentRecordedAt: new Date().toISOString(),
          ...(safety ? { relocationSafety: { planId: plan.closurePlanId, recordedBy: actor.id, evidence: safety, at: new Date().toISOString() } } : {}) },
      } });
      await tx.supportRequest.update({ where: { id: task.id }, data: { status: 'RESOLVED', resolutionType: 'MANAGER_RESOLVED', resolutionNote: note, resolvedByUserId: actor.id, resolvedAt: new Date() } });
      return request;
    });
  }

  private accessWhere(actor: PublicUser): Prisma.TransferRequestWhereInput {
    if (actor.role === 'STORAGE_CUSTOMER') return { closurePlanId: { not: null }, reservation: { customerId: actor.id },
      OR: [{ consentEvidence: { not: Prisma.DbNull } }, { destinationDecision: { path: ['accepted'], equals: true } }],
    };
    const scoped = { storageType: { facility: facilityScope(actor) } };
    return { closurePlanId: { not: null }, OR: [
      { fromStorageUnit: scoped, ...(actor.role === 'FACILITY_STAFF' ? { assignedStaffUserId: actor.id } : {}) },
      { toStorageUnit: scoped, ...(actor.role === 'FACILITY_STAFF' ? { receivingStaffId: actor.id } : {}) },
    ] };
  }

  private async assignedTask(db: Db, id: string, actor: PublicUser) {
    const task = await db.supportRequest.findUnique({ where: { id }, include: { rentalContract: { include: contractInfo } } });
    if (!task?.closurePlanId || !task.rentalContract || !task.storageUnitId || task.status === 'RESOLVED') throw new NotFoundException('Không có nhiệm vụ di dời đang xử lý.');
    await assertTaskExecution(db, actor, task.assignedStaffUserId, { storageUnitId: task.storageUnitId });
    if (task.storageUnitId !== task.rentalContract.reservationUnit.storageUnitId || task.closurePlanId !== task.rentalContract.reservationUnit.storageUnit.storageType.facility.closurePlanId)
      throw new ConflictException('Nhiệm vụ không còn khớp với kho và kế hoạch hiện tại.');
    return { task, contract: task.rentalContract };
  }

  private async activePlan(db: Db, contract: Contract, expected?: string | null, allowExpired = false) {
    const source = contract.reservationUnit.storageUnit;
    await db.$queryRaw`SELECT id FROM "Facility" WHERE id=${source.storageType.facilityId} FOR SHARE`;
    const plan = await db.facility.findUniqueOrThrow({ where: { id: source.storageType.facilityId } });
    if (plan.operationalStatus !== 'CLOSING' || !plan.closurePlanId || (expected && plan.closurePlanId !== expected) ||
      contract.status !== 'ACTIVE' || contract.reservationUnit.releasedAt || (!allowExpired && contract.endDate <= businessToday()) || source.status !== 'OCCUPIED')
      throw new ConflictException('Hợp đồng hoặc kế hoạch di dời không còn hợp lệ.');
    return plan as typeof plan & { closurePlanId: string };
  }

  private destinationWhere(contract: Contract): Prisma.StorageUnitWhereInput {
    const source = contract.reservationUnit.storageUnit.storageType;
    const renewalConflict = { status: 'APPROVED_PENDING_PAYMENT' as const, previousEndDate: { lt: contract.endDate }, requestedEndDate: { gt: businessToday() } };
    return { status: 'AVAILABLE', storageType: {
      facilityId: { not: source.facilityId }, facility: { operationalStatus: 'OPEN', bookingEnabled: true },
      catalogStatus: 'AVAILABLE', sizeId: source.sizeId, condition: source.condition,
      widthCm: { gte: source.widthCm }, lengthCm: { gte: source.lengthCm }, heightCm: { gte: source.heightCm },
    }, maintenanceRequests: { none: { activeKey: { not: null } } }, incidentBlocks: { none: { releasedAt: null } },
    reservationUnits: { none: { OR: [
      { reservationId: contract.reservationId },
      { releasedAt: null, plannedStartDate: { lt: contract.endDate }, plannedEndDate: { gt: businessToday() } },
      { releasedAt: null, contract: { renewals: { some: renewalConflict } } },
      { releasedAt: null, reservation: { renewals: { some: { ...renewalConflict, rentalContractId: null } } } },
    ] } } };
  }

  private serviceLines(db: Db, row: Transfer) {
    return db.reservationService.findMany({ where: { reservationId: row.reservationId, AND: [
      serviceFacilityScope(row.fromStorageUnit.storageType.facilityId),
      { OR: [
        { serviceKindSnapshot: 'RENTAL', OR: [{ fulfillmentStatus: null }, { fulfillmentStatus: { not: 'RELEASED' } }] },
        { serviceKindSnapshot: 'PURCHASE', OR: [{ fulfillmentStatus: null }, { fulfillmentStatus: 'RESERVED' }] },
      ] },
    ] }, orderBy: { id: 'asc' } });
  }
  private async checkServiceReplacement(db: Db, row: Transfer, lines: Awaited<ReturnType<ClosureRelocationService['serviceLines']>>) {
    if (!this.inventory || !row.toStorageUnit) throw new ConflictException('Chưa xác định được dịch vụ thay thế.');
    if (await db.rentalContract.count({ where: { reservationId: row.reservationId, id: { not: row.rentalContractId }, status: 'ACTIVE',
      reservationUnit:{storageUnit:{storageType:{facilityId:{not:row.toStorageUnit.storageType.facilityId}}}} } }))
      throw new ConflictException('Dịch vụ dùng chung nhiều kho cần được điều phối riêng trước khi di dời.');
    const today = businessToday();
    const replacements = lines.filter(line => line.serviceKindSnapshot === 'PURCHASE' || !line.serviceEndDate || line.serviceEndDate > today);
    for (const line of replacements) {
      if (line.serviceKindSnapshot === 'PURCHASE' && line.fulfillmentStatus !== 'RESERVED')
        throw new ConflictException('Sản phẩm cũ thiếu trạng thái bàn giao xác thực. Cần đối soát trước khi đặt lại tồn kho hoặc hoàn tiền.');
      const offering = await db.facilityServiceOffering.findUnique({ where: { additionalServiceId_facilityId: { additionalServiceId: line.additionalServiceId, facilityId: row.toStorageUnit.storageType.facilityId } }, include: { additionalService: true } });
      if (!offering?.isActive || !offering.additionalService.isActive || offering.configurationReview || offering.additionalService.kind !== line.serviceKindSnapshot || offering.additionalService.billingUnit !== line.billingUnitSnapshot)
        throw new ConflictException('Dịch vụ tại cơ sở mới chưa có cấu hình tương đương.');
      if (line.serviceKindSnapshot === 'RENTAL' && !line.serviceEndDate) throw new ConflictException('Thiết bị thuê thiếu ngày kết thúc.');
    }
    await this.inventory.assertQuoteAvailable(db, replacements.map(line => ({ serviceId: line.additionalServiceId, quantity: line.quantity,
      serviceStartDate: (line.serviceStartDate && line.serviceStartDate > today ? line.serviceStartDate : today).toISOString().slice(0, 10),
      serviceEndDate: line.serviceEndDate?.toISOString().slice(0,10) })), row.toStorageUnit.storageTypeId, true);
  }
  private async hasOtherSourceContracts(db: Db, row: Transfer) {
    return (await db.rentalContract.count({where:{reservationId:row.reservationId,id:{not:row.rentalContractId},status:'ACTIVE',
      reservationUnit:{releasedAt:null,storageUnit:{storageType:{facilityId:row.fromStorageUnit.storageType.facilityId}}}}})) > 0;
  }
  private async moveServices(db: Db, row: Transfer, confirmed: boolean) {
    const lines = await this.serviceLines(db, row);
    if (!lines.length) return;
    if (await db.transferRequest.count({where:{reservationId:row.reservationId,id:{not:row.id},status:'APPROVED',sourceHandover:{not:Prisma.DbNull}}}))
      throw new ConflictException('Cần hoàn tất kho đang di dời trước khi điều phối dịch vụ chung.');
    const handling = row.serviceHandling as { lineIds?: string[]; mode?: string } | null;
    if (!confirmed || !handling || JSON.stringify(handling.lineIds) !== JSON.stringify(lines.map(line => line.id)))
      throw new ConflictException('Cần quản lý cơ sở đích đối chiếu dịch vụ và nhân viên xác nhận đã thu hồi thiết bị nguồn.');
    const keepSource = await this.hasOtherSourceContracts(db,row);
    if (keepSource !== (handling.mode === 'KEEP_SOURCE')) throw new ConflictException('Các kho dùng chung dịch vụ đã thay đổi. Cần đối chiếu lại phương án.');
    if (keepSource) return;
    await this.checkServiceReplacement(db, row, lines);
    for (const line of lines) {
      const ended = line.serviceKindSnapshot === 'RENTAL' && line.serviceEndDate && line.serviceEndDate <= businessToday();
      await db.reservationService.update({ where: { id: line.id }, data: ended ? { fulfillmentStatus: 'RELEASED' } :
        { serviceFacilityId: row.toStorageUnit!.storageType.facilityId, ...(line.serviceKindSnapshot === 'PURCHASE' ? { fulfillmentStatus: 'RESERVED' } : {}) } });
    }
  }

  private async locked(tx: Db, id: string) {
    await tx.$queryRaw`SELECT id FROM "TransferRequest" WHERE id=${id} FOR UPDATE`;
    const row = await tx.transferRequest.findUnique({ where: { id }, include: transferInfo });
    if (!row?.closurePlanId) throw new NotFoundException('Không có hồ sơ di dời.');
    return row;
  }

  private async resolveTask(db: Db, row: Transfer, actor: PublicUser, escalate: boolean, note: string) {
    if (!row.supportRequestId) return;
    await db.supportRequest.update({ where: { id: row.supportRequestId }, data: escalate
      ? { status: 'ESCALATED', escalatedByUserId: actor.id, escalatedAt: new Date(), escalationReason: note }
      : { status: 'RESOLVED', resolutionType: 'OTHER', resolutionNote: note, resolvedByUserId: actor.id, resolvedAt: new Date() } });
  }

  private async audit(db: Db, actor: PublicUser, row: Transfer, action: string) {
    await db.auditEvent.create({ data: { category: 'ACTIVITY', outcome: 'SUCCESS', action, actorId: actor.id, actorRole: actor.role, actorName: actor.fullName, actorEmail: actor.email,
      resource: 'relocation', resourceId: row.id, method: 'POST', route: '/relocations/' + row.id, httpStatus: 200,
      metadata: { customerId: row.rentalContract.reservation.customerId, sourceFacilityId: row.fromStorageUnit.storageType.facilityId, destinationFacilityId: row.toStorageUnit?.storageType.facilityId ?? null,
        staffRecipientIds: [row.assignedStaffUserId, row.receivingStaffId].filter(Boolean), code: row.transferCode,
        sourceName: row.fromStorageUnit.storageType.facility.name, destinationName: row.toStorageUnit?.storageType.facility.name ?? null } } });
  }

  private unitView(unit: Contract['reservationUnit']['storageUnit']) {
    return { id: unit.id, code: unit.unitNumber, facility: unit.storageType.facility, type: unit.storageType.name, location: [unit.floor, unit.zone].filter(Boolean).join(' · ') };
  }

  private contractView(contract: Contract) {
    return { id: contract.id, code: contract.contractCode, customer: contract.reservation.customer.fullName, endDate: contract.endDate, unit: this.unitView(contract.reservationUnit.storageUnit) };
  }

  private view(row: Transfer, actor?: PublicUser) {
    const local = (unit: Transfer['fromStorageUnit'], source: boolean) =>
      actor?.role === 'FACILITY_STAFF' && (source ? row.assignedStaffUserId : row.receivingStaffId) === actor.id
      || actor?.role === 'FACILITY_MANAGER' && actor.selectedFacilityId === unit.storageType.facilityId;
    const endpoint = (unit: Transfer['fromStorageUnit'], source: boolean) => {
      const { id, code, facility, type, location } = this.unitView(unit);
      return { id, code, facility: { id: facility.id, name: facility.name, ...(source ? { closureMode: facility.closureMode } : {}) },
        ...(local(unit, source) ? { type, location } : {}) };
    };
    const contract = this.contractView(row.rentalContract);
    const decision = row.destinationDecision as { accepted?: boolean } | null;
    return { id: row.id, code: row.transferCode, status: row.status,
      contract: { id: contract.id, code: contract.code, customer: contract.customer, endDate: contract.endDate },
      source: endpoint(row.fromStorageUnit, true), destination: row.toStorageUnit ? endpoint(row.toStorageUnit, false) : null,
      destinationAccepted: decision?.accepted === true,
      consent: !!row.consentEvidence && row.status !== 'REJECTED', sourceHandover: !!row.sourceHandover, destinationHandover: !!row.destinationHandover,
      safetyConfirmed: !!row.safetyEvidence, servicesApproved: !!row.serviceHandling, assignedStaffId: row.assignedStaffUserId, receivingStaffId: row.receivingStaffId,
      exception: actor?.role === 'STORAGE_CUSTOMER' ? null : row.relocationException, rejectionReason: row.rejectionReason };
  }

  private async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await this.prisma.$transaction(fn, { isolationLevel: 'Serializable', timeout: 20000 }); }
      catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) throw new ConflictException('Hồ sơ vừa thay đổi. Vui lòng tải lại.');
        throw error;
      }
    }
    throw new ConflictException('Hồ sơ vừa thay đổi.');
  }
}
