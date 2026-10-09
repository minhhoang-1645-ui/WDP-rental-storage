import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface UnitListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE';
  storageType?: string;
  floor?: string;
  zone?: string;
}

export interface CustomerListQuery {
  page: number;
  limit: number;
  search?: string;
}

@Injectable()
export class ManagerService {
  constructor(private readonly prisma: PrismaService) {}

  async listUnits(query: UnitListQuery) {
    const where: Prisma.StorageUnitWhereInput = {
      ...(query.search ? { unitNumber: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.floor ? { floor: { equals: query.floor, mode: 'insensitive' } } : {}),
      ...(query.zone ? { zone: { equals: query.zone, mode: 'insensitive' } } : {}),
      ...(query.storageType ? {
        storageType: {
          is: {
            OR: [
              { id: query.storageType },
              { code: { equals: query.storageType, mode: 'insensitive' } },
            ],
          },
        },
      } : {}),
    };
    const today = this.today();
    const total = await this.prisma.storageUnit.count({ where });
    const units = await this.prisma.storageUnit.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ unitNumber: 'asc' }, { id: 'asc' }],
      include: {
        storageType: true,
        reservationUnits: {
          where: {
            releasedAt: null,
            plannedEndDate: { gt: today },
            reservation: { status: 'CONFIRMED' },
          },
          include: { reservation: { include: { customer: true } } },
          orderBy: [{ plannedStartDate: 'asc' }, { id: 'asc' }],
        },
      },
    });
    return {
      page: query.page,
      limit: query.limit,
      total,
      items: units.map((unit) => this.toUnit(unit, today)),
    };
  }

  async getUnit(id: string) {
    const unit = await this.prisma.storageUnit.findFirst({
      where: { OR: [{ id }, { unitNumber: { equals: id, mode: 'insensitive' } }] },
      include: {
        storageType: true,
        reservationUnits: {
          include: { reservation: { include: { customer: true } } },
          orderBy: [{ plannedStartDate: 'desc' }, { id: 'asc' }],
        },
      },
    });
    if (!unit) throw new NotFoundException('Không tìm thấy kho vật lý.');
    const today = this.today();
    const allocations = unit.reservationUnits.map((allocation) => this.toAllocation(allocation));
    const isActive = (allocation: typeof unit.reservationUnits[number]) => allocation.reservation.status === 'CONFIRMED'
      && allocation.releasedAt === null
      && allocation.plannedStartDate <= today
      && allocation.plannedEndDate > today;
    const isFuture = (allocation: typeof unit.reservationUnits[number]) => allocation.reservation.status === 'CONFIRMED'
      && allocation.releasedAt === null
      && allocation.plannedStartDate > today;
    return {
      ...this.toUnit({ ...unit, reservationUnits: unit.reservationUnits.filter((allocation) => isActive(allocation) || isFuture(allocation)) }, today),
      currentAllocation: unit.reservationUnits.find(isActive) ? this.toAllocation(unit.reservationUnits.find(isActive)!) : null,
      futureAllocations: unit.reservationUnits.filter(isFuture).map((allocation) => this.toAllocation(allocation)),
      allocations,
      createdAt: unit.createdAt.toISOString(),
      updatedAt: unit.updatedAt.toISOString(),
    };
  }

  async listCustomers(query: CustomerListQuery) {
    const where: Prisma.UserWhereInput = {
      role: 'CUSTOMER',
      ...(query.search ? {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const total = await this.prisma.user.count({ where });
    const customers = await this.prisma.user.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        createdAt: true,
        _count: { select: { reservations: true } },
        reservations: {
          take: 1,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          include: { storageType: true },
        },
      },
    });
    return {
      page: query.page,
      limit: query.limit,
      total,
      items: customers.map((customer) => ({
        id: customer.id,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone ?? '',
        accountStatus: 'ACTIVE' as const,
        createdAt: customer.createdAt.toISOString(),
        reservationCount: customer._count.reservations,
        latestReservation: customer.reservations[0] ? this.toReservationSummary(customer.reservations[0]) : null,
      })),
    };
  }

  async getCustomer(id: string) {
    const customer = await this.prisma.user.findFirst({
      where: { id, role: 'CUSTOMER' },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        reservations: {
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          include: {
            storageType: true,
            units: { include: { storageUnit: true }, orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng.');
    return {
      id: customer.id,
      fullName: customer.fullName,
      email: customer.email,
      phone: customer.phone ?? '',
      accountStatus: 'ACTIVE' as const,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
      reservationCount: customer.reservations.length,
      reservations: customer.reservations.map((reservation) => ({
        ...this.toReservationSummary(reservation),
        allocatedUnits: reservation.units.map((allocation) => ({
          unitId: allocation.storageUnitId,
          unitCode: allocation.storageUnit.unitNumber,
          plannedStartDate: this.isoDate(allocation.plannedStartDate),
          plannedEndDate: this.isoDate(allocation.plannedEndDate),
          releasedAt: allocation.releasedAt?.toISOString() ?? null,
        })),
      })),
    };
  }

  private toUnit(unit: any, today: Date) {
    const allocations = unit.reservationUnits.map((allocation: any) => this.toAllocation(allocation));
    return {
      id: unit.id,
      unitCode: unit.unitNumber,
      storageType: { id: unit.storageType.id, code: unit.storageType.code, name: unit.storageType.name },
      category: { id: unit.storageType.sizeId, name: unit.storageType.sizeName },
      condition: unit.storageType.condition,
      dimensions: {
        widthCm: unit.storageType.widthCm,
        lengthCm: unit.storageType.lengthCm,
        heightCm: unit.storageType.heightCm,
        display: this.dimensions(unit.storageType),
      },
      floor: unit.floor,
      zone: unit.zone,
      row: unit.row,
      position: unit.position,
      status: unit.status,
      allocationSummary: {
        current: allocations.find((allocation: any) => this.date(allocation.startDate) <= today && this.date(allocation.endDate) > today) ?? null,
        future: allocations.filter((allocation: any) => this.date(allocation.startDate) > today),
      },
    };
  }

  private toAllocation(allocation: any) {
    return {
      id: allocation.id,
      reservationReference: allocation.reservation.reservationCode,
      reservationStatus: allocation.reservation.status,
      customer: {
        id: allocation.reservation.customer.id,
        fullName: allocation.reservation.customer.fullName,
        email: allocation.reservation.customer.email,
      },
      startDate: this.isoDate(allocation.plannedStartDate),
      endDate: this.isoDate(allocation.plannedEndDate),
      releasedAt: allocation.releasedAt?.toISOString() ?? null,
    };
  }

  private toReservationSummary(reservation: any) {
    return {
      id: reservation.id,
      reference: reservation.reservationCode,
      storageType: { id: reservation.storageType.id, code: reservation.storageType.code, name: reservation.storageType.name },
      quantity: reservation.quantity,
      startDate: this.isoDate(reservation.startDate),
      endDate: this.isoDate(reservation.endDate),
      status: reservation.status,
      createdAt: reservation.createdAt.toISOString(),
    };
  }

  private today() {
    return this.date(new Date().toISOString().slice(0, 10));
  }

  private date(value: string) {
    return new Date(value + 'T00:00:00.000Z');
  }

  private isoDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private dimensions(value: { widthCm: number; lengthCm: number; heightCm: number }) {
    return `${this.meters(value.widthCm)} × ${this.meters(value.lengthCm)} × ${this.meters(value.heightCm)} m`;
  }

  private meters(value: number) {
    return (value / 100).toFixed(1).replace('.', ',');
  }
}
