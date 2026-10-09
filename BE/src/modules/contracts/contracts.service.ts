import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface ContractListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: 'PENDING_PAYMENT' | 'READY_FOR_HANDOVER' | 'ACTIVE' | 'COMPLETED';
}

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureForConfirmedReservation(tx: Prisma.TransactionClient, reservationId: string) {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: {
        units: { include: { storageUnit: true }, orderBy: { id: 'asc' } },
      },
    });
    if (!reservation || reservation.status !== 'CONFIRMED') {
      throw new ConflictException('Chỉ Reservation CONFIRMED mới được tạo RentalContract.');
    }
    if (reservation.units.length !== reservation.quantity) {
      throw new ConflictException('Reservation CONFIRMED phải có đủ ReservationUnit trước khi tạo RentalContract.');
    }

    const units = [...reservation.units].sort((first, second) => first.storageUnit.unitNumber.localeCompare(second.storageUnit.unitNumber) || first.id.localeCompare(second.id));
    for (const [index, unit] of units.entries()) {
      await tx.rentalContract.upsert({
        where: { reservationUnitId: unit.id },
        update: {},
        create: {
          contractCode: `${reservation.reservationCode}-C${String(index + 1).padStart(2, '0')}`,
          reservationId: reservation.id,
          reservationUnitId: unit.id,
          status: 'PENDING_PAYMENT',
          startDate: reservation.startDate,
          endDate: reservation.endDate,
        },
      });
    }
  }

  async listCustomerContracts(customerId: string, query: Pick<ContractListQuery, 'page' | 'limit'>) {
    const where: Prisma.RentalContractWhereInput = { reservation: { customerId } };
    const total = await this.prisma.rentalContract.count({ where });
    const contracts = await this.prisma.rentalContract.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: this.contractInclude(),
    });
    return { page: query.page, limit: query.limit, total, items: contracts.map((contract) => this.toContract(contract, false)) };
  }

  async getCustomerContract(customerId: string, id: string) {
    const contract = await this.prisma.rentalContract.findFirst({
      where: { OR: [{ id }, { contractCode: id }], reservation: { customerId } },
      include: this.contractInclude(),
    });
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng.');
    return this.toContract(contract, true);
  }

  async listManagerContracts(query: ContractListQuery) {
    const where: Prisma.RentalContractWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? {
        OR: [
          { contractCode: { contains: query.search, mode: 'insensitive' } },
          { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } },
          { reservation: { customer: { fullName: { contains: query.search, mode: 'insensitive' } } } },
          { reservation: { customer: { email: { contains: query.search, mode: 'insensitive' } } } },
          { reservationUnit: { storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } } },
        ],
      } : {}),
    };
    const total = await this.prisma.rentalContract.count({ where });
    const contracts = await this.prisma.rentalContract.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: this.contractInclude(),
    });
    return { page: query.page, limit: query.limit, total, items: contracts.map((contract) => this.toContract(contract, true)) };
  }

  async getManagerContract(id: string) {
    const contract = await this.prisma.rentalContract.findFirst({
      where: { OR: [{ id }, { contractCode: id }] },
      include: this.contractInclude(),
    });
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng.');
    return this.toContract(contract, true);
  }

  private contractInclude() {
    return {
      reservation: {
        include: {
          customer: { select: { id: true, fullName: true, email: true, phone: true } },
          storageType: { select: { id: true, code: true, name: true, sizeId: true, sizeName: true, condition: true } },
        },
      },
      reservationUnit: { include: { storageUnit: { select: { id: true, unitNumber: true, floor: true, zone: true, row: true, position: true, status: true } } } },
    };
  }

  private toContract(contract: any, includeCustomer: boolean) {
    const reservation = contract.reservation;
    const storageUnit = contract.reservationUnit.storageUnit;
    return {
      id: contract.id,
      contractCode: contract.contractCode,
      status: contract.status,
      startDate: this.isoDate(contract.startDate),
      endDate: this.isoDate(contract.endDate),
      reservation: {
        id: reservation.id,
        reference: reservation.reservationCode,
        status: reservation.status,
        quantity: reservation.quantity,
        ...(includeCustomer ? { customer: { id: reservation.customer.id, fullName: reservation.customer.fullName, email: reservation.customer.email, phone: reservation.customer.phone ?? '' } } : {}),
      },
      storageType: reservation.storageType,
      storageUnit: {
        id: storageUnit.id,
        unitCode: storageUnit.unitNumber,
        floor: storageUnit.floor,
        zone: storageUnit.zone,
        row: storageUnit.row,
        position: storageUnit.position,
        physicalStatus: storageUnit.status,
      },
      reservationPricing: reservation.quoteSnapshot,
      createdAt: contract.createdAt.toISOString(),
      updatedAt: contract.updatedAt.toISOString(),
      activatedAt: contract.activatedAt?.toISOString() ?? null,
      completedAt: contract.completedAt?.toISOString() ?? null,
    };
  }

  private isoDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
