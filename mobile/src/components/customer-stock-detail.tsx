import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import type { StockMovement } from '@/stock/types';
import { CustomerActionRow } from './customer-premium';
import { CustomerInfoGrid } from './customer-info-grid';
import { StatusBadge } from './customer-ui';
import { ErrorState, LoadingState } from './screen-state';
import { ItemPhotos } from './item-photos';
import { inventoryBlue, movementStatus, movementWarehouse } from './inventory-presentation';
import { formatDate } from '@/utils/format';

export function CustomerStockDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const source = useResource<StockMovement>(id ? '/customer/stock-movements/' + encodeURIComponent(id) : null, false, true);
  const row = source.data;
  const state = row && movementStatus[row.status];
  const Icon = row?.type === 'OUT' ? ArrowDownToLine : ArrowUpFromLine;

  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
    <Stack.Screen options={{ title: 'Chi tiết phiếu', headerTitleAlign: 'center', headerTitleStyle: { color: inventoryBlue, fontWeight: '700' } }}/>
    {source.loading ? <LoadingState layout="detail"/> : source.error ? <ErrorState message={source.error} onRetry={source.refresh}/> : row ? <>
      <View style={s.card}>
        <View style={s.head}>
          <View style={[s.icon, row.type === 'OUT' && s.outbound]}><Icon size={20} color={inventoryBlue}/></View>
          <View style={s.grow}><Text style={s.title}>{row.type === 'IN' ? 'Gửi hàng vào kho' : 'Lấy hàng ra khỏi kho'}</Text><Text style={s.copy}>{row.movementCode}</Text></View>
          <StatusBadge status={row.status} displayLabel={state?.label}/>
        </View>
        {state && <Text style={s.copy}>{state.description}</Text>}
        <CustomerInfoGrid values={[
          ['Kho trên phiếu', movementWarehouse(row) || 'Chưa ghi nhận'],
          ['Ngày gửi', formatDate(row.createdAt, true)],
          ['Lịch dự kiến', row.scheduledAt ? formatDate(row.scheduledAt, true) : 'Chưa chọn'],
          ['Nhân viên phụ trách', row.assignedStaff?.fullName],
          ['Hoàn tất', row.completedAt ? formatDate(row.completedAt, true) : ''],
        ]}/>
        {row.note ? <Text style={s.copy}>Ghi chú: {row.note}</Text> : null}
      </View>
      <View style={s.card}>
        <Text style={s.title}>Hàng hóa</Text>
        {row.lines.map(line => <View key={line.id} style={s.line}>
          <Text style={s.label}>{line.storedItem.name}</Text>
          <ItemPhotos photos={row.type === 'IN' ? line.photos ?? line.storedItem.photos ?? [] : line.storedItem.photos ?? []}/>
          <CustomerInfoGrid values={[
            ['Yêu cầu', line.requestedQty + ' ' + line.storedItem.unit],
            ['Đã giao nhận', line.actualQty == null ? 'Chưa kiểm đếm' : line.actualQty + ' ' + line.storedItem.unit],
            ['Ghi chú', line.note],
          ]}/>
        </View>)}
        {row.completionNote ? <Text style={s.copy}>Kết quả giao nhận: {row.completionNote}</Text> : null}
      </View>
      <CustomerActionRow title="Hợp đồng liên quan" path={'/customer/contracts/' + encodeURIComponent(row.rentalContract.id)}/>
    </> : null}
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 18, gap: 9 },
  card: { backgroundColor: 'white', borderWidth: 1, borderColor: '#E1E6EF', borderRadius: 12, padding: 10, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  icon: { width: 38, height: 38, borderRadius: 9, backgroundColor: '#E0EDFF', alignItems: 'center', justifyContent: 'center' },
  outbound: { backgroundColor: '#EFEBFF' },
  title: { color: '#17243A', fontSize: 15, fontWeight: '700' },
  label: { color: '#17243A', fontSize: 13, fontWeight: '700' },
  copy: { color: '#475467', fontSize: 12, lineHeight: 17 },
  line: { borderTopWidth: 1, borderTopColor: '#E1E6EF', paddingTop: 8, gap: 6 },
});
