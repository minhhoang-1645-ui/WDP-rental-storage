import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { businessToday } from '../../business-date.js';

@Controller(['manager/overstays', 'staff/management/overstays'])
@UseGuards(AuthGuard, RolesGuard)
@Roles('MANAGER', 'STAFF')
export class OverstayController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async list(@Query('page') pageText?: string) {
    const page = Number(pageText ?? 1), limit = 25;
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new BadRequestException('Trang không hợp lệ.');
    const today = businessToday(), where = { status: 'ACTIVE' as const, endDate: { lte: today }, reservationUnit: { releasedAt: null } };
    const [total, rows] = await Promise.all([
      this.prisma.rentalContract.count({ where }),
      this.prisma.rentalContract.findMany({ where, orderBy: [{ endDate: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit, include: {
        reservation: { select: { id: true, reservationCode: true, customer: { select: { fullName: true, phone: true } }, returnRequests: { select: { id: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1 } } },
        reservationUnit: { include: { storageUnit: { select: { unitNumber: true, floor: true, zone: true } } } },
        storedItems: { where: { balance: { gt: 0 } }, select: { id: true, name: true, unit: true, balance: true } },
      } }),
    ]);
    return { page, limit, total, items: rows.map(row => ({ id: row.id, contractCode: row.contractCode, reservationId: row.reservationId, reference: row.reservation.reservationCode, customer: row.reservation.customer, storageUnit: row.reservationUnit.storageUnit, endDate: row.endDate.toISOString().slice(0, 10), overdueDays: Math.floor((today.getTime() - row.endDate.getTime()) / 86400000) + 1, storedItems: row.storedItems, returnRequest: row.reservation.returnRequests[0] ?? null, message: 'Đã hết kỳ thuê, chưa hoàn tất trả kho. Kho vẫn bị chặn cho tới khi lấy hết hàng và hoàn tất kiểm tra.' })) };
  }
}
