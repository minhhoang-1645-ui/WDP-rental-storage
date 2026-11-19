export function isCustomerTransferSubject(subject: unknown) {
  return typeof subject === 'string' && /chuyen (doi )?kho/.test(subject.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'));
}

export function isTransferRequest(row: { subject?: unknown; resolutionType?: unknown }) {
  return row.resolutionType === 'TRANSFER_RECOMMENDED' || isCustomerTransferSubject(row.subject);
}
