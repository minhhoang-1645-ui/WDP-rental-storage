import { businessToday } from '../../business-date.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ActiveRentalListQuery } from './active-rentals.service.js';
import { deriveOverdueState } from './overdue-state.js';

export function staffRentalWhere(scope: Prisma.RentalContractWhereInput, query: ActiveRentalListQuery, now: Date): Prisma.ReservationWhereInput {
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
  const unit: Prisma.StorageUnitWhereInput = {
    ...(query.unitCode ? { unitNumber: contains(query.unitCode) } : {}),
    ...(query.storageType ? { OR: [{ storageTypeId: query.storageType }, { storageType: { code: contains(query.storageType) } }] } : {}),
  };
  const matchingContract: Prisma.RentalContractWhereInput = { AND: [scope, { reservationUnit: { storageUnit: unit } }] };
  const customerMatch = (value: string): Prisma.ReservationWhereInput[] => [
    { customer: { fullName: contains(value) } }, { customer: { email: contains(value) } },
  ];
  const filters: Prisma.ReservationWhereInput[] = [
    { contracts: { some: matchingContract } },
  ];
  if (query.search) filters.push({ OR: [
    { reservationCode: contains(query.search) }, ...customerMatch(query.search),
    { contracts: { some: { AND: [matchingContract, { OR: [
      { contractCode: contains(query.search) },
      { reservationUnit: { storageUnit: { unitNumber: contains(query.search) } } },
    ] }] } } },
  ] });
  if (query.customer) filters.push({ OR: customerMatch(query.customer) });
  if (query.overdue !== undefined) {
    const inTerm = { AND: [scope, { endDate: { gte: businessToday(now) } }] };
    filters.push({ contracts: query.overdue ? { none: inTerm } : { some: inTerm } });
  }
  return { AND: filters };
}

export function staffRentalSelect(scope: Prisma.RentalContractWhereInput) {
  return {
    id: true, reservationCode: true,
    customer: { select: { fullName: true, phone: true, email: true } },
    contracts: {
      where: scope, orderBy: [{ contractCode: 'asc' }, { id: 'asc' }],
      select: {
        id: true, contractCode: true, status: true, startDate: true, endDate: true,
        reservationUnit: { select: { storageUnit: { select: {
          id: true, unitNumber: true, status: true, floor: true, zone: true, row: true, position: true,
          storageType: { select: { id: true, name: true, code: true } },
        } } } },
      },
    },
  } satisfies Prisma.ReservationSelect;
}

export function staffRentalView(record: Prisma.ReservationGetPayload<{ select: ReturnType<typeof staffRentalSelect> }>, now: Date) {
  const contracts = record.contracts.map(({ reservationUnit, startDate, endDate, ...contract }) => {
    const { unitNumber, ...unit } = reservationUnit.storageUnit;
    return {
      ...contract, startDate: startDate.toISOString().slice(0, 10), endDate: endDate.toISOString().slice(0, 10),
      ...deriveOverdueState(endDate, now), unit: { ...unit, unitCode: unitNumber },
    };
  });
  const start = new Date(Math.min(...record.contracts.map(contract => +contract.startDate)));
  const end = new Date(Math.max(...record.contracts.map(contract => +contract.endDate)));
  const type = contracts[0].unit.storageType;
  const quantity = contracts.length;
  return {
    reservationId: record.id, reservationReference: record.reservationCode, customer: record.customer, contracts,
    storageType: contracts.every(contract => contract.unit.storageType.id === type.id) ? type : null,
    quantity, contractCount: quantity, unitCount: quantity,
    startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), ...deriveOverdueState(end, now),
  };
}
