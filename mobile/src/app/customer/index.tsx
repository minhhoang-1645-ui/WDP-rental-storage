import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, ClipboardList, FileText, Headphones, UserRound, ChevronRight, CreditCard, Warehouse } from 'lucide-react-native';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { CustomerHero, CustomerLink, customerStyles as s } from '@/components/customer-premium';
import { CustomerReveal } from '@/components/customer-flow';
import { CustomerNotifications } from '@/components/customer-notifications';
import { StatusBadge } from '@/components/customer-ui';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { useResource } from '@/operations/use-resource';
import { idOf, rows, text, object, type Row } from '@/operations/model';
import { formatDate, formatMoney } from '@/utils/format';
import { paymentWindowClosed, isScheduledRenewalInvoice } from '@/utils/payment-state';

export default function CustomerHomeScreen() {
  const insets=useSafeAreaInsets();
  const rentals=useResource<{items:Row[]}>('/customer/rentals',true);
  const invoices=useResource<{items:Row[]}>('/customer/invoices',true);
  const contracts=useResource<{items:Row[]}>('/customer/contracts',true);
  const submissions=useResource<{items:Row[]}>('/customer/payment-submissions',true);
  const reservations=useResource<Row[]>('/reservations');
  const sources=[rentals,invoices,contracts,submissions,reservations];
  const active=rentals.data?.items??[];
  const unitCount=active.reduce((sum,item)=>sum+rows(item.contracts).filter(c=>c.status==='ACTIVE').length,0);
  const pending=new Set((submissions.data?.items??[]).filter(i=>i.status==='PENDING_VERIFICATION').map(i=>text(i,'invoice.id')));
  const payable=!submissions.error&&!submissions.loading?(invoices.data?.items??[]).filter(i=>['OPEN','PARTIALLY_PAID'].includes(String(i.status))&&Number(i.balanceDue)>0&&!pending.has(idOf(i))&&!isScheduledRenewalInvoice(i)&&!paymentWindowClosed(i)&&object(i.signing).complete!==false):[];
  // Active/finished legacy contracts without a signature timestamp are not new signing tasks.
  const unsigned=(contracts.data?.items??[]).filter(i=>['PENDING_PAYMENT','READY_FOR_HANDOVER'].includes(String(i.status))&&Boolean(text(i,'terms.snapshotHash'))&&!text(i,'terms.acceptedAt'));
  const attention=[...unsigned.map(row=>({row,resource:'contracts'})),...payable.map(row=>({row,resource:'invoices'}))];
  const recent=[...(reservations.data??[])].sort((a,b)=>(Date.parse(text(b,'updatedAt','createdAt'))||0)-(Date.parse(text(a,'updatedAt','createdAt'))||0));
  const shortcuts=[{title:'Đơn đặt',path:'/customer/reservations',icon:ClipboardList},{title:'Lịch nhận',path:'/customer/appointments',icon:CalendarDays},{title:'Tài liệu',path:'/customer/contracts',icon:FileText},{title:'Hỗ trợ',path:'/customer/support-requests',icon:Headphones}];
  const first=active[0];
  const rentalPath=active.length===1&&first?'/customer/rentals/'+encodeURIComponent(idOf(first)):'/customer/rentals';
  const end=first?text(first,'effectiveEndDate','endDate'):'';
  const loading=sources.some(i=>i.loading);
  return <ScrollView style={{backgroundColor:C.surface}} contentInsetAdjustmentBehavior="never" refreshControl={<RefreshControl refreshing={loading&&sources.some(i=>Boolean(i.data))} onRefresh={()=>sources.forEach(i=>i.refresh())}/>} contentContainerStyle={{paddingBottom:24}}>
    <CustomerHero topInset={insets.top}>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{fontSize:22,fontWeight:'700',color:C.onHero}}>NestBox</Text><View style={{flexDirection:'row',gap:4}}><CustomerNotifications inverse/><Pressable accessibilityRole="button" accessibilityLabel="Tài khoản" onPress={()=>router.push('/customer/account')} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><UserRound size={22} color="white"/></Pressable></View></View>
      {rentals.loading&&!rentals.data?<Text style={{color:C.onHeroSecondary,fontSize:16,textAlign:'center'}}>Đang tải kho của bạn…</Text>:rentals.error?<Text style={{color:C.onHeroSecondary,fontSize:16,textAlign:'center'}}>Chưa tải được kho của bạn</Text>:unitCount>0?<View style={{gap:12,alignItems:'center'}}>
        <View style={{alignItems:'center',gap:2}}><Text style={{color:C.onHeroSecondary,fontSize:14,lineHeight:22}}>Không gian của bạn</Text><Text style={{color:'white',fontSize:44,lineHeight:54,fontWeight:'700'}}>{String(unitCount).padStart(2,'0')}</Text><Text style={{color:C.onHeroSecondary,fontSize:14,lineHeight:20}}>kho của bạn</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Xem kho và thời hạn thuê" onPress={()=>router.push(rentalPath as Href)} style={({pressed})=>({alignSelf:'stretch',flexDirection:'row',alignItems:'center',gap:12,backgroundColor:C.heroControl,borderRadius:12,paddingHorizontal:14,paddingVertical:12,opacity:pressed?0.7:1})}><Warehouse size={22} color="white"/><View style={{flex:1,gap:4}}><Text style={{color:'white',fontSize:16,lineHeight:24,fontWeight:'600'}}>{unitCount===1&&first?text(first,'storageType.name')||'Kho của bạn':'Xem '+unitCount+' kho của bạn'}</Text>{active.length===1&&end?<Text style={{color:C.onHeroSecondary,fontSize:14,lineHeight:20}}>{first.rentalState==='OVERDUE'?'Đã đến hạn trả kho · ':'Thuê đến '}{formatDate(end)}</Text>:<Text style={{color:C.onHeroSecondary,fontSize:14,lineHeight:20}}>Thông tin kho và thời hạn thuê</Text>}</View><ChevronRight size={18} color="white"/></Pressable>
      </View>:<View style={{gap:8,alignItems:'center',paddingVertical:8}}><Text style={{fontSize:26,lineHeight:34,fontWeight:'700',color:'white',textAlign:'center'}}>Tìm không gian dành riêng cho bạn.</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/customer/discover')} style={{minHeight:44,justifyContent:'center'}}><Text style={{fontSize:16,fontWeight:'600',color:'white'}}>Khám phá kho →</Text></Pressable></View>}
      <View style={{flexDirection:'row',gap:8}}>{shortcuts.map(({title,path,icon:Icon})=><Pressable key={path} accessibilityRole="button" onPress={()=>router.push(path as Href)} style={({pressed})=>({flex:1,alignItems:'center',gap:8,opacity:pressed?0.65:1})}><View style={{width:44,height:44,borderRadius:22,backgroundColor:C.heroControl,alignItems:'center',justifyContent:'center'}}><Icon size={21} color="white"/></View><Text style={{fontSize:14,lineHeight:20,color:'white',textAlign:'center'}}>{title}</Text></Pressable>)}</View>
    </CustomerHero>
    <View style={{paddingHorizontal:20,paddingTop:20}}><CustomerReveal>
      {sources.filter(i=>i.error).map((i,index)=><ErrorState key={index} message={i.error!} onRetry={i.refresh}/>)}
      {attention.length>0&&<View style={{padding:14,gap:4,borderRadius:14,backgroundColor:'#FFF8E8',marginBottom:12}}>
        <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:6}}><Text style={[s.section,{flex:1}]}>Việc cần làm</Text><Text style={{fontSize:14,fontWeight:'600',color:C.warning}}>{attention.length}</Text></View>
        {attention.slice(0,3).map(({row,resource})=>{
          const signing=resource==='contracts',Icon=signing?FileText:CreditCard;
          const storage=text(row,'reservation.product.name','reservation.storageType.name','storageType.name','product.name');
          const due=text(row,'dueAt','dueDate');
          return <Pressable key={resource+idOf(row)} accessibilityRole="button" onPress={()=>router.push(('/customer/'+resource+'/'+encodeURIComponent(idOf(row))) as Href)} style={({pressed})=>({minHeight:68,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12,borderTopWidth:0.5,borderTopColor:'#EBDDBD',opacity:pressed?0.65:1})}><Icon size={22} color={C.warning}/><View style={{flex:1,gap:4}}><Text style={[s.body,{fontWeight:'600'}]}>{signing?'Ký hợp đồng thuê kho':'Thanh toán '+formatMoney(Number(row.balanceDue))}</Text><Text style={s.secondary}>{[storage,due?'Hạn '+formatDate(due):''].filter(Boolean).join(' · ')||(signing?'Xem nội dung và ký hợp đồng':'Mở hóa đơn để xem chi tiết')}</Text></View><ChevronRight size={18} color={C.warning}/></Pressable>;
        })}
        {attention.length>3&&<CustomerNotifications label="Xem thêm việc cần làm"/>}
      </View>}
      <View style={{gap:4}}>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}><Text style={[s.section,{flex:1}]}>Đơn đặt gần đây</Text>{recent.length>3&&<CustomerLink title="Xem thêm" path="/customer/reservations"/>}</View>
        {reservations.loading&&!reservations.data?<LoadingState layout="compact"/>:recent.length?recent.slice(0,3).map(row=><Pressable key={idOf(row)} accessibilityRole="button" onPress={()=>router.push(('/customer/reservations/'+encodeURIComponent(idOf(row))) as Href)} style={({pressed})=>[s.row,{opacity:pressed?0.65:1}]}><View style={{width:40,height:40,borderRadius:20,backgroundColor:C.tealSubtle,alignItems:'center',justifyContent:'center'}}><ClipboardList size={20} color={C.navy}/></View><View style={{flex:1,gap:4}}><Text style={[s.body,{fontWeight:'600'}]}>{text(row,'product.name','storageType.name')||'Đơn đặt kho'}</Text>{text(row,'createdAt')?<Text style={s.secondary}>{formatDate(text(row,'createdAt'))}</Text>:null}<StatusBadge status={String(row.status)} displayLabel={row.status==='PENDING'?'Chờ xác nhận':undefined}/></View><ChevronRight size={18} color={C.muted}/></Pressable>):<Text style={[s.secondary,{paddingVertical:12}]}>Đơn đặt kho của bạn sẽ xuất hiện tại đây.</Text>}
      </View>
      <CustomerLink title="Khám phá thêm loại kho" path="/customer/discover"/>
    </CustomerReveal></View>
  </ScrollView>;
}
