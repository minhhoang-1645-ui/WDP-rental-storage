import { assertActiveRole } from '../facility-access/record-access.js';
import { facilityIds } from '../facility-access/facility-access.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export function reportFilters(query: Record<string, unknown>) {
  const text = (key: string) => { const value = query[key]; if (value === undefined || value === '') return ''; if (typeof value !== 'string' || value.length > 100) throw new BadRequestException('Bộ lọc báo cáo không hợp lệ.'); return value; };
  const date = (key: string) => { const value = text(key); if (!value) return ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new BadRequestException('Ngày báo cáo không hợp lệ.'); return value; };
  const from = date('from'), to = date('to'), group = text('group') || 'month', typeId = text('typeId');
  if (!['day', 'week', 'month', 'year'].includes(group) || from && to && from > to) throw new BadRequestException('Kiểm tra thứ tự ngày và cách nhóm thời gian.');
  return { from, to, group, typeId };
}
type Row = Record<string, any>;
function number(value: unknown) { const n = Number(value ?? 0); if (!Number.isSafeInteger(n) || n < 0) throw new BadRequestException('Số liệu vượt giới hạn hiển thị an toàn. Thu hẹp thời gian báo cáo.'); return n; }
@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}
  private async permittedFacilities(input:Record<string,unknown>,actor:PublicUser){
    if(actor.role!=='BUSINESS_OPERATIONS_MANAGER')return facilityIds(this.prisma,actor);
    if(input.facilityId===undefined||input.facilityId==='')return undefined;
    if(typeof input.facilityId!=='string'||input.facilityId.length>120)throw new BadRequestException('Cơ sở không hợp lệ.');
    if(!await this.prisma.facility.findUnique({where:{id:input.facilityId},select:{id:true}}))throw new BadRequestException('Cơ sở không tồn tại.');
    return [input.facilityId];
  }
  private scope(query: ReturnType<typeof reportFilters> & { facilityIds?:string[] }, column: Prisma.Sql, typeColumn: Prisma.Sql = Prisma.sql`COALESCE(r."quoteSnapshot"->>'storageTypeId', r."storageTypeId")`, facilityColumn: Prisma.Sql = Prisma.sql`r."facilityId"`) {
    return Prisma.sql`${query.facilityIds === undefined ? Prisma.sql`TRUE` : query.facilityIds.length ? Prisma.sql`${facilityColumn} IN (${Prisma.join(query.facilityIds)})` : Prisma.sql`FALSE`} AND ${query.from ? Prisma.sql`${column} >= ${new Date(query.from + 'T00:00:00+07:00')}` : Prisma.sql`TRUE`} AND ${query.to ? Prisma.sql`${column} < ${new Date(Date.parse(query.to + 'T00:00:00+07:00') + 86400000)}` : Prisma.sql`TRUE`} AND ${query.typeId ? Prisma.sql`${typeColumn} = ${query.typeId}` : Prisma.sql`TRUE`}`;
  }
  async dashboard(input: Record<string, unknown>, actor: PublicUser) {
    await assertActiveRole(this.prisma,actor,'BUSINESS_OPERATIONS_MANAGER');
    const filters={...reportFilters(input),typeId:'',facilityIds:await this.permittedFacilities(input,actor)};
    const facilityFilter=filters.facilityIds ? Prisma.sql`f.id IN (${Prisma.join(filters.facilityIds)})` : Prisma.sql`TRUE`;
    const invoicePeriod=this.scope(filters,Prisma.sql`i."issuedAt"`, undefined, Prisma.sql`COALESCE(i."facilityIdSnapshot",r."facilityId")`);
    const paymentPeriod=this.scope(filters,Prisma.sql`p."receivedAt"`, undefined, Prisma.sql`COALESCE(i."facilityIdSnapshot",r."facilityId")`);
    const reservationPeriod=this.scope(filters,Prisma.sql`r."createdAt"`);
    const handoverPeriod=this.scope(filters,Prisma.sql`h."completedAt"`);
    const returnPeriod=this.scope(filters,Prisma.sql`rr."physicallyReturnedAt"`,undefined,Prisma.sql`COALESCE(rs.fid,r."facilityId")`);
    // Each fact is aggregated independently before joining to facilities; no
    // multiplication of invoices by contracts, payments or physical units.
    const rows=await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH scoped AS (SELECT f.id,f.code,f.name,f."bookingEnabled",f."operationalStatus" FROM "Facility" f WHERE ${facilityFilter}),
      units AS (SELECT t."facilityId" AS fid, COUNT(*) AS total,
        COUNT(*) FILTER (WHERE u.status='OCCUPIED') AS occupied, COUNT(*) FILTER (WHERE u.status='AVAILABLE') AS available,
        COUNT(*) FILTER (WHERE u.status='RESERVED') AS reserved, COUNT(*) FILTER (WHERE u.status='MAINTENANCE') AS maintenance
        FROM "StorageUnit" u JOIN "StorageType" t ON t.id=u."storageTypeId" JOIN scoped s ON s.id=t."facilityId" GROUP BY t."facilityId"),
      contracts AS (SELECT t."facilityId" AS fid,COUNT(*) AS active FROM "RentalContract" c JOIN "ReservationUnit" a ON a.id=c."reservationUnitId" JOIN "StorageUnit" u ON u.id=a."storageUnitId" JOIN "StorageType" t ON t.id=u."storageTypeId" JOIN scoped s ON s.id=t."facilityId" WHERE c.status='ACTIVE' AND a."releasedAt" IS NULL GROUP BY t."facilityId"),
      bookings AS (SELECT r."facilityId" AS fid,COUNT(*) AS count FROM "Reservation" r JOIN scoped s ON s.id=r."facilityId" WHERE ${reservationPeriod} GROUP BY r."facilityId"),
      billed AS (SELECT COALESCE(i."facilityIdSnapshot",r."facilityId") AS fid,SUM(i."rentalAmount") AS rent FROM "Invoice" i JOIN "Reservation" r ON r.id=i."reservationId" JOIN scoped s ON s.id=COALESCE(i."facilityIdSnapshot",r."facilityId") WHERE i.status<>'VOID' AND ${invoicePeriod} GROUP BY COALESCE(i."facilityIdSnapshot",r."facilityId")),
      debt AS (SELECT COALESCE(i."facilityIdSnapshot",r."facilityId") AS fid,SUM(i."balanceDue") AS amount FROM "Invoice" i JOIN "Reservation" r ON r.id=i."reservationId" JOIN scoped s ON s.id=COALESCE(i."facilityIdSnapshot",r."facilityId") WHERE i.status<>'VOID' AND i."balanceDue">0 GROUP BY COALESCE(i."facilityIdSnapshot",r."facilityId")),
      paid AS (SELECT COALESCE(i."facilityIdSnapshot",r."facilityId") AS fid,SUM(p.amount) AS amount FROM "Payment" p JOIN "Invoice" i ON i.id=p."invoiceId" JOIN "Reservation" r ON r.id=i."reservationId" JOIN scoped s ON s.id=COALESCE(i."facilityIdSnapshot",r."facilityId") WHERE ${paymentPeriod} GROUP BY COALESCE(i."facilityIdSnapshot",r."facilityId")),
      handovers AS (SELECT r."facilityId" AS fid,COUNT(*) AS count FROM "HandoverAppointment" h JOIN "Reservation" r ON r.id=h."reservationId" JOIN scoped s ON s.id=r."facilityId" WHERE h.status='COMPLETED' AND h."completedAt" IS NOT NULL AND ${handoverPeriod} GROUP BY r."facilityId"),
      return_site AS (SELECT ri."returnRequestId" AS rid, CASE WHEN COUNT(DISTINCT t."facilityId")=1 THEN MIN(t."facilityId") END AS fid FROM "ReturnInspection" ri JOIN "StorageUnit" u ON u.id=ri."storageUnitId" JOIN "StorageType" t ON t.id=u."storageTypeId" GROUP BY ri."returnRequestId"),
      returns AS (SELECT COALESCE(rs.fid,r."facilityId") AS fid,COUNT(*) AS count FROM "ReturnRequest" rr JOIN "Reservation" r ON r.id=rr."reservationId" LEFT JOIN return_site rs ON rs.rid=rr.id JOIN scoped s ON s.id=COALESCE(rs.fid,r."facilityId") WHERE rr."physicallyReturnedAt" IS NOT NULL AND ${returnPeriod} GROUP BY COALESCE(rs.fid,r."facilityId"))
      SELECT s.*,u.total,u.occupied,u.available,u.reserved,u.maintenance,c.active,b.count AS "newReservations",h.count AS handovers,rr.count AS returns,
        COALESCE(bi.rent,0)::text AS rent,COALESCE(d.amount,0)::text AS debt,COALESCE(p.amount,0)::text AS received
      FROM scoped s LEFT JOIN units u ON u.fid=s.id LEFT JOIN contracts c ON c.fid=s.id LEFT JOIN bookings b ON b.fid=s.id
      LEFT JOIN billed bi ON bi.fid=s.id LEFT JOIN debt d ON d.fid=s.id LEFT JOIN paid p ON p.fid=s.id LEFT JOIN handovers h ON h.fid=s.id LEFT JOIN returns rr ON rr.fid=s.id ORDER BY s.code,s.id`);
    return {asOf:new Date().toISOString(),items:rows.map(r=>({id:r.id,code:r.code,name:r.name,bookingEnabled:r.bookingEnabled,operationalStatus:r.operationalStatus,units:{total:number(r.total),occupied:number(r.occupied),available:number(r.available),reserved:number(r.reserved),maintenance:number(r.maintenance)},activeContracts:number(r.active),newReservations:number(r.newReservations),handovers:number(r.handovers),returns:number(r.returns),rent:r.rent,debt:r.debt,received:r.received}))};
  }
  async dashboardTrend(input: Record<string, unknown>, actor: PublicUser) {
    await assertActiveRole(this.prisma,actor,'BUSINESS_OPERATIONS_MANAGER');
    const filters={...reportFilters(input),typeId:'',facilityIds:await this.permittedFacilities(input,actor)};
    const group=filters.group;
    const bucket=(column:Prisma.Sql)=>Prisma.sql`to_char(date_trunc(${group},${column}+interval '7 hours'),${group==='year'?'YYYY':group==='month'?'YYYY-MM':'YYYY-MM-DD'})`;
    const rows=await this.prisma.$queryRaw<{date:string;billed:string;received:string}[]>(Prisma.sql`
      SELECT date,SUM(billed)::text AS billed,SUM(received)::text AS received FROM (
        SELECT ${bucket(Prisma.sql`i."issuedAt"`)} AS date,SUM(i."rentalAmount")+SUM(i."serviceAmount") AS billed,0::numeric AS received
        FROM "Invoice" i JOIN "Reservation" r ON r.id=i."reservationId" WHERE i.status<>'VOID' AND ${this.scope(filters,Prisma.sql`i."issuedAt"`, undefined, Prisma.sql`COALESCE(i."facilityIdSnapshot",r."facilityId")`)} GROUP BY date
        UNION ALL
        SELECT ${bucket(Prisma.sql`p."receivedAt"`)} AS date,0::numeric AS billed,SUM(p.amount) AS received
        FROM "Payment" p JOIN "Invoice" i ON i.id=p."invoiceId" JOIN "Reservation" r ON r.id=i."reservationId" WHERE ${this.scope(filters,Prisma.sql`p."receivedAt"`, undefined, Prisma.sql`COALESCE(i."facilityIdSnapshot",r."facilityId")`)} GROUP BY date
      ) series GROUP BY date ORDER BY date`);
    return {group,asOf:new Date().toISOString(),items:rows};
  }
  async summary(input: Record<string, unknown>, actor:PublicUser) {
    await assertActiveRole(this.prisma,actor,actor.role==='BUSINESS_OPERATIONS_MANAGER'?'BUSINESS_OPERATIONS_MANAGER':'FACILITY_MANAGER');
    const filters = {...reportFilters(input),facilityIds:await this.permittedFacilities(input,actor)}, group = filters.group;
    const bucket = (column: Prisma.Sql) => Prisma.sql`to_char(date_trunc(${group}, ${column} + interval '7 hours'), ${group === 'year' ? 'YYYY' : group === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'})`;
    const invoiceType = Prisma.sql`COALESCE(i."storageTypeIdSnapshot", r."quoteSnapshot"->>'storageTypeId', r."storageTypeId")`;
    const invoiceScope = this.scope(filters, Prisma.sql`i."issuedAt"`, invoiceType, Prisma.sql`COALESCE(i."facilityIdSnapshot",r."facilityId")`), paymentScope = this.scope(filters, Prisma.sql`p."receivedAt"`, invoiceType, Prisma.sql`COALESCE(i."facilityIdSnapshot",r."facilityId")`), bookingScope = this.scope(filters, Prisma.sql`r."createdAt"`);
    // Aggregate in PostgreSQL; clients receive groups, not every transaction/customer.
    const [invoiceGroups, paymentGroups, bookingGroups, units, totals, voids] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(Prisma.sql`SELECT ${invoiceType} AS id, t.name, ${bucket(Prisma.sql`i."issuedAt"`)} AS date, SUM(i."rentalAmount") AS rent, SUM(i."depositAmount") AS deposit, SUM(i."totalAmount") AS total, SUM(i."amountPaid") AS paid, SUM(i."balanceDue") AS debt, COUNT(*) AS count, SUM(CASE WHEN i."dueAt" <= NOW() AND i."balanceDue" > 0 THEN i."balanceDue" ELSE 0 END) AS overdue FROM "Invoice" i JOIN "Reservation" r ON r.id = i."reservationId" JOIN "StorageType" t ON t.id = ${invoiceType} WHERE i.status <> 'VOID' AND ${invoiceScope} GROUP BY ${invoiceType}, t.name, date`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`SELECT ${bucket(Prisma.sql`p."receivedAt"`)} AS date, SUM(p.amount) AS received, COUNT(*) AS count FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId" JOIN "Reservation" r ON r.id = i."reservationId" WHERE ${paymentScope} GROUP BY date`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`SELECT r."storageTypeId" AS id, t.name, ${bucket(Prisma.sql`r."createdAt"`)} AS date, COUNT(*) AS requests, COUNT(*) FILTER(WHERE r.status = 'CONFIRMED') AS confirmed, SUM(r.quantity) AS units FROM "Reservation" r JOIN "StorageType" t ON t.id = r."storageTypeId" WHERE ${bookingScope} GROUP BY r."storageTypeId", t.name, date`),
      this.prisma.storageUnit.groupBy({ by: ['storageTypeId', 'status'], where: { ...(filters.typeId?{storageTypeId:filters.typeId}:{}),...(filters.facilityIds===undefined?{}:{storageType:{facilityId:{in:filters.facilityIds}}}) }, _count: true }),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`SELECT COUNT(DISTINCT a."storageUnitId") AS allocated FROM "ReservationUnit" a JOIN "StorageUnit" u ON u.id=a."storageUnitId" JOIN "StorageType" t ON t.id=u."storageTypeId" JOIN "Reservation" r ON r.id=a."reservationId" WHERE r.status = 'CONFIRMED' AND a."releasedAt" IS NULL AND ${this.scope(filters,Prisma.sql`r."createdAt"`,Prisma.sql`t.id`,Prisma.sql`t."facilityId"`)}`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`SELECT COUNT(*) AS count FROM "Invoice" i JOIN "Reservation" r ON r.id=i."reservationId" WHERE i.status = 'VOID' AND ${invoiceScope}`),
    ]);
    const categories = new Map<string, Row>(), times = new Map<string, Row>();
    const category = (row: Row) => { if (!categories.has(row.id)) categories.set(row.id, { id: row.id, name: row.name, requests: 0, confirmed: 0, units: 0, rent: 0, physicalUnits: 0, occupied: 0 }); return categories.get(row.id)!; };
    const time = (date: string) => { if (!times.has(date)) times.set(date, { date, rent: 0, received: 0, bookings: 0 }); return times.get(date)!; };
    const sums = { rent: 0, deposit: 0, total: 0, paid: 0, debt: 0, received: 0, overdue: 0, invoiceCount: 0, paymentCount: 0, bookingCount: 0, confirmedCount: 0, allocatedUnits: number(totals[0]?.allocated) };
    for (const row of invoiceGroups) { for (const key of ['rent', 'deposit', 'total', 'paid', 'debt', 'overdue'] as const) sums[key] += number(row[key]); sums.invoiceCount += number(row.count); category(row).rent += number(row.rent); time(row.date).rent += number(row.rent); }
    for (const row of bookingGroups) { const c = category(row); c.requests += number(row.requests); c.confirmed += number(row.confirmed); c.units += number(row.units); sums.bookingCount += number(row.requests); sums.confirmedCount += number(row.confirmed); time(row.date).bookings += number(row.requests); }
    for (const row of paymentGroups) { sums.received += number(row.received); sums.paymentCount += number(row.count); time(row.date).received += number(row.received); }
    for (const row of units) { const c = categories.get(row.storageTypeId); if (c) { c.physicalUnits += row._count; if (row.status === 'OCCUPIED') c.occupied += row._count; } }
    for (const value of Object.values(sums)) number(value);
    return { asOf: new Date().toISOString(), filters, ...sums, missingAmounts: 0, missingPayments: 0, voidCount: number(voids[0]?.count), categories: [...categories.values()].sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name, 'vi')), times: [...times.values()].sort((a, b) => a.date.localeCompare(b.date)), unitSummary: units.map(row => ({ typeId: row.storageTypeId, status: row.status, count: row._count })), dateSemantics: { bookings: 'Ngày tạo đơn', rent: 'Ngày phát hành hóa đơn; không gồm cọc/dịch vụ', received: 'Ngày nhận tiền; có thể gồm cọc/dịch vụ', occupancy: 'Hiện tại, không phải lịch sử' } };
  }
  async csv(input: Record<string, unknown>, actor:PublicUser) {
    await assertActiveRole(this.prisma,actor,actor.role==='BUSINESS_OPERATIONS_MANAGER'?'BUSINESS_OPERATIONS_MANAGER':'FACILITY_MANAGER');
    const filters = {...reportFilters(input),facilityIds:await this.permittedFacilities(input,actor)}, invoiceType = Prisma.sql`COALESCE(i."storageTypeIdSnapshot", r."quoteSnapshot"->>'storageTypeId', r."storageTypeId")`, scope = this.scope(filters, Prisma.sql`i."issuedAt"`, invoiceType, Prisma.sql`COALESCE(i."facilityIdSnapshot",r."facilityId")`);
    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`SELECT i."invoiceCode" AS "Mã hóa đơn", t.name AS "Loại kho", i."issuedAt" AS "Ngày phát hành", i."rentalAmount" AS "Tiền thuê VND", i."depositAmount" AS "Cọc VND", i."serviceAmount" AS "Dịch vụ VND", i."chargeAmount" AS "Phí khác VND", i."totalAmount" AS "Tổng VND", i."amountPaid" AS "Đã thu VND", i."balanceDue" AS "Còn thu VND" FROM "Invoice" i JOIN "Reservation" r ON r.id=i."reservationId" JOIN "StorageType" t ON t.id=${invoiceType} WHERE i.status <> 'VOID' AND ${scope} ORDER BY i."issuedAt", i.id LIMIT 10001`);
    if (rows.length > 10000) throw new BadRequestException('Có hơn 10.000 hóa đơn. Chọn khoảng thời gian nhỏ hơn để xuất đủ dữ liệu.');
    const headers = ['Mã hóa đơn', 'Loại kho', 'Ngày phát hành', 'Tiền thuê VND', 'Cọc VND', 'Dịch vụ VND', 'Phí khác VND', 'Tổng VND', 'Đã thu VND', 'Còn thu VND'];
    const escape = (value: unknown) => { const text = value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : JSON.stringify(value, (_key, entry: unknown) => typeof entry === 'bigint' ? entry.toString() : entry) ?? ''; return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"'; };
    return '\uFEFF' + [headers, ...rows.map(row => headers.map(key => row[key]))].map(row => row.map(escape).join(',')).join('\r\n');
  }
}
