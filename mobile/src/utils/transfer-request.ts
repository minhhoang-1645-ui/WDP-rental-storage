export function isTransferRequest(row: { subject?: unknown; resolutionType?: unknown }) {
  return row.resolutionType === 'TRANSFER_RECOMMENDED' || (typeof row.subject === 'string' && row.subject.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').includes('chuyen kho'))
}
