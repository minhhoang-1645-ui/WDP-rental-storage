import { useCustomerRentalJourney } from '@/hooks/use-customer-rental-journey';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, ChevronRight, Clock3, FileText, Headphones, X } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { OperationForm, type FormAction } from '@/operations/form';
import { customerSupportAction } from '@/portals/actions';
import { formatDate, formatMoney } from '@/utils/format';
import { isScheduledRenewalInvoice, paymentWindowClosed } from '@/utils/payment-state';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { CustomerActionRow, customerStyles as s } from './customer-premium';
import { StatusBadge } from './customer-ui';
import { ErrorState, LoadingState } from './screen-state';

export function CustomerBookingDetail({id}:{id:string}) {
  const source=useResource<Row>('/reservations/'+encodeURIComponent(id));
  const row=source.data, confirmed=row?.status==='CONFIRMED', insets=useSafeAreaInsets();
  const flow=useCustomerRentalJourney(text(row??{},'id')||id);
  const {contracts,invoices,appointments,submissions}=flow;
  const [now,setNow]=useState(Date.now),[help,setHelp]=useState(false),[action,setAction]=useState<FormAction>(),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer);},[]);
  const refs=new Set([id,row?idOf(row):'',text(row??{},'reference','id')].filter(Boolean));
  const related=(item:Row)=>refs.has(text(item,'reservation.id'))||refs.has(text(item,'reservation.reference'));
  const documents=rows(contracts.data?.items).filter(related), bills=rows(invoices.data?.items).filter(related), visits=rows(appointments.data?.items).filter(related);
  const sources=[source,contracts,invoices,appointments,submissions];
  const ready=!sources.some(item=>item.loading||item.error);
  const expired=row?.status==='EXPIRED'||bills.some(item=>item.type==='INITIAL'&&Number(item.balanceDue)>0&&paymentWindowClosed({type:'INITIAL',reservation:{status:row?.status,expiresAt:row?.expiresAt}},now));
  const unsigned=documents.find(item=>['PENDING_PAYMENT','READY_FOR_HANDOVER'].includes(String(item.status))&&Boolean(text(item,'terms.snapshotHash'))&&!text(item,'terms.acceptedAt'));
  const pendingIds=new Set(rows(submissions.data?.items).filter(item=>item.status==='PENDING_VERIFICATION').map(item=>text(item,'invoice.id')));
  const payable=bills.find(item=>['OPEN','PARTIALLY_PAID'].includes(String(item.status))&&Number(item.balanceDue)>0&&!isScheduledRenewalInvoice(item,now)&&!paymentWindowClosed(item,now)&&object(item.signing).complete===true&&!pendingIds.has(idOf(item)));
  const primary=confirmed&&ready&&!expired?(flow.unsigned?{title:'Xem hợp đồng cần ký',path:'/customer/contracts?reservationId='+encodeURIComponent(text(row??{},'id')||id)}:flow.next):undefined;
  const status=String(row?.status??'');
  const description=status==='PENDING'?'NestBox đang kiểm tra yêu cầu. Bạn chưa cần thao tác thêm.':status==='CONFIRMED'?expired?'Đã đến hạn giữ kho. Kiểm tra hóa đơn hoặc gửi hỗ trợ nếu bạn đã chuyển tiền.':unsigned?'Đơn đã được xác nhận. Bạn cần xem và ký hợp đồng.':payable?'Hợp đồng đã ký. Bạn có thể thanh toán hóa đơn.':bills.some(item=>pendingIds.has(idOf(item)))?'NestBox đang đối chiếu khoản chuyển của bạn.':documents.some(item=>item.status==='ACTIVE')?'Kho đã được kích hoạt. Bạn có thể sử dụng theo hợp đồng.':visits.some(item=>item.status==='CONFIRMED')?'Lịch nhận kho đã xác nhận. Xem ngày giờ bên dưới.':'Đơn đã được xác nhận. Xem các tài liệu và cập nhật bên dưới.':status==='REJECTED'?'Yêu cầu chưa được chấp thuận. Bạn có thể gửi hỗ trợ về đơn này.':status==='EXPIRED'?'Đơn đã hết hạn giữ kho. Bạn có thể tìm kho và đặt lại.':status==='CANCELLED'?'Đơn đã hủy. Bạn có thể gửi hỗ trợ nếu cần.':'Xem thông tin đơn đặt kho của bạn.';
  const start=text(row??{},'startDate'),end=text(row??{},'endDateExclusive','endDate');
  const days=start&&end?Math.round((Date.parse(end)-Date.parse(start))/86400000):0;
  const quote=object(row?.quote),amount=quote.quotedTotalAmount??quote.totalAmount;
  const months=Number(row?.durationMonths??(quote.billingMode==='MONTHLY'?quote.termMonths:undefined)),duration=Number.isInteger(months)&&months>0?months+' tháng':days>0?days+' ngày':'';
  const events=[{title:'Đã gửi yêu cầu',at:text(row??{},'createdAt')},{title:'Đơn được cập nhật',at:text(row??{},'updatedAt')},...documents.map(item=>({title:'Đã ký hợp đồng',at:text(item,'terms.acceptedAt')})),...visits.map(item=>({title:item.status==='COMPLETED'?'Đã hoàn tất bàn giao':'Đã xác nhận lịch nhận kho',at:text(item,item.status==='COMPLETED'?'completedAt':'confirmedAt')}))].filter(item=>item.at&&Number.isFinite(Date.parse(item.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const refresh=()=>{if(!help&&!action)sources.forEach(item=>item.refresh());};
  const chooseTopic=(topic:string)=>{if(!row)return;const base=customerSupportAction(idOf(row),{operational:false});setAction({...base,fields:base.fields.map(field=>field.name==='subject'?{...field,initial:topic}:field.name==='category'?{...field,initial:'OTHER'}:field)});};
  return <View style={{flex:1,backgroundColor:C.surface}}><Stack.Screen options={{title:'Chi tiết đơn đặt kho',headerTitleStyle:{fontSize:20,fontWeight:'600'},headerBackButtonDisplayMode:'minimal'}}/>
    <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={source.loading&&Boolean(row)} onRefresh={refresh}/>} contentContainerStyle={[s.page,{gap:20}]}>
      {source.loading?<LoadingState layout="detail"/>:source.error?<ErrorState message={source.error} onRetry={source.refresh}/>:row?<>
        <View style={{gap:10}}><Text accessibilityRole="header" style={{fontSize:22,lineHeight:30,fontWeight:'700',color:C.text}}>{text(row,'product.name')||'Đơn đặt kho'}</Text><StatusBadge status={status} displayLabel={status==='PENDING'?'Chờ duyệt':undefined}/><Text style={s.body}>{description}</Text>{text(row,'rejectionReason')?<Text style={s.secondary}>{text(row,'rejectionReason')}</Text>:null}</View>
        <View style={{gap:8,paddingVertical:16,borderTopWidth:0.5,borderBottomWidth:0.5,borderColor:C.divider}}><View style={{flexDirection:'row',alignItems:'center',gap:10}}><CalendarDays size={20} color={C.navy}/><Text style={[s.body,{fontWeight:'600',flex:1}]}>{[start?formatDate(start):'',end?formatDate(end):''].filter(Boolean).join(' → ')}</Text></View><Text style={s.secondary}>{[duration,text(row,'product.dimensions'),Number(row.quantity)>1?row.quantity+' kho':''].filter(Boolean).join(' · ')}</Text></View>
        {typeof amount==='number'&&amount>0&&<View style={{gap:4}}><Text style={s.secondary}>Giá trị đơn đặt kho</Text><Text style={{fontSize:24,lineHeight:32,fontWeight:'700',color:C.deepNavy}}>{formatMoney(amount)}</Text><Text style={s.secondary}>Theo báo giá khi gửi yêu cầu</Text></View>}
        {confirmed&&sources.slice(1).some(item=>item.loading)&&<LoadingState layout="compact"/>}
        {sources.slice(1).filter(item=>item.error).map((item,index)=><ErrorState key={index} message={item.error!} onRetry={item.refresh}/>)}
        {documents.length>0&&<View style={{gap:8}}><Text style={s.section}>Kho trong đơn</Text><Text style={s.secondary}>Đã ký {flow.signed}/{flow.expected||documents.length} hợp đồng</Text>{documents.map((item,index)=><CustomerActionRow key={idOf(item)} title={text(item,'storageType.name')||'Kho '+(index+1)} subtitle={text(item,'terms.acceptedAt')?'Đã ký':'Chưa ký'} icon={FileText} path={'/customer/contracts/'+encodeURIComponent(idOf(item))}/>)}</View>}
        {bills.length>0&&<View>{bills.map(item=><CustomerActionRow key={idOf(item)} title="Hóa đơn của đơn này" subtitle={typeof item.balanceDue==='number'?'Còn phải trả '+formatMoney(item.balanceDue):undefined} trailing={<StatusBadge status={String(item.status)}/>} path={'/customer/invoices/'+encodeURIComponent(idOf(item))}/>)}</View>}
        {documents.length>0&&<CustomerActionRow title="Hợp đồng của đơn thuê" subtitle="Chữ ký và bước tiếp theo" path={'/customer/contracts?reservationId='+encodeURIComponent(text(row??{},'id')||id)}/>}{visits.length>0&&<View>{visits.map(item=><CustomerActionRow key={idOf(item)} title="Lịch nhận kho" subtitle={text(item,'scheduledAt')?formatDate(text(item,'scheduledAt'),true):undefined} trailing={<StatusBadge status={String(item.status)}/>} path={'/customer/appointments/'+encodeURIComponent(idOf(item))}/>)}</View>}
        {events[0]&&<View style={{flexDirection:'row',gap:10,alignItems:'center'}}><Clock3 size={18} color={C.muted}/><View style={{flex:1,gap:4}}><Text style={s.secondary}>{events[0].title}</Text><Text style={s.secondary}>{formatDate(events[0].at,true)}</Text></View></View>}
        {notice?<Text accessibilityRole="alert" style={{...s.body,color:C.success}}>{notice}</Text>:null}
        <Pressable accessibilityRole="button" onPress={()=>setHelp(true)} style={({pressed})=>[s.row,{opacity:pressed?0.65:1,borderBottomWidth:0}]}><Headphones size={20} color={C.navy}/><Text style={[s.body,{flex:1}]}>Cần trợ giúp về đơn này?</Text><ChevronRight size={18} color={C.muted}/></Pressable>
      </>:null}
    </ScrollView>
    {primary&&<View style={{paddingHorizontal:20,paddingVertical:12,borderTopWidth:0.5,borderTopColor:C.divider}}><Pressable accessibilityRole="button" onPress={()=>router.push(primary.path as Href)} style={({pressed})=>({minHeight:52,borderRadius:12,backgroundColor:C.cobalt,justifyContent:'center',alignItems:'center',padding:12,opacity:pressed?0.75:1})}><Text style={{fontSize:16,lineHeight:24,fontWeight:'600',color:'white'}}>{primary.title}</Text></Pressable></View>}
    <Modal visible={help} transparent animationType="slide" onRequestClose={()=>{if(!busy&&!action)setHelp(false);}}><View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(16,24,40,0.4)'}}><SafeAreaView edges={['bottom']} style={{maxHeight:'90%',backgroundColor:'white',borderTopLeftRadius:24,borderTopRightRadius:24,paddingBottom:Math.max(insets.bottom,12)}}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={s.page}>{action?<OperationForm key={action.title+action.fields.find(field=>field.name==='subject')?.initial} action={action} onBusyChange={setBusy} onClose={()=>{setAction(undefined);setHelp(false);}} onSaved={()=>{setAction(undefined);setHelp(false);setNotice('Đã gửi yêu cầu hỗ trợ cho đơn này.');}}/>:<><View style={{flexDirection:'row',alignItems:'center'}}><Text style={[s.section,{flex:1}]}>Bạn cần hỗ trợ gì?</Text><Pressable accessibilityRole="button" accessibilityLabel="Đóng hỗ trợ" onPress={()=>setHelp(false)} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><X size={20} color={C.text}/></Pressable></View>{['Hỏi về trạng thái đơn','Thay đổi ngày thuê','Vấn đề khác'].map(topic=><Pressable key={topic} accessibilityRole="button" onPress={()=>chooseTopic(topic)} style={s.row}><Text style={[s.body,{flex:1}]}>{topic}</Text><ChevronRight size={18} color={C.muted}/></Pressable>)}</>}</ScrollView></KeyboardAvoidingView></SafeAreaView></View></Modal>
  </View>;
}
