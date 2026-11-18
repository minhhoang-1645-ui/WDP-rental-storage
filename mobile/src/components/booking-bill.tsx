import { StyleSheet, Text, View } from 'react-native';
import { object, rows, type Row } from '@/operations/model';
import { formatDate, formatMoney } from '@/utils/format';
import { quotePaymentSummary } from '@/utils/quote-payment-summary';
import { serviceDisplayName } from '@/utils/service-labels';
import { serviceCalendarMonths } from '@/utils/service-period';

const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0;

/** Total and balances come from the quote. Unequal future invoices are never averaged. */
export function BookingBill({quote}: {quote: Row}) {
  const summary=quotePaymentSummary(quote), initial=object(quote.initialPaymentBreakdown);
  const months=typeof quote.termMonths==='number'&&Number.isInteger(quote.termMonths)?quote.termMonths:0;
  const remainingMonths=summary.monthly&&months>1?months-1:0;
  const quantity=positive(quote.quantity)?quote.quantity:null;
  const monthlyRent=positive(quote.monthlyUnitPrice)&&quantity!==null?quote.monthlyUnitPrice*quantity:null;
  const depositEquivalent=quote.billingMode==='MONTHLY'&&positive(quote.depositAmount)&&monthlyRent!==null&&Number.isSafeInteger(monthlyRent)&&Number.isInteger(quote.depositAmount/monthlyRent)?quote.depositAmount/monthlyRent:null;
  const depositLabel=depositEquivalent!==null?'Tiền cọc ('+depositEquivalent+' tháng tiền thuê)':'Tiền cọc';
  const period=months>0?months+' tháng':positive(quote.billableDays)?quote.billableDays+' ngày':'thời gian đã chọn';
  const rentals=rows(quote.services).filter(service=>service.kind==='RENTAL');
  const fullMonthlyServices=Array.isArray(quote.services)&&rentals.every(service=>service.billingUnit==='MONTH'&&service.serviceStartDate===quote.startDate&&service.serviceEndDate===quote.endDate);
  const initialEquipment=typeof initial.rentalAddOnAmount==='number'?initial.rentalAddOnAmount:0;
  const monthlyAmount=positive(initial.rentalAmount)?initial.rentalAmount+initialEquipment:null;
  const each=summary.laterEach ?? (fullMonthlyServices&&monthlyAmount!==null&&remainingMonths>0&&summary.remaining===monthlyAmount*remainingMonths?monthlyAmount:null);
  const row=(title:string,value:number|string|null|undefined,emphasis=false)=>value!==null&&value!==undefined&&value!==0?<View style={s.row}><Text style={[s.label,emphasis&&s.emphasis]}>{title}</Text><Text selectable style={[s.value,emphasis&&s.emphasis]}>{typeof value==='number'?formatMoney(value):value}</Text></View>:null;
  return <View style={{gap:16}}>
    {positive(summary.total)&&<View style={s.block}>
      <Text style={s.title}>Tổng tiền tất cả hóa đơn</Text>
      <Text selectable style={s.total}>{formatMoney(summary.total)}</Text>
      <Text style={s.note}>Tiền thuê toàn bộ thời gian + cọc + thiết bị/vật tư</Text>
    </View>}
    {quote.paymentPlan!=='PREPAID'&&positive(summary.first)&&<View style={s.block}>
      <Text style={s.title}>Thanh toán lần đầu</Text>
      <Text selectable style={s.first}>{formatMoney(summary.first)}</Text>
      <Text style={s.note}>{summary.monthly?'Tháng đầu + cọc + thiết bị/vật tư ban đầu':'Trả một lần cho toàn bộ thời gian thuê'}</Text>
      {summary.monthly&&<View style={{gap:2,marginTop:8}}>
        {row('Tiền thuê tháng đầu',positive(initial.rentalAmount)?initial.rentalAmount:null)}
        {row(depositLabel,positive(initial.depositAmount)?initial.depositAmount:null)}
        {row('Vật tư mua một lần',positive(initial.purchaseAddOnAmount)?initial.purchaseAddOnAmount:null)}
        {row('Thiết bị trong tháng đầu',positive(initial.rentalAddOnAmount)?initial.rentalAddOnAmount:null)}
      </View>}
    </View>}
    {summary.monthly&&positive(summary.remaining)&&<View style={{gap:4}}>
      <Text style={s.title}>Các tháng còn lại</Text>
      <View style={s.row}><Text style={s.label}>Số tháng chưa trả</Text><Text style={s.value}>{remainingMonths} tháng</Text></View>
      {each!==null
        ? row('Mỗi tháng cần trả',each)
        : <>{row('Tiền thuê kho mỗi tháng',positive(initial.rentalAmount)?initial.rentalAmount:null)}{row('Thiết bị mỗi tháng','Theo hóa đơn')}</>}
      <View style={{borderTopWidth:1,borderColor:'#D0D5DD',marginTop:6,paddingTop:6}}>{row('Tổng còn trả sau',summary.remaining,true)}</View>
    </View>}
    <View style={{gap:4,borderTopWidth:1,borderColor:'#D0D5DD',paddingTop:14}}>
      <Text style={s.title}>Chi tiết toàn bộ tiền thuê</Text>
      {row(quote.billingMode==='DAILY'?'Đơn giá 1 kho / ngày':'Đơn giá 1 kho / tháng',quote.billingMode==='DAILY'?(positive(Number(quote.dailyUnitPrice))?Number(quote.dailyUnitPrice):null):(positive(quote.monthlyUnitPrice)?quote.monthlyUnitPrice:null))}
      {row('Số kho',quantity!==null?quantity+' kho':null)}
      {row('Thời hạn thuê',period)}
      {positive(quote.discountAmount)&&positive(quote.baseRentalAmount)&&row('Tiền thuê trước giảm giá',quote.baseRentalAmount)}
      {positive(quote.discountAmount)&&row('Giảm giá trả thẳng',-quote.discountAmount)}
      {row('Tiền thuê '+period,positive(quote.rentalAmount)?quote.rentalAmount:null)}
      {row(depositLabel,positive(quote.depositAmount)?quote.depositAmount:null)}
      {positive(quote.depositAmount)&&<Text style={s.note}>Cọc thu một lần, đối chiếu khi trả kho.</Text>}
      {rows(quote.services).filter(service=>positive(service.amount)).map((service,index)=>{
        const unit=service.billingUnit==='DAY'?'ngày':service.billingUnit==='MONTH'?'tháng':'cái';
        const from=typeof service.serviceStartDate==='string'?service.serviceStartDate:'';
        const to=typeof service.serviceEndDate==='string'?service.serviceEndDate:'';
        const duration=service.billingUnit==='MONTH'?serviceCalendarMonths(from,to):service.billingUnit==='DAY'?(Date.parse(to)-Date.parse(from))/86400000:null;
        return <View key={String(service.serviceId??service.code??index)} style={{gap:4,paddingTop:8}}>
          {row(serviceDisplayName(String(service.code??''),String(service.name??'Thiết bị/vật tư')),Number(service.amount))}
          <Text style={s.note}>{positive(service.unitPrice)?formatMoney(service.unitPrice)+'/'+unit+' × ':''}{String(service.quantity??'')} {service.kind==='PURCHASE'?'sản phẩm':'thiết bị'}{typeof duration==='number'&&Number.isFinite(duration)&&duration>0?' × '+duration+' '+unit:''}</Text>
          {from&&to&&<Text style={s.note}>{formatDate(from)} → {formatDate(to)}</Text>}
        </View>;
      })}
      {row('Tổng thiết bị và vật tư',positive(quote.addOnTotalAmount)?quote.addOnTotalAmount:null)}
    </View>
    <Text style={s.note}>Báo giá; thanh toán theo hóa đơn sau khi ký hợp đồng.</Text>
  </View>;
}
const s=StyleSheet.create({
  block:{gap:6,paddingBottom:16,borderBottomWidth:1,borderColor:'#D0D5DD'},
  title:{fontSize:17,lineHeight:24,fontWeight:'600',color:'#17191D'},
  total:{fontSize:28,lineHeight:36,fontWeight:'700',color:'#123E85',fontVariant:['tabular-nums']},
  first:{fontSize:24,lineHeight:32,fontWeight:'700',color:'#123E85',fontVariant:['tabular-nums']},
  note:{fontSize:14,lineHeight:21,color:'#475467'},
  row:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:16,paddingVertical:8},
  label:{flex:1,fontSize:14,lineHeight:22,color:'#475467'},
  value:{fontSize:16,lineHeight:24,fontWeight:'600',color:'#17191D',flexShrink:1,fontVariant:['tabular-nums']},
  emphasis:{fontSize:17,lineHeight:25,fontWeight:'700',color:'#123E85'},
});
