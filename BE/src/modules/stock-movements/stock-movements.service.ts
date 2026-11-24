import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { managerReservationScope } from '../facility-access/record-access.js';

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  getCustomer(actor: PublicUser, id: string) {
    if (actor.role !== 'STORAGE_CUSTOMER') throw new ForbiddenException();
    return this.findHistorical(id, {
      customerUserId: actor.id,
      rentalContract: { reservation: { customerId: actor.id } },
    });
  }

  getManager(actor: PublicUser, id: string) {
    return this.findHistorical(id, { rentalContract: { reservation: managerReservationScope(actor) } });
  }

  private async findHistorical(id: string, scope: Prisma.StockMovementWhereInput) {
    const record = await this.prisma.stockMovement.findFirst({
      where: { ...scope, OR: [{ id }, { movementCode: id }] },
      select: {
        id: true, movementCode: true, type: true, status: true, note: true, completionNote: true,
        createdAt: true, scheduledAt: true, completedAt: true, locationRecordedAt: true,
        storageUnitId: true, unitCodeSnapshot: true, floorSnapshot: true, zoneSnapshot: true,
        storageUnitSnapshot: true,
        rentalContract: { select: { id: true, contractCode: true } },
        lines: {
          orderBy: { id: 'asc' },
          select: {
            id: true, requestedQty: true, actualQty: true, note: true,
            storedItem: { select: { id: true, itemCode: true, name: true, unit: true } },
          },
        },
      },
    });
    if (!record) throw new NotFoundException('Không tìm thấy phiếu lưu trữ lịch sử.');
    const { storageUnitId, storageUnitSnapshot, unitCodeSnapshot, floorSnapshot, zoneSnapshot, locationRecordedAt, ...history } = record;
    return {
      ...history,
      readOnly: true,
      storageUnit: locationRecordedAt && storageUnitId && unitCodeSnapshot
        ? { id: storageUnitId, unitNumber: unitCodeSnapshot, floor: floorSnapshot, zone: zoneSnapshot }
        : null,
      storageUnitAtCompletion: storageUnitSnapshot,
      locationEvidence: locationRecordedAt ? 'RECORDED' : 'UNKNOWN_LEGACY',
    };
  }
}
