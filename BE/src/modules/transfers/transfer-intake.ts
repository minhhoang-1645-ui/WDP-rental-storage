import { ConflictException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';

export function isTransferSubject(subject: string) {
  return /chuyen (doi )?kho/.test(subject.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'));
}

export const transferSubjectFilter: Prisma.SupportRequestWhereInput = {
  OR: ['chuyển kho', 'chuyen kho', 'chuyển đổi kho', 'chuyen doi kho'].map(phrase => ({ subject: { contains: phrase, mode: 'insensitive' } })),
};
export const legacyTransferFilter: Prisma.SupportRequestWhereInput = {
  AND: [transferSubjectFilter, { status: { not: 'RESOLVED' }, transferRequests: { none: {} } }],
};

export async function assertTransferIntakeAvailable(tx: Prisma.TransactionClient, reservationId: string, rentalContractId: string) {
  if (await tx.transferRequest.findFirst({ where: { rentalContractId, status: { in: ['REQUESTED', 'APPROVED'] } }, select: { id: true } })) {
    throw new ConflictException('Kho đã có yêu cầu chuyển đang xử lý. Xem tiến độ trong Chuyển đổi kho.');
  }
  if (await tx.returnInspection.findFirst({ where: { rentalContractId, returnRequest: { status: { not: 'COMPLETED' } } }, select: { id: true } })) {
    throw new ConflictException('Kho đã có yêu cầu trả đang xử lý.');
  }
  if (await tx.renewalRequest.findFirst({ where: { reservationId, status: { in: ['PENDING', 'APPROVED_PENDING_PAYMENT'] }, OR: [{ rentalContractId: null }, { rentalContractId }] }, select: { id: true } })) {
    throw new ConflictException('Kho đang có yêu cầu gia hạn chưa hoàn tất.');
  }
}

export function createLinkedTransfer(tx: Prisma.TransactionClient, contract: { id: string; reservationId: string; reservationUnitId: string; reservationUnit: { storageUnitId: string } }, support: { id: string; customerUserId: string; category: string; createdAt: Date }) {
  return tx.transferRequest.create({ data: {
    transferCode: `WDP-TRF-${randomBytes(5).toString('hex').toUpperCase()}`,
    rentalContractId: contract.id, reservationId: contract.reservationId,
    fromReservationUnitId: contract.reservationUnitId, fromStorageUnitId: contract.reservationUnit.storageUnitId,
    requestedByUserId: support.customerUserId, supportRequestId: support.id, createdAt: support.createdAt,
    reason: support.category === 'FACILITY_EQUIPMENT_FAILURE' ? 'FACILITY_EQUIPMENT_FAILURE' : support.category === 'UNIT_ISSUE' ? 'UNIT_ISSUE' : 'OTHER',
    idempotencyKey: `customer-support:${support.id}`,
  }, select: { id: true } });
}
