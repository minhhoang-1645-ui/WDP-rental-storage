import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useResource } from '@/operations/use-resource';
import { idOf, rows, label, text, type Row } from '@/operations/model';
import { ContractRenewalHistory } from './contract-renewal-history';
import { ContractTransferHistory } from './contract-transfer-history';
import { useCustomerRentalJourney } from '@/hooks/use-customer-rental-journey';
import { JourneyNotice, JourneyScreen } from './customer-journey-ui';
import { CustomerActionRow, customerStyles as s } from './customer-premium';
import { CustomerInfoGrid } from './customer-info-grid';
import { CustomerStatusFilters } from './customer-record';
import { StatusBadge } from './customer-ui';
import { LoadingState, ErrorState } from './screen-state';
import { FileText } from 'lucide-react-native';
import { formatDate } from '@/utils/format';

export function CustomerContracts({contractId}:{contractId?:string}){
  const params=useLocalSearchParams<{reservationId?:string}>();
  const detail=useResource<Row>(contractId?'/customer/contracts/'+encodeURIComponent(contractId):null);
  const [choice,setChoice]=useState('');
  const reservation=contractId?text(detail.data??{},'reservation.id'):params.reservationId||choice;
  const flow=useCustomerRentalJourney(reservation);
  useEffect(()=>{if(!contractId&&!params.reservationId&&!choice&&flow.all.length)setChoice(text(flow.all[0],'reservation.id'));},[contractId,params.reservationId,choice,flow.contracts.data]);
  const groups=[...new Map(flow.all.map(item=>[text(item,'reservation.id'),item])).values()];
  const selected=contractId?detail.data:flow.group[0];
  const signed=contractId?Boolean(text(selected??{},'terms.acceptedAt')):flow.allSigned;
  const action=contractId&&!signed&&selected&&!flow.closed&&['PENDING_PAYMENT','READY_FOR_HANDOVER'].includes(String(selected.status))?{title:'Xem và ký hợp đồng',path:'/customer/contract-document?id='+encodeURIComponent(contractId)}:flow.next;
  return <JourneyScreen title={contractId?'Hợp đồng thuê':'Tài liệu thuê kho'} action={flow.loading||flow.error||detail.loading||detail.error?undefined:action}>
    {detail.error?<ErrorState message={detail.error} onRetry={detail.refresh}/>:detail.loading?<LoadingState layout="detail"/>:null}
    {!contractId&&!params.reservationId&&groups.length>0&&<View><Text style={s.secondary}>Chọn đơn thuê</Text><CustomerStatusFilters values={groups.map(item=>text(item,'reservation.id'))} selected={choice} onChange={setChoice} label={value=>text(groups.find(item=>text(item,'reservation.id')===value)??{},'storageType.name')||'Đơn thuê'}/></View>}
    {flow.error?<ErrorState message={flow.error} onRetry={flow.refresh}/>:flow.loading?<LoadingState layout="list"/>:reservation&&!flow.group.length?<Text style={s.secondary}>Chưa tìm thấy hợp đồng của đơn này. Hãy cập nhật lại tài liệu.</Text>:!reservation?<View>{flow.all.length?<Text style={s.secondary}>Chọn đơn thuê để xem hợp đồng và bước tiếp theo.</Text>:<Text style={s.secondary}>Hợp đồng sẽ xuất hiện khi đơn đặt được xác nhận.</Text>}</View>:<>
      <Text style={s.title}>{contractId?text(selected??{},'storageType.name')||'Hợp đồng thuê kho':'Hợp đồng của bạn'}</Text>
      {contractId&&selected?<View style={{gap:8}}><Text style={s.secondary}>Tình trạng hợp đồng</Text><StatusBadge status={String(selected.status)}/><Text style={s.secondary}>Chữ ký</Text><StatusBadge status={signed?'Đã ký':'Chưa ký'} tone={signed?'success':'warning'}/></View>:<Text style={s.secondary}>{flow.group.length} hợp đồng cho đơn thuê {flow.expected||flow.group.length} ô kho.</Text>}
      <JourneyNotice title={flow.closed?'Đơn đã đóng hoặc hết hạn':flow.active?'Kho đã hoạt động':flow.early?'Đã bàn giao — Chờ đến ngày bắt đầu thuê':flow.pending?'Đang đối chiếu thanh toán':flow.allSigned?'Chữ ký đã hoàn tất':'Cần hoàn tất hợp đồng'} message={flow.closed?'Bạn có thể xem lại tài liệu. Kiểm tra hóa đơn hoặc liên hệ NestBox nếu đã chuyển tiền.':flow.active?'Hợp đồng là tài liệu tham chiếu. Quản lý kho tại mục Kho thuê.':flow.early?'Đã nhận chìa khóa; chỉ sử dụng kho từ ngày bắt đầu thuê.':flow.pending?'NestBox đang kiểm tra khoản chuyển. Chưa ghi nhận thanh toán hoàn tất.':flow.allSigned?flow.active?'Kho đã hoạt động. Quản lý kho tại mục Kho thuê.':flow.paid?'Bạn có thể theo dõi hoặc đặt lịch nhận kho khi đủ điều kiện.':'Bước tiếp theo là thanh toán hóa đơn ban đầu.':'Đã ký '+flow.signed+'/'+flow.expected+' hợp đồng. Cần ký tất cả trước khi thanh toán.'} success={flow.allSigned&&!flow.pending&&!flow.early}/>
      {!contractId&&<><Text style={s.section}>Danh sách hợp đồng</Text>{flow.group.map(item=><CustomerActionRow key={idOf(item)} title={'Hợp đồng · '+text(item,'storageType.name')} subtitle={[label(item.status),text(item,'createdAt')?formatDate(text(item,'createdAt')):''].filter(Boolean).join(' · ')} icon={FileText} trailing={<StatusBadge status={text(item,'terms.acceptedAt')?'Đã ký':'Chưa ký'} tone={text(item,'terms.acceptedAt')?'success':'warning'}/>} path={'/customer/contracts/'+encodeURIComponent(idOf(item))}/>)}</>}
      <Text style={s.section}>Thông tin kỳ thuê</Text><CustomerInfoGrid values={[["Từ ngày",selected?formatDate(text(selected,'startDate')):''],['Đến ngày',selected?formatDate(text(selected,'endDate')):'']]}/><Text style={s.secondary}>“Đã ký” là trạng thái chữ ký, không đồng nghĩa kho đã hoạt động.</Text>
      {contractId&&selected&&<CustomerActionRow title="Đọc hợp đồng PDF" icon={FileText} path={'/customer/contract-document?id='+encodeURIComponent(contractId)}/>}
      {contractId&&selected&&rows(selected.renewals).length>0&&<ContractRenewalHistory contract={selected} scope="customer"/>}
      {contractId&&selected&&rows(selected.transfers).length>0&&<ContractTransferHistory contract={selected} scope="customer"/>}
    </>}
  </JourneyScreen>;
}
