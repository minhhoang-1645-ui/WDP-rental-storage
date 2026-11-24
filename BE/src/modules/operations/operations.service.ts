import { assertActiveRole } from '../facility-access/record-access.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { randomUUID } from 'node:crypto';
import { analyticsPeriod } from '../manager/manager-analytics.service.js';
const fields = [
  'code',
  'name',
  'address',
  'officeHours',
  'accessHours',
  'bookingEnabled',
  'operationalStatus',
  'expectedUpdatedAt',
];
@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(actor: PublicUser) {
    await assertActiveRole(this.prisma, actor, 'BUSINESS_OPERATIONS_MANAGER');
    return this.prisma.facility.findMany({ orderBy: { code: 'asc' } });
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
      const value = { ...old, ...body };
      const text = (key: string, max: number) => {
        const v = value[key as keyof typeof value];
        if (typeof v !== 'string' || !v.trim() || v.length > max)
          throw new BadRequestException('Kiểm tra ' + key);
        return v.trim();
      };
      if (
        typeof value.bookingEnabled !== 'boolean' ||
        !['OPEN', 'CLOSED'].includes(String(value.operationalStatus))
      )
        throw new BadRequestException('Trạng thái cơ sở không hợp lệ.');
      if (value.operationalStatus === 'CLOSED' && value.bookingEnabled)
        throw new BadRequestException('Cơ sở đóng cửa không thể nhận đặt kho.');
      if (!old && value.bookingEnabled) throw new BadRequestException('Cơ sở mới cần được cấu hình kho vật lý và giá trước khi mở nhận đặt kho.');
      if (old && value.bookingEnabled && !old.bookingEnabled && !await tx.storageType.count({where:{facilityId:id,monthlyRate:{gt:0},units:{some:{}}}})) throw new ConflictException('Chưa có loại kho có giá và kho vật lý. Cần Manager cấu hình trước khi nhận đặt kho.');
      if (id && value.operationalStatus === 'CLOSED') {
        const count = await tx.rentalContract.count({
          where: {
            reservation: { facilityId: id },
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
        if (count || holds)
          throw new ConflictException(
            'Cơ sở còn đơn hoặc hợp đồng. Có thể tắt nhận đặt kho mới; chưa thể đóng cửa.',
          );
        const unresolved = await Promise.all([
          tx.invoice.count({where:{reservation:{facilityId:id},status:{not:'VOID'},balanceDue:{gt:0}}}),
          tx.depositSettlement.count({where:{returnRequest:{reservation:{facilityId:id}},status:{not:'SETTLED'}}}),
          tx.supportRequest.count({where:{reservation:{facilityId:id},status:{not:'RESOLVED'}}}),
          tx.maintenanceRequest.count({where:{storageUnit:{storageType:{facilityId:id}},activeKey:{not:null}}}),
        ]);
        if (unresolved.some(Boolean)) throw new ConflictException('Cơ sở còn nghĩa vụ tài chính hoặc hồ sơ vận hành chưa hoàn tất. Chưa thể đóng cửa.');
      }
      const data = {
        code: text('code', 80),
        name: text('name', 120),
        address: text('address', 500),
        officeHours:
          old && body.officeHours === undefined
            ? old.officeHours
            : text('officeHours', 200),
        accessHours:
          old && body.accessHours === undefined
            ? old.accessHours
            : text('accessHours', 200),
        bookingEnabled: value.bookingEnabled,
        operationalStatus: String(value.operationalStatus),
      };
      if (old && old.code !== data.code)
        throw new ConflictException('Không đổi mã cơ sở đã tạo.');
      if (!old && await tx.facility.findUnique({where:{code:data.code}})) throw new ConflictException('Mã cơ sở đã tồn tại.');
      return id
        ? tx.facility.update({ where: { id }, data })
        : tx.facility.create({ data });
    });
  }
  async ranges(actor: PublicUser) {
    await assertActiveRole(this.prisma, actor, 'BUSINESS_OPERATIONS_MANAGER');
    const [items, types] = await Promise.all([this.prisma.businessRule.findMany({
        where: { key: 'monthlyPriceRange' },
        orderBy: [{version:'desc'},{createdAt:'desc'}],
      }),this.prisma.storageType.findMany({select:{id:true,facilityId:true,name:true,code:true,monthlyRate:true},orderBy:{name:'asc'}})]);
    const now=new Date();
    const active=items.filter(r=>r.effectiveFrom<=now&&(!r.effectiveTo||r.effectiveTo>now));
    return {items:items.map(r=>({...r,status:r.effectiveFrom>now?'SCHEDULED':r.effectiveTo&&r.effectiveTo<=now?'HISTORICAL':'EFFECTIVE'})),types:types.map(t=>{const range=active.find(r=>r.facilityId===t.facilityId&&r.storageTypeId===t.id)??active.find(r=>r.facilityId===t.facilityId&&!r.storageTypeId);const price=t.monthlyRate===null?null:Number(t.monthlyRate);const bounds=range?.value as {min:number;max:number}|undefined; return {...t,monthlyRate:price,range:bounds??null,outsideRange:price!==null&&!!bounds&&(price<bounds.min||price>bounds.max)};})};
  }
  async saveRange(body: Record<string, unknown>, actor: PublicUser) {
    if (
      Object.keys(body).some(
        (k) =>
          ![
            'facilityId',
            'storageTypeId',
            'min',
            'max',
            'effectiveFrom',
            'expectedVersion',
          ].includes(k),
      )
    )
      throw new BadRequestException('Trường khung giá không hợp lệ.');
    const facilityId =
      typeof body.facilityId === 'string' ? body.facilityId : null;
    const storageTypeId =
      typeof body.storageTypeId === 'string' && body.storageTypeId
        ? body.storageTypeId
        : null;
    const min = body.min,
      max = body.max;
    if (
      !facilityId ||
      typeof min !== 'number' ||
      typeof max !== 'number' ||
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) ||
      min < 0 ||
      max < min
    )
      throw new BadRequestException('Chọn cơ sở và nhập khung giá hợp lệ.');
    if (typeof body.effectiveFrom !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(body.effectiveFrom))
      throw new BadRequestException('Ngày áp dụng không hợp lệ.');
    const effectiveFrom = new Date(body.effectiveFrom);
    if (
      !Number.isFinite(effectiveFrom.getTime()) ||
      effectiveFrom.getTime() < Date.now() - 60000
    )
      throw new BadRequestException('Ngày áp dụng phải từ hiện tại trở đi.');
    return this.prisma.$transaction(async (tx) => {
      await assertActiveRole(tx, actor, 'BUSINESS_OPERATIONS_MANAGER');
      await tx.$queryRawUnsafe(
        'SELECT 1 FROM pg_advisory_xact_lock(hashtext($1))',
        'price-range:' + facilityId,
      );
      if (
        !(await tx.facility.findUnique({
          where: { id: facilityId },
          select: { id: true },
        }))
      )
        throw new BadRequestException('Cơ sở không tồn tại.');
      if (
        storageTypeId &&
        !(await tx.storageType.findFirst({
          where: { id: storageTypeId, facilityId },
          select: { id: true },
        }))
      )
        throw new BadRequestException('Loại kho không thuộc cơ sở.');
      const last = await tx.businessRule.findFirst({
        where: { key: 'monthlyPriceRange', facilityId, storageTypeId },
        orderBy: { version: 'desc' },
      });
      if ((last?.version ?? 0) !== body.expectedVersion)
        throw new ConflictException(
          'Khung giá đã thay đổi. Tải lại trước khi lưu.',
        );
      if (last && last.effectiveFrom >= effectiveFrom)
        throw new ConflictException('Ngày áp dụng phải sau phiên bản trước.');
      if (last)
        await tx.businessRule.update({
          where: { id: last.id },
          data: { effectiveTo: effectiveFrom },
        });
      return tx.businessRule.create({
        data: {
          id: randomUUID(),
          key: 'monthlyPriceRange',
          facilityId,
          storageTypeId,
          version: (last?.version ?? 0) + 1,
          value: { min, max },
          effectiveFrom,
          createdById: actor.id,
        },
      });
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
    const facilityId=input.facilityId;
    if(facilityId!==undefined&&typeof facilityId!=='string')throw new BadRequestException('Cơ sở không hợp lệ.');
    const facilities=await this.prisma.facility.findMany({where:facilityId?{id:facilityId}:{},select:{id:true,code:true,name:true,bookingEnabled:true,operationalStatus:true},orderBy:{code:'asc'}});
    if(facilityId&&!facilities.length)throw new NotFoundException('Không tìm thấy cơ sở.');
    const items=await Promise.all(facilities.map(async facility=>{
      const reservation={facilityId:facility.id};
      const unitWhere={storageType:reservation};
      const [units,activeContracts,newReservations,invoices,receivable,payments,refunds,rentRefunds,handovers,returns]=await Promise.all([
        this.prisma.storageUnit.groupBy({by:['status'],where:unitWhere,_count:{_all:true}}),
        this.prisma.rentalContract.count({where:{reservation,status:'ACTIVE'}}),
        this.prisma.reservation.count({where:{...reservation,createdAt:range}}),
        this.prisma.invoice.aggregate({where:{reservation,status:{not:'VOID'},issuedAt:range},_sum:{rentalAmount:true,serviceAmount:true,chargeAmount:true,depositAmount:true,totalAmount:true}}),
        this.prisma.invoice.aggregate({where:{reservation,status:{not:'VOID'},balanceDue:{gt:0}},_sum:{balanceDue:true}}),
        this.prisma.payment.aggregate({where:{invoice:{reservation},receivedAt:range},_sum:{amount:true}}),
        this.prisma.depositSettlement.aggregate({where:{returnRequest:{reservation},refundedAt:{not:null,...range}},_sum:{refundAmount:true}}),
        this.prisma.returnRequest.findMany({where:{reservation,rentRefundedAt:{not:null,...range}},select:{earlyReturnCloseout:true}}),
        this.prisma.handoverAppointment.count({where:{reservation,status:'COMPLETED',completedAt:{not:null,...range}}}),
        this.prisma.returnRequest.count({where:{reservation,physicallyReturnedAt:{not:null,...range}}}),
      ]);
      const counts=Object.fromEntries(units.map(u=>[u.status,u._count._all]));
      const total=units.reduce((sum,u)=>sum+u._count._all,0);
      const rentRefunded=rentRefunds.reduce((sum,r)=>{const amount=(r.earlyReturnCloseout as {refundAmount?:unknown}|null)?.refundAmount;if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<0)throw new ConflictException('Hồ sơ hoàn tiền thuê cần được đối chiếu trước khi tổng hợp.');return sum+BigInt(amount);},0n);
      return {...facility,units:{total,occupied:counts.OCCUPIED??0,available:counts.AVAILABLE??0,reserved:counts.RESERVED??0,maintenance:counts.MAINTENANCE??0},activeContracts,newReservations,handovers,returns,rent:String(invoices._sum.rentalAmount??0n),services:String(invoices._sum.serviceAmount??0n),fees:String(invoices._sum.chargeAmount??0n),deposit:String(invoices._sum.depositAmount??0n),billed:String(invoices._sum.totalAmount??0n),debt:String(receivable._sum.balanceDue??0n),received:String(payments._sum.amount??0n),depositRefunded:String(refunds._sum.refundAmount??0n),rentRefunded:String(rentRefunded)};
    }));
    return {period,asOf:new Date().toISOString(),items};
  }
  async businessAudit(input:Record<string,unknown>,actor:PublicUser) {
    await assertActiveRole(this.prisma,actor,'BUSINESS_OPERATIONS_MANAGER');
    const page=Number(input.page??1),limit=Number(input.limit??20);
    if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new BadRequestException('Phân trang không hợp lệ.');
    const where={category:'ACTIVITY' as const,actorRole:'BUSINESS_OPERATIONS_MANAGER',resource:{in:['facilities','business-policies','pricing-rules','business-rules','additional-services']}};
    const [total,items]=await Promise.all([this.prisma.auditEvent.count({where}),this.prisma.auditEvent.findMany({where,select:{id:true,actorName:true,action:true,outcome:true,resource:true,resourceId:true,createdAt:true},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*limit,take:limit})]);
    return {page,limit,total,items};
  }
}
export async function assertMonthlyRange(
  tx: Prisma.TransactionClient,
  facilityId: string,
  storageTypeId: string,
  amount: number,
) {
  const now = new Date();
  const rows = await tx.businessRule.findMany({
    where: {
      key: 'monthlyPriceRange',
      facilityId,
      OR: [{ storageTypeId }, { storageTypeId: null }],
      effectiveFrom: { lte: now },
      AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] }],
    },
    orderBy: { version: 'desc' },
  });
  const rule =
    rows.find((r) => r.storageTypeId === storageTypeId) ??
    rows.find((r) => r.storageTypeId === null);
  if (!rule) return; // Existing facilities retain their current behavior until BOM configures a range.
  const range = rule.value as { min: number; max: number };
  if (
    !range ||
    !Number.isSafeInteger(range.min) ||
    !Number.isSafeInteger(range.max) ||
    range.min < 0 ||
    range.max < range.min
  )
    throw new ConflictException(
      'Khung giá đang lưu không hợp lệ; cần BOM đối chiếu trước khi đổi giá.',
    );
  if (amount < range.min || amount > range.max)
    throw new BadRequestException(
      'Giá tháng phải nằm trong khung ' +
        range.min +
        ' – ' +
        range.max +
        ' đ do điều hành quy định.',
    );
}
