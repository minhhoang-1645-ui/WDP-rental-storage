import { BadRequestException, Controller, ForbiddenException, Get, Query, Req, UseGuards } from '@nestjs/common';
import { isIsoCalendarDate } from '../../business-date.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { facilityScope } from '../facility-access/task-access.js';

@Controller(['operations/reports/maintenance-costs', 'manager/reports/maintenance-costs'])
@UseGuards(AuthGuard, RolesGuard)
@Roles('BUSINESS_OPERATIONS_MANAGER', 'FACILITY_MANAGER')
export class MaintenanceCostReportController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    const actor = request.user;
    if (!actor || (actor.role !== 'BUSINESS_OPERATIONS_MANAGER' && actor.role !== 'FACILITY_MANAGER')) throw new ForbiddenException();
    const from = this.date(query.from);
    const to = this.date(query.to);
    if (from && to && from > to) throw new BadRequestException('Khoảng ngày không hợp lệ.');
    const facilityId = typeof query.facilityId === 'string' ? query.facilityId : '';
    if (actor.role === 'FACILITY_MANAGER' && facilityId && !await this.prisma.facility.count({
      where: { AND: [facilityScope(actor), { id: facilityId }] },
    })) throw new ForbiddenException('Bạn không có quyền xem báo cáo cơ sở này.');
    const managerScope = actor.role === 'FACILITY_MANAGER'
      ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "FacilityAccess" fa JOIN "User" u ON u.id = fa."userId"
        WHERE fa."facilityId" = f.id AND fa."userId" = ${actor.id} AND fa."revokedAt" IS NULL
          AND u.role = 'FACILITY_MANAGER' AND u."accountStatus" = 'ACTIVE'
      ) ${actor.selectedFacilityId ? Prisma.sql`AND f.id = ${actor.selectedFacilityId}` : Prisma.empty}`
      : Prisma.empty;
    return this.prisma.$transaction(async tx => {
      const items = await tx.$queryRaw(Prisma.sql`
        WITH reports AS (
          SELECT coalesce(m."commonAreaFacilityId", st."facilityId") AS facility_id, m.category,
            (m."createdAt" + INTERVAL '7 hours')::date AS created_day,
            (m."costConfirmedAt" + INTERVAL '7 hours')::date AS confirmed_day,
            m."actualCostVnd"
          FROM "MaintenanceRequest" m
          LEFT JOIN "StorageUnit" u ON u.id = m."storageUnitId"
          LEFT JOIN "StorageType" st ON st.id = u."storageTypeId"
        ), entries AS (
          SELECT facility_id, category, created_day AS day, 1 AS tickets,
            CASE WHEN confirmed_day IS NULL THEN "actualCostVnd" END AS pending,
            NULL::numeric AS confirmed
          FROM reports
          UNION ALL
          SELECT facility_id, category, confirmed_day, 0, NULL, "actualCostVnd"
          FROM reports WHERE confirmed_day IS NOT NULL
        )
        SELECT f.id AS "facilityId", f.name AS "facilityName", r.category::text AS category,
          to_char(r.day, 'YYYY-MM') AS month, sum(r.tickets)::int AS "ticketCount",
          sum(r.confirmed)::text AS "confirmedVnd", sum(r.pending)::text AS "pendingVnd"
        FROM entries r JOIN "Facility" f ON f.id = r.facility_id
        WHERE TRUE
          ${managerScope}
          ${this.period(Prisma.sql`r.day`, from, to)}
          ${facilityId ? Prisma.sql`AND f.id = ${facilityId}` : Prisma.empty}
        GROUP BY f.id, f.name, r.category, to_char(r.day, 'YYYY-MM')
        ORDER BY month DESC, f.name, r.category
      `);
      const revenue = await tx.$queryRaw(Prisma.sql`
        WITH billed AS (
          SELECT coalesce(i."facilityIdSnapshot", r."facilityId") AS facility_id,
            sum(i."rentalAmount") AS rent, sum(i."serviceAmount") AS services
          FROM "Invoice" i JOIN "Reservation" r ON r.id = i."reservationId"
          WHERE i.status <> 'VOID'
            ${this.period(Prisma.sql`(i."issuedAt" + INTERVAL '7 hours')::date`, from, to)}
          GROUP BY 1
        )
        SELECT f.id AS "facilityId", f.name AS "facilityName", coalesce(b.rent, 0)::text AS "rentVnd",
          coalesce(b.services, 0)::text AS "servicesVnd",
          (coalesce(b.rent, 0) + coalesce(b.services, 0))::text AS "totalVnd"
        FROM "Facility" f JOIN billed b ON b.facility_id = f.id
        WHERE TRUE
          ${managerScope}
          ${facilityId ? Prisma.sql`AND f.id = ${facilityId}` : Prisma.empty}
        ORDER BY f.name, f.id
      `);
      return { items, revenue };
    }, { isolationLevel: 'RepeatableRead' });
  }

  private period(day: Prisma.Sql, from: string, to: string) {
    return Prisma.sql`
      ${from ? Prisma.sql`AND ${day} >= ${from}::date` : Prisma.empty}
      ${to ? Prisma.sql`AND ${day} <= ${to}::date` : Prisma.empty}
    `;
  }

  private date(value: unknown) {
    if (value == null || value === '') return '';
    if (typeof value !== 'string' || !isIsoCalendarDate(value)) throw new BadRequestException('Ngày phải theo định dạng YYYY-MM-DD.');
    return value;
  }
}
