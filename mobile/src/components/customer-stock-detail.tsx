import { ItemPhotos } from './item-photos';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useResource } from '@/operations/use-resource';
import type { StockMovement } from '@/stock/types';
import { text, type Row } from '@/operations/model';
import { customerStyles as s, CustomerActionRow } from './customer-premium';
import { CustomerInfoGrid } from './customer-info-grid';
import { StatusBadge } from './customer-ui';
import { ErrorState, LoadingState } from './screen-state';
import { formatDate } from '@/utils/format';

export function CustomerStockDetail(){
  const {id}=useLocalSearchParams<{id:string}>();
  const source=useResource<StockMovement>('/customer/stock-movements/'+encodeURIComponent(String(id)));
  const row=source.data;
  const contract=useResource<Row>(row?'/customer/contracts/'+encodeURIComponent(row.rentalContract.id):null);
  const message=row?({REQUESTED:'Yêu cầu đã gửi. NestBox sẽ phân công nhân viên giao nhận.',ASSIGNED:'Nhân viên đã được phân công. Số lượng chỉ cập nhật sau khi giao nhận và kiểm đếm.',COMPLETED:'Giao nhận đã hoàn tất. Số lượng thực nhận đã được ghi nhận.',CANCELLED:'Phiếu đã hủy và không làm thay đổi hàng đang lưu.'} as const)[row.status]:'';
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}><Stack.Screen options={{title:'Chi tiết phiếu'}}/>{source.loading?<LoadingState layout="detail"/>:source.error?<ErrorState message={source.error} onRetry={source.refresh}/>:row?<><View style={{gap:8}}><Text style={s.title}>{row.type==='IN'?'Gửi hàng vào kho':'Lấy hàng ra khỏi kho'}</Text><StatusBadge status={row.status}/><Text style={s.secondary}>{message}</Text></View><CustomerInfoGrid values={[["Kho thuê",text(contract.data??{},'storageType.name')],['Ngày tạo',formatDate(row.createdAt,true)],['Lịch dự kiến',row.scheduledAt?formatDate(row.scheduledAt,true):''],['Nhân viên hỗ trợ',row.assignedStaff?.fullName],['Đã phân công',row.assignedAt?formatDate(row.assignedAt,true):''],['Hoàn tất',row.completedAt?formatDate(row.completedAt,true):'']]}/>{contract.error?<ErrorState message={contract.error} onRetry={contract.refresh}/>:null}<CustomerActionRow title="Hợp đồng liên quan" path={'/customer/contracts/'+encodeURIComponent(row.rentalContract.id)}/><Text style={s.section}>Hàng hóa và số lượng</Text>{row.lines.map(line=><View key={line.id} style={{gap:8,paddingVertical:12,borderBottomWidth:0.5,borderBottomColor:'#EAECF0'}}><Text style={[s.body,{fontWeight:'600'}]}>{line.storedItem.name}</Text><ItemPhotos photos={row.type==='IN'?line.photos??[]:line.storedItem.photos??[]}/><CustomerInfoGrid values={[["Số lượng yêu cầu",line.requestedQty+' '+line.storedItem.unit],['Số lượng thực nhận',line.actualQty==null?'Chưa kiểm đếm':line.actualQty+' '+line.storedItem.unit],['Ghi chú',line.note]]}/></View>)}{row.note?<View style={{gap:6}}><Text style={s.section}>Ghi chú của bạn</Text><Text style={s.body}>{row.note}</Text></View>:null}{row.completionNote?<View style={{gap:6}}><Text style={s.section}>Kết quả giao nhận</Text><Text style={s.body}>{row.completionNote}</Text></View>:null}</>:null}</ScrollView>;
}
