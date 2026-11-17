import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { formatDate, formatMoney } from '@/utils/format';
import { CustomerInfoGrid } from './customer-info-grid';
import { CustomerActionRow, customerStyles as s } from './customer-premium';
import { StatusBadge } from './customer-ui';
import { CustomerTheme as C } from '@/constants/wdp-theme';

const money=(value:unknown)=>value!=null&&Number.isFinite(Number(value))?formatMoney(Number(value)):'';
const date=(row:Row,...paths:string[])=>text(row,...paths)?formatDate(text(row,...paths)):'';
function Section({title,children}:{title:string;children:ReactNode}) {return <View style={{gap:12,paddingVertical:12}}><Text accessibilityRole="header" style={s.section}>{title}</Text>{children}</View>;}

/** Curated customer content. Never renders arbitrary API properties in the main screen. */
export function CustomerWorkflowDetails({resource,row}:{resource:string;row:Row}) {
  const contracts=rows(row.contracts), invoices=rows(row.invoices), billing=object(row.billingSummary);
  const events:[string,string][]=[['Đã gửi',text(row,'createdAt','requestedAt')],['Đã bắt đầu xử lý',text(row,'startedAt')],['Đã duyệt',text(row,'approvedAt')],['Đã ký tài liệu',text(row,'terms.acceptedAt','appendix.acceptedAt')],['Đã bàn giao',text(row,'handoverCompletedAt')],['Đã hoàn tất',text(row,'completedAt','resolvedAt')]];
  const validEvents=events.filter(([,at])=>at&&Number.isFinite(Date.parse(at))).sort((a,b)=>Date.parse(a[1])-Date.parse(b[1]));
  return <View style={{gap:4}}>
    {resource==='rentals'&&<>
      {contracts.length>0&&<Section title="Hợp đồng & tài liệu">{contracts.map(contract=><CustomerActionRow key={idOf(contract)} title={text(contract,'unit.unitCode')||'Hợp đồng thuê kho'} subtitle={[text(contract,'contractCode'),date(contract,'endDate')?'Đến '+date(contract,'endDate'):''].filter(Boolean).join(' · ')} path={'/customer/contracts/'+encodeURIComponent(idOf(contract))}/>)}</Section>}
      <Section title="Thanh toán"><CustomerInfoGrid values={[["Đã thanh toán",money(billing.totalPaid)],["Còn phải thanh toán",money(billing.payableBalance??billing.totalOutstanding)]]}/>{invoices.map(invoice=><CustomerActionRow key={idOf(invoice)} title={text(invoice,'invoiceCode')||'Hóa đơn thuê kho'} subtitle={money(invoice.balanceDue)} trailing={<StatusBadge status={String(invoice.status)}/>} path={'/customer/invoices/'+encodeURIComponent(idOf(invoice))}/>)}{!invoices.length&&<CustomerActionRow title="Xem hóa đơn" path="/customer/invoices"/>}</Section>
    </>}
    {resource==='appointments'&&<Section title="Thông tin nhận kho"><CustomerInfoGrid values={[["Địa điểm",text(row,'location','facility.address','reservation.facility.address')],["Mục đích",'Nhận kho và bàn giao chìa khóa'],['Ghi chú lịch hẹn',row.note]]}/>{rows(row.allocatedUnits).map((unit,index)=><View key={text(unit,'unitId','contractId','unitCode')||String(index)} style={s.row}><View style={{flex:1,gap:4}}><Text style={[s.body,{fontWeight:'600'}]}>{text(unit,'unitCode')||'Kho bàn giao'}</Text><Text style={s.secondary}>{[text(unit,'contractCode'),date(unit,'contractStartDate')&&date(unit,'contractEndDate')?date(unit,'contractStartDate')+' → '+date(unit,'contractEndDate'):''].filter(Boolean).join(' · ')}</Text></View></View>)}{text(row,'handoverNote')&&<Text style={s.body}>{text(row,'handoverNote')}</Text>}</Section>}
    {resource==='returns'&&rows(row.inspections).length>0&&<Section title="Kết quả kiểm tra">{rows(row.inspections).map((item,index)=><View key={idOf(item)||String(index)} style={{gap:6,paddingVertical:12,borderBottomWidth:0.5,borderBottomColor:C.divider}}><Text style={[s.body,{fontWeight:'600'}]}>{text(item,'unit.unitCode','storageUnit.unitCode')||'Kho kiểm tra'}</Text>{Boolean(item.result)&&<StatusBadge status={String(item.result)}/>}<CustomerInfoGrid values={[["Hiện trạng",item.conditionNote],["Vấn đề ghi nhận",item.issueNote]]}/></View>)}<CustomerActionRow title="Theo dõi tiền cọc" path="/customer/deposit-settlements"/></Section>}
    {resource==='deposit-settlements'&&<Section title="Đối chiếu tiền cọc"><CustomerInfoGrid values={[["Tiền cọc",money(row.depositAmount)],["Các khoản khấu trừ",money(row.deductionAmount??row.totalDeductions)],["Số tiền được hoàn",money(row.refundAmount)],["Còn phải thanh toán",money(row.outstandingAmount)]]}/>{rows(row.issues).map((item,index)=><View key={idOf(item)||String(index)} style={s.row}><Text style={[s.body,{flex:1}]}>{[text(item,'unit.unitCode'),text(item,'reason')].filter(Boolean).join(' · ')||'Khoản khấu trừ'}</Text><Text style={s.body}>{money(item.approvedChargeAmount)}</Text></View>)}</Section>}
    {resource==='deposit-settlements'&&<><CustomerInfoGrid values={[["Đã hoàn tiền",text(row,'refundedAt')?formatDate(text(row,'refundedAt'),true):''],['Ngày hoàn tất đối chiếu',text(row,'settledAt')?formatDate(text(row,'settledAt'),true):'']]}/>{text(row,'outstandingInvoice.id')&&<CustomerActionRow title="Hóa đơn cần thanh toán bổ sung" subtitle={money(object(row.outstandingInvoice).balanceDue)} path={'/customer/invoices/'+encodeURIComponent(text(row,'outstandingInvoice.id'))}/>}</>}
    {resource==='contracts'&&<Section title="Hồ sơ liên quan">{text(row,'reservation.id')&&<CustomerActionRow title="Đơn đặt kho liên quan" path={'/customer/reservations/'+encodeURIComponent(text(row,'reservation.id'))}/>}</Section>}
    {resource==='support-requests'&&text(row,'invoice.id')&&<CustomerActionRow title="Hóa đơn liên quan" path={'/customer/invoices/'+encodeURIComponent(text(row,'invoice.id'))}/>}
    {validEvents.length>0&&<Section title={resource==='support-requests'?'Tiến trình hỗ trợ':'Các mốc cập nhật'}><View style={{gap:0}}>{validEvents.map(([title,at],index)=><View key={title+at} style={{flexDirection:'row',gap:12,minHeight:58}}><View style={{alignItems:'center',width:12}}><View style={{width:8,height:8,borderRadius:4,backgroundColor:C.cobalt,marginTop:7}}/>{index<validEvents.length-1&&<View style={{width:1,flex:1,backgroundColor:C.border}}/>}</View><View style={{flex:1,gap:4,paddingBottom:16}}><Text style={s.body}>{title}</Text><Text style={s.secondary}>{formatDate(at,true)}</Text></View></View>)}</View></Section>}
    <CustomerActionRow title="Xem thông tin đầy đủ" subtitle="Chi tiết hồ sơ và thông tin tham chiếu" path={'/customer/record-information?resource='+encodeURIComponent(resource)+'&id='+encodeURIComponent(idOf(row))}/>
  </View>;
}
