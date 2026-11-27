import { groupPriceKey, groupPriceKeys, lockPriceRange, priceBounds, priceInRange, priceVersionStatus, resolveMonthlyRange, sizeGroups, type SizeGroup } from '../pricing/monthly-price-range.js';
import { readServiceSchedule } from '../dispatch/service-schedule.js';
import { scheduleIssues } from './facility-hours.js';
import { facilityScheduleImpact } from './facility-schedule-impact.js';
import { assertActiveRole } from '../facility-access/record-access.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { businessDate, isIsoCalendarDate } from '../../business-date.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { randomUUID } from 'node:crypto';
import { analyticsPeriod } from '../manager/manager-analytics.service.js';
import { CLOSURE_BOOKING_REFUND_PENDING, CLOSURE_BOOKING_REFUND_RECORDED } from '../transfers/closure-booking.js';
function confirmedRefundAmount(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new ConflictException('Cần đối soát số tiền hoàn đã ghi nhận.');
  return BigInt(value);
}
const fields = [
  'code',
  'name',
  'address',
  'officeHours',
  'serviceSchedule',
  'accessHours',
  'bookingEnabled',
  'operationalStatus',
  'closureReason',
  'closureMode',
  'closureExpectedAt',
  'reopeningSafetyEvidence',
  'expectedUpdatedAt',
  'scheduleImpactToken',
];
@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(actor: PublicUser) {
    await assertActiveRole(this.prisma, actor, 'BUSINESS_OPERATIONS_MANAGER');
    const facilities = await this.prisma.facility.findMany({ orderBy: { code: 'asc' } });
    return Promise.all(facilities.map(async facility => {
      if (facility.operationalStatus !== 'CLOSING') return facility;
      const [activeContracts, openTasks, openTransfers, pendingBookings] = await Promise.all([
        this.prisma.rentalContract.count({ where: { status: 'ACTIVE', reservationUnit: { releasedAt: null, storageUnit: { storageType: { facilityId: facility.id } } } } }),
        this.prisma.supportRequest.count({ where: { closurePlanId: facility.closurePlanId, status: { not: 'RESOLVED' } } }),
        this.prisma.transferRequest.count({ where: { closurePlanId: facility.closurePlanId, status: { in: ['REQUESTED','APPROVED'] } } }),
        this.prisma.reservation.count({where:{facilityId:facility.id,status:{in:['PENDING','CONFIRMED']},OR:[{status:'PENDING'},{contracts:{none:{}}},{contracts:{some:{status:{in:['PENDING_PAYMENT','READY_FOR_HANDOVER']}}}}]}}),
      ]);
      return { ...facility, closureProgress: { activeContracts, openTasks, openTransfers, pendingBookings } };
    }));
  }
  async save(
    id: string | undefined,
    body: Record<string, unknown>,
    actor: PublicUser,
  ) {
    if (Object.keys(body).some((k) => !fields.includes(k)))
      throw new BadRequestException('Có trường không được phép sửa.');
    return this.prisma.$transaction(async (tx) => {
      await assertActiveRole(tx, actor, 'BUSINESS_OPERATIONS_MANAGER');
      await tx.$queryRawUnsafe(
        'SELECT 1 FROM pg_advisory_xact_lock(hashtext($1))',
        'facility-master',
      );
      if (id)
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Facility" WHERE id=$1 FOR UPDATE',
          id,
        );
      const old = id ? await tx.facility.findUnique({ where: { id } }) : null;
      if (id && !old) throw new NotFoundException('Không tìm thấy cơ sở.');
      if (old && old.updatedAt.toISOString() !== body.expectedUpdatedAt)
        throw new ConflictException(
          'Cơ sở vừa thay đổi. Tải lại trước khi lưu.',
        );
      const value = { operationalStatus: 'OPEN', bookingEnabled: false, ...old, ...body };
      const text = (key: string, max: number) => {
        const v = value[key as keyof typeof value];
        if (typeof v !== 'string' || !v.trim() || v.length > max)
          throw new BadRequestException('Kiểm tra ' + key);
        return v.trim();
      };
      if (
        typeof value.bookingEnabled !== 'boolean' ||
        typeof value.operationalStatus !== 'string' ||
        !['OPEN', 'CLOSING', 'CLOSED'].includes(value.operationalStatus)
      )
        throw new BadRequestException('Trạng thái cơ sở không hợp lệ.');
      const changed = old !== null && old.operationalStatus !== value.operationalStatus;
      if (!old && value.operationalStatus !== 'OPEN')
        throw new BadRequestException('Cơ sở mới phải có trạng thái hoạt động.');
      if (old?.operationalStatus === 'CLOSED' && value.operationalStatus === 'CLOSING')
        throw new BadRequestException('Cần mở lại cơ sở trước khi lập kế hoạch ngừng.');
      const closing = value.operationalStatus === 'CLOSING';
      const mode = body.closureMode ?? old?.closureMode ?? 'CONTRACT_EXPIRY';
      if (closing && mode !== 'CONTRACT_EXPIRY' && mode !== 'REQUIRED_RELOCATION')
        throw new BadRequestException('Chọn phương án ngừng kinh doanh hợp lệ.');
      const modeChanged = closing && body.closureMode !== undefined && mode !== old?.closureMode;
      const expected = body.closureExpectedAt;
      const previousExpected = old?.closureExpectedAt?.toISOString().slice(0, 10);
      const expectedChanged = expected !== undefined && (expected ?? '') !== (previousExpected ?? '');
      const planChanged = closing && (changed || modeChanged || (body.closureReason !== undefined && body.closureReason !== old?.closureReason)
        || expectedChanged);
      if (modeChanged && old?.closureMode === 'REQUIRED_RELOCATION' && !changed)
        throw new ConflictException('Cần xác minh an toàn và mở lại trước khi hủy phương án di dời bắt buộc.');
      const reopening = changed && value.operationalStatus === 'OPEN';
      const reopeningSafetyEvidence = reopening && old?.closureMode === 'REQUIRED_RELOCATION'
        ? text('reopeningSafetyEvidence', 500) : null;
      if (expected != null && expected !== '') {
        if (typeof expected !== 'string' || !isIsoCalendarDate(expected))
          throw new BadRequestException('Ngày dự kiến ngừng phục vụ không hợp lệ.');
        if (closing && (changed || expectedChanged) && expected < businessDate())
          throw new BadRequestException('Ngày dự kiến ngừng phục vụ không được trước ngày hiện tại.');
      }
      const closureReason = planChanged
        ? text('closureReason', 500)
        : null;
      const bookingEnabled = changed ? false : value.bookingEnabled;
      if (value.operationalStatus !== 'OPEN' && bookingEnabled)
        throw new BadRequestException('Cơ sở đóng cửa không thể nhận đặt kho.');
      if (!old && value.bookingEnabled) throw new BadRequestException('Cơ sở mới cần được cấu hình kho vật lý và giá trước khi mở nhận đặt kho.');
      const enabling = Boolean(old && bookingEnabled && !old.bookingEnabled);
      const readHours = (key: 'officeHours' | 'accessHours') => {
        if (!Object.hasOwn(body, key)) return old?.[key] ?? '';
        const input = body[key];
        if (typeof input !== 'string' || input.length > 200) throw new BadRequestException('Giờ hoạt động không hợp lệ.');
        return input.trim();
      };
      const officeHours = readHours('officeHours');
      const accessHours = readHours('accessHours');
      const editsSchedule = Object.hasOwn(body, 'serviceSchedule');
      const editsHours = !old || Object.hasOwn(body, 'officeHours') || Object.hasOwn(body, 'accessHours') || editsSchedule;
      const windows = editsHours || enabling
        ? readServiceSchedule(editsSchedule ? body.serviceSchedule : old?.serviceSchedule ?? [])
        : undefined;
      if (windows) {
        const errors = scheduleIssues(officeHours, accessHours, windows, bookingEnabled);
        if (Object.keys(errors).length) throw new BadRequestException({ message: Object.values(errors)[0], fields: errors });
      }
      if (old && bookingEnabled && !old.bookingEnabled) {
        const [configured, staff] = await Promise.all([
          tx.storageType.count({where:{facilityId:id,catalogStatus:'AVAILABLE',monthlyRate:{gt:0},widthCm:{gt:0},lengthCm:{gt:0},heightCm:{gt:0},units:{some:{status:'AVAILABLE',maintenanceRequests:{none:{activeKey:{not:null}}}}}}}),
          tx.facilityAccess.findMany({
            where:{facilityId:id,revokedAt:null,user:{accountStatus:'ACTIVE',role:{in:['FACILITY_MANAGER','FACILITY_STAFF']}}},
            select:{user:{select:{role:true}}},
          }),
        ]);
        if (!configured || new Set(staff.map(({ user }) => user.role)).size < 2)
          throw new ConflictException('Cần có kho trống với giá hợp lệ, quản lý và nhân viên đang hoạt động trước khi nhận đặt kho.');
      }
      if (id && changed && value.operationalStatus === 'CLOSED') {
        const count = await tx.rentalContract.count({
          where: {
            reservationUnit: { storageUnit: { storageType: { facilityId: id } } },
            status: { in: ['PENDING_PAYMENT', 'READY_FOR_HANDOVER', 'ACTIVE'] },
          },
        });
        const holds = await tx.reservation.count({
          where: {
            facilityId: id,
            status: { in: ['PENDING', 'CONFIRMED'] },
            OR: [{ status: 'PENDING' }, { contracts: { none: {} } }],
          },
        });
        const unresolved = await Promise.all([
          tx.invoice.count({where:{OR:[{facilityIdSnapshot:id},{facilityIdSnapshot:null,reservation:{facilityId:id}}],status:{not:'VOID'},balanceDue:{gt:0}}}),
          tx.depositSettlement.count({where:{returnRequest:{OR:[{inspections:{some:{storageUnit:{storageType:{facilityId:id}}}}},{inspections:{none:{}},reservation:{facilityId:id}}]},status:{not:'SETTLED'}}}),
          tx.supportRequest.count({where:{OR:[{storageUnit:{storageType:{facilityId:id}}},{storageUnitId:null,rentalContract:{reservationUnit:{storageUnit:{storageType:{facilityId:id}}}}},{storageUnitId:null,rentalContractId:null,reservation:{facilityId:id}}],status:{not:'RESOLVED'}}}),
          tx.maintenanceRequest.count({where:{OR:[{storageUnit:{storageType:{facilityId:id}},activeKey:{not:null}},{commonAreaFacilityId:id,status:{not:'COMPLETED'}}]}}),
          tx.reservationUnit.count({where:{storageUnit:{storageType:{facilityId:id}},releasedAt:null,actualVacatedAt:null,reservation:{status:{in:['PENDING','CONFIRMED']}}}}),
          tx.transferRequest.count({where:{status:{in:['REQUESTED','APPROVED']},OR:[{fromStorageUnit:{storageType:{facilityId:id}}},{toStorageUnit:{storageType:{facilityId:id}}}]}}),
          tx.handoverAppointment.count({where:{reservation:{facilityId:id},status:{in:['REQUESTED','CONFIRMED']}}}),
          tx.returnRequest.count({where:{OR:[{inspections:{some:{storageUnit:{storageType:{facilityId:id}}}}},{inspections:{none:{}},reservation:{facilityId:id}}],status:{not:'COMPLETED'}}}),
          tx.storageUnit.count({where:{storageType:{facilityId:id},status:'OCCUPIED'}}),
          tx.reservationService.count({where:{reservation:{status:'CONFIRMED'},AND:[
            {OR:[{serviceFacilityId:id},{serviceFacilityId:null,reservation:{facilityId:id}}]},
            {OR:[{serviceKindSnapshot:'PURCHASE',fulfillmentStatus:'RESERVED'},{serviceKindSnapshot:'RENTAL',OR:[{fulfillmentStatus:null},{fulfillmentStatus:{not:'RELEASED'}}]}]},
          ]}}),
        ]);
        const labels = ['hợp đồng cần xử lý', 'đơn đặt kho đang chờ', 'hóa đơn còn nợ', 'quyết toán cọc', 'yêu cầu hỗ trợ', 'yêu cầu bảo trì', 'phân bổ kho chưa bàn giao', 'hồ sơ chuyển kho', 'lịch bàn giao', 'hồ sơ trả kho', 'ô kho đang sử dụng', 'dịch vụ đã giữ đang chờ xử lý'];
        const blockers = [count, holds, ...unresolved].flatMap((number, index) => number ? [`${number} ${labels[index]}`] : []);
        if (blockers.length) throw new ConflictException(`Chưa thể đóng cơ sở. Còn ${blockers.join(', ')}.`);
      }
      const data = {
        code: text('code', 80),
        name: text('name', 120),
        address: text('address', 500),
        officeHours,
        accessHours,
        ...(editsSchedule ? { serviceSchedule: windows } : {}),
        bookingEnabled,
        operationalStatus: value.operationalStatus,
        ...(planChanged ? {
          closureMode: mode === 'REQUIRED_RELOCATION' ? mode : 'CONTRACT_EXPIRY', closureReason,
          closurePlanId: changed ? randomUUID() : old?.closurePlanId ?? randomUUID(),
          closureStartedAt: changed ? new Date() : old?.closureStartedAt ?? new Date(),
          closureStartedById: changed ? actor.id : old?.closureStartedById ?? actor.id,
          closureExpectedAt: typeof expected==='string' && expected ? new Date(expected) : changed || expected !== undefined ? null : old?.closureExpectedAt,
        } : reopening ? {
          closureMode:null,closureReason:null,closurePlanId:null,closureStartedAt:null,closureStartedById:null,closureExpectedAt:null,
        } : {}),
      };
      if (old && old.code !== data.code)
        throw new ConflictException('Không đổi mã cơ sở đã tạo.');
      if (!old && await tx.facility.findUnique({where:{code:data.code}})) throw new ConflictException('Mã cơ sở đã tồn tại.');
      const impact = old && windows && editsHours
        && (officeHours !== old.officeHours || accessHours !== old.accessHours || editsSchedule)
        ? await facilityScheduleImpact(tx, old.id, { officeHours, accessHours, schedule: windows })
        : null;
      if (impact && body.scheduleImpactToken !== impact.token) {
        throw new ConflictException({ code: 'FACILITY_SCHEDULE_IMPACT', ...impact,
          message: `Thay đổi ảnh hưởng ${impact.appointments} lịch hẹn. Các lịch hiện tại sẽ được giữ để Manager xử lý.` });
      }
      const facility = id
        ? tx.facility.update({ where: { id }, data })
        : tx.facility.create({ data });
      const saved = await facility;
      if (impact) await tx.auditEvent.create({ data: {
        category: 'ACTIVITY', action: 'FACILITY_SCHEDULE_IMPACT', outcome: 'SUCCESS',
        actorId: actor.id, actorRole: actor.role, actorName: actor.fullName, actorEmail: actor.email,
        resource: 'facility', resourceId: saved.id, method: 'PATCH', route: '/operations/facilities/' + saved.id, httpStatus: 200,
        metadata: { facilityName: saved.name, facilityCode: saved.code, facilityId: saved.id, appointments: impact.appointments },
      } });
      if (reopening && old?.closurePlanId) {
        await tx.supportRequest.updateMany({ where: { closurePlanId: old.closurePlanId, status: { not: 'RESOLVED' },
          OR:[{lastAction:null},{lastAction:{not:CLOSURE_BOOKING_REFUND_PENDING}}], transferRequests: { none: { status: { in: ['REQUESTED','APPROVED'] } } } },
          data: { status: 'RESOLVED', resolutionType: 'MANAGER_RESOLVED', resolutionNote: 'Kế hoạch ngừng kinh doanh đã được hủy. Cơ sở mở lại.', resolvedByUserId: actor.id, resolvedAt: new Date() } });
      }
      if (old && (changed || planChanged || old.bookingEnabled !== bookingEnabled)) {
        const affected = changed || planChanged ? await tx.reservation.findMany({
          where: {
            OR: [
              { contracts: { some: {
                status: { in: ['ACTIVE', 'PENDING_PAYMENT', 'READY_FOR_HANDOVER'] },
                reservationUnit: { releasedAt: null, storageUnit: { storageType: { facilityId: saved.id } } },
              } } },
              { facilityId: saved.id, status: { in: ['PENDING', 'CONFIRMED'] }, contracts: { none: {} } },
            ],
          },
          select: { customerId: true },
          distinct: ['customerId'],
        }) : [];
        await tx.auditEvent.create({data:{
          category:'ACTIVITY',action:'FACILITY_LIFECYCLE',outcome:'SUCCESS',
          actorId:actor.id,actorRole:actor.role,actorName:actor.fullName,actorEmail:actor.email,
          resource:'facility',resourceId:saved.id,method:'PATCH',route:'/operations/facilities/'+saved.id,httpStatus:200,
          metadata:{
            previousStatus:old.operationalStatus,status:saved.operationalStatus,
            statusChanged:changed || planChanged,facilityName:saved.name,facilityCode:saved.code,
            customerRecipientIds:affected.flatMap(({ customerId }) => customerId ? [customerId] : []),
            previousBookingEnabled:old.bookingEnabled,bookingEnabled,
            closureMode:saved.closureMode ?? null,closureReason,closurePlanId:saved.closurePlanId ?? old.closurePlanId ?? null,
            reopeningSafetyEvidence,
          },
        }});
      }
      return saved;
    });
  }
  async ranges(actor: PublicUser) {
    await assertActiveRole(this.prisma, actor, 'BUSINESS_OPERATIONS_MANAGER');
    const [items, types] = await Promise.all([
      this.prisma.businessRule.findMany({ where: { key: { in: ['monthlyPriceRange', ...groupPriceKeys] } },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.storageType.findMany({ select: { id: true, facilityId: true, sizeId: true, name: true, code: true, monthlyRate: true }, orderBy: { name: 'asc' } }),
    ]);
    const authorIds = [...new Set(items.map(item => item.createdById))];
    const authors = await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, fullName: true } });
    const names = new Map(authors.map(author => [author.id, author.fullName]));
    const now = new Date();
    return { groups: sizeGroups, items: items.map(item => ({
      ...item, sizeId: item.key === 'monthlyPriceRange' ? null : item.key.split(':')[1],
      legacy: item.key === 'monthlyPriceRange', status: priceVersionStatus(item, now), author: names.get(item.createdById) ?? null,
    })), types: types.map(type => ({ ...type, monthlyRate: type.monthlyRate === null ? null : Number(type.monthlyRate) })) };
  }

  async saveRange(body: Record<string, unknown>, actor: PublicUser) {
    if (Object.keys(body).some(key => !['facilityId', 'sizeId', 'min', 'max', 'effectiveFrom', 'expectedVersion'].includes(key)))
      throw new BadRequestException('Trường khung giá không hợp lệ.');
    const { facilityId, sizeId } = body;
    const bounds = priceBounds(body);
    if (typeof facilityId !== 'string' || !facilityId || typeof sizeId !== 'string' || !Object.hasOwn(sizeGroups, sizeId) || !bounds)
      throw new BadRequestException('Chọn cơ sở, nhóm kho và nhập khung giá hợp lệ.');
    if (typeof body.effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(body.effectiveFrom))
      throw new BadRequestException('Ngày áp dụng không hợp lệ.');
    const effectiveFrom = new Date(body.effectiveFrom);
    const day = body.effectiveFrom.slice(0, 10);
    const calendar = new Date(day + 'T00:00:00Z');
    if (!Number.isFinite(+effectiveFrom) || !Number.isFinite(+calendar) || calendar.toISOString().slice(0, 10) !== day)
      throw new BadRequestException('Ngày áp dụng không hợp lệ.');
    return this.prisma.$transaction(async tx => {
      await assertActiveRole(tx, actor, 'BUSINESS_OPERATIONS_MANAGER');
      await lockPriceRange(tx, facilityId);
      const now = new Date();
      if (effectiveFrom <= now) throw new BadRequestException('Ngày áp dụng phải ở tương lai.');
      const facility = await tx.facility.findUnique({ where: { id: facilityId }, select: { name: true } });
      if (!facility) throw new BadRequestException('Cơ sở không tồn tại.');
      const key = groupPriceKey(sizeId);
      const last = await tx.businessRule.findFirst({ where: { key, facilityId, storageTypeId: null }, orderBy: { version: 'desc' } });
      if ((last?.version ?? 0) !== body.expectedVersion) throw new ConflictException('Khung giá đã thay đổi. Tải lại trước khi lưu.');
      if (last && last.effectiveFrom >= effectiveFrom) throw new ConflictException('Ngày áp dụng phải sau phiên bản trước.');
      const previous = last ? priceBounds(last.value) : null;
      if (last) await tx.businessRule.update({ where: { id: last.id }, data: { effectiveTo: effectiveFrom } });
      const saved = await tx.businessRule.create({ data: { id: randomUUID(), key, facilityId, version: (last?.version ?? 0) + 1,
        value: bounds, effectiveFrom, createdById: actor.id } });
      const types = await tx.storageType.findMany({ where: { facilityId, sizeId }, select: { name: true, monthlyRate: true }, orderBy: { name: 'asc' } });
      const affected = types.filter(item => !priceInRange(bounds, Number(item.monthlyRate))).map(item => item.name);
      await tx.auditEvent.create({ data: {
        actorId: actor.id, actorRole: actor.role, actorName: actor.fullName, actorEmail: actor.email, category: 'ACTIVITY', outcome: 'SUCCESS',
        resource: 'pricing-rules', resourceId: facilityId, action: 'PUBLISH_GROUP_PRICE_RANGE',
        method: 'POST', route: '/operations/pricing-rules', httpStatus: 201,
        metadata: { facilityId, facilityName: facility.name, sizeId, groupName: sizeGroups[sizeId as SizeGroup],
          oldRange: previous, newRange: bounds, effectiveFrom: effectiveFrom.toISOString(), affected, version: saved.version },
      } });
      if (+effectiveFrom <= Date.now()) throw new BadRequestException('Thời điểm hiệu lực đã qua. Hãy chọn lại.');
      return saved;
    });
  }
  async report(actor: PublicUser) {
    await assertActiveRole(this.prisma, actor, 'BUSINESS_OPERATIONS_MANAGER');
    const [facilities, units, contracts, receipts] = await Promise.all([
      this.prisma.facility.count(),
      this.prisma.storageUnit.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.rentalContract.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({ _sum: { amount: true } }),
    ]);
    return {
      asOf: new Date().toISOString(),
      facilities,
      units,
      contracts,
      grossReceipts: String(receipts._sum.amount ?? 0n),
      limitations: [
        'Tồn kho và hợp đồng là trạng thái hiện tại.',
        'Tổng đã thu có thể gồm tiền cọc; không phải doanh thu thuần.',
        'Chưa hỗ trợ phân bổ tiền thu theo khoản tiền thuê/cọc hoặc báo cáo lịch sử hoàn tiền.',
      ],
    };
  }
  async performance(input:Record<string,unknown>,actor:PublicUser) {
    await assertActiveRole(this.prisma,actor,'BUSINESS_OPERATIONS_MANAGER');
    const {range,...period}=analyticsPeriod(input);
    // Both workflows store refund timestamps as UTC ISO strings in their settlement JSON.
    const refundDate = [
      ...(range.gte ? [{ path: ['refundedAt'], gte: range.gte.toISOString() }] : []),
      ...(range.lt ? [{ path: ['refundedAt'], lt: range.lt.toISOString() }] : []),
    ];
    const facilityId=input.facilityId;
    if(facilityId!==undefined&&typeof facilityId!=='string')throw new BadRequestException('Cơ sở không hợp lệ.');
    const facilities=await this.prisma.facility.findMany({where:facilityId?{id:facilityId}:{},select:{id:true,code:true,name:true,bookingEnabled:true,operationalStatus:true},orderBy:{code:'asc'}});
    if(facilityId&&!facilities.length)throw new NotFoundException('Không tìm thấy cơ sở.');
    const items=await Promise.all(facilities.map(async facility=>{
      const reservation={facilityId:facility.id};
      const unitWhere={storageType:reservation};
      const returnSite: Prisma.ReturnRequestWhereInput = { OR: [
        {inspections:{some:{},every:{storageUnit:{storageType:reservation}}}}, {inspections:{none:{}},reservation},
      ] };
      const [units,activeContracts,newReservations,invoices,receivable,payments,refunds,rentRefunds,handovers,returns,closureRefunds,cancellationRefunds,transferRefunds]=await Promise.all([
        this.prisma.storageUnit.groupBy({by:['status'],where:unitWhere,_count:{_all:true}}),
        this.prisma.rentalContract.count({where:{reservationUnit:{releasedAt:null,storageUnit:{storageType:reservation}},status:'ACTIVE'}}),
        this.prisma.reservation.count({where:{...reservation,createdAt:range}}),
        this.prisma.invoice.aggregate({where:{OR:[{facilityIdSnapshot:facility.id},{facilityIdSnapshot:null,reservation}],status:{not:'VOID'},issuedAt:range},_sum:{rentalAmount:true,serviceAmount:true,chargeAmount:true,depositAmount:true,totalAmount:true}}),
        this.prisma.invoice.aggregate({where:{OR:[{facilityIdSnapshot:facility.id},{facilityIdSnapshot:null,reservation}],status:{not:'VOID'},balanceDue:{gt:0}},_sum:{balanceDue:true}}),
        this.prisma.payment.aggregate({where:{invoice:{OR:[{facilityIdSnapshot:facility.id},{facilityIdSnapshot:null,reservation}]},receivedAt:range},_sum:{amount:true}}),
        this.prisma.depositSettlement.aggregate({where:{returnRequest:returnSite,refundedAt:{not:null,...range}},_sum:{refundAmount:true}}),
        this.prisma.returnRequest.findMany({where:{...returnSite,rentRefundedAt:{not:null,...range}},select:{earlyReturnCloseout:true}}),
        this.prisma.handoverAppointment.count({where:{reservation,status:'COMPLETED',completedAt:{not:null,...range}}}),
        this.prisma.returnRequest.count({where:{...returnSite,physicallyReturnedAt:{not:null,...range}}}),
        this.prisma.supportRequest.findMany({where:{reservation,closurePlanId:{not:null},lastAction:CLOSURE_BOOKING_REFUND_RECORDED,status:'RESOLVED',resolvedAt:{not:null,...range}},select:{earlyReturnFinancialReview:true}}),
        this.prisma.reservation.findMany({where:{...reservation,paidCancellation:{path:['state'],equals:'REFUNDED'},
          AND:refundDate.map(filter=>({paidCancellation:filter}))},select:{paidCancellation:true}}),
        this.prisma.transferRequest.findMany({where:{status:'COMPLETED',closurePlanId:null,fromStorageUnit:unitWhere,
          commercialSettlement:{path:['refundState'],equals:'REFUNDED'},
          AND:refundDate.map(filter=>({commercialSettlement:filter}))},select:{commercialSettlement:true}}),
      ]);
      const counts=Object.fromEntries(units.map(u=>[u.status,u._count._all]));
      const total=units.reduce((sum,u)=>sum+u._count._all,0);
      const rentRefunded=rentRefunds.reduce((sum,r)=>{const amount=(r.earlyReturnCloseout as {refundAmount?:unknown}|null)?.refundAmount;if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<0)throw new ConflictException('Hồ sơ hoàn tiền thuê cần được đối chiếu trước khi tổng hợp.');return sum+BigInt(amount);},0n);
      const closureRefunded = closureRefunds.reduce((sum,row)=>{
        const amount = (row.earlyReturnFinancialReview as {refundAmount?:unknown} | null)?.refundAmount;
        if (typeof amount !== 'string' || !/^[1-9]\d*$/.test(amount)) throw new ConflictException('Cần đối soát số tiền hoàn đơn chưa bàn giao.');
        return sum + BigInt(amount);
      },0n);
      const bookingRefunded = cancellationRefunds.reduce((sum,row)=>
        sum + confirmedRefundAmount((row.paidCancellation as {quote?:{total?:unknown}} | null)?.quote?.total), closureRefunded);
      const transferRefunded = transferRefunds.reduce((sum,row)=>
        sum + confirmedRefundAmount((row.commercialSettlement as {refundAmount?:unknown} | null)?.refundAmount), 0n);
      return {...facility,units:{total,occupied:counts.OCCUPIED??0,available:counts.AVAILABLE??0,reserved:counts.RESERVED??0,maintenance:counts.MAINTENANCE??0},activeContracts,newReservations,handovers,returns,rent:String(invoices._sum.rentalAmount??0n),services:String(invoices._sum.serviceAmount??0n),fees:String(invoices._sum.chargeAmount??0n),deposit:String(invoices._sum.depositAmount??0n),billed:String(invoices._sum.totalAmount??0n),debt:String(receivable._sum.balanceDue??0n),received:String(payments._sum.amount??0n),depositRefunded:String(refunds._sum.refundAmount??0n),rentRefunded:String(rentRefunded),bookingRefunded:String(bookingRefunded),transferRefunded:String(transferRefunded)};
    }));
    return {period,asOf:new Date().toISOString(),items};
  }
  async businessAudit(input:Record<string,unknown>,actor:PublicUser) {
    await assertActiveRole(this.prisma,actor,'BUSINESS_OPERATIONS_MANAGER');
    const page=Number(input.page??1),limit=Number(input.limit??20);
    if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new BadRequestException('Phân trang không hợp lệ.');
    const where={category:'ACTIVITY' as const,actorRole:'BUSINESS_OPERATIONS_MANAGER',resource:{in:['facility','facilities','business-policies','pricing-rules','business-rules','additional-services']}};
    const [total,items]=await Promise.all([this.prisma.auditEvent.count({where}),this.prisma.auditEvent.findMany({where,select:{id:true,actorName:true,action:true,outcome:true,resource:true,resourceId:true,createdAt:true},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*limit,take:limit})]);
    return {page,limit,total,items};
  }
}
