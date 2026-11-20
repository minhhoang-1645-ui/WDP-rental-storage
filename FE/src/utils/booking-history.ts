type HistoryRow = Record<string, unknown>;
function value(row: HistoryRow, path: string): string {
  let current: unknown = row;
  for (const key of path.split('.')) current = current && typeof current === 'object' ? (current as HistoryRow)[key] : undefined;
  return typeof current === 'string' || typeof current === 'number' ? String(current) : '';
}
export function bookingHistory(reservations: HistoryRow[], contracts: HistoryRow[]) {
  return reservations.map(reservation => {
    // Booking returns a public reference as id; contracts return both reference and database id.
    const reference = value(reservation, 'id');
    const linked = contracts.filter(contract => [value(contract, 'reservation.reference'), value(contract, 'reservation.id')].includes(reference));
    const complete = linked.length >= Number(reservation.quantity || 1) && linked.every(contract => contract.status === 'COMPLETED');
    const phase = ['CANCELLED', 'EXPIRED', 'REJECTED'].includes(value(reservation, 'status')) ? value(reservation, 'status') : complete ? 'RETURNED' : linked.some(contract => contract.status === 'ACTIVE') ? 'ACTIVE' : linked.some(contract => contract.status === 'READY_FOR_HANDOVER') ? 'READY' : linked.some(contract => contract.status === 'PENDING_PAYMENT') ? 'PAYMENT' : value(reservation, 'status');
    const phaseLabel = ({ RETURNED: 'Đã trả kho', ACTIVE: 'Đang thuê', READY: 'Chờ nhận kho', PAYMENT: 'Chờ thanh toán', PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', REJECTED: 'Không được chấp thuận', CANCELLED: 'Đã hủy', EXPIRED: 'Đã hết hạn giữ kho' } as Record<string, string>)[phase] || 'Đã cập nhật';
    const startDate = linked.map(contract => value(contract, 'startDate')).filter(Boolean).sort()[0] || value(reservation, 'startDate');
    const endDate = linked.map(contract => value(contract, 'endDate')).filter(Boolean).sort().at(-1) || value(reservation, 'endDateExclusive') || value(reservation, 'endDate');
    const unitCodes = [...new Set(linked.map(contract => value(contract, 'storageUnit.unitCode')).filter(Boolean))];
    return { reservation, reference, contracts: linked, phase, phaseLabel, startDate, endDate, unitCodes,
      searchText: [reference, value(reservation, 'product.name'), ...unitCodes, ...linked.map(contract => value(contract, 'contractCode'))].join(' ').toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'),
    };
  }).sort((a, b) => (Date.parse(value(b.reservation, 'createdAt')) || 0) - (Date.parse(value(a.reservation, 'createdAt')) || 0) || a.reference.localeCompare(b.reference));
}
export function matchesHistorySearch(text: string, search: string) {
  return text.includes(search.trim().toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'));
}
