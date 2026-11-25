import { recordAssignment } from '../facility-access/assignment-audit.js';
import { assertTaskExecution, assertTaskFacility, reservationScope } from '../facility-access/task-access.js';
import { assertAssignmentAccess } from '../facility-access/facility-access.service.js';
import { Optional } from '@nestjs/common';
import { BusinessPolicyService } from '../policies/business-policy.service.js';
import { parseHandoverReport, readUnitHandoverDraft, type UnitHandover } from './handover-report.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { BillingService } from '../billing/billing.service.js';
import { AdditionalServiceInventoryService, purchasedPhysicalUnit } from '../additional-services/additional-service-inventory.service.js';

export interface AppointmentListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  date?: string;
  from?: string;
  through?: string;
  agenda?: 'all' | 'upcoming';
}

type HandoverPrerequisites = {
  status: string; quantity: number; customerId: string;
  invoices: { type: string; status: string }[];
  contracts: { status: string; termsAcceptedAt: Date | null; termsAcceptedByUserId: string | null; reservationUnitId: string }[];
  units: { id: string; releasedAt?: Date | null }[];
};

@Injectable()
export class AppointmentsService implements OnModuleInit, OnModuleDestroy {
  private activationTimer?: ReturnType<typeof setInterval>;
  private sweeping = false;
  private readonly logger = new Logger(AppointmentsService.name);
  onModuleInit() {
    this.activationTimer = setInterval(() => { void this.activateDueHandovers(); }, 30_000);
    this.activationTimer.unref?.();
    void this.activateDueHandovers();
  }
  onModuleDestroy() { if (this.activationTimer) clearInterval(this.activationTimer); }

  async activateDueHandovers() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const today = new Date(`${this.vietnamDate(new Date())}T00:00:00Z`);
      const pending = await this.prisma.handoverAppointment.findMany({ where: { status: 'COMPLETED', reservation: { status: 'CONFIRMED', contracts: { some: { status: 'READY_FOR_HANDOVER', startDate: { lte: today }, endDate: { gt: today } } } } }, select: { id: true }, take: 100 });
      for (const item of pending) {
        try {
          await this.serializable(async tx => {
            await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "HandoverAppointment" WHERE "id" = ${item.id} FOR UPDATE`);
            const current = await tx.handoverAppointment.findUnique({ where: { id: item.id }, select: { status: true, completedAt:true, handoverReport:true, reservation: { include: this.reservationReadinessInclude() } } });
            if (!current || current.status !== 'COMPLETED' || current.reservation.contracts.every((contract: any) => contract.status === 'ACTIVE')) return;
            this.assertHandoverReady(current.reservation);
            if (current.reservation.contracts.some((contract: any) => this.vietnamDate(new Date()) < this.isoDate(contract.startDate) || this.vietnamDate(new Date()) >= this.isoDate(contract.endDate))) return;
            const report = current.handoverReport as {unitChecks?: {unitId?:string;inspected?:boolean}[]} | null;
            const verifiedPriorHandover = !!current.completedAt && Array.isArray(report?.unitChecks) &&
              current.reservation.contracts.every(contract=>report.unitChecks!.some(unit=>unit?.unitId===contract.reservationUnit.storageUnit.id && unit.inspected===true));
            // When keys were already handed over, activation at the agreed date only records
            // an existing commitment. Any subsequent physical action stays subject to closure safety.
            await this.activateContracts(tx, current.reservation, verifiedPriorHandover);
          }, 'Hồ sơ kích hoạt vừa thay đổi.');
        } catch (error) { this.logger.warn(`Chưa kích hoạt được lịch bàn giao ${item.id}: ${error instanceof Error ? error.message : 'Lỗi xử lý'}`); }
      }
    } catch (error) { this.logger.error('Không kiểm tra được lịch kích hoạt kho.', error instanceof Error ? error.message : undefined); }
    finally { this.sweeping = false; }
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService = new BillingService(prisma),
    private readonly inventory: AdditionalServiceInventoryService = new AdditionalServiceInventoryService(prisma),
    @Optional() private readonly policies?: BusinessPolicyService,
  ) {}

  async createCustomerAppointment(customer: PublicUser, input: Record<string, unknown>, idempotencyKey: string | undefined) {
    if (customer.role !== 'STORAGE_CUSTOMER') throw new ForbiddenException('Chỉ Customer được yêu cầu lịch bàn giao qua endpoint này.');
    const parsed = this.createInput(input, idempotencyKey);
    const reservationIdentity = await this.prisma.reservation.findFirst({ where: { OR: [{ id: parsed.reservationId }, { reservationCode: parsed.reservationId }], customerId: customer.id }, select: { id: true } });
    if (!reservationIdentity) throw new NotFoundException('Không tìm thấy Reservation.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Reservation" WHERE "id" = ${reservationIdentity.id} FOR UPDATE`);
        const duplicate = await tx.handoverAppointment.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.appointmentInclude() });
        if (duplicate) {
          this.assertMatchingAppointmentRetry(duplicate, reservationIdentity.id, parsed);
          return this.toAppointment(duplicate, false);
        }
        const reservation = await tx.reservation.findUnique({ where: { id: reservationIdentity.id }, include: this.reservationReadinessInclude() });
        if (!reservation) throw new NotFoundException('Không tìm thấy Reservation.');
        this.assertHandoverReady(reservation);
        const handoverLeadDays = this.policies ? await this.policies.value('handoverLeadDays',tx) : 3;
        await this.assertAppointmentDate(reservation, parsed.scheduledAt,handoverLeadDays);
        if (await tx.handoverAppointment.findFirst({ where: { reservationId: reservation.id, status: 'COMPLETED' }, select: { id: true } })) throw new ConflictException('Đã hoàn tất bàn giao chìa khóa cho đơn này. Hệ thống sẽ kích hoạt khi đến ngày thuê.');
        const existingActive = await tx.handoverAppointment.findUnique({ where: { activeKey: this.activeKey(reservation.id) } });
        if (existingActive) throw new ConflictException('Reservation đã có một lịch bàn giao đang hoạt động.');
        const sequence = await tx.handoverAppointment.count({ where: { reservationId: reservation.id } }) + 1;
        const created = await tx.handoverAppointment.create({
          data: {
            appointmentCode: `${reservation.reservationCode}-A${String(sequence).padStart(2, '0')}`,
            reservationId: reservation.id,
            scheduledAt: parsed.scheduledAt,
            handoverLeadDays,
            requestedByUserId: customer.id,
            status: 'CONFIRMED',
            confirmedAt: new Date(),
            note: parsed.note,
            activeKey: this.activeKey(reservation.id),
            idempotencyKey: parsed.idempotencyKey,
          },
          include: this.appointmentInclude(),
        });
        return this.toAppointment(created, false);
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const duplicate = await this.prisma.handoverAppointment.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: this.appointmentInclude() });
        if (duplicate) {
          this.assertMatchingAppointmentRetry(duplicate, reservationIdentity.id, parsed);
          return this.toAppointment(duplicate, false);
        }
        throw new ConflictException('Reservation đã có một lịch bàn giao đang hoạt động.');
      }
      if (this.isPrismaCode(error, 'P2034')) throw new ConflictException('Lịch bàn giao vừa được cập nhật. Vui lòng thử lại.');
      throw error;
    }
  }

  async listCustomerAppointments(customerId: string, query: AppointmentListQuery) {
    const [page, handoverLeadDays] = await Promise.all([
      this.appointmentPage({ reservation: { customerId } }, query, false),
      this.policies?.value('handoverLeadDays') ?? 3,
    ]);
    return { ...page, handoverLeadDays };
  }

  async getCustomerAppointment(customerId: string, id: string) {
    const appointment = await this.prisma.handoverAppointment.findFirst({ where: { OR: [{ id }, { appointmentCode: id }], reservation: { customerId } }, omit: { assignedStaffUserId: true }, include: this.appointmentInclude(false) });
    if (!appointment) throw new NotFoundException('Không tìm thấy lịch bàn giao.');
    return this.toAppointment(appointment, false);
  }

  async listOperationalAppointments(query: AppointmentListQuery, actor: PublicUser) {
    const staff = actor.role === 'FACILITY_STAFF';
    return this.appointmentPage({reservation:reservationScope(actor),...(staff ? this.staffScope(actor.id) : {})}, staff ? query : { ...query, agenda: undefined }, true, staff);
  }

  async getOperationalAppointment(id: string, actor: PublicUser) {
    const appointment = await this.prisma.handoverAppointment.findFirst({ where: { AND: [{reservation:reservationScope(actor)}, { OR: [{ id }, { appointmentCode: id }] }, actor.role === 'FACILITY_STAFF' ? this.staffScope(actor.id) : {}] }, include: this.appointmentInclude() });
    if (!appointment) throw new NotFoundException('Không tìm thấy lịch bàn giao.');
    const view = this.toAppointment(appointment, true, actor.role === 'FACILITY_STAFF');
    if (!['REQUESTED', 'CONFIRMED'].includes(appointment.status)) return view;
    const leadDays = await this.appointmentLeadDays(appointment);
    try {
      if (actor.role === 'FACILITY_STAFF') this.assertAssigned(appointment, actor);
      this.assertHandoverReady(appointment.reservation);
      await this.assertAppointmentDate(appointment.reservation, appointment.scheduledAt, leadDays);
      if (appointment.status === 'CONFIRMED') {
        await this.assertHandoverExecutionTime(appointment.reservation, new Date(), leadDays);
        if (appointment.reservation.quantity === 1) await this.assertHandoverUnitsAvailable(this.prisma, appointment.reservation);
      }
      return { ...view, handoverReadiness: { allowed: true, reason: null, leadDays } };
    } catch (error) {
      if (!(error instanceof ConflictException || error instanceof ForbiddenException)) throw error;
      return { ...view, handoverReadiness: { allowed: false, reason: error.message, leadDays } };
    }
  }

  private staffScope(staffId: string): Prisma.HandoverAppointmentWhereInput {
    return { OR: [{ assignedStaffUserId: staffId }, { assignedStaffUserId: null, status: 'COMPLETED', completedByUserId: staffId }] };
  }

  async adjustAppointment(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý được xử lý ngoại lệ lịch bàn giao.');
    const action = input.action;
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    const expected = typeof input.expectedScheduledAt === 'string' ? Date.parse(input.expectedScheduledAt) : NaN;
    if ((action !== 'RESCHEDULE' && action !== 'NO_SHOW') || note.length < 3 || note.length > 1000 || !Number.isFinite(expected)) {
      throw new BadRequestException('Cần thao tác, lý do và lịch hẹn hiện tại.');
    }
    const value = typeof input.scheduledAt === 'string' ? input.scheduledAt : '';
    const scheduledAt = new Date(value);
    if (action === 'RESCHEDULE' && (!/(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(scheduledAt.getTime()))) {
      throw new BadRequestException('Lịch mới phải có ngày giờ và múi giờ hợp lệ.');
    }
    const identity = await this.appointmentIdentity(id);
    return this.serializable(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "HandoverAppointment" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.handoverAppointment.findUniqueOrThrow({ where: { id: identity.id }, include: this.appointmentInclude() });
      await assertTaskFacility(tx, actor, { reservationId: current.reservationId });
      if (!['REQUESTED', 'CONFIRMED'].includes(current.status) || current.scheduledAt.getTime() !== expected
        || readUnitHandoverDraft(current.handoverReport).unitProgress.length) {
        throw new ConflictException('Lịch đã thay đổi hoặc đã ghi nhận bàn giao từng kho. Vui lòng tải lại.');
      }
      const now = new Date();
      const leadDays = await this.appointmentLeadDays(current, tx);
      if (action === 'NO_SHOW' && current.scheduledAt >= now) throw new ConflictException('Chỉ ghi nhận khách không đến sau giờ hẹn.');
      if (action === 'RESCHEDULE') {
        if (scheduledAt <= now || scheduledAt.getTime() === expected) throw new BadRequestException('Chọn một thời điểm mới trong tương lai.');
        this.assertHandoverReady(current.reservation);
        await this.assertAppointmentDate(current.reservation, scheduledAt, leadDays);
      }
      const report = current.handoverReport && typeof current.handoverReport === 'object' && !Array.isArray(current.handoverReport)
        ? current.handoverReport : {};
      const history = Array.isArray(report.scheduleHistory) ? report.scheduleHistory : [];
      const adjustment = {
        action, note, previousScheduledAt: current.scheduledAt.toISOString(),
        scheduledAt: action === 'RESCHEDULE' ? scheduledAt.toISOString() : null,
        managerId: actor.id, managerName: actor.fullName, at: now.toISOString(),
      };
      const updated = await tx.handoverAppointment.update({ where: { id: current.id }, data: {
        ...(action === 'NO_SHOW' ? { status: 'CANCELLED', cancelledAt: now, activeKey: null } : { scheduledAt, handoverLeadDays: leadDays }),
        handoverReport: { ...report, scheduleHistory: [...history, adjustment] },
      }, include: this.appointmentInclude() });
      return this.toAppointment(updated, true);
    }, 'Lịch bàn giao vừa thay đổi. Vui lòng tải lại.');
  }

  async assignAppointment(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException('Chỉ quản lý được phân công nhân viên bàn giao.');
    const staffUserId = typeof input.staffUserId === 'string' ? input.staffUserId.trim() : '';
    if (!staffUserId || !Object.hasOwn(input, 'expectedAssignedStaffUserId') || input.expectedAssignedStaffUserId !== null && typeof input.expectedAssignedStaffUserId !== 'string') throw new BadRequestException('Cần chọn nhân viên và gửi phiên bản phân công hiện tại.');
    const identity = await this.appointmentIdentity(id);
    return this.serializable(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "HandoverAppointment" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.handoverAppointment.findUniqueOrThrow({ where: { id: identity.id }, include: this.appointmentInclude() });
      if (!['REQUESTED', 'CONFIRMED'].includes(current.status)) throw new ConflictException('Chỉ phân công lịch đang chờ bàn giao, chưa hoàn tất hoặc hủy.');
      const staff = await assertAssignmentAccess(tx,actor,staffUserId,{reservationId:current.reservationId});
      if (!staff || staff.role !== 'FACILITY_STAFF' || staff.accountStatus !== 'ACTIVE') throw new BadRequestException('Nhân viên phải là FACILITY_STAFF đang hoạt động.');
      if (current.assignedStaffUserId === staff.id) return this.toAppointment(current, true);
      if ((current.assignedStaffUserId ?? null) !== input.expectedAssignedStaffUserId) throw new ConflictException('Phân công vừa thay đổi. Tải lại trước khi giao lịch.');
      await recordAssignment(tx,actor,"appointments",current.id,current.assignedStaffUserId,staff.id);
      return this.toAppointment(await tx.handoverAppointment.update({ where: { id: current.id }, data: { assignedStaffUserId: staff.id, assignedByUserId: actor.id, assignedAt: new Date() }, include: this.appointmentInclude() }), true);
    }, 'Lịch bàn giao vừa được phân công bởi yêu cầu khác. Vui lòng tải lại.');
  }

  private assertAssigned(record: any, actor: PublicUser) {
    if (record.assignedStaffUserId === actor.id) return;
    if (!record.assignedStaffUserId && record.status === 'COMPLETED' && record.completedByUserId === actor.id) return;
    throw new ForbiddenException('Chỉ nhân viên được quản lý phân công mới được xử lý lịch bàn giao này.');
  }

  async confirmAppointment(id: string, actor: PublicUser) {
    if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ nhân viên được xác nhận lịch bàn giao.');
    const identity = await this.appointmentIdentity(id);
    return this.serializable(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "HandoverAppointment" WHERE "id" = ${identity.id} FOR UPDATE`);
        const current = await tx.handoverAppointment.findUnique({ where: { id: identity.id }, include: this.appointmentInclude() });
        if (!current) throw new NotFoundException('Không tìm thấy lịch bàn giao.');
        if(current.status==='COMPLETED' && !current.assignedStaffUserId && current.completedByUserId===actor.id) {
          await assertTaskFacility(tx,actor,{reservationId:current.reservationId});
        } else await assertTaskExecution(tx,actor,current.assignedStaffUserId,{reservationId:current.reservationId});
        if (current.status === 'CONFIRMED') return this.toAppointment(current, true);
        if (current.status !== 'REQUESTED') throw new ConflictException(`Không thể xác nhận lịch ở trạng thái ${current.status}.`);
        this.assertHandoverReady(current.reservation);
        await this.assertAppointmentDate(current.reservation, current.scheduledAt,await this.appointmentLeadDays(current,tx));
        const updated = await tx.handoverAppointment.update({
          where: { id: current.id },
          data: { status: 'CONFIRMED', confirmedByUserId: actor.id, confirmedAt: new Date() },
          include: this.appointmentInclude(),
        });
        return this.toAppointment(updated, true);
      }, 'Lịch bàn giao vừa được cập nhật. Vui lòng tải lại.');
  }

  async recordUnitHandover(id: string, unitId: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ nhân viên được giao mới được bàn giao kho.');
    const condition = typeof input?.condition === 'string' ? input.condition.trim() : '';
    if (condition.length < 3 || condition.length > 500 || input.inspected !== true ||
        input.identityVerified !== true || input.accessDelivered !== true) {
      throw new BadRequestException('Cần ghi hiện trạng kho, đối chiếu người nhận và xác nhận đã bàn giao quyền truy cập.');
    }
    const identity = await this.appointmentIdentity(id);
    return this.serializable(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "HandoverAppointment" WHERE "id" = ${identity.id} FOR UPDATE`);
      const current = await tx.handoverAppointment.findUnique({ where: { id: identity.id }, include: this.appointmentInclude() });
      if (!current) throw new NotFoundException('Không tìm thấy lịch bàn giao.');
      if(current.status==='COMPLETED' && !current.assignedStaffUserId && current.completedByUserId===actor.id) {
          await assertTaskFacility(tx,actor,{reservationId:current.reservationId});
        } else await assertTaskExecution(tx,actor,current.assignedStaffUserId,{reservationId:current.reservationId});
      if (current.status === 'COMPLETED' && current.handoverReport && typeof current.handoverReport === 'object' && !Array.isArray(current.handoverReport)) {
        const checks = current.handoverReport.unitChecks;
        if (Array.isArray(checks) && checks.some(check => check && typeof check === 'object' && !Array.isArray(check)
          && check.unitId === unitId && check.condition === condition)) return this.toAppointment(current, true);
      }
      const { unitProgress, activityUpdatedAt } = readUnitHandoverDraft(current.handoverReport);
      const previous = unitProgress.find(unit => unit.unitId === unitId);
      if (previous?.condition === condition) return this.toAppointment(current, true);
      if (previous) throw new ConflictException('Kho này đã được ghi nhận. Hãy tải lại biên bản bàn giao.');
      if (current.status !== 'CONFIRMED') throw new ConflictException('Chỉ ghi nhận từng kho khi lịch đã xác nhận và đang chờ bàn giao.');
      this.assertHandoverReady(current.reservation);
      await this.assertAppointmentDate(current.reservation, current.scheduledAt,await this.appointmentLeadDays(current,tx));
      const now = new Date();
      await this.assertHandoverExecutionTime(current.reservation, now,await this.appointmentLeadDays(current,tx));
      const target = current.reservation.contracts.find(contract => contract.reservationUnit.storageUnit.id === unitId)?.reservationUnit.storageUnit;
      if (!target) throw new NotFoundException('Kho không thuộc lịch bàn giao này.');
      await this.assertPhysicalUnitsAvailable(tx, current.reservation.id, [target]);
      const recorded: UnitHandover = { unitId, unitCode: target.unitNumber, condition, inspected: true, completedAt: now.toISOString(), staffUserId: actor.id };
      const updated = await tx.handoverAppointment.update({
        where: { id: current.id },
        data: { handoverReport: {
          ...this.appointmentScheduleHistory(current.handoverReport),
          unitProgress: [...unitProgress, recorded], activityUpdatedAt: activityUpdatedAt ?? current.updatedAt.toISOString(),
        } },
        include: this.appointmentInclude(),
      });
      return this.toAppointment(updated, true);
    }, 'Kết quả bàn giao vừa thay đổi. Vui lòng tải lại.');
  }

  async completeHandover(id: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'FACILITY_STAFF') throw new ForbiddenException('Chỉ nhân viên được hoàn tất bàn giao.');
    const identity = await this.appointmentIdentity(id);
    return this.serializable(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "HandoverAppointment" WHERE "id" = ${identity.id} FOR UPDATE`);
        const current = await tx.handoverAppointment.findUnique({ where: { id: identity.id }, include: this.appointmentInclude() });
        if (!current) throw new NotFoundException('Không tìm thấy lịch bàn giao.');
        if(current.status==='COMPLETED' && !current.assignedStaffUserId && current.completedByUserId===actor.id) {
          await assertTaskFacility(tx,actor,{reservationId:current.reservationId});
        } else await assertTaskExecution(tx,actor,current.assignedStaffUserId,{reservationId:current.reservationId});
        if (current.status === 'COMPLETED') {
          if (await this.deliverProducts(tx, current, input.deliveredPurchaseIds, actor)) {
            const updated = await tx.handoverAppointment.findUniqueOrThrow({ where: { id: current.id }, include: this.appointmentInclude() });
            return this.toAppointment(updated, true, true);
          }
          return this.toAppointment(current, true, true);
        }
        if (current.status !== 'CONFIRMED') throw new ConflictException('Chỉ lịch CONFIRMED mới được hoàn tất bàn giao.');
        this.assertHandoverReady(current.reservation);
        await this.assertAppointmentDate(current.reservation, current.scheduledAt,await this.appointmentLeadDays(current,tx));
        await this.assertHandoverExecutionTime(current.reservation, new Date(),await this.appointmentLeadDays(current,tx));
        const contracts = current.reservation.contracts;
        const units = contracts.map(contract => contract.reservationUnit.storageUnit);
        const { unitProgress } = readUnitHandoverDraft(current.handoverReport);
        if (unitProgress.length && units.some(unit => !unitProgress.some(saved => saved.unitId === unit.id))) {
          throw new ConflictException('Cần ghi nhận bàn giao từng kho trước khi hoàn tất lịch.');
        }
        const inputReport = input.handoverReport;
        const report = parseHandoverReport(unitProgress.length && inputReport && typeof inputReport === 'object'
          ? { ...input, handoverReport: { ...inputReport, unitChecks: unitProgress } }
          : input, current.reservation.customer, units);
        if (units.length > 1 && !report.data.unitChecks) throw new BadRequestException('Biên bản cần có kết quả kiểm tra của từng kho.');
        await this.assertHandoverUnitsAvailable(tx, current.reservation);

        await this.deliverProducts(tx, current, input.deliveredPurchaseIds, actor);
        const now = new Date();
        const checks = report.data.unitChecks ?? units.map(unit => ({ unitId: unit.id, unitCode: unit.unitNumber, condition: report.data.condition, inspected: true }));
        const unitChecks = checks.map(check => ({ ...check, completedAt: unitProgress.find(item => item.unitId === check.unitId)?.completedAt ?? now.toISOString() }));
        if (contracts.every((contract: any) => this.vietnamDate(now) >= this.isoDate(contract.startDate))) await this.activateContracts(tx, current.reservation);
        const updated = await tx.handoverAppointment.update({
          where: { id: current.id },
          data: { status: 'COMPLETED', completedAt: now, completedByUserId: actor.id, handoverNote: report.text,
            handoverReport: { ...this.appointmentScheduleHistory(current.handoverReport), ...report.data, unitChecks }, activeKey: null },
          include: this.appointmentInclude(),
        });
        return this.toAppointment(updated, true);
      }, 'Lịch bàn giao vừa được hoàn tất bởi yêu cầu khác. Vui lòng tải lại.');
  }

  private async deliverProducts(
    tx: Prisma.TransactionClient,
    appointment: { id: string; reservation: {
      id: string; status: string; facilityId: string;
      invoices: { status: string }[];
      services: { id: string; fulfillmentStatus: string | null; serviceFacilityId: string | null }[];
    } },
    selections: unknown,
    actor: PublicUser,
  ) {
    if (selections === undefined) return false;
    if (!Array.isArray(selections) || selections.length > 100 ||
      selections.some(id => typeof id !== 'string' || !id || id.length > 120) ||
      new Set(selections).size !== selections.length)
      throw new BadRequestException('Danh sách sản phẩm xác nhận bàn giao không hợp lệ.');
    if (!selections.length) return false;
    const reservation = appointment.reservation;
    await assertRoutineFacilityAccess(tx, reservation.facilityId);
    if (reservation.status !== 'CONFIRMED' || reservation.invoices.length !== 1 || reservation.invoices[0].status !== 'PAID')
      throw new ConflictException('Cần đơn đã xác nhận và hóa đơn ban đầu đã thanh toán đầy đủ để bàn giao sản phẩm.');
    const eligible = new Set(reservation.services.filter(line =>
      (!line.serviceFacilityId || line.serviceFacilityId === reservation.facilityId) && (line.fulfillmentStatus === 'RESERVED' || line.fulfillmentStatus === 'FULFILLED'),
    ).map(line => line.id));
    if (selections.some(id => !eligible.has(id)))
      throw new BadRequestException('Sản phẩm không thuộc đơn mua đủ điều kiện bàn giao.');
    const delivered = await this.inventory.fulfillPurchases(tx, reservation.id, selections);
    if (!delivered.length) return false;
    await tx.auditEvent.create({ data: {
      action: 'DELIVER_PURCHASED_PRODUCTS', category: 'ACTIVITY', outcome: 'SUCCESS',
      actorId: actor.id, actorName: actor.fullName, actorRole: actor.role,
      resource: 'appointments', resourceId: appointment.id,
      method: 'POST', route: '/staff/appointments/:id/complete-handover', httpStatus: 201,
      metadata: { reservationId: reservation.id, deliveredPurchaseIds: delivered },
    } });
    return true;
  }

  private async assertHandoverUnitsAvailable(db: Prisma.TransactionClient, reservation: {
    id: string; quantity: number; contracts: { reservationUnit: { storageUnit: { id: string; status: string } } }[];
  }) {
    const units = reservation.contracts.map(contract => contract.reservationUnit.storageUnit);
    const unitIds = units.map(unit => unit.id);
    if (new Set(unitIds).size !== reservation.quantity) throw new ConflictException('Số kho vật lý chưa đủ hoặc bị trùng.');
    await this.assertPhysicalUnitsAvailable(db, reservation.id, units);
  }

  private async assertPhysicalUnitsAvailable(db: Prisma.TransactionClient, reservationId: string, units: { id: string; status: string }[]) {
    await assertRoutineAccess(db, units.map(unit => unit.id));
    if (units.some(unit => ['MAINTENANCE', 'OCCUPIED'].includes(unit.status))) {
      throw new ConflictException('Có kho đang bảo trì hoặc đang được sử dụng.');
    }
    if (await db.maintenanceRequest.count({ where: { storageUnitId: { in: units.map(unit => unit.id) }, activeKey: { not: null } } })) {
      throw new ConflictException('Có kho đang chờ xử lý bảo trì. Hãy kiểm tra lại trước khi bàn giao.');
    }
    const otherActive = await db.rentalContract.count({
      where: { status: 'ACTIVE', reservationId: { not: reservationId }, reservationUnit: { storageUnitId: { in: units.map(unit => unit.id) } } },
    });
    if (otherActive > 0) throw new ConflictException('Có kho đang thuộc hợp đồng thuê khác còn hiệu lực.');
  }

  private async activateContracts(tx: Prisma.TransactionClient, reservation: any, priorPhysicalHandover = false) {
        const contracts = reservation.contracts;
        const unitIds = contracts.map((contract: any) => contract.reservationUnit.storageUnit.id);
        await assertRoutineAccess(tx, unitIds, undefined, priorPhysicalHandover);
        if (contracts.some((contract: any) => ['MAINTENANCE', 'OCCUPIED'].includes(contract.reservationUnit.storageUnit.status))) throw new ConflictException('Kho chưa sẵn sàng để kích hoạt.');
        if (await tx.rentalContract.count({ where: { status: 'ACTIVE', reservationId: { not: reservation.id }, reservationUnit: { storageUnitId: { in: unitIds } } } })) throw new ConflictException('Kho vẫn thuộc hợp đồng đang sử dụng khác.');
        const now = new Date();
        const activated = await tx.rentalContract.updateMany({
          where: { id: { in: contracts.map((contract: any) => contract.id) }, status: 'READY_FOR_HANDOVER' },
          data: { status: 'ACTIVE', activatedAt: now },
        });
        if (activated.count !== reservation.quantity) throw new ConflictException('Không thể kích hoạt đầy đủ tất cả RentalContract.');
        const occupied = await tx.storageUnit.updateMany({
          where: { id: { in: unitIds }, status: { notIn: ['MAINTENANCE', 'OCCUPIED'] } },
          data: { status: 'OCCUPIED' },
        });
        if (occupied.count !== reservation.quantity) throw new ConflictException('Không thể chuyển đầy đủ StorageUnit sang OCCUPIED.');
        await this.billing.ensureRecurringInvoices(tx, reservation.id);
  }

  private assertHandoverReady(reservation: HandoverPrerequisites) {
    if (reservation.status !== 'CONFIRMED') throw new ConflictException('Đơn đặt kho chưa được xác nhận.');
    const initialInvoices = reservation.invoices.filter(invoice => invoice.type === 'INITIAL');
    if (initialInvoices.length !== 1 || initialInvoices[0].status !== 'PAID') throw new ConflictException('Hóa đơn ban đầu phải được thanh toán đầy đủ trước khi bàn giao.');
    if (reservation.contracts.length !== reservation.quantity || reservation.units.length !== reservation.quantity) throw new ConflictException('Đơn đặt kho chưa có đủ hợp đồng và kho vật lý.');
    if (reservation.contracts.some(contract => contract.status !== 'READY_FOR_HANDOVER')) throw new ConflictException('Chưa có đủ hợp đồng sẵn sàng bàn giao.');
    if (reservation.contracts.some(contract => !contract.termsAcceptedAt || contract.termsAcceptedByUserId !== reservation.customerId)) {
      throw new ConflictException({ code: 'CONTRACT_ACCEPTANCE_REQUIRED', message: 'Khách hàng cần xác nhận tất cả hợp đồng trước khi đặt hoặc hoàn tất bàn giao.' });
    }
    const allocationIds = new Set(reservation.units.filter(unit => !unit.releasedAt).map(unit => unit.id));
    if (reservation.contracts.some(contract => !allocationIds.has(contract.reservationUnitId))) throw new ConflictException('Hợp đồng không khớp với kho vật lý đã phân bổ.');
  }

  private handoverBlockReason(reservation: HandoverPrerequisites) {
    try {
      this.assertHandoverReady(reservation);
      return null;
    } catch (error) {
      if (error instanceof ConflictException) return error.message;
      throw error;
    }
  }

  private handoverBookingReadiness(reservation: HandoverPrerequisites) {
    const bookingBlockReason = this.handoverBlockReason(reservation);
    return { bookingReady: bookingBlockReason === null, bookingBlockReason };
  }

  private appointmentScheduleHistory(value: Prisma.JsonValue | null) {
    return value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.scheduleHistory)
      ? { scheduleHistory: value.scheduleHistory } : {};
  }

  private publicHandoverReport(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
    const { scheduleHistory: _scheduleHistory, ...report } = value;
    return report;
  }

  private async appointmentLeadDays(record:any,db:Prisma.TransactionClient=this.prisma) {
    if(Number.isInteger(record.handoverLeadDays))return record.handoverLeadDays;
    const prior=record.createdAt && this.policies?await this.policies.value('handoverLeadDays',db,record.createdAt):3;
    const scheduled=this.vietnamDate(record.scheduledAt);
    const scheduledDays=(record.reservation?.contracts??[]).map((c:any)=>Math.ceil((Date.parse(this.isoDate(c.startDate))-Date.parse(scheduled))/86400000));
    return Math.max(prior,0,...scheduledDays);
  }

  private async handoverLeadDays() {
    return this.policies ? this.policies.value('handoverLeadDays') : 3;
  }

  private async assertAppointmentDate(reservation: any, scheduledAt: Date, configuredLeadDays?: number) {
    const leadDays = configuredLeadDays ?? await this.handoverLeadDays();
    const appointmentDay = this.vietnamDate(scheduledAt);
    if (reservation.contracts.some((contract: any) => appointmentDay < this.keyPickupStartDate(contract.startDate, leadDays))) {
      throw new ConflictException({
        code: 'HANDOVER_BEFORE_PICKUP_WINDOW',
        message: `Lịch nhận chìa khóa chỉ được đặt sớm tối đa ${leadDays} ngày trước ngày bắt đầu thuê.`,
      });
    }
    if (reservation.contracts.some((contract: any) => appointmentDay >= this.isoDate(contract.endDate))) {
      throw new ConflictException({ code: 'HANDOVER_OUTSIDE_CONTRACT_WINDOW', message: 'Ngày nhận kho phải nằm trước ngày kết thúc thuê.' });
    }
  }

  private async assertHandoverExecutionTime(reservation: any, now: Date, configuredLeadDays?: number) {
    const leadDays = configuredLeadDays ?? await this.handoverLeadDays();
    // Confirm actual collection independently of the planned appointment hour.
    // Rental activation still waits for startDate in completeHandover/activateDueHandovers.
    const today = this.vietnamDate(now);
    if (reservation.contracts.some((contract: any) => today < this.keyPickupStartDate(contract.startDate, leadDays) || today >= this.isoDate(contract.endDate))) {
      throw new ConflictException({ code: 'HANDOVER_OUTSIDE_CONTRACT_WINDOW', message: `Chỉ được bàn giao từ ${leadDays} ngày trước ngày thuê đến trước ngày kết thúc thuê.` });
    }
  }

  private vietnamDate(value: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${date.year}-${date.month}-${date.day}`;
  }

  private isoDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private keyPickupStartDate(startDate: Date, leadDays = 3) {
    const date = new Date(`${this.isoDate(startDate)}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - leadDays);
    return date.toISOString().slice(0, 10);
  }

  private async appointmentIdentity(id: string) {
    const identity = await this.prisma.handoverAppointment.findFirst({ where: { OR: [{ id }, { appointmentCode: id }] }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy lịch bàn giao.');
    return identity;
  }

  private async appointmentPage(baseWhere: Prisma.HandoverAppointmentWhereInput, query: AppointmentListQuery, includeCustomer: boolean, staff = false) {
    const range = query.date ? this.dateRange(query.date) : {
      ...(query.from ? { gte: this.dateRange(query.from).gte } : {}),
      ...(query.through ? { lt: this.dateRange(query.through).lt } : {}),
    };
    if (range.gte && range.lt && range.gte >= range.lt) throw new BadRequestException('Khoảng ngày hẹn không hợp lệ.');
    const where: Prisma.HandoverAppointmentWhereInput = {
      ...baseWhere,
      ...(query.status ? { status: query.status } : {}),
      ...(range.gte || range.lt ? { scheduledAt: range } : {}),
      ...(query.search ? { AND: [{ OR: [
        { appointmentCode: { contains: query.search, mode: 'insensitive' } },
        { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } },
        { reservation: { customer: { fullName: { contains: query.search, mode: 'insensitive' } } } },
        { reservation: { customer: { email: { contains: query.search, mode: 'insensitive' } } } },
        { ...(staff ? { status: { in: ['REQUESTED', 'CONFIRMED'] } } : {}),
          reservation: { units: { some: { storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } } } } },
      ] }] } : {}),
    };
    if (query.agenda) return this.staffAgendaPage(where, query);
    const [total, records] = await Promise.all([
      this.prisma.handoverAppointment.count({ where }),
      this.prisma.handoverAppointment.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ scheduledAt: includeCustomer && !query.from && !query.through ? 'desc' : 'asc' }, { id: 'asc' }], omit: { assignedStaffUserId: !includeCustomer }, include: this.appointmentInclude(includeCustomer) }),
    ]);
    return { page: query.page, limit: query.limit, total, items: records.map((record) => this.toAppointment(record, includeCustomer, staff)) };
  }

  private async staffAgendaPage(where: Prisma.HandoverAppointmentWhereInput, query: AppointmentListQuery) {
    const now = new Date();
    const open = { status: { in: ['REQUESTED', 'CONFIRMED'] } } satisfies Prisma.HandoverAppointmentWhereInput;
    const upcoming = { ...open, scheduledAt: { gte: now } };
    const groups: { filter: Prisma.HandoverAppointmentWhereInput; order: Prisma.HandoverAppointmentOrderByWithRelationInput[] }[] = [
      { filter: upcoming, order: [{ scheduledAt: 'asc' }] },
    ];
    if (query.agenda === 'all') groups.push(
      { filter: { ...open, scheduledAt: { lt: now } }, order: [{ scheduledAt: 'desc' }] },
      { filter: { status: 'COMPLETED' }, order: [{ completedAt: { sort: 'desc', nulls: 'last' } }, { scheduledAt: 'desc' }] },
      { filter: { status: 'CANCELLED' }, order: [{ scheduledAt: 'desc' }] },
    );
    const filters = groups.map(group => ({ AND: [where, group.filter] }));
    const totals = await Promise.all(filters.map(group => this.prisma.handoverAppointment.count({ where: group })));
    let skip = (query.page - 1) * query.limit;
    let remaining = query.limit;
    const reads = groups.flatMap((group, index) => {
      const size = totals[index];
      if (skip >= size || !remaining) { skip = Math.max(0, skip - size); return []; }
      const take = Math.min(remaining, size - skip);
      const read = this.prisma.handoverAppointment.findMany({
        where: filters[index], skip, take,
        orderBy: [...group.order, { id: 'asc' }],
        include: this.appointmentInclude(),
      });
      remaining -= take;
      skip = 0;
      return [read];
    });
    const records = (await Promise.all(reads)).flat();
    return { page: query.page, limit: query.limit, total: totals.reduce((sum, count) => sum + count, 0), items: records.map(record => this.toAppointment(record, true, true)) };
  }

  private appointmentInclude(includeAssignee = true) {
    return {
      requestedBy: { select: { id: true, fullName: true, role: true } },
      ...(includeAssignee ? {
        assignedStaff: { select: { id: true, fullName: true, role: true, accountStatus: true } },
        assignedBy: { select: { id: true, fullName: true, role: true } },
      } : {}),
      confirmedBy: { select: { id: true, fullName: true, role: true } },
      completedBy: { select: { id: true, fullName: true, role: true } },
      reservation: { include: this.reservationReadinessInclude() },
    };
  }

  private reservationReadinessInclude() {
    return {
      facility: { select: { id: true, name: true } },
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      invoices: { where: { type: 'INITIAL' as const }, select: { id: true, invoiceCode: true, type: true, status: true } },
      services: {
        where: { serviceKindSnapshot: 'PURCHASE' as const },
        select: { id: true, additionalServiceId: true, serviceNameSnapshot: true, quantity: true, fulfillmentStatus: true, serviceFacilityId: true },
        orderBy: { id: 'asc' as const },
      },
      units: { select: { id: true, storageUnitId: true, releasedAt: true } },
      contracts: { include: { reservationUnit: { include: { storageUnit: { select: { id: true, unitNumber: true, status: true, floor: true, zone: true } } } } }, orderBy: { contractCode: 'asc' as const } },
    };
  }

  private toAppointment(record: any, includeCustomer: boolean, staff = false) {
    const draft = record.status === 'CONFIRMED' ? readUnitHandoverDraft(record.handoverReport) : null;
    const historical = staff && ['COMPLETED', 'CANCELLED'].includes(record.status);
    const reportChecks: unknown = record.handoverReport?.unitChecks;
    const historicalUnits = (Array.isArray(reportChecks) ? reportChecks : []).flatMap(check =>
      typeof check?.unitId === 'string' && typeof check.unitCode === 'string' ? [{ unitId: check.unitId, unitCode: check.unitCode }] : []);
    return {
      ...(includeCustomer && record.reservation.facility ? { facility: record.reservation.facility } : {}),
      ...(includeCustomer ? {
        assignedStaff: record.assignedStaff ?? null,
        assignedBy: record.assignedBy ?? null,
        assignedAt: record.assignedAt?.toISOString() ?? null,
        assignmentStatus: !record.assignedStaffUserId ? 'UNASSIGNED' : record.assignedStaff?.accountStatus === 'DISABLED' ? 'NEEDS_REASSIGNMENT' : 'ASSIGNED',
      } : {}),
      ...(includeCustomer && record.reservation.services?.length ? {
        purchasedProducts: record.reservation.services.map((line: {
          id: string; additionalServiceId: string; serviceNameSnapshot: string; quantity: number; fulfillmentStatus: string | null;
        }) => ({
          id: line.id, name: line.serviceNameSnapshot, quantity: line.quantity, fulfillmentStatus: line.fulfillmentStatus,
          physicalUnit: purchasedPhysicalUnit(record.reservation.quoteSnapshot, line.additionalServiceId),
        })),
      } : {}),
      handoverReport: record.status === 'COMPLETED' ? this.publicHandoverReport(record.handoverReport) : null,
      ...(includeCustomer && ['REQUESTED', 'CONFIRMED'].includes(record.status)
        ? this.handoverBookingReadiness(record.reservation) : {}),
      ...(includeCustomer && record.handoverReport?.scheduleHistory?.length
        ? { scheduleAdjustment: record.handoverReport.scheduleHistory.at(-1) } : {}),
      ...(draft?.activityUpdatedAt ? { activityUpdatedAt: draft.activityUpdatedAt } : {}),
      ...(includeCustomer && draft ? { unitHandoverProgress: draft.unitProgress.map(({ unitId, unitCode, condition, completedAt }) => ({ unitId, unitCode, condition, completedAt })) } : {}),
      id: record.id,
      appointmentCode: record.appointmentCode,
      status: record.status,
      usageStatus: historical ? null : record.status === 'COMPLETED' && record.reservation.contracts.some((contract: any) => contract.status === 'READY_FOR_HANDOVER') ? 'WAITING_FOR_RENTAL_START' : record.reservation.contracts.every((contract: any) => contract.status === 'ACTIVE') ? 'ACTIVE' : null,
      scheduledAt: record.scheduledAt.toISOString(),
      reservation: {
        id: record.reservation.id,
        reference: record.reservation.reservationCode,
        ...(!historical ? { status: record.reservation.status, quantity: record.reservation.quantity, contractCount: record.reservation.contracts.length } : {}),
        ...(includeCustomer ? { customer: historical ? { fullName: record.reservation.customer.fullName } : record.reservation.customer } : {}),
      },
      allocatedUnits: historical ? historicalUnits : record.reservation.contracts.map((contract: any) => ({
        contractCode: contract.contractCode,
        contractStatus: contract.status,
        contractStartDate: this.isoDate(contract.startDate),
        contractEndDate: this.isoDate(contract.endDate),
        activatedAt: contract.activatedAt?.toISOString() ?? null,
        unitId: contract.reservationUnit.storageUnit.id,
        unitCode: contract.reservationUnit.storageUnit.unitNumber,
        unitStatus: contract.reservationUnit.storageUnit.status,
        floor: contract.reservationUnit.storageUnit.floor,
        zone: contract.reservationUnit.storageUnit.zone,
      })),
      note: record.note,
      handoverNote: record.handoverNote,
      requestedBy: record.requestedBy,
      confirmedBy: record.confirmedBy,
      completedBy: record.completedBy,
      confirmedAt: record.confirmedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      cancelledAt: record.cancelledAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private createInput(input: Record<string, unknown>, idempotencyKey: string | undefined) {
    const reservationId = typeof input.reservationId === 'string' ? input.reservationId.trim() : '';
    if (!reservationId) throw new BadRequestException('reservationId là bắt buộc.');
    const scheduledAtText = typeof input.scheduledAt === 'string' ? input.scheduledAt : '';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(scheduledAtText)) throw new BadRequestException('scheduledAt phải là timestamp ISO 8601 có múi giờ.');
    const scheduledAt = new Date(scheduledAtText);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) throw new BadRequestException('scheduledAt phải là thời điểm hợp lệ trong tương lai.');
    const note = this.optionalText(input.note, 2000, 'note');
    const key = idempotencyKey?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new BadRequestException('Idempotency-Key phải dài 8–200 ký tự và chỉ chứa ký tự an toàn.');
    return { reservationId, scheduledAt, note, idempotencyKey: key };
  }

  private assertMatchingAppointmentRetry(appointment: any, reservationId: string, parsed: { scheduledAt: Date; note: string | null }) {
    if (appointment.reservationId !== reservationId || appointment.scheduledAt.getTime() !== parsed.scheduledAt.getTime() || (appointment.note ?? '') !== (parsed.note ?? '')) {
      throw new ConflictException('Idempotency-Key đã được dùng cho một lịch bàn giao khác.');
    }
  }

  private optionalText(value: unknown, maximum: number, label: string) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > maximum) throw new BadRequestException(`${label} không hợp lệ.`);
    return value.trim();
  }

  private activeKey(reservationId: string) {
    return `HANDOVER:${reservationId}`;
  }

  private dateRange(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('date phải có định dạng YYYY-MM-DD.');
    const start = new Date(`${value}T00:00:00+07:00`);
    if (!Number.isFinite(start.getTime()) || this.vietnamDate(start) !== value) throw new BadRequestException('date không hợp lệ.');
    const end = new Date(start.getTime() + 86400000);
    return { gte: start, lt: end };
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
import { assertRoutineAccess, assertRoutineFacilityAccess } from '../facilities/facility-safety.js';
