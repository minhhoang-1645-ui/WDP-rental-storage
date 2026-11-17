import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronRight, FileText, CalendarDays, Headphones, Package } from 'lucide-react-native';
import { WdpColors } from '@/constants/wdp-theme';
import { codeOf, idOf, text, rows, type Row } from '@/operations/model';
import { Disclosure, Facts } from '@/operations/ui';
import { RecordView } from '@/operations/record-view';
import { formatDate, formatMoney } from '@/utils/format';
import { CustomerInfoGrid } from './customer-info-grid';
import { StatusBadge } from './customer-ui';
import { useCustomerPresentation } from './customer-presentation';

function customerStatusLabel(resource:string,row:Row) {
  if(row.status==='OPEN') return resource==='invoices'?'Chưa thanh toán':resource==='support-requests'?'Chờ tiếp nhận':undefined;
  if(resource==='contracts'&&row.status==='PENDING_PAYMENT') return text(row,'terms.acceptedAt')?'Chờ thanh toán':'Chờ ký hợp đồng';
  return undefined;
}
function customerReference(row: Row) {
  const value = codeOf(row);
  return value && value !== idOf(row) && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value) ? value : '';
}
function customerNextStep(resource: string, row: Row) {
  if (resource === 'reservations') return ({PENDING: 'NestBox đang kiểm tra yêu cầu của bạn.', CONFIRMED: 'Mở hợp đồng để ký, rồi thanh toán hóa đơn trước hạn.', REJECTED: 'Xem lý do bên dưới hoặc gửi hỗ trợ.', EXPIRED: 'Đơn đã hết hạn. Bạn có thể tìm kho và đặt lại.', CANCELLED: 'Đơn đã hủy.'} as Record<string,string>)[String(row.status)] || '';
  if (resource === 'support-requests') return ({OPEN: 'NestBox đã nhận yêu cầu của bạn.', ASSIGNED: 'Nhân viên sẽ kiểm tra và liên hệ với bạn.', IN_PROGRESS: 'NestBox đang xử lý yêu cầu.', ESCALATED: 'Yêu cầu cần được xem xét thêm.', RESOLVED: 'Xem kết quả xử lý bên dưới.'} as Record<string,string>)[String(row.status)] || '';
  return '';
}
export function customerRecordTitle(resource: string, row: Row) {
  if (resource === 'invoices') {
    const amount = row.status === 'PAID' ? row.totalAmount ?? row.amountPaid : row.balanceDue ?? row.totalAmount;
    return amount == null ? 'Hóa đơn' : (row.status === 'PAID' ? 'Đã thanh toán · ' : 'Còn phải trả · ') + formatMoney(Number(amount));
  }
  if (['payments', 'payment-history', 'payment-submissions'].includes(resource)) return row.amount == null ? 'Thông tin thanh toán' : formatMoney(Number(row.amount));
  return text(row, 'subject', 'fullName', 'name', 'email', 'unit.unitCode', 'storageUnit.unitCode', 'product.name', 'storageType.name', 'reservation.product.name') || ({rentals: 'Kho của tôi', reservations: 'Đơn đặt kho', contracts: 'Hợp đồng thuê', appointments: 'Lịch bàn giao', renewals: 'Gia hạn kho', returns: 'Trả kho', transfers: 'Chuyển kho', 'support-requests': 'Yêu cầu hỗ trợ'} as Record<string,string>)[resource] || 'Yêu cầu của tôi';
}
export function CustomerRecordRow({resource, row, path}: {resource: string; row: Row; path: string}) {
  const identity = text(row, 'unit.unitCode', 'storageUnit.unitCode', 'reservation.reference', 'reservationReference');
  const date = text(row, 'scheduledAt', 'dueAt', 'dueDate', 'updatedAt', 'createdAt');
  const Icon=resource==='contracts'?FileText:resource==='appointments'?CalendarDays:resource==='support-requests'?Headphones:Package;
  const reference=customerReference(row);
  return <Pressable accessibilityRole="button" onPress={()=>router.push(path as Href)} style={({pressed})=>({backgroundColor:pressed?WdpColors.soft:WdpColors.surface,paddingVertical:12,borderBottomWidth:0.5,borderBottomColor:WdpColors.border,flexDirection:'row',alignItems:'center',gap:12})}>
    <View style={{width:40,height:40,borderRadius:20,backgroundColor:WdpColors.soft,alignItems:'center',justifyContent:'center'}}><Icon size={20} color={WdpColors.navy}/></View>
    <View style={{flex:1,gap:4}}><Text style={{fontSize:16,lineHeight:24,fontWeight:'600',color:WdpColors.text}}>{customerRecordTitle(resource,row)}</Text>{Boolean(identity||date)&&<Text style={{fontSize:14,lineHeight:20,color:WdpColors.muted}}>{[identity,date?formatDate(date,resource==='appointments'):''].filter(Boolean).join(' · ')}</Text>}<View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8}}><StatusBadge status={String(row.status??row.rentalState??'')} displayLabel={customerStatusLabel(resource,row)}/>{reference&&reference!==identity?<Text style={{fontSize:13,color:WdpColors.muted}}>{reference}</Text>:null}</View></View><ChevronRight size={18} color={WdpColors.muted}/>
  </Pressable>;
}
export function CustomerStatusFilters({values, selected, onChange, label}: {values: string[]; selected: string; onChange: (value: string) => void; label: (value: string) => string}) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8, paddingVertical: 4}}>{['', ...values].map(value => <Pressable key={value || 'all'} accessibilityRole="button" accessibilityState={{selected: selected === value}} onPress={() => onChange(value)} style={{minHeight: 48, justifyContent: 'center'}}><View style={{minHeight: 38, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: selected === value ? WdpColors.navy : WdpColors.surface, borderWidth: 1, borderColor: WdpColors.border}}><Text style={{fontSize: 14, fontWeight: '600', color: selected === value ? 'white' : WdpColors.text}}>{value ? label(value) : 'Tất cả'}</Text></View></Pressable>)}</ScrollView>;
}
export function CustomerRecordSummary({resource, row}: {resource: string; row: Row}) {
  const customer = useCustomerPresentation();
  const values: [string, unknown][] = [
    ['Kho', text(row, 'unit.unitCode', 'storageUnit.unitCode')],
    ['Loại kho', text(row, 'product.name', 'storageType.name', 'reservation.product.name')],
    ['Bắt đầu thuê', text(row, 'startDate', 'reservation.startDate') ? formatDate(text(row, 'startDate', 'reservation.startDate')) : ''],
    ['Kết thúc thuê', text(row, 'effectiveEndDate', 'endDate', 'reservation.endDate') ? formatDate(text(row, 'effectiveEndDate', 'endDate', 'reservation.endDate')) : ''],
    ['Lịch hẹn', row.scheduledAt ? formatDate(String(row.scheduledAt), true) : ''],
    ['Còn phải trả', resource !== 'invoices' && row.balanceDue != null ? formatMoney(Number(row.balanceDue)) : ''],
    ['Liên quan đến', text(row, 'reservation.reference', 'reservationReference', 'contract.contractCode')],
    ['Cập nhật gần nhất', resource === 'support-requests' && row.updatedAt ? formatDate(String(row.updatedAt), true) : ''],
  ];
  if(resource==='rentals') values.unshift(['Ô kho',rows(row.contracts).map(item=>text(item,'unit.unitCode')).filter(Boolean).join(' · ')]);
  if(resource==='renewals') values.push(['Hạn thuê hiện tại',text(row,'previousEndDate')?formatDate(text(row,'previousEndDate')):''],['Hạn thuê đề nghị',text(row,'requestedEndDate')?formatDate(text(row,'requestedEndDate')):''],['Thuê thêm',row.termMonths?String(row.termMonths)+' tháng':'']);
  if(resource==='appointments') values.push(['Kho bàn giao',rows(row.allocatedUnits).map(item=>text(item,'unitCode')).filter(Boolean).join(' · ')]);
  if(resource==='returns') values.push(['Kho trả',rows(row.inspections).map(item=>text(item,'unit.unitCode')).filter(Boolean).join(' · ')]);
  if(customer&&resource!=='invoices') return <View style={{gap:12,paddingBottom:16,borderBottomWidth:1,borderBottomColor:WdpColors.border}}>
    <View style={{gap:6}}><Text accessibilityRole="header" style={{fontSize:22,lineHeight:30,fontWeight:'700',color:WdpColors.text}}>{resource==='contracts'?'Hợp đồng thuê kho':customerRecordTitle(resource,row)}</Text><StatusBadge status={String(row.status??row.rentalState??'')}/>{customerReference(row)?<Text selectable style={{fontSize:14,color:WdpColors.muted}}>{customerReference(row)}</Text>:null}</View>
    <CustomerInfoGrid values={values}/>
    {customerNextStep(resource,row)?<Text style={{fontSize:16,lineHeight:24,color:WdpColors.navy}}>{customerNextStep(resource,row)}</Text>:null}
    {row.description?<View style={{gap:6}}><Text style={{fontSize:17,fontWeight:'600',color:WdpColors.text}}>Nội dung yêu cầu</Text>{String(row.description).length>220?<Disclosure title="Đọc đầy đủ"><Text style={{fontSize:16,lineHeight:24,color:WdpColors.text}}>{String(row.description)}</Text></Disclosure>:<Text style={{fontSize:16,lineHeight:24,color:WdpColors.text}}>{String(row.description)}</Text>}</View>:null}
    {text(row,'resolutionNote','rejectionReason')?<View style={{gap:6,paddingVertical:10,borderTopWidth:0.5,borderTopColor:WdpColors.border}}><Text style={{fontSize:17,fontWeight:'600',color:WdpColors.text}}>{text(row,'rejectionReason')?'Lý do':'Kết quả xử lý'}</Text><Text style={{fontSize:16,lineHeight:24,color:WdpColors.text}}>{text(row,'resolutionNote','rejectionReason')}</Text></View>:null}
  </View>;
  return <View style={{backgroundColor: WdpColors.surface, borderRadius: 14, padding: 14, gap: 12}}><Text accessibilityRole="header" style={{fontSize: 22, lineHeight: 30, fontWeight: '700', color: WdpColors.navy}}>{customerRecordTitle(resource, row)}</Text><StatusBadge status={String(row.status ?? row.rentalState ?? '')}/>{Boolean(customerReference(row)) && <Text selectable style={{fontSize: 14, color: WdpColors.muted}}>{customerReference(row)}</Text>}<Facts values={values}/>{customer && Boolean(customerNextStep(resource, row)) && <Text style={{fontSize: 16, lineHeight: 24, color: WdpColors.navy}}>{customerNextStep(resource, row)}</Text>}{Boolean(row.description) && (String(row.description).length > 220 ? <Disclosure title="Nội dung yêu cầu"><Text style={{fontSize: 16, lineHeight: 24, color: WdpColors.text}}>{String(row.description)}</Text></Disclosure> : <Text style={{fontSize: 16, lineHeight: 24, color: WdpColors.text}}>{String(row.description)}</Text>)}{Boolean(text(row, 'resolutionNote')) && <Text style={{fontSize: 16, lineHeight: 24, color: WdpColors.text}}>{text(row, 'resolutionNote')}</Text>}</View>;
}
export function CustomerRecordSections({row, root = '/customer'}: {row: Row; root?: string}) {
  const groups: {title: string; data: Row}[] = [
    {title: 'Thông tin kho và kỳ thuê', data: {}}, {title: 'Chi phí và thanh toán', data: {}},
    {title: 'Hợp đồng và tài liệu', data: {}}, {title: 'Tiến trình và cập nhật', data: {}},
    {title: 'Thông tin tham chiếu', data: {}},
  ];
  const shown = new Set(['subject', 'description', 'status', 'rentalState', 'startDate', 'endDate', 'effectiveEndDate', 'scheduledAt', 'balanceDue', 'resolutionNote']);
  for (const [key, value] of Object.entries(row)) {
    if (shown.has(key) || value == null || value === '' || Array.isArray(value) && !value.length) continue;
    const group = /(^id$|Id$|Code$|reference|customer|createdBy|updatedBy)/i.test(key) ? 4 : /price|amount|payment|billing|invoice|deposit|fee|discount|tax|balance/i.test(key) ? 1 : /contract|appendix|sign|document|accept/i.test(key) ? 2 : /history|At$|response|resolution|escalat|staff|inspection|timeline/i.test(key) ? 3 : 0;
    groups[group].data[key] = value;
  }
  return <View style={{gap: 4}}>{groups.filter(group => Object.keys(group.data).length).map(group => <Disclosure key={group.title} title={group.title}><RecordView row={group.data} root={root}/></Disclosure>)}</View>;
}
