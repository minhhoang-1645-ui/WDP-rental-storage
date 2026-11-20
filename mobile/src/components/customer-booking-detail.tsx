import { useCustomerRentalJourney } from '@/hooks/use-customer-rental-journey';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, FileText } from 'lucide-react-native';
import { apiRequest } from '@/services/api';
import { useResource } from '@/operations/use-resource';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { formatDate, formatMoney } from '@/utils/format';
import { isScheduledRenewalInvoice, paymentWindowClosed } from '@/utils/payment-state';
import { quotePaymentSummary } from '@/utils/quote-payment-summary';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { CustomerActionRow, customerStyles as s } from './customer-premium';
import { StatusBadge } from './customer-ui';
import { ErrorState, LoadingState } from './screen-state';

export function CustomerBookingDetail({id}:{id:string}) {
  const source=useResource<Row>('/reservations/'+encodeURIComponent(id));
  const row=source.data, confirmed=row?.status==='CONFIRMED';
  const flow=useCustomerRentalJourney(text(row??{},'id')||id);
  const {contracts,invoices,appointments,submissions}=flow;
  const [now,setNow]=useState(Date.now);
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
  const primary=confirmed&&ready&&!expired?(flow.unsigned?{title:'Xem hợp đồng',path:'/customer/contracts?reservationId='+encodeURIComponent(text(row??{},'id')||id)}:flow.next):undefined;
  const [cancelOpen,setCancelOpen]=useState(false), [cancelBusy,setCancelBusy]=useState(false), [cancelError,setCancelError]=useState(''), [cancelled,setCancelled]=useState(false);
  const cancelLock=useRef(false);
  const canCancel=ready && !cancelled && (row?.status==='PENDING' || confirmed) &&
    documents.every(item=>item.status==='PENDING_PAYMENT'&&!text(item,'terms.acceptedAt')) &&
    bills.every(item=>!['PAID','PARTIALLY_PAID'].includes(String(item.status)) && !pendingIds.has(idOf(item)) && Number(item.amountPaid ?? 0)===0) &&
    visits.every(item=>item.status==='CANCELLED');
  async function cancelOrder() {
    if (cancelLock.current || !canCancel) return;
    cancelLock.current=true;
    setCancelBusy(true);
    setCancelError('');
    try {
      const result=await apiRequest<Row>('/reservations/'+encodeURIComponent(id)+'/cancel',{method:'POST'});
      if (result.status!=='CANCELLED') throw new Error('Chưa xác nhận được đơn đã hủy.');
      setCancelled(true);
      setCancelOpen(false);
      refresh();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Chưa thể hủy đơn. Vui lòng thử lại.');
    } finally {
      cancelLock.current=false;
      setCancelBusy(false);
    }
  }
  const status=String(cancelled?'CANCELLED':row?.status??'');
  const description=status==='PENDING'?'NestBox đang kiểm tra yêu cầu. Bạn chưa cần thao tác thêm.':status==='CONFIRMED'?expired?'Đã đến hạn giữ kho. Kiểm tra hóa đơn hoặc gửi hỗ trợ nếu bạn đã chuyển tiền.':unsigned?'Đơn đã được xác nhận. Bạn cần xem và ký hợp đồng.':payable?'Hợp đồng đã ký. Bạn có thể thanh toán hóa đơn.':bills.some(item=>pendingIds.has(idOf(item)))?'NestBox đang đối chiếu khoản chuyển của bạn.':documents.some(item=>item.status==='ACTIVE')?'Kho đã được kích hoạt. Bạn có thể sử dụng theo hợp đồng.':visits.some(item=>item.status==='CONFIRMED')?'Lịch nhận kho đã xác nhận. Xem ngày giờ bên dưới.':'Đơn đã được xác nhận. Xem các tài liệu và cập nhật bên dưới.':status==='REJECTED'?'Yêu cầu chưa được chấp thuận. Bạn có thể gửi hỗ trợ về đơn này.':status==='EXPIRED'?'Đơn đã hết hạn giữ kho. Bạn có thể tìm kho và đặt lại.':status==='CANCELLED'?'Đơn đã hủy. Bạn có thể gửi hỗ trợ nếu cần.':'Xem thông tin đơn đặt kho của bạn.';
  const start=text(row??{},'startDate'),end=text(row??{},'endDateExclusive','endDate');
  const days=start&&end?Math.round((Date.parse(end)-Date.parse(start))/86400000):0;
  const quote=object(row?.quote);
  const paymentSummary = quotePaymentSummary(quote);
  const totalQuote = paymentSummary.total ?? (typeof quote.totalAmount === 'number' && Number.isSafeInteger(quote.totalAmount) ? quote.totalAmount : null);
  const initialInvoiceTotal = flow.initial?.totalAmount;
  const hasInvoiceTotal = typeof initialInvoiceTotal === 'number' && Number.isSafeInteger(initialInvoiceTotal) && initialInvoiceTotal >= 0;
  const firstPayment = hasInvoiceTotal ? initialInvoiceTotal : paymentSummary.first;
  const months=Number(row?.durationMonths??(quote.billingMode==='MONTHLY'?quote.termMonths:undefined)),duration=Number.isInteger(months)&&months>0?months+' tháng':days>0?days+' ngày':'';
  const refresh=()=>{sources.forEach(item=>item.refresh());};
  return <View style={{flex:1,backgroundColor:C.surface}}><Stack.Screen options={{title:'Chi tiết đơn đặt kho',headerTitleStyle:{fontSize:20,fontWeight:'600'},headerBackButtonDisplayMode:'minimal'}}/>
    <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={source.loading&&Boolean(row)} onRefresh={refresh}/>} contentContainerStyle={[s.page,{gap:12}]}>
      {source.loading?<LoadingState layout="detail"/>:source.error?<ErrorState message={source.error} onRetry={source.refresh}/>:row?<>
        <View style={{gap:10}}><Text accessibilityRole="header" style={{fontSize:22,lineHeight:30,fontWeight:'700',color:C.text}}>{text(row,'product.name')||'Đơn đặt kho'}</Text><StatusBadge status={status} displayLabel={status==='PENDING'?'Chờ duyệt':undefined}/><Text style={s.secondary}>{cancelled ? "Đã hủy đơn đặt kho." : description}</Text>{text(row,'rejectionReason')?<Text style={s.secondary}>{text(row,'rejectionReason')}</Text>:null}</View>
        <View style={{gap:8,padding:12,borderWidth:1,borderColor:C.divider,borderRadius:12}}><View style={{flexDirection:'row',alignItems:'center',gap:10}}><CalendarDays size={20} color={C.navy}/><Text style={[s.body,{fontWeight:'600',flex:1}]}>{[start?formatDate(start):'',end?formatDate(end):''].filter(Boolean).join(' → ')}</Text></View><Text style={s.secondary}>{[duration,text(row,'product.dimensions'),Number(row.quantity)>1?row.quantity+' kho':''].filter(Boolean).join(' · ')}</Text></View>
        {firstPayment !== null && <View style={{gap:4}}>
          <Text style={s.secondary}>{hasInvoiceTotal ? 'Hóa đơn ban đầu' : 'Dự kiến thanh toán lần đầu'}</Text>
          <Text style={{fontSize:24,lineHeight:32,fontWeight:'700',color:C.deepNavy}}>{formatMoney(firstPayment)}</Text>
        </View>}
        {totalQuote !== null && totalQuote >= 0 && <View style={{gap:4}}>
          <Text style={s.secondary}>Tổng báo giá cả kỳ thuê (gồm cọc)</Text>
          <Text style={[s.body,{fontWeight:'700'}]}>{formatMoney(totalQuote)}</Text>
        </View>}
        {confirmed&&sources.slice(1).some(item=>item.loading)&&<LoadingState layout="compact"/>}
        {sources.slice(1).filter(item=>item.error).map((item,index)=><ErrorState key={index} message={item.error!} onRetry={item.refresh}/>)}
        {confirmed && status==='CONFIRMED' ? <Text style={s.section}>Các bước cần hoàn tất</Text> : null}
        {documents.length>0 && <CustomerActionRow title="Hợp đồng" icon={FileText}
          trailing={<StatusBadge status={flow.allSigned?'Đã ký':'Chưa ký'} displayLabel={(flow.allSigned?'Đã ký':'Chưa ký')+' ('+flow.signed+'/'+(flow.expected||documents.length)+')'} tone={flow.allSigned?'success':'danger'}/>}
          path={documents.length===1?'/customer/contracts/'+encodeURIComponent(idOf(documents[0])):'/customer/contracts?reservationId='+encodeURIComponent(idOf(row))}/>}
        {flow.initial ? <>
          <CustomerActionRow title="Hóa đơn" trailing={<StatusBadge status={String(flow.initial.status)} displayLabel={flow.initial.status==='OPEN'?'Chưa thanh toán':undefined}/>}
            path={'/customer/invoices/'+encodeURIComponent(idOf(flow.initial))}/>
          {flow.allSigned && Number(flow.initial.balanceDue)>0 && status==='CONFIRMED' ? <View style={{backgroundColor:'#EDF3FD',borderRadius:12,padding:12}}>
            <Text style={s.secondary}>Còn phải trả theo hóa đơn ban đầu</Text><Text style={{fontSize:25,fontWeight:'800',color:C.cobalt}}>{formatMoney(Number(flow.initial.balanceDue))}</Text>
          </View> : null}
        </> : null}
        {flow.visit ? <CustomerActionRow title="Lịch nhận kho" icon={CalendarDays}
          subtitle={text(flow.visit,'scheduledAt')?formatDate(text(flow.visit,'scheduledAt'),true):undefined}
          trailing={<StatusBadge status={String(flow.visit.status)}/>} path={'/customer/appointments/'+encodeURIComponent(idOf(flow.visit))}/>
          : status==='CONFIRMED' && ready ? <View style={s.row}><CalendarDays size={20} color={C.cobalt}/><Text style={[s.body,{flex:1}]}>Lịch nhận kho</Text><StatusBadge status="Chưa đặt"/></View> : null}
      </>:null}
    </ScrollView>
    {!cancelled&&primary&&<View style={{paddingHorizontal:20,paddingVertical:12,borderTopWidth:0.5,borderTopColor:C.divider}}><Pressable accessibilityRole="button" onPress={()=>router.push(primary.path as Href)} style={({pressed})=>({minHeight:52,borderRadius:12,backgroundColor:C.cobalt,justifyContent:'center',alignItems:'center',padding:12,opacity:pressed?0.75:1})}><Text style={{fontSize:16,lineHeight:24,fontWeight:'600',color:'white'}}>{primary.title}</Text></Pressable></View>}
    {canCancel ? <Pressable accessibilityRole="button" onPress={()=>{setCancelError('');setCancelOpen(true);}}
      style={{minHeight:44,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#B42318',fontWeight:'700'}}>Hủy đơn đặt</Text></Pressable> : null}
    <Modal visible={cancelOpen} transparent animationType="slide" onRequestClose={()=>{if(!cancelBusy)setCancelOpen(false);}}>
      <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'#10182866'}}>
        <SafeAreaView edges={['bottom']} style={{backgroundColor:'white',padding:16,borderTopLeftRadius:22,borderTopRightRadius:22,gap:12}}>
          <Text style={s.section}>Hủy đơn đặt kho?</Text>
          <View style={{backgroundColor:'#EDF3FD',borderRadius:12,padding:12}}>
            <Text style={s.body}>{text(row??{},'product.name')||'Đơn đặt kho'}</Text>
            <Text style={s.secondary}>Chưa ký · Chưa thanh toán</Text>
          </View>
          <Text style={s.secondary}>Đơn đủ điều kiện sẽ được hủy ngay và các ô đã giữ sẽ được trả lại.</Text>
          {cancelError ? <Text accessibilityRole="alert" style={{color:'#B42318'}}>{cancelError}</Text> : null}
          <Pressable accessibilityRole="button" disabled={cancelBusy||!canCancel} onPress={()=>void cancelOrder()}
            style={{minHeight:46,alignItems:'center',justifyContent:'center',backgroundColor:'#C82032',borderRadius:10}}>
            <Text style={{color:'white',fontWeight:'700'}}>{cancelBusy?'Đang hủy…':'Xác nhận hủy đơn'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={cancelBusy} onPress={()=>setCancelOpen(false)}
            style={{minHeight:44,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:C.divider,borderRadius:10}}><Text style={s.body}>Giữ đơn</Text></Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}
