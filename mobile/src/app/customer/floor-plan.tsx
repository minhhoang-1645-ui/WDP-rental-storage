import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import { idOf, rows, text, type Row } from '@/operations/model';
import { customerStyles as s } from '@/components/customer-premium';
import { CustomerInfoGrid } from '@/components/customer-info-grid';
import { ErrorState, LoadingState } from '@/components/screen-state';

export default function Screen() {
  const {rentalId,rentalContractId}=useLocalSearchParams<{rentalId?:string;rentalContractId?:string}>();
  const source=useResource<Row>(rentalId?'/customer/rentals/'+encodeURIComponent(rentalId):null);
  if(!rentalId)return <Redirect href="/customer/discover"/>;
  const contract=rows(source.data?.contracts).find(item=>idOf(item)===rentalContractId);
  const unit=contract?text(contract,'unit.unitCode'):'';
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}><Stack.Screen options={{title:'Vị trí kho'}}/>{source.loading?<LoadingState layout="detail"/>:source.error?<ErrorState message={source.error} onRetry={source.refresh}/>:contract?<><View style={{flexDirection:'row',gap:12,alignItems:'center'}}><MapPin size={24} color="#175CD3"/><Text style={[s.body,{fontWeight:'600',flex:1}]}>{text(source.data??{},'storageType.name')||'Kho của bạn'}</Text></View><CustomerInfoGrid values={[["Ô kho",unit],['Tầng',text(contract,'unit.floor')],['Khu',text(contract,'unit.zone')],['Hàng',text(contract,'unit.row')],['Vị trí',text(contract,'unit.position')]]}/><Text style={s.secondary}>Chưa có sơ đồ lối đi và cửa vào được xác thực cho kho này. Bạn có thể dùng thông tin vị trí trên hoặc liên hệ nhân viên khi đến cơ sở.</Text></>:<Text style={s.secondary}>Kho này không còn trong danh sách đang thuê. Quay lại Kho thuê để chọn lại.</Text>}</ScrollView>;
}
