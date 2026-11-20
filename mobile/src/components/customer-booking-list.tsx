import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, Search, Warehouse } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import { idOf, rows, text, type Row } from '@/operations/model';
import { formatDate } from '@/utils/format';
import { StatusBadge } from './customer-ui';
import { ErrorState, LoadingState } from './screen-state';

export function CustomerBookingList() {
  const orders = useResource<Row[]>('/reservations');
  const contracts = useResource<Row>('/customer/contracts', true);
  const invoices = useResource<Row>('/customer/invoices', true);
  const appointments = useResource<Row>('/customer/appointments', true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Tất cả');
  const sources = [orders, contracts, invoices, appointments];
  const error = sources.find(source => source.error);
  const loading = sources.some(source => source.loading);
  const refresh = () => sources.forEach(source => source.refresh());
  const results = rows(orders.data).map(order => {
    const related = (row: Row) => [text(row,'reservation.id'), text(row,'reservation.reference')].includes(idOf(order));
    const docs = rows(contracts.data?.items).filter(related);
    const bill = rows(invoices.data?.items).find(row => row.type === 'INITIAL' && related(row));
    const visits = rows(appointments.data?.items).filter(related);
    const stage = order.status !== 'CONFIRMED' || loading || error ? ''
      : docs.some(row => row.status !== 'CANCELLED' && !text(row,'terms.acceptedAt')) ? 'Chưa ký hợp đồng'
      : bill?.status === 'OPEN' ? 'Chưa thanh toán' : bill?.status === 'PARTIALLY_PAID' ? 'Đã trả một phần'
      : visits.some(row => row.status === 'COMPLETED') ? 'Đã bàn giao'
      : visits.some(row => row.status === 'CONFIRMED' || row.status === 'REQUESTED') ? 'Chờ bàn giao'
      : bill?.status === 'PAID' ? 'Chưa đặt lịch nhận' : '';
    return { order, stage };
  }).filter(({order, stage}) => {
    const searchable = text(order,'product.name') + ' ' + idOf(order);
    const matchesFilter = filter === 'Tất cả' ||
      (filter === 'Đã xác nhận' && order.status === 'CONFIRMED') ||
      (filter === 'Đã hủy' && order.status === 'CANCELLED') ||
      (filter === 'Cần xử lý' && ['Chưa ký hợp đồng','Chưa thanh toán','Đã trả một phần','Chưa đặt lịch nhận'].includes(stage));
    return matchesFilter && searchable.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  return <ScrollView keyboardShouldPersistTaps="handled" style={{flex:1, backgroundColor:'white'}}
    contentContainerStyle={{padding:16,gap:10}} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh}/>}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8,borderWidth:1,borderColor:'#D5DEEB',borderRadius:10,paddingHorizontal:10}}>
      <Search size={17} color="#475569"/><TextInput value={query} onChangeText={setQuery} placeholder="Tìm theo tên kho hoặc mã đơn"
        accessibilityLabel="Tìm đơn đặt kho" style={{flex:1,minHeight:44,color:'#101828'}}/>
    </View>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{['Tất cả','Đã xác nhận','Cần xử lý','Đã hủy'].map(value =>
      <Pressable key={value} accessibilityRole="button" accessibilityState={{selected:filter===value}} onPress={()=>setFilter(value)}
        style={{flexGrow:1,minHeight:44,paddingHorizontal:10,justifyContent:'center',alignItems:'center',borderWidth:1,borderColor:'#D5DEEB',borderRadius:22,backgroundColor:filter===value?'#0758DC':'white'}}>
        <Text style={{color:filter===value?'white':'#101828',fontWeight:'600'}}>{value}</Text></Pressable>)}</View>
    {error ? <ErrorState message="Một số thông tin đơn đặt chưa tải được." onRetry={refresh}/> : null}
    {loading && !orders.data ? <LoadingState layout="list"/> : <>
      <Text style={{color:'#475569'}}>{results.length} đơn đặt</Text>
      {results.length === 0 ? <Text style={{color:'#475569'}}>Chưa có đơn phù hợp.</Text> : results.map(({order,stage}) =>
        <Pressable key={idOf(order)} accessibilityRole="button"
          onPress={()=>router.push({pathname:'/customer/[resource]/[id]',params:{resource:'reservations',id:idOf(order)}})}
          style={{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderWidth:1,borderColor:'#DCE3ED',borderRadius:12,backgroundColor:'#FAFCFF'}}>
          <View style={{padding:9,backgroundColor:'#EDF3FD',borderRadius:10}}><Warehouse size={21} color="#0758DC"/></View>
          <View style={{flex:1,gap:5}}><Text style={{fontSize:16,fontWeight:'700',color:'#101828'}}>{text(order,'product.name')||'Đơn đặt kho'}</Text>
            <StatusBadge status={String(order.status)} tone={order.status==='CONFIRMED'?'info':undefined}/>
            <Text style={{color:'#475569'}}>{formatDate(text(order,'startDate'))} – {formatDate(text(order,'endDate'))}</Text>
            {stage ? <StatusBadge status={stage} tone={stage==='Chưa ký hợp đồng'?'danger':stage==='Đã bàn giao'?'success':stage==='Chờ bàn giao'?'info':'warning'}/> : null}
          </View><ChevronRight size={18} color="#475569"/>
        </Pressable>)}
    </>}
  </ScrollView>;
}
