import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { ArrowDownUp, Boxes, MapPin, FileText, CreditCard, Headphones, ChevronRight } from 'lucide-react-native';
import { usePublicCatalog } from '@/hooks/use-public-catalog';
import { useResource } from '@/operations/use-resource';
import { idOf, rows, text, type Row } from '@/operations/model';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { customerStyles as s, CustomerActionRow } from '@/components/customer-premium';
import { CustomerReveal } from '@/components/customer-flow';
import { CustomerInfoGrid } from '@/components/customer-info-grid';
import { CustomerRecordActions } from '@/components/customer-record-actions';
import { StatusBadge } from '@/components/customer-ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { customerRentalActions, customerSupportAction } from '@/portals/actions';
import type { FormAction } from '@/operations/form';
import { formatDate, formatMoney } from '@/utils/format';

export function CustomerRentals({initialRentalId}:{initialRentalId?:string}) {
  const catalog=usePublicCatalog();
  const rentals=useResource<{items:Row[]}>('/customer/rentals',true);
  const [selected,setSelected]=useState(''),[action,setAction]=useState<FormAction>(),[notice,setNotice]=useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const choices=(rentals.data?.items??[]).flatMap(rental=>rows(rental.contracts).filter(contract=>contract.status==='ACTIVE').map(contract=>({rental,contract})));
  const current=choices.find(item=>idOf(item.contract)===selected)??(initialRentalId?choices.find(item=>idOf(item.rental)===initialRentalId||text(item.rental,'reservationReference')===initialRentalId):choices[0]);
  const rental=current?.rental,contract=current?.contract,contractId=contract?idOf(contract):'';
  const invoices=useResource<Row>(rental?'/customer/invoices':null,true);
  const returns=useResource<Row>(rental?'/customer/returns':null,true);
  const requests=useResource<Row>(rental?'/customer/support-requests':null,true);
  const related=rows(invoices.data?.items).filter(item=>text(item,'reservation.id')===text(rental??{},'reservationId')||Boolean(text(rental??{},'reservationReference'))&&text(item,'reservation.reference')===text(rental??{},'reservationReference'));
  const authorized=rental&&!returns.loading&&!returns.error&&!requests.loading&&!requests.error?customerRentalActions(rental,rows(returns.data?.items),now,rows(requests.data?.items)):[];
  const contextual=authorized.filter(item=>!item.title.startsWith('Yêu cầu chuyển kho')&&item.title!=='Gửi yêu cầu hỗ trợ');
  const transfer=authorized.find(item=>item.title.startsWith('Yêu cầu chuyển kho')&&item.description?.includes(text(contract??{},'contractCode')));
  if(transfer)contextual.push(transfer);
  const support=rental&&contract?customerSupportAction(text(rental,'reservationId'),{contractId,unitId:text(contract,'unit.id')}):undefined;
  const refresh=()=>{if(!action){rentals.refresh();invoices.refresh();returns.refresh();requests.refresh();}};
  const product=rows(catalog.data?.products).find(item=>text(item,'id')===text(rental??{},'storageType.id'));
  const name=rental?text(rental,'storageType.name'):'';
  const go=(path:string)=>router.push(path as Href);
  const shortcuts=[{title:'Nhập / xuất',icon:ArrowDownUp,path:'/customer/stock-movements?rentalContractId='+encodeURIComponent(contractId)},{title:'Hàng đang lưu',icon:Boxes,path:'/customer/stored-items?rentalContractId='+encodeURIComponent(contractId)},{title:'Vị trí kho',icon:MapPin,path:'/customer/floor-plan?rentalId='+encodeURIComponent(rental?idOf(rental):'')+'&rentalContractId='+encodeURIComponent(contractId)}];
  const rawFloor=text(contract??{},'unit.floor');
  const floor=/^ground(?: floor)?$/i.test(rawFloor)?'Tầng trệt':/^floor\s+\d+$/i.test(rawFloor)?rawFloor.replace(/^floor\s+/i,'Tầng '):/^\d+$/.test(rawFloor)?'Tầng '+rawFloor:rawFloor;
  const location=[floor,text(contract??{},'unit.zone')?'Khu '+text(contract??{},'unit.zone'):''].filter(Boolean).join(' · ');
  return <View style={{flex:1,backgroundColor:'white'}}><Stack.Screen options={{title:'Kho thuê',headerBackVisible:Boolean(initialRentalId),headerTitleStyle:{fontSize:22,fontWeight:'700'}}}/><ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={rentals.loading&&Boolean(rentals.data)} onRefresh={refresh}/>} contentContainerStyle={s.page}>
    {rentals.loading?<LoadingState layout="detail"/>:rentals.error?<ErrorState message={rentals.error} onRetry={rentals.refresh}/>:current&&rental&&contract?<CustomerReveal key={contractId}>
      {choices.length>1&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingBottom:8}}>{choices.map((item,index)=><Pressable key={idOf(item.contract)} accessibilityRole="radio" accessibilityState={{checked:idOf(item.contract)===contractId}} onPress={()=>{setSelected(idOf(item.contract));setNotice('');}} style={{minHeight:44,paddingHorizontal:14,paddingVertical:10,borderRadius:22,backgroundColor:idOf(item.contract)===contractId?C.navy:C.soft}}><Text style={{fontSize:14,lineHeight:20,color:idOf(item.contract)===contractId?'white':C.text}}>{text(item.rental,'storageType.name')||'Kho thuê'}{choices.filter(other=>text(other.rental,'storageType.name')===text(item.rental,'storageType.name')).length>1?' · '+(index+1):''}</Text></Pressable>)}</ScrollView>}
      <View style={{gap:14,padding:16,borderRadius:16,backgroundColor:'#F1F5FD'}}>
        <View style={{flexDirection:'row',alignItems:'flex-start',gap:12}}><Text accessibilityRole="header" style={{fontSize:20,lineHeight:28,fontWeight:'700',color:C.text,flex:1}}>{name||'Kho của bạn'}</Text><StatusBadge status={rental.rentalState==='OVERDUE'?'OVERDUE':'ACTIVE'}/></View>
        {catalog.loading?<LoadingState layout="compact"/>:catalog.error?<ErrorState message={catalog.error} onRetry={catalog.refresh}/>:null}
        <CustomerInfoGrid values={[["Kích thước",text(product??{},'dimensions')],['Diện tích',text(product??{},'floorArea')],['Vị trí',location],['Hạn thuê đến',formatDate(text(contract,'endDate')||text(rental,'effectiveEndDate'))]]}/>
        <View style={{paddingTop:12,borderTopWidth:0.5,borderTopColor:'#D9E3F3',gap:4}}><Text style={s.secondary}>Thời gian thuê</Text><Text style={[s.body,{fontWeight:'600'}]}>{formatDate(text(contract,'startDate')||text(rental,'startDate'))} → {formatDate(text(contract,'endDate')||text(rental,'effectiveEndDate'))}</Text></View>
      </View>
      <Text accessibilityRole="header" style={[s.section,{paddingTop:8}]}>Thao tác nhanh</Text>
      <View style={{flexDirection:'row',gap:8,paddingVertical:12}}>{shortcuts.map(({title,icon:Icon,path})=><Pressable key={title} accessibilityRole="button" onPress={()=>go(path)} style={({pressed})=>({flex:1,alignItems:'center',gap:8,opacity:pressed?0.65:1})}><View style={{width:50,height:50,borderRadius:25,backgroundColor:C.tealSubtle,alignItems:'center',justifyContent:'center'}}><Icon size={23} color={C.navy}/></View><Text style={{fontSize:14,lineHeight:20,textAlign:'center',color:C.text}}>{title}</Text></Pressable>)}</View>
      <Text accessibilityRole="header" style={[s.section,{paddingTop:12}]}>Tài liệu & thanh toán</Text>
      <View><CustomerActionRow title="Hợp đồng thuê" icon={FileText} path={'/customer/contracts/'+encodeURIComponent(contractId)}/>
        {invoices.loading?<LoadingState layout="compact"/>:invoices.error?<ErrorState message={invoices.error} onRetry={invoices.refresh}/>:related.map((invoice,index)=><CustomerActionRow key={idOf(invoice)} title={related.length===1?'Hóa đơn':'Hóa đơn '+(index+1)} icon={CreditCard} subtitle={typeof invoice.balanceDue==='number'&&invoice.balanceDue>0?formatMoney(invoice.balanceDue)+' còn phải trả':undefined} trailing={<StatusBadge status={String(invoice.status)}/>} path={'/customer/invoices/'+encodeURIComponent(idOf(invoice))}/>)}

      </View>
      {[returns,requests].filter(source=>source.error).map((source,index)=><ErrorState key={index} message={source.error!} onRetry={source.refresh}/>)}
      {rental.pendingRenewal?<CustomerActionRow title="Gia hạn đang xử lý" path="/customer/renewals"/>:null}
      <CustomerRecordActions actions={contextual} selected={action} onSelect={setAction} onClose={()=>setAction(undefined)} onSaved={()=>{setAction(undefined);setNotice('Đã gửi yêu cầu.');refresh();}}/>
      {notice?<Text accessibilityRole="alert" style={{...s.body,color:C.success}}>{notice}</Text>:null}
      {support&&<Pressable accessibilityRole="button" onPress={()=>setAction(support)} style={({pressed})=>[s.row,{borderBottomWidth:0,opacity:pressed?0.65:1}]}><Headphones size={20} color={C.navy}/><Text style={[s.body,{flex:1}]}>Cần hỗ trợ về kho này?</Text><ChevronRight size={18} color={C.muted}/></Pressable>}
    </CustomerReveal>:<><EmptyState title="Bạn chưa có kho đang thuê" message="Kho sẽ xuất hiện khi hợp đồng được kích hoạt sau bàn giao."/><CustomerActionRow title="Theo dõi đơn đặt kho" path="/customer/reservations"/><CustomerActionRow title="Tìm kho" path="/customer/discover"/></>}
  </ScrollView></View>;
}
