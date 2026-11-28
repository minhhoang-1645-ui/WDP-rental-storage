import { useCustomerRentalJourney } from '@/hooks/use-customer-rental-journey';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, FileText } from 'lucide-react-native';
import { apiRequest } from '@/services/api';
import { useResource } from '@/operations/use-resource';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { formatDate } from '@/utils/format';
import { isScheduledRenewalInvoice, paymentWindowClosed } from '@/utils/payment-state';
import { quotePaymentSummary } from '@/utils/quote-payment-summary';
import { bookingAmount, bookingHoldDeadline, bookingStatusText, bookingTerm } from '@/utils/customer-booking-display';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { CustomerActionRow, customerStyles as s } from './customer-premium';
import { StatusBadge } from './customer-ui';
import { EmptyState, ErrorState, LoadingState } from './screen-state';
import { CustomerInfoGrid } from './customer-info-grid';

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
  const [paidQuote, setPaidQuote] = useState<Row>();
  const cancellation = object(row?.paidCancellation);
  const paidPath = '/reservations/' + encodeURIComponent(id) + '/paid-cancellation';
  const paidEligible = confirmed && !cancellation.state && bills.some(item => item.type === 'INITIAL' && item.status === 'PAID') &&
    documents.length > 0 && documents.every(item => item.status === 'READY_FOR_HANDOVER') && Boolean(object(quotePolicy(row)).cancellation);
  async function paidAction(send: boolean) {
    if (cancelLock.current) return;
    cancelLock.current = true;
    setCancelBusy(true);
    setCancelError('');
    try {
      const response = await apiRequest<Row>(paidPath, send ? { method: 'POST', body: JSON.stringify({
        action: 'REQUEST', confirmed: true, confirmation: paidQuote?.confirmation,
      }) } : {});
      if (response.state === 'QUOTE') setPaidQuote(object(response.quote));
      else { setPaidQuote(undefined); source.refresh(); }
    } catch (error) {
      if (send) setPaidQuote(undefined);
      setCancelError(error instanceof Error ? error.message : 'Không thể tải hồ sơ hủy đơn.');
    } finally { setCancelBusy(false); cancelLock.current = false; }
  }
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
  const term = bookingTerm(row ?? {});
  const quote=object(row?.quote);
  const paymentSummary = quotePaymentSummary(quote);
  const totalQuote = paymentSummary.total ?? (typeof quote.totalAmount === 'number' && Number.isSafeInteger(quote.totalAmount) ? quote.totalAmount : null);
  const initialInvoiceTotal = bookingAmount(flow.initial?.totalAmount);
  const firstPayment = initialInvoiceTotal || bookingAmount(paymentSummary.first);
  const initialBalance = flow.initial?.status === 'VOID' ? '' : bookingAmount(flow.initial?.balanceDue);
  const holdUntil = cancelled ? '' : bookingHoldDeadline(row ?? {}, flow.initial);
  const holdMinutes = holdUntil ? Math.max(0, Math.ceil((Date.parse(holdUntil) - now) / 60000)) : 0;
  const allocatedUnits = rows(object(row?.rentalSummary).currentUnits);
  const charges: [string, string][] = [
    ['Tiền thuê', bookingAmount(quote.rentalAmount)], ['Tiền cọc', bookingAmount(quote.depositAmount)],
    ['Dịch vụ', Number(quote.addOnTotalAmount) > 0 ? bookingAmount(quote.addOnTotalAmount) : ''],
    ['Tổng báo giá cả kỳ thuê', bookingAmount(totalQuote)],
    [initialInvoiceTotal ? 'Hóa đơn ban đầu' : 'Dự kiến thanh toán lần đầu', firstPayment],
    ['Còn phải trả theo hóa đơn ban đầu', initialBalance],
  ];
  const refresh=()=>{sources.forEach(item=>item.refresh());};
  return <View style={{flex:1,backgroundColor:C.surface}}><Stack.Screen options={{title:'Chi tiết đơn đặt kho',headerTitleStyle:{fontSize:20,fontWeight:'600'},headerBackButtonDisplayMode:'minimal'}}/>
    <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={source.loading&&Boolean(row)} onRefresh={refresh}/>} contentContainerStyle={[s.page,{gap:12}]}>
      {source.loading?<LoadingState layout="detail"/>:source.error?<ErrorState message={source.error} onRetry={source.refresh}/>:row?<>
        <View style={{gap:8}}>
          <Text accessibilityRole="header" style={{fontSize:22,lineHeight:30,fontWeight:'700',color:C.text}}>{text(row,'product.name')||'Đơn đặt kho'}</Text>
          <Text selectable style={s.secondary}>{text(row, 'reference', 'id')}</Text>
          <StatusBadge status={status} displayLabel={bookingStatusText[status]}/>
          <Text style={s.secondary}>{description}</Text>
          {text(row,'rejectionReason') ? <Text style={s.secondary}>{text(row,'rejectionReason')}</Text> : null}
        </View>
        <CustomerInfoGrid values={[
          ['Bắt đầu thuê', term.start], ['Đến ngày', term.end],
          ['Thời gian thuê', term.length], ['Số lượng', term.quantity],
          ['Hạn giữ ô', holdUntil ? formatDate(holdUntil, true) : ''],
          ['Thời gian còn lại', holdUntil ? (holdMinutes ? Math.floor(holdMinutes / 60) + ' giờ ' + (holdMinutes % 60) + ' phút' : 'Đã đến hạn giữ ô') : ''],
        ]} />
        {allocatedUnits.length > 0 && <View style={{gap:8,padding:12,borderWidth:1,borderColor:C.divider,borderRadius:12}}>
          <Text accessibilityRole="header" style={s.section}>Ô kho đã phân bổ</Text>
          {allocatedUnits.map(unit => <Text key={text(unit, 'contractId')} style={s.body}>
            {[text(unit, 'unitCode'), text(unit, 'floor'), text(unit, 'zone'), text(unit, 'contractCode')].filter(Boolean).join(' · ')}
          </Text>)}
        </View>}
        {charges.some(([, value]) => value) && <View style={{gap:8,padding:12,borderWidth:1,borderColor:C.divider,borderRadius:12}}>
          <Text accessibilityRole="header" style={s.section}>Chi phí đơn đặt</Text>
          <CustomerInfoGrid values={charges} />
        </View>}
        {(paidEligible || Boolean(cancellation.state)) && <View style={{gap: 8, padding: 12, borderWidth: 1, borderColor: C.divider, borderRadius: 12}}>
          <Text style={s.section}>Hủy đơn đã thanh toán</Text>
          {cancellation.state ? <Text style={s.body}>{({ REQUESTED: 'Đang chờ quản lý xử lý', REFUND_PENDING: 'Đã hủy, chờ hoàn tiền', REFUNDED: 'Đã hoàn tiền', COMPLETED: 'Đã hủy đơn', REJECTED: 'Yêu cầu bị từ chối' })[String(cancellation.state)]}
            {typeof cancellation.total === 'number' ? ' · ' + bookingAmount(cancellation.total) : ''}
            {typeof cancellation.refundDueOn === 'string' ? ' · Hạn ' + formatDate(cancellation.refundDueOn) : ''}</Text> : null}
          {paidQuote ? <>
            <CustomerInfoGrid values={[[`Tiền thuê hoàn (${paidQuote.percent}%)`, bookingAmount(paidQuote.rent)], ['Hoàn tiền cọc', bookingAmount(paidQuote.deposit)],
              ...rows(paidQuote.services).map(item => [text(item, 'name'), bookingAmount(item.amount)] as [string, string]), ['Tổng dự kiến hoàn', bookingAmount(paidQuote.total)]]} />
            {paidQuote.requiresRecovery === true && <Text style={s.secondary}>Nhân viên sẽ đối chiếu kho và thu hồi chìa khóa, thẻ, thiết bị trước khi quản lý duyệt.</Text>}
            <Pressable accessibilityRole="button" disabled={cancelBusy} onPress={() => void paidAction(true)}><Text style={s.body}>Xác nhận gửi yêu cầu hủy</Text></Pressable>
          </> : paidEligible && <Pressable accessibilityRole="button" disabled={cancelBusy} onPress={() => void paidAction(false)}><Text style={s.body}>{cancelBusy ? 'Đang tải…' : 'Xem khoản hoàn trước khi hủy'}</Text></Pressable>}
          {cancelError && paidEligible ? <Text accessibilityRole="alert" style={s.secondary}>{cancelError}</Text> : null}
        </View>}
        {confirmed && !cancellation.state && bills.some(item => item.type === 'INITIAL' && item.status === 'PARTIALLY_PAID') &&
          <CustomerActionRow title="Yêu cầu đối soát để hủy đơn" path={'/customer/support-requests/new?reservationId=' + encodeURIComponent(id)} />}
        {confirmed&&sources.slice(1).some(item=>item.loading)&&<LoadingState layout="compact"/>}
        {sources.slice(1).filter(item=>item.error).map((item,index)=><ErrorState key={index} message={item.error!} onRetry={item.refresh}/>)}
        {confirmed && status==='CONFIRMED' ? <Text style={s.section}>Các bước cần hoàn tất</Text> : null}
        {documents.length>0 && <CustomerActionRow title="Hợp đồng" icon={FileText}
          trailing={<StatusBadge status={flow.allSigned?'Đã ký':'Chưa ký'} displayLabel={(flow.allSigned?'Đã ký':'Chưa ký')+' ('+flow.signed+'/'+(flow.expected||documents.length)+')'} tone={flow.allSigned?'success':'danger'}/>}
          path={documents.length===1?'/customer/contracts/'+encodeURIComponent(idOf(documents[0])):'/customer/contracts?reservationId='+encodeURIComponent(idOf(row))}/>}
        {flow.initial ?
          <CustomerActionRow title="Hóa đơn" trailing={<StatusBadge status={String(flow.initial.status)} displayLabel={flow.initial.status==='OPEN'?'Chưa thanh toán':undefined}/>}
            path={'/customer/invoices/'+encodeURIComponent(idOf(flow.initial))}/> : null}
        {flow.visit ? <CustomerActionRow title="Lịch nhận kho" icon={CalendarDays}
          subtitle={text(flow.visit,'scheduledAt')?formatDate(text(flow.visit,'scheduledAt'),true):undefined}
          trailing={<StatusBadge status={String(flow.visit.status)} displayLabel={flow.visit.status === 'COMPLETED' ? 'Đã bàn giao' : flow.visit.status === 'CONFIRMED' ? 'Đã xác nhận lịch' : undefined}/>} path={'/customer/appointments/'+encodeURIComponent(idOf(flow.visit))}/>
          : status==='CONFIRMED' && ready ? <View style={s.row}><CalendarDays size={20} color={C.cobalt}/><Text style={[s.body,{flex:1}]}>Lịch nhận kho</Text><StatusBadge status="Chưa đặt"/></View> : null}
      </>:<EmptyState title="Không tìm thấy đơn đặt kho" message="Quay lại danh sách để chọn đơn." />}
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

function quotePolicy(row?: Row) { return object(row?.quote).pricingPolicy; }
