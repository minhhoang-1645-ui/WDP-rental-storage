import { first, object, rows, type Row } from '../components/manager/portal-data';

const unitCode = (unit: Row) => first(unit, 'unitCode', 'unitNumber', 'storageUnit.unitCode', 'storageUnit.unitNumber');
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export function physicalUnitCodes(row: Row, resource: string): string[] {
  switch (resource) {
    case 'reservations': {
      const allocations = rows(row.allocatedUnits);
      const live = allocations.filter(item => !item.releasedAt);
      return unique((live.length ? live : allocations).map(unitCode));
    }
    case 'appointments': {
      if (row.status === 'COMPLETED' || row.status === 'CANCELLED') {
        return unique([...rows(object(row.handoverReport).unitChecks), ...rows(row.historicalUnits)].map(unitCode));
      }
      return unique(rows(row.allocatedUnits).map(unitCode));
    }
    case 'contracts':
      return unique([first(row, 'storageUnit.unitCode', 'unit.unitCode')]);
    case 'renewals': {
      const stored = first(row, 'quoteSnapshot.scope.unitCode', 'quote.scope.unitCode');
      if (stored) return [stored];
      const signed = rows(object(object(row.appendix).snapshot).contracts);
      if (signed.length) return unique(signed.map(unitCode));
      if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(String(row.status))) return [];
      return unique(rows(row.contracts).map(unitCode));
    }
    case 'returns':
      return unique(rows(row.inspections).map(item => unitCode(object(item.unit))));
    case 'transfers':
      return unique([unitCode(object(row.fromUnit)), unitCode(object(row.toUnit))]);
    case 'damage-claims':
      return unique([first(row, 'unitCodeSnapshot')]);
    case 'support-requests':
      return unique([unitCode(object(row.unit))]);
    case 'maintenance':
      return unique([unitCode(object(row.unit)), ...rows(row.affectedUnits).map(unitCode)]);
    default:
      return [];
  }
}

export function physicalUnitLabel(row: Row, resource: string) {
  if (resource !== 'transfers') return physicalUnitCodes(row, resource).join(', ');
  const from = unitCode(object(row.fromUnit));
  const to = unitCode(object(row.toUnit));
  if (!from && !to) return '';
  const source = first(row, 'fromUnit.facility.name', 'sourceFacility.name');
  const destination = first(row, 'toUnit.facility.name', 'destinationFacility.name');
  const sourceId = first(row, 'fromUnit.facility.id', 'sourceFacility.id');
  const destinationId = first(row, 'toUnit.facility.id', 'destinationFacility.id');
  const crossFacility = source && destination && (sourceId && destinationId ? sourceId !== destinationId : source !== destination);
  return (from ? [from, crossFacility && source].filter(Boolean).join(' · ') : 'Chưa xác định kho nguồn')
    + ' → ' + (to ? [to, crossFacility && destination].filter(Boolean).join(' · ') : 'Chưa chọn kho đích');
}
