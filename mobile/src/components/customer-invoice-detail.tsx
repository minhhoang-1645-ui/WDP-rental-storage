import { useState } from 'react';
import { Text } from 'react-native';
import { useResource } from '@/operations/use-resource';
import { text, type Row } from '@/operations/model';
import { InvoicePayment } from '@/portals/invoice-payment';
import { JourneyScreen } from './customer-journey-ui';
import { CustomerInfoGrid } from './customer-info-grid';
import { StatusBadge } from './customer-ui';
import { LoadingState, ErrorState } from './screen-state';
import { customerStyles as s } from './customer-premium';
import { formatDate, formatMoney } from '@/utils/format';

export function CustomerInvoiceDetail({id}:{id:string}){const source=useResource<Row>('/customer/invoices/'+encodeURIComponent(id),false,true),[notice,setNotice]=useState('');const row=source.data;const amount=(value:unknown)=>typeof value==='number'?formatMoney(value):'';return <JourneyScreen title="Chi tiết hóa đơn">{source.loading?<LoadingState layout="detail"/>:source.error?<ErrorState message={source.error} onRetry={source.refresh}/>:row?<><Text style={s.secondary}>{row.status==='PAID'?'Đã thanh toán':'Còn phải thanh toán'}</Text><Text style={{fontSize:30,lineHeight:38,fontWeight:'700',color:'#123E85'}}>{amount(row.status==='PAID'?row.totalAmount:row.balanceDue)}</Text><StatusBadge status={String(row.status)} displayLabel={row.status==='OPEN'?'Chưa thanh toán':undefined}/><CustomerInfoGrid values={[["Hạn thanh toán",text(row,'dueAt')?formatDate(text(row,'dueAt')):''],['Tiền thuê',amount(row.rentalAmount)],['Tiền cọc',amount(row.depositAmount)],['Thiết bị và dịch vụ',Number(row.serviceAmount)>0?amount(row.serviceAmount):''],['Phí khác',Number(row.chargeAmount)>0?amount(row.chargeAmount):''],['Tổng hóa đơn',amount(row.totalAmount)],['Đã thanh toán',amount(row.amountPaid)]]}/>{notice?<Text accessibilityRole="alert" style={{...s.body,color:'#087443'}}>{notice}</Text>:null}<InvoicePayment compactSummary key={id} invoice={row} refresh={source.refresh} onNotice={setNotice}/></>:null}</JourneyScreen>;}
