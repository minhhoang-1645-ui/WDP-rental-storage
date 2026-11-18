import { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useResource } from '@/operations/use-resource';
import { idOf, rows, text, type Row } from '@/operations/model';
import type { FormAction } from '@/operations/form';
import { useCustomerRentalJourney } from '@/hooks/use-customer-rental-journey';
import { JourneyScreen, JourneyNotice } from './customer-journey-ui';
import { CustomerActionRow, customerStyles as s } from './customer-premium';
import { CustomerInfoGrid } from './customer-info-grid';
import { CustomerRecordActions } from './customer-record-actions';
import { LoadingState, ErrorState } from './screen-state';
import { StatusBadge } from './customer-ui';
import { formatDate } from '@/utils/format';

export function CustomerAppointments({id}:{id?:string}){
  const params=useLocalSearchParams<{reservationId?:string}>();
  const detail=useResource<Row>(id?'/customer/appointments/'+encodeURIComponent(id):null);
  const reservationId=id?text(detail.data??{},'reservation.id'):params.reservationId;
  const flow=useCustomerRentalJourney(reservationId),[action,setAction]=useState<FormAction>();
  const row=id?detail.data:flow.visit,early=row?.usageStatus==='WAITING_FOR_RENTAL_START',completed=row?.status==='COMPLETED';
  const selected=flow.group[0],back=reservationId?'/customer/contracts?reservationId='+encodeURIComponent(reservationId):'/customer/contracts';
  return <JourneyScreen title="Lịch nhận kho" action={!flow.loading&&!flow.error&&!detail.loading&&!detail.error?(row?{title:'Xem hợp đồng',path:back}:flow.scheduling?{title:'Đặt lịch nhận kho',onPress:()=>setAction(flow.scheduling)}:undefined):undefined}>
    {detail.error?<ErrorState message={detail.error} onRetry={detail.refresh}/>:flow.error?<ErrorState message={flow.error} onRetry={flow.refresh}/>:detail.loading||flow.loading?<LoadingState layout="detail"/>:row?<>
      <Text style={s.title}>{early?'Đã bàn giao sớm':completed?'Đã bàn giao kho':'Lịch nhận kho'}</Text><JourneyNotice title={early?'Chờ đến ngày bắt đầu thuê':completed?'Staff đã xác nhận bàn giao':row.status==='CONFIRMED'?'Lịch đã xác nhận':'Lịch '+(row.status==='CANCELLED'?'đã hủy':'đang chờ xác nhận')} message={early?'Chìa khóa đã bàn giao nhưng chưa được sử dụng kho.':completed?'Theo dõi quyền sử dụng tại hợp đồng và Kho thuê.':row.status==='CONFIRMED'?'Lịch hợp lệ được xác nhận tự động; nhân viên sẽ thực hiện bàn giao thực tế.':'Xem trạng thái mới nhất hoặc liên hệ NestBox.'}/>
      <Text style={s.section}>Lịch đã đặt</Text><CustomerInfoGrid values={[["Ngày giờ nhận",text(row,'scheduledAt')?formatDate(text(row,'scheduledAt'),true):''],['Bàn giao thực tế',completed?'Staff đã xác nhận':'Đang chờ Staff'],['Bắt đầu thuê',selected?formatDate(text(selected,'startDate')):''],['Ghi chú',row.note],['Ghi nhận bàn giao',row.handoverNote]]}/><Text style={s.section}>Tại điểm nhận kho</Text><Text style={s.secondary}>Staff kiểm tra người nhận, hiện trạng kho, chìa khóa/thẻ và giấy tờ trước khi xác nhận bàn giao.</Text>
    </>:reservationId?<><Text style={s.title}>Chọn lịch nhận kho</Text><Text style={s.secondary}>{flow.scheduling?'Có thể nhận chìa khóa sớm tối đa 3 ngày. Chỉ sử dụng kho từ ngày bắt đầu thuê.':'Chưa đủ điều kiện đặt lịch. Cần ký tất cả hợp đồng và thanh toán đủ hóa đơn ban đầu.'}</Text></>:<>{rows(flow.appointments.data?.items).length?rows(flow.appointments.data?.items).map(item=><CustomerActionRow key={idOf(item)} title="Lịch nhận kho" subtitle={formatDate(text(item,'scheduledAt'),true)} trailing={<StatusBadge status={String(item.status)}/>} path={'/customer/appointments/'+encodeURIComponent(idOf(item))}/>):<Text style={s.secondary}>Bạn chưa có lịch nhận kho.</Text>}<CustomerActionRow title="Chọn hợp đồng để đặt lịch" path="/customer/contracts"/></>}
    <CustomerRecordActions actions={[]} selected={action} onSelect={setAction} onClose={()=>setAction(undefined)} onSaved={()=>{setAction(undefined);flow.refresh();detail.refresh();}}/>
  </JourneyScreen>;
}
