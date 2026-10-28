import { Text, View } from 'react-native';
import { isTransferRequest } from '@/utils/transfer-request';
import { useResource } from './use-resource';
import { createAction } from './actions';
import { type FormAction } from './form';
import { codeOf, idOf, rows, text, type Row } from './model';
import { Button, Navigation, Panel, styles } from './ui';

export function transferFromSupport(source: Row): FormAction {
  const base = createAction('transfers')!;
  return { ...base, path: '/staff/management/transfers', description: `${text(source, 'customer.fullName')} · ${text(source, 'unit.unitCode')} · ${codeOf(source)}. Chọn hợp đồng thuộc yêu cầu này.`, fields: base.fields.map(field => field.name === 'rentalContractId' ? { ...field, initial: text(source, 'contract.id'), optionsAccept: row => text(row, 'reservation.id') === text(source, 'reservation.id'), optionLabel: row => `${text(row, 'reservation.customer.fullName')} · Kho ${text(row, 'storageUnit.unitCode')} · ${text(row, 'contractCode')}` } : field.name === 'supportRequestId' ? { ...field, initial: idOf(source), fixed: true } : field) };
}
export function TransferInbox({ transfers, onCreate }: { transfers: Row[]; onCreate: (action: FormAction) => void }) {
  const data = useResource<Row>('/manager/support-requests', true);
  const pending = rows(data.data?.items).filter(row => isTransferRequest(row) && !transfers.some(transfer => text(transfer, 'supportRequest.id') === idOf(row) && transfer.status !== 'REJECTED') && (row.status !== 'RESOLVED' || row.resolutionType === 'TRANSFER_RECOMMENDED'));
  return <Panel title="Yêu cầu chuyển kho từ khách hàng">{data.loading ? <Text style={styles.copy}>Đang tải yêu cầu…</Text> : data.error ? <><Text style={styles.error}>{data.error}</Text><Button title="Thử lại yêu cầu chuyển kho" onPress={data.refresh} /></> : !pending.length ? <Text style={styles.copy}>Không có yêu cầu mới cần tạo lệnh.</Text> : pending.map(row => <View key={idOf(row)} style={{ gap: 8, marginVertical: 8 }}><Text style={styles.label}>{text(row, 'customer.fullName')} · {codeOf(row)}</Text><Text style={styles.copy}>{text(row, 'unit.unitCode')} · {text(row, 'description')}</Text><Button title="Tiếp nhận chuyển kho" onPress={() => onCreate(transferFromSupport(row))} /><Navigation title="Xem yêu cầu gốc" path={`/staff/support-requests/${encodeURIComponent(idOf(row))}`} /></View>)}</Panel>;
}
