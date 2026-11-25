import { managerReservationScope } from '../facility-access/record-access.js';
import type { PublicUser } from '../auth/auth.types.js';
import { facilityScope, currentRentalScope, currentContractScope, renewalTaskScope, supportTaskScope, returnTaskScope } from '../facility-access/task-access.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { businessToday } from '../../business-date.js';
import { unitHistoryCounts, unitMetadataLocked } from './unit-edit-policy.js';
import { canonicalUnitFloor, canonicalUnitZone, unitFloorValues } from './unit-location.js';

const allocationContract = { id: true, contractCode: true, status: true, startDate: true, endDate: true } as const;
const unitAllocationInclude = { reservation: { include: { customer: true } }, contract: { select: allocationContract } } as const;
type UnitAllocation = Prisma.ReservationUnitGetPayload<{ include: typeof unitAllocationInclude }>;

function openAllocation(allocation: UnitAllocation) {
  return allocation.reservation.status === 'CONFIRMED' && allocation.releasedAt === null
    && allocation.contract?.status !== 'COMPLETED' && allocation.contract?.status !== 'CANCELLED';
}

function byAllocationStart(left: UnitAllocation, right: UnitAllocation) {
  return left.plannedStartDate.getTime() - right.plannedStartDate.getTime() || left.id.localeCompare(right.id);
}

const staffUnitSelect = {
  id: true, unitNumber: true, status: true, floor: true, zone: true, row: true, position: true,
  storageType: { select: { id: true, code: true, name: true } },
} satisfies Prisma.StorageUnitSelect;
const staffUnit = ({ unitNumber, ...unit }: Prisma.StorageUnitGetPayload<{ select: typeof staffUnitSelect }>) => ({ ...unit, unitCode: unitNumber });

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

  async dashboardSummary(actor: PublicUser) {
    const scope=managerReservationScope(actor);
    const now = new Date();
    const today = businessToday(now);
    const [pendingReservations, activeRentalRows, overdueRows, upcomingAppointments, pendingRenewals, openSupportRequests, maintenanceUnits, pendingDepositSettlements, availableUnits, occupiedUnits] = await Promise.all([
      this.prisma.reservation.count({ where: { AND:[scope], status: 'PENDING' } }),
      this.prisma.rentalContract.findMany({ where: { ...currentContractScope(actor), status: 'ACTIVE' }, distinct: ['reservationId'], select: { reservationId: true } }),
      this.prisma.rentalContract.findMany({ where: { ...currentContractScope(actor), status: 'ACTIVE', endDate: { lte: today } }, distinct: ['reservationId'], select: { reservationId: true } }),
      this.prisma.handoverAppointment.count({ where: { reservation:scope, status: { in: ['REQUESTED', 'CONFIRMED'] }, scheduledAt: { gte: now } } }),
      this.prisma.renewalRequest.count({ where: { ...renewalTaskScope(actor), status: { in: ['PENDING', 'APPROVED_PENDING_PAYMENT'] } } }),
      this.prisma.supportRequest.count({ where: { ...supportTaskScope(actor), status: { not: 'RESOLVED' } } }),
      this.prisma.storageUnit.count({ where: { storageType:{facility:scope.facility}, status: 'MAINTENANCE' } }),
      this.prisma.depositSettlement.count({ where: { returnRequest:returnTaskScope(actor), status: { not: 'SETTLED' } } }),
      this.prisma.storageUnit.count({ where: { storageType:{facility:scope.facility}, status: 'AVAILABLE' } }),
      this.prisma.storageUnit.count({ where: { storageType:{facility:scope.facility}, status: 'OCCUPIED' } }),
    ]);
    return { pendingReservations, activeRentals: activeRentalRows.length, overdueRentals: overdueRows.length, upcomingAppointments, pendingRenewals, openSupportRequests, maintenanceUnits, pendingDepositSettlements, availableUnits, occupiedUnits };
  }

  private unitFilters(query: UnitListQuery, aliases = false): Prisma.StorageUnitWhereInput {
    return {
      ...(query.search ? { unitNumber: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.floor ? { floor: { ...(aliases ? { in: unitFloorValues(query.floor) } : { equals: query.floor }), mode: 'insensitive' } } : {}),
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
  }

  async listStaffUnits(query: UnitListQuery, staffId: string) {
    const { page, limit } = query;
    const where = { AND: [this.unitFilters(query), { storageType: { facility: facilityScope({id:staffId,role:'FACILITY_STAFF'}) } }] };
    const [total, units] = await Promise.all([
      this.prisma.storageUnit.count({ where }),
      this.prisma.storageUnit.findMany({ where, select: staffUnitSelect, skip: (page - 1) * limit, take: limit, orderBy: [{ unitNumber: 'asc' }, { id: 'asc' }] }),
    ]);
    return { page, limit, total, items: units.map(staffUnit) };
  }

  async listUnits(query: UnitListQuery, actor: PublicUser) {
    managerReservationScope(actor);
    const where = { AND: [this.unitFilters(query, true), { storageType: { facility: facilityScope(actor) } }] };
    const today = this.today();
    const total = await this.prisma.storageUnit.count({ where });
    const units = await this.prisma.storageUnit.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ unitNumber: 'asc' }, { id: 'asc' }],
      include: {
        storageType: true,
        maintenanceRequests: {
          where: { status: { in: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION'] } },
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, maintenanceCode: true, status: true, priority: true },
        },
        reservationUnits: {
          where: {
            releasedAt: null,
            OR: [{ plannedEndDate: { gt: today } }, { contract: { is: { status: 'ACTIVE' } } }],
            reservation: { status: 'CONFIRMED' },
          },
          include: unitAllocationInclude,
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

  async getStaffUnit(id: string, staffId: string) {
    const notFound = () => new NotFoundException('Không tìm thấy kho vật lý tại cơ sở được cấp quyền.');
    const unit = await this.prisma.storageUnit.findFirst({
      where: { storageType: { facility: facilityScope({id:staffId,role:'FACILITY_STAFF'}) }, OR: [{ id }, { unitNumber: { equals: id, mode: 'insensitive' } }] },
      select: staffUnitSelect,
    });
    if (!unit) throw notFound();
    return staffUnit(unit);
  }

  async getUnit(id: string, actor: PublicUser) {
    managerReservationScope(actor);
    const unit = await this.prisma.storageUnit.findFirst({
      where: { storageType: { facility: facilityScope(actor) }, OR: [{ id }, { unitNumber: { equals: id, mode: 'insensitive' } }] },
      include: {
        _count: { select: unitHistoryCounts },
        storageType: true,
        maintenanceRequests: {
          where: { status: { in: ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION'] } },
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, maintenanceCode: true, status: true, priority: true },
        },
        reservationUnits: {
          include: unitAllocationInclude,
          orderBy: [{ plannedStartDate: 'desc' }, { id: 'asc' }],
        },
      },
    });
    if (!unit) throw new NotFoundException('Không tìm thấy kho vật lý.');
    const audit = await this.prisma.auditEvent.findMany({
      where: { resource: 'units', resourceId: unit.id, outcome: 'SUCCESS', action: { in: ['CREATE', 'UPDATE'] } },
      select: { id: true, action: true, actorName: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const today = this.today();
    const summary = this.toUnit(unit, today);
    return {
      ...summary,
      currentAllocation: summary.allocationSummary.current,
      futureAllocations: summary.allocationSummary.future,
      allocations: unit.reservationUnits.map(allocation => ({ ...this.toAllocation(allocation), createdAt: allocation.createdAt.toISOString() })),
      editLocked: unitMetadataLocked(unit.status, unit._count),
      history: audit,
      createdAt: unit.createdAt.toISOString(),
      updatedAt: unit.updatedAt.toISOString(),
    };
  }

  async listCustomers(query: CustomerListQuery, actor: PublicUser) {
    const scope={OR:[managerReservationScope(actor),currentRentalScope(actor)]};
    const where: Prisma.UserWhereInput = { reservations:{some:scope},
      role: 'STORAGE_CUSTOMER',
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
        accountStatus: true,
        createdAt: true,
        _count: { select: { reservations: {where:scope} } },
        reservations: { where:scope,
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
        accountStatus: customer.accountStatus,
        createdAt: customer.createdAt.toISOString(),
        reservationCount: customer._count.reservations,
        latestReservation: customer.reservations[0] ? this.toReservationSummary(customer.reservations[0]) : null,
      })),
    };
  }

  async getCustomer(id: string, actor: PublicUser) {
    const scope={OR:[managerReservationScope(actor),currentRentalScope(actor)]};
    const customer = await this.prisma.user.findFirst({
      where: { id, role: 'STORAGE_CUSTOMER', reservations:{some:scope} },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        accountStatus: true,
        createdAt: true,
        updatedAt: true,
        reservations: { where:scope,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          include: {
            storageType: true,
            units: { where:{storageUnit:{storageType:{facility:facilityScope(actor)}}}, include: { storageUnit: true }, orderBy: { createdAt: 'asc' } },
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
      accountStatus: customer.accountStatus,
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
    const eligible = (unit.reservationUnits as UnitAllocation[]).filter(openAllocation).sort(byAllocationStart);
    const current = eligible.find(allocation => allocation.contract?.status === 'ACTIVE')
      ?? eligible.find(allocation => allocation.plannedStartDate <= today && allocation.plannedEndDate > today);
    const future = eligible.filter(allocation => allocation.contract?.status !== 'ACTIVE' && allocation.plannedStartDate > today);
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
      floor: canonicalUnitFloor(unit.floor),
      zone: canonicalUnitZone(unit.zone),
      row: unit.row,
      position: unit.position,
      status: unit.status,
      activeMaintenance: unit.maintenanceRequests?.[0] ?? null,
      maintenanceStatus: unit.maintenanceRequests?.[0]?.status ?? null,
      maintenancePriority: unit.maintenanceRequests?.[0]?.priority ?? null,
      allocationSummary: {
        current: current ? this.toAllocation(current) : null,
        future: future.map(allocation => this.toAllocation(allocation)),
      },
    };
  }

  private toAllocation(allocation: UnitAllocation) {
    return {
      id: allocation.id,
      reservationReference: allocation.reservation.reservationCode,
      reservationStatus: allocation.reservation.status,
      customer: {
        id: allocation.reservation.customer.id,
        fullName: allocation.reservation.customer.fullName,
        email: allocation.reservation.customer.email,
      },
      contract: allocation.contract ?? null,
      startDate: this.isoDate(allocation.plannedStartDate),
      endDate: this.isoDate(!allocation.releasedAt && allocation.contract?.status === 'ACTIVE'
        ? allocation.contract.endDate ?? allocation.plannedEndDate : allocation.plannedEndDate),
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
    return businessToday();
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
