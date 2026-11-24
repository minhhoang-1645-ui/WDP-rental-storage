import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';

type Db = Prisma.TransactionClient;
export async function facilityIds(db: Db, actor: PublicUser) {
  if (!['FACILITY_MANAGER', 'FACILITY_STAFF'].includes(actor.role)) throw new ForbiddenException('Vai trò không có quyền vận hành cơ sở.');
  const user = await db.user.findFirst({ where: { id: actor.id, role: actor.role, accountStatus: 'ACTIVE' }, select: { id: true } });
  if (!user) throw new ForbiddenException('Quyền tài khoản đã thay đổi. Vui lòng đăng nhập lại.');
  const rows = await db.facilityAccess.findMany({ where: { userId: actor.id, revokedAt: null }, select: { facilityId: true } });
  return rows.map(row => row.facilityId);
}
export async function assertFacility(db: Db, actor: PublicUser, id: string) {
  if (!(await facilityIds(db, actor)).includes(id)) throw new ForbiddenException('Bạn chưa được cấp quyền tại cơ sở này.');
}
async function assignmentCounts(db: Db, userId: string, closed = false) {
  const assignedStaffUserId = userId;
  const counts = await Promise.all([
    db.handoverAppointment.count({ where: { assignedStaffUserId, status: closed ? { notIn: ['REQUESTED', 'CONFIRMED'] } : { in: ['REQUESTED', 'CONFIRMED'] } } }),
    db.stockMovement.count({ where: { assignedStaffUserId, status: closed ? { notIn: ['REQUESTED', 'ASSIGNED'] } : { in: ['REQUESTED', 'ASSIGNED'] } } }),
    db.returnRequest.count({ where: { assignedStaffUserId, status: closed ? 'COMPLETED' : { not: 'COMPLETED' } } }),
    db.maintenanceRequest.count({ where: { assignedStaffUserId, status: closed ? 'COMPLETED' : { not: 'COMPLETED' } } }),
    db.supportRequest.count({ where: { assignedStaffUserId, status: closed ? 'RESOLVED' : { not: 'RESOLVED' } } }),
    db.transferRequest.count({ where: { assignedStaffUserId, status: closed ? { notIn: ['REQUESTED', 'APPROVED'] } : { in: ['REQUESTED', 'APPROVED'] } } }),
    db.damageClaim.count({ where: { assignedStaffId: userId, status: closed ? 'RESOLVED' : { not: 'RESOLVED' } } }),
  ]);
  return counts.reduce((total, count) => total + count, 0);
}

export async function assertNoOpenAssignments(db: Db, userId: string) {
  if (await assignmentCounts(db, userId)) throw new ConflictException('Tài khoản còn công việc chưa hoàn tất. Quản lý cần phân công lại trước.');
}
@Injectable()
export class FacilityAccessService {
  constructor(private readonly prisma: PrismaService) {}
  async list(actor:PublicUser) {
    await this.assertAdmin(this.prisma, actor);
    const [facilities, items, users] = await Promise.all([
      this.prisma.facility.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      this.prisma.facilityAccess.findMany({ where: { revokedAt: null }, include: { user: { select: { id: true, fullName: true, role: true } }, facility: { select: { id: true, name: true } } }, orderBy: { grantedAt: 'desc' } }),
      this.prisma.user.findMany({where:{role:{in:['FACILITY_STAFF','FACILITY_MANAGER']}},select:{id:true,fullName:true,role:true,email:true,accountStatus:true},orderBy:{fullName:'asc'}}),
    ]);
    return { facilities, items, users };
  }
  async userAccess(actor: PublicUser, id: string) {
    await this.assertAdmin(this.prisma, actor);
    const user = await this.prisma.user.findUnique({
      where: { id }, select: { id: true, role: true, accountStatus: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    const [history, openAssignments, closedAssignments, sessions] = await Promise.all([
      this.prisma.facilityAccess.findMany({ where: { userId: id }, orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, facilityId: true, facility: { select: { name: true } }, grantedAt: true, revokedAt: true, grantedById: true, revokedById: true } }),
      assignmentCounts(this.prisma, id),
      assignmentCounts(this.prisma, id, true),
      this.prisma.authSession.findMany({
        where: { userId: id, expiresAt: { gt: new Date() } },
        select: { expiresAt: true, tokenHash: true }, orderBy: { expiresAt: 'desc' },
      }),
    ]);
    const actorIds = [...new Set(history.flatMap(item => item.revokedById ? [item.grantedById, item.revokedById] : [item.grantedById]))];
    const actors = actorIds.length ? await this.prisma.user.findMany({
      where: { id: { in: actorIds } }, select: { id: true, fullName: true },
    }) : [];
    const actorNames = new Map(actors.map(item => [item.id, item.fullName]));
    const grants = history.map(item => ({
      ...item,
      grantedByName: actorNames.get(item.grantedById) ?? null,
      revokedByName: item.revokedById ? actorNames.get(item.revokedById) ?? null : null,
    }));
    return { history: grants, openAssignments, closedAssignments, sessions: sessions.map(session => ({
      expiresAt: session.expiresAt, status: user.accountStatus !== 'ACTIVE' || session.tokenHash.startsWith('disabled:') ? 'REVOKED' : 'ACTIVE',
    })) };
  }

  async revokeSessions(actor: PublicUser, id: string) {
    if (id === actor.id) throw new ForbiddenException('Đăng xuất để kết thúc phiên hiện tại của bạn.');
    return this.prisma.$transaction(async tx => {
      await this.admin(tx, actor);
      await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', id);
      if (!await tx.user.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Không tìm thấy tài khoản.');
      const { count } = await tx.authSession.deleteMany({
        where: { userId: id, NOT: { tokenHash: { startsWith: 'disabled:' } } },
      });
      await this.audit(tx, actor, 'REVOKE_SESSIONS', id, '/admin/users/:id/sessions/revoke', { count });
      return { count };
    });
  }

  async changeRole(actor:PublicUser,id:string,role:unknown,expectedRole?:unknown) {
    if(typeof role!=='string'||!['FACILITY_STAFF','FACILITY_MANAGER','BUSINESS_OPERATIONS_MANAGER'].includes(role))throw new BadRequestException('Chỉ đổi giữa các vai trò nội bộ. Không tạo quyền Admin tại đây.');
    if(id===actor.id)throw new ForbiddenException('Không tự thay đổi quyền của mình.');
    return this.prisma.$transaction(async tx=>{
      await this.admin(tx,actor);
      await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',id);
      const target=await tx.user.findUnique({where:{id},select:{id:true,role:true}});
      if(!target)throw new NotFoundException('Không tìm thấy tài khoản.');
      if(!['FACILITY_STAFF','FACILITY_MANAGER','BUSINESS_OPERATIONS_MANAGER'].includes(target.role))throw new ConflictException('Không chuyển tài khoản khách hàng hoặc quản trị viên bằng chức năng này.');
      if (expectedRole !== undefined && target.role !== expectedRole) throw new ConflictException('Vai trò đã thay đổi. Hãy tải lại tài khoản.');
      if(target.role===role)return {changed:false};
      await assertNoOpenAssignments(tx,id);
      if(await tx.facilityAccess.count({where:{userId:id,revokedAt:null}}))throw new ConflictException('Thu hồi quyền cơ sở cũ trước khi đổi vai trò.');
      await tx.user.update({where:{id},data:{role:role as 'FACILITY_STAFF'|'FACILITY_MANAGER'|'BUSINESS_OPERATIONS_MANAGER'}});
      await tx.authSession.deleteMany({where:{userId:id}});
      await this.audit(tx, actor, 'CHANGE_ROLE', id, '/admin/facility-access/users/:id/role', { previousRole: target.role, nextRole: role });
      return {changed:true};
    });
  }
  private async admin(tx: Db, actor: PublicUser) {
    await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(hashtext($1))', 'nestbox-iam');
    await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE role=\'SYSTEM_ADMINISTRATOR\' ORDER BY id FOR UPDATE');
    await this.assertAdmin(tx, actor);
  }
  private async assertAdmin(tx: Db, actor: PublicUser) {
    if (actor.role !== 'SYSTEM_ADMINISTRATOR' || !await tx.user.findFirst({ where: { id: actor.id, role: 'SYSTEM_ADMINISTRATOR', accountStatus: 'ACTIVE' }, select: { id: true } })) throw new ForbiddenException('Chỉ quản trị hệ thống đang hoạt động được quản lý quyền truy cập.');
  }
  private async audit(tx: Db, actor: PublicUser, action: string, resourceId: string, route: string, metadata: Prisma.InputJsonObject, method = 'PATCH') {
    await tx.auditEvent.create({ data: {
      category: 'ACTIVITY', action, resource: 'users', resourceId, route, method, metadata,
      outcome: 'SUCCESS', httpStatus: method === 'POST' ? 201 : 200,
      actorId: actor.id, actorName: actor.fullName, actorEmail: actor.email, actorRole: actor.role,
    } });
  }

  async grant(actor: PublicUser, body: Record<string, unknown>) {
    if (typeof body.userId !== 'string' || typeof body.facilityId !== 'string') throw new BadRequestException('Chọn tài khoản và cơ sở.');
    const userId = body.userId, facilityId = body.facilityId;
    return this.prisma.$transaction(async tx => {
      await this.admin(tx, actor);
      await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', userId);
      const user = await tx.user.findFirst({ where: { id: userId, role: { in: ['FACILITY_STAFF', 'FACILITY_MANAGER'] }, accountStatus: 'ACTIVE' }, select: { id: true } });
      if (!user || !await tx.facility.findUnique({ where: { id: facilityId }, select: { id: true } })) throw new BadRequestException('Chỉ cấp quyền cơ sở cho nhân viên hoặc quản lý đang hoạt động.');
      const activeKey = JSON.stringify([userId, facilityId]);
      const existing = await tx.facilityAccess.findUnique({ where: { activeKey } });
      if (existing) return existing;
      const grant = await tx.facilityAccess.create({ data: { id: randomUUID(), userId, facilityId, activeKey, grantedById: actor.id } });
      await this.audit(tx, actor, 'GRANT_FACILITY_ACCESS', userId, '/admin/facility-access', { facilityId, accessId: grant.id }, 'POST');
      return grant;
    });
  }
  async revoke(actor: PublicUser, id: string) {
    return this.prisma.$transaction(async tx => {
      await this.admin(tx, actor);
      const row = await tx.facilityAccess.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Không tìm thấy quyền cơ sở.');
      await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', row.userId);
      if (!row.revokedAt) {
        await assertNoOpenAssignments(tx, row.userId);
        await tx.facilityAccess.update({ where: { id }, data: { activeKey: null, revokedById: actor.id, revokedAt: new Date() } });
        await tx.authSession.deleteMany({ where: { userId: row.userId } });
        await this.audit(tx, actor, 'REVOKE_FACILITY_ACCESS', row.userId, '/admin/facility-access/:id/revoke', { facilityId: row.facilityId, accessId: id });
      }
      return { revoked: true };
    });
  }
}

export type AssignmentReference={reservationId?:string;rentalContractId?:string;storageUnitId?:string};
export async function assertAssignmentAccess(tx:Db,actor:PublicUser,staffId:string,reference:AssignmentReference){
 if(actor.role!=='FACILITY_MANAGER')throw new ForbiddenException('Chỉ quản lý được phân công.');
 await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id IN ($1,$2) ORDER BY id FOR UPDATE',actor.id,staffId);
 const staff=await tx.user.findFirst({where:{id:staffId,role:'FACILITY_STAFF',accountStatus:'ACTIVE'},select:{id:true,role:true,accountStatus:true}});
 if(!staff)throw new BadRequestException('Chỉ giao việc cho nhân viên đang hoạt động.');
 let id:string|undefined;
 if(reference.reservationId)id=(await tx.reservation.findUnique({where:{id:reference.reservationId},select:{facilityId:true}}))?.facilityId;
 else if(reference.rentalContractId)id=(await tx.rentalContract.findUnique({where:{id:reference.rentalContractId},select:{reservation:{select:{facilityId:true}}}}))?.reservation.facilityId;
 else if(reference.storageUnitId)id=(await tx.storageUnit.findUnique({where:{id:reference.storageUnitId},select:{storageType:{select:{facilityId:true}}}}))?.storageType.facilityId;
 if(!id)throw new BadRequestException('Không xác định được cơ sở của công việc.');
 await assertFacility(tx,actor,id);
 if(!await tx.facilityAccess.findFirst({where:{userId:staffId,facilityId:id,revokedAt:null},select:{id:true}}))throw new ForbiddenException('Nhân viên chưa được cấp quyền tại cơ sở của công việc.');
 return staff;
}
