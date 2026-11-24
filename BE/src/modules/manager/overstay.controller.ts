import { staffContractScope, reservationScope } from '../facility-access/task-access.js';
import { Controller, Get, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { businessToday } from '../../business-date.js';

@Controller(['manager/overstays', 'staff/management/overstays'])
@UseGuards(AuthGuard, RolesGuard)
@Roles('FACILITY_MANAGER', 'FACILITY_STAFF')
export class OverstayController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async list(@Req() request: AuthenticatedRequest, @Query('page') pageText?: string) {
    const page = Number(pageText ?? 1), limit = 25;
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new BadRequestException('Trang không hợp lệ.');
    const today = businessToday();
    const staffId = request.user!.role === 'FACILITY_STAFF' ? request.user!.id : undefined;
    const activeReturn: Prisma.ReturnRequestWhereInput = { assignedStaffUserId: staffId, physicallyReturnedAt: null, status: { in: ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'] } };
    const where: Prisma.RentalContractWhereInput = { status: 'ACTIVE', endDate: { lte: today }, reservationUnit: { releasedAt: null } };
    if (staffId) where.AND = [staffContractScope(request.user!)]; else where.reservation = reservationScope(request.user!);
    const [total, rows] = await Promise.all([
      this.prisma.rentalContract.count({ where }),
      this.prisma.rentalContract.findMany({ where, orderBy: [{ endDate: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit, include: {
        reservation: { select: { reservationCode: true, customer: { select: { fullName: true, phone: true } } } },
        returnInspections: {
          where: { returnRequest: activeReturn },
          select: { returnRequest: { select: { id: true, status: true } } },
          orderBy: [{ returnRequest: { createdAt: 'desc' } }, { id: 'desc' }],
          take: 1,
        },
        reservationUnit: { include: { storageUnit: { select: { unitNumber: true, floor: true, zone: true } } } },
      } }),
    ]);
    return { page, limit, total, items: rows.map(row => ({ id: row.id, contractCode: row.contractCode, reservationId: row.reservationId, reference: row.reservation.reservationCode, customer: row.reservation.customer, storageUnit: row.reservationUnit.storageUnit, endDate: row.endDate.toISOString().slice(0, 10), overdueDays: Math.floor((today.getTime() - row.endDate.getTime()) / 86400000) + 1, returnRequest: row.returnInspections[0]?.returnRequest ?? null, message: 'Đã hết kỳ thuê, chưa hoàn tất trả kho. Kho vẫn bị chặn cho tới khi xác nhận đã dọn trống và hoàn tất kiểm tra hiện trạng.' })) };
  }
}
