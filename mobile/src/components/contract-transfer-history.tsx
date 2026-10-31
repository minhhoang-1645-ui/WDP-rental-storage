import { Text, View } from 'react-native';
import { DocumentFile } from './document-file';
import { object, rows, text } from '@/operations/model';
import { Panel, styles } from '@/operations/ui';

const date = (value: string) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa ghi nhận';
export function ContractTransferHistory({ contract: value, scope }: { contract: unknown; scope: 'customer' | 'manager' | 'staff/management' }) {
  const contract = object(value), transfers = rows(contract.transfers);
  if (!transfers.length) return null;
  return <Panel title="Lịch sử chuyển kho của hợp đồng">
    <Text style={styles.copy}>Kho hiện tại: {text(contract, 'storageUnit.unitCode')}. Hợp đồng đã ký giữ nguyên; biên bản chuyển kho được đính kèm hồ sơ.</Text>
    {transfers.map(transfer => <View key={text(transfer, 'id')} style={{ gap: 8, marginVertical: 10 }}>
      <Text style={styles.label}>{text(transfer, 'transferCode')} · {text(transfer, 'fromUnit.unitCode')} → {text(transfer, 'toUnit.unitCode') || 'Chưa chọn kho đích'}</Text>
      <Text style={styles.copy}>{transfer.status === 'COMPLETED' ? `Đã chuyển thực tế ${date(text(transfer, 'completedAt'))} · Xác nhận: ${text(transfer, 'completedBy.fullName') || 'Chưa ghi nhận'}` : transfer.status === 'APPROVED' ? 'Đã duyệt, chờ chuyển thực tế.' : transfer.status === 'REJECTED' ? 'Đã từ chối; kho thuê không thay đổi.' : 'Đang kiểm tra kho đích.'}</Text>
      {transfer.status === 'COMPLETED' && <><Text style={styles.copy}>Biên bản vận hành đính kèm hợp đồng; không phải lần ký mới của khách.</Text><DocumentFile path={`/${scope}/documents/contracts/${encodeURIComponent(text(contract, 'id'))}/transfers/${encodeURIComponent(text(transfer, 'id'))}`} name={`${text(transfer, 'transferCode')}-BB`} /></>}
    </View>)}
  </Panel>;
}
