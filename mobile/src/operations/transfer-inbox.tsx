import { isTransferRequest } from '@/utils/transfer-request';
import { createAction } from './actions';
import { type FormAction } from './form';
import { codeOf, idOf, rows, text, type Row } from './model';

export function transferIntakeAllowed(source: Row, activeContracts: Row[]) {
  return isTransferRequest(source)
    && ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'].includes(String(source.status))
    && (source.status !== 'RESOLVED' || source.resolutionType === 'TRANSFER_RECOMMENDED')
    && !rows(source.transfers).some(transfer => transfer.status !== 'REJECTED')
    && activeContracts.some(contract => contract.status === 'ACTIVE' && text(contract, 'reservation.id') === text(source, 'reservation.id'));
}

export function transferFromSupport(source: Row): FormAction {
  const base = createAction('transfers')!;
  return { ...base, path: '/staff/management/transfers', description: `${text(source, 'customer.fullName')} · ${text(source, 'unit.unitCode')} · ${codeOf(source)}. Chọn hợp đồng thuộc yêu cầu này.`, fields: base.fields.map(field => field.name === 'rentalContractId' ? { ...field, initial: text(source, 'contract.id'), optionsAccept: row => text(row, 'reservation.id') === text(source, 'reservation.id'), optionLabel: row => `${text(row, 'reservation.customer.fullName')} · Kho ${text(row, 'storageUnit.unitCode')} · ${text(row, 'contractCode')}` } : field.name === 'supportRequestId' ? { ...field, initial: idOf(source), fixed: true } : field) };
}
