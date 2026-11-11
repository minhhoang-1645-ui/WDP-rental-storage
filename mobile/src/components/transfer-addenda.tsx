import { Text } from 'react-native';
import { DocumentAcceptance } from './document-acceptance';
import { useResource } from '@/operations/use-resource';
import { object, text, type Row } from '@/operations/model';
import { Facts, Panel, styles, money } from '@/operations/ui';
export function TransferAddenda() {
  const result = useResource<{ items: Row[] }>('/customer/transfer-orders', true);
  return <>{result.error && <Text style={styles.error}>Chưa tải được phụ lục đổi loại: {result.error}</Text>}{result.data?.items.map(row => { const commercial = object(row.commercial), snapshot = object(commercial.snapshot); return <Panel key={text(row, 'id')} title={`Đổi loại kho · ${text(row, 'transferCode')}`}><Facts values={[["Từ kho", `${text(snapshot, 'from.code')} · ${text(snapshot, 'from.typeName')}`], ['Đến kho', `${text(snapshot, 'to.code')} · ${text(snapshot, 'to.typeName')}`], ['Giá hiện tại/tháng', money(snapshot.currentRate)], ['Giá mới/tháng', money(snapshot.newRate)], ['Từ kỳ thu ngày', snapshot.effectiveFrom]]} /><Text style={styles.copy}>Kỳ hiện tại và cọc giữ nguyên. Hóa đơn tương lai chưa thu được thay bằng bản mới có liên kết; không xóa chứng cứ cũ.</Text>{snapshot.smaller === true && <Text style={styles.error}>Kho nhỏ hơn. Hãy tự đối chiếu kích thước và đồ đạc; hệ thống không bảo đảm hàng sẽ vừa.</Text>}{row.status === 'APPROVED' || commercial.acceptedAt ? <DocumentAcceptance row={row} resource="transfer-orders" onSaved={result.refresh} /> : <Text style={styles.copy}>Theo dõi trạng thái chuyển trong hồ sơ.</Text>}</Panel>; })}</>;
}
