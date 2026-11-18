import { useEffect, useState } from 'react';
import { useResource } from '@/operations/use-resource';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { customerAppointmentAction } from '@/portals/actions';
import { paymentWindowClosed } from '@/utils/payment-state';

export function useCustomerRentalJourney(preferredReservationId?: string, defaultToFirst = false){
  const contracts=useResource<Row>('/customer/contracts',true),invoices=useResource<Row>('/customer/invoices',true),appointments=useResource<Row>('/customer/appointments',true),submissions=useResource<Row>('/customer/payment-submissions',true);
  const [now,setNow]=useState(Date.now);useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer);},[]);
  const all=rows(contracts.data?.items);
  const reservationId = preferredReservationId || (defaultToFirst ? text(all[0] ?? {}, 'reservation.id') : '');
  const matches=(row:Row)=>Boolean(reservationId)&&(text(row,'reservation.id')===reservationId||text(row,'reservation.reference')===reservationId);
  const group=all.filter(matches),expected=Number(object(group[0]?.reservation).quantity)||0,signed=group.filter(item=>Boolean(text(item,'terms.acceptedAt'))).length;
  const complete=group.length>0&&group.length===expected,allSigned=complete&&signed===expected;
  const initial=rows(invoices.data?.items).find(item=>matches(item)&&item.type==='INITIAL');
  const paid=initial?.status==='PAID'&&initial.balanceDue===0;
  const pending=Boolean(initial)&&rows(submissions.data?.items).some(item=>text(item,'invoice.id')===idOf(initial!)&&item.status==='PENDING_VERIFICATION');
  const visits=rows(appointments.data?.items).filter(matches),visit=visits.find(item=>['CONFIRMED','REQUESTED'].includes(String(item.status)))??visits.find(item=>item.status==='COMPLETED');
  const active=complete&&group.every(item=>item.status==='ACTIVE');
  const early=visit?.usageStatus==='WAITING_FOR_RENTAL_START';
  const sources=[contracts,invoices,appointments,submissions],loading=sources.some(item=>item.loading),error=sources.find(item=>item.error)?.error;
  const scheduling=group[0]&&paid&&allSigned?customerAppointmentAction(group[0],all,rows(appointments.data?.items),now):undefined;
  const payable=allSigned&&initial&&object(initial.signing).complete===true&&!pending&&!paymentWindowClosed(initial,now)&&['OPEN','PARTIALLY_PAID'].includes(String(initial.status))&&Number(initial.balanceDue)>0;
  const closed=group.some(item=>['EXPIRED','CANCELLED'].includes(text(item,'reservation.status')))||Boolean(initial&&Number(initial.balanceDue)>0&&paymentWindowClosed(initial,now));
  const unsigned=!closed?group.find(item=>!text(item,'terms.acceptedAt')&&['PENDING_PAYMENT','READY_FOR_HANDOVER'].includes(String(item.status))):undefined;
  const next=!loading&&!error?(active?{title:'Xem kho thuê',path:'/customer/rentals/'+encodeURIComponent(text(group[0],'reservation.id'))}:unsigned?{title:'Xem và ký hợp đồng',path:'/customer/contract-document?id='+encodeURIComponent(idOf(unsigned))}:payable&&!closed?{title:'Thanh toán hóa đơn',path:'/customer/invoices/'+encodeURIComponent(idOf(initial!))}:visit?{title:'Xem lịch nhận kho',path:'/customer/appointments/'+encodeURIComponent(idOf(visit))}:scheduling&&!closed?{title:'Đặt lịch nhận kho',path:'/customer/appointments?reservationId='+encodeURIComponent(reservationId!)}:undefined):undefined;
  return {reservationId,contracts,invoices,appointments,submissions,all,group,expected,signed,complete,allSigned,initial,paid,pending,visit,visits,active,early,scheduling,unsigned,next,loading,error,closed,refresh:()=>sources.forEach(item=>item.refresh())};
}
