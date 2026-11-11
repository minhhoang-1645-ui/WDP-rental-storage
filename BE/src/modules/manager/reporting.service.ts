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
  private scope(query: ReturnType<typeof reportFilters>, column: Prisma.Sql, typeColumn: Prisma.Sql = Prisma.sql`COALESCE(r."quoteSnapshot"->>'storageTypeId', r."storageTypeId")`) {
    return Prisma.sql`${query.from ? Prisma.sql`${column} >= ${new Date(query.from + 'T00:00:00+07:00')}` : Prisma.sql`TRUE`} AND ${query.to ? Prisma.sql`${column} < ${new Date(Date.parse(query.to + 'T00:00:00+07:00') + 86400000)}` : Prisma.sql`TRUE`} AND ${query.typeId ? Prisma.sql`${typeColumn} = ${query.typeId}` : Prisma.sql`TRUE`}`;
  }
  async summary(input: Record<string, unknown>) {
    const filters = reportFilters(input), group = filters.group;
    const bucket = (column: Prisma.Sql) => Prisma.sql`to_char(date_trunc(${group}, ${column} + interval '7 hours'), ${group === 'year' ? 'YYYY' : group === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'})`;
    const invoiceType = Prisma.sql`COALESCE(i."storageTypeIdSnapshot", r."quoteSnapshot"->>'storageTypeId', r."storageTypeId")`;
    const invoiceScope = this.scope(filters, Prisma.sql`i."issuedAt"`, invoiceType), paymentScope = this.scope(filters, Prisma.sql`p."receivedAt"`, invoiceType), bookingScope = this.scope(filters, Prisma.sql`r."createdAt"`);
    // Aggregate in PostgreSQL; clients receive groups, not every transaction/customer.
    const [invoiceGroups, paymentGroups, bookingGroups, units, totals, voids] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(Prisma.sql`SELECT ${invoiceType} AS id, t.name, ${bucket(Prisma.sql`i."issuedAt"`)} AS date, SUM(i."rentalAmount") AS rent, SUM(i."depositAmount") AS deposit, SUM(i."totalAmount") AS total, SUM(i."amountPaid") AS paid, SUM(i."balanceDue") AS debt, COUNT(*) AS count, SUM(CASE WHEN i."dueAt" <= NOW() AND i."balanceDue" > 0 THEN i."balanceDue" ELSE 0 END) AS overdue FROM "Invoice" i JOIN "Reservation" r ON r.id = i."reservationId" JOIN "StorageType" t ON t.id = ${invoiceType} WHERE i.status <> 'VOID' AND ${invoiceScope} GROUP BY ${invoiceType}, t.name, date`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`SELECT ${bucket(Prisma.sql`p."receivedAt"`)} AS date, SUM(p.amount) AS received, COUNT(*) AS count FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId" JOIN "Reservation" r ON r.id = i."reservationId" WHERE ${paymentScope} GROUP BY date`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`SELECT r."storageTypeId" AS id, t.name, ${bucket(Prisma.sql`r."createdAt"`)} AS date, COUNT(*) AS requests, COUNT(*) FILTER(WHERE r.status = 'CONFIRMED') AS confirmed, SUM(r.quantity) AS units FROM "Reservation" r JOIN "StorageType" t ON t.id = r."storageTypeId" WHERE ${bookingScope} GROUP BY r."storageTypeId", t.name, date`),
      this.prisma.storageUnit.groupBy({ by: ['storageTypeId', 'status'], where: filters.typeId ? { storageTypeId: filters.typeId } : {}, _count: true }),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`SELECT COUNT(DISTINCT u."storageUnitId") AS allocated FROM "ReservationUnit" u JOIN "Reservation" r ON r.id=u."reservationId" WHERE r.status = 'CONFIRMED' AND ${bookingScope}`),
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
  async csv(input: Record<string, unknown>) {
    const filters = reportFilters(input), invoiceType = Prisma.sql`COALESCE(i."storageTypeIdSnapshot", r."quoteSnapshot"->>'storageTypeId', r."storageTypeId")`, scope = this.scope(filters, Prisma.sql`i."issuedAt"`, invoiceType);
    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`SELECT i."invoiceCode" AS "Mã hóa đơn", t.name AS "Loại kho", i."issuedAt" AS "Ngày phát hành", i."rentalAmount" AS "Tiền thuê VND", i."depositAmount" AS "Cọc VND", i."serviceAmount" AS "Dịch vụ VND", i."chargeAmount" AS "Phí khác VND", i."totalAmount" AS "Tổng VND", i."amountPaid" AS "Đã thu VND", i."balanceDue" AS "Còn thu VND" FROM "Invoice" i JOIN "Reservation" r ON r.id=i."reservationId" JOIN "StorageType" t ON t.id=${invoiceType} WHERE i.status <> 'VOID' AND ${scope} ORDER BY i."issuedAt", i.id LIMIT 10001`);
    if (rows.length > 10000) throw new BadRequestException('Có hơn 10.000 hóa đơn. Chọn khoảng thời gian nhỏ hơn để xuất đủ dữ liệu.');
    const headers = ['Mã hóa đơn', 'Loại kho', 'Ngày phát hành', 'Tiền thuê VND', 'Cọc VND', 'Dịch vụ VND', 'Phí khác VND', 'Tổng VND', 'Đã thu VND', 'Còn thu VND'];
    const escape = (value: unknown) => { const text = value instanceof Date ? value.toISOString() : String(value ?? ''); return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"'; };
    return '\uFEFF' + [headers, ...rows.map(row => headers.map(key => row[key]))].map(row => row.map(escape).join(',')).join('\r\n');
  }
}
