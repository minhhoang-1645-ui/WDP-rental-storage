import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

@Injectable()
export class UnitStaffService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  enabled() { return this.config.get<string>('UNIT_STAFF_ASSIGNMENTS_ENABLED') === 'true'; }
  async list(actor: PublicUser) {
    if (!['MANAGER', 'STAFF'].includes(actor.role)) throw new ForbiddenException('Chức năng dành cho quản lý và nhân viên phụ trách.');
    if (!this.enabled()) return { enabled: false, items: [], message: 'Phân công theo kho chưa được bật. Cần áp dụng migration đã chuẩn bị trước khi bật cấu hình.' };
    const items = await this.prisma.unitStaffAssignment.findMany({ where: { endedAt: null, ...(actor.role === 'STAFF' ? { staffUserId: actor.id } : {}) }, include: this.include(), orderBy: { storageUnit: { unitNumber: 'asc' } } });
    return { enabled: true, items };
  }
  async assign(unitId: string, input: Record<string, unknown>, actor: PublicUser) {
    if (actor.role !== 'MANAGER') throw new ForbiddenException('Chỉ quản lý được phân công người phụ trách kho.');
    if (!this.enabled()) throw new ServiceUnavailableException({ code: 'UNIT_ASSIGNMENTS_NOT_ENABLED', message: 'Phân công theo kho chưa được bật; database hiện chưa được thay đổi.' });
    const staffUserId = typeof input.staffUserId === 'string' ? input.staffUserId.trim() : '';
    if (!staffUserId || !Object.hasOwn(input, 'expectedAssignmentId') || input.expectedAssignmentId !== null && typeof input.expectedAssignmentId !== 'string') throw new BadRequestException('Cần chọn nhân viên và gửi phiên bản phân công hiện tại.');
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StorageUnit" WHERE "id" = ${unitId} FOR UPDATE`);
        if (!await tx.storageUnit.findUnique({ where: { id: unitId }, select: { id: true } })) throw new NotFoundException('Không tìm thấy kho.');
        const staff = await tx.user.findFirst({ where: { id: staffUserId, role: 'STAFF', accountStatus: 'ACTIVE' }, select: { id: true } });
        if (!staff) throw new BadRequestException('Nhân viên phải là STAFF đang hoạt động.');
        const current = await tx.unitStaffAssignment.findFirst({ where: { storageUnitId: unitId, endedAt: null } });
        if (current?.staffUserId === staffUserId) return tx.unitStaffAssignment.findUniqueOrThrow({ where: { id: current.id }, include: this.include() });
        if ((current?.id ?? null) !== input.expectedAssignmentId) throw new ConflictException('Phân công đã thay đổi. Vui lòng tải lại danh sách kho.');
        const now = new Date();
        if (current) await tx.unitStaffAssignment.update({ where: { id: current.id }, data: { endedAt: now } });
        const assigned = await tx.unitStaffAssignment.create({ data: { storageUnitId: unitId, staffUserId, assignedByUserId: actor.id, assignedAt: now }, include: this.include() });
        await tx.supportRequest.updateMany({ where: { storageUnitId: unitId, assignedStaffUserId: null, status: 'OPEN', subject: { not: 'Đề nghị trả kho trước hạn' } }, data: { assignedStaffUserId: staffUserId, status: 'ASSIGNED' } });
        await tx.maintenanceRequest.updateMany({ where: { storageUnitId: unitId, assignedStaffUserId: null, status: 'OPEN' }, data: { assignedStaffUserId: staffUserId } });
        await tx.stockMovement.updateMany({ where: { status: 'REQUESTED', assignedStaffUserId: null, rentalContract: { reservationUnit: { storageUnitId: unitId } } }, data: { assignedStaffUserId: staffUserId, assignedByUserId: actor.id, assignedAt: now, status: 'ASSIGNED' } });
        return assigned;
      }, { isolationLevel: 'Serializable', timeout: 20000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('Kho vừa được phân công bởi thao tác khác. Vui lòng tải lại.');
      throw error;
    }
  }
  async resolveStaff(tx: Prisma.TransactionClient, unitIds: string[]) {
    if (!this.enabled() || !unitIds.length) return null;
    const ids = [...new Set(unitIds)];
    const rows = await tx.unitStaffAssignment.findMany({ where: { storageUnitId: { in: ids }, endedAt: null, staff: { role: 'STAFF', accountStatus: 'ACTIVE' } }, select: { staffUserId: true, assignedByUserId: true } });
    if (rows.length !== ids.length || new Set(rows.map(row => row.staffUserId)).size !== 1) return null;
    return rows[0];
  }
  private include() { return { storageUnit: { select: { id: true, unitNumber: true, floor: true, zone: true, status: true } }, staff: { select: { id: true, fullName: true, email: true, accountStatus: true } }, assignedBy: { select: { id: true, fullName: true } } }; }
}
