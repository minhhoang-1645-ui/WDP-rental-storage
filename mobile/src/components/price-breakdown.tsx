import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { object, rows, text, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';
import { serviceDisplayName } from '@/utils/service-labels';
import { quotePaymentSummary, quotePeriod } from '@/utils/quote-payment-summary';

const money = (value: number | null) => value === null ? 'Chờ xác nhận' : formatMoney(value);
export function PriceBreakdown({ quote }: { quote: Row }) {
  const [expanded, setExpanded] = useState(false);
  const summary = quotePaymentSummary(quote), initial = object(quote.initialPaymentBreakdown);
  const period = quotePeriod(initial.periodStart, initial.periodEnd);
  if (summary.first === null && summary.total === null) return null;
  const firstLines = [[summary.monthly ? 'Tiền thuê tháng đầu' : 'Tiền thuê cả kỳ','rentalAmount'],['Tiền cọc bảo đảm · thu một lần','depositAmount'],['Vật tư/dịch vụ mua một lần','purchaseAddOnAmount'],['Dịch vụ/thiết bị thuê trong kỳ đầu','rentalAddOnAmount']];
  return <View style={styles.wrap}>
    <View style={styles.hero} accessibilityLabel="Khoản thanh toán lần đầu">
      <View style={styles.row}><Text accessibilityRole="header" style={styles.heroTitle}>Thanh toán lần đầu</Text><Text style={styles.heroNote}>Dự kiến</Text></View>
      <Text selectable accessibilityLabel="Số tiền thanh toán lần đầu dự kiến" style={styles.firstAmount}>{money(summary.first)}</Text>
      <Text style={styles.heroCopy}>{summary.plan}{typeof quote.termMonths==='number' ? ` · Thuê ${quote.termMonths} tháng` : ''}{typeof quote.quantity==='number' ? ` · ${quote.quantity} kho` : ''}</Text>
      <Text style={styles.heroCopy}>Số tiền trên là tổng của các khoản bên dưới, không cộng thêm lần nữa.</Text>
      {Boolean(period) && <Text style={styles.heroCopy}>Tiền thuê trong khoản này: {period}.</Text>}
      {firstLines.filter(([,key])=>typeof initial[key]==='number' && Number(initial[key])>0).map(([title,key])=><View key={key} style={styles.row}><Text style={styles.heroLabel}>{title}</Text><Text style={styles.heroValue}>{formatMoney(Number(initial[key]))}</Text></View>)}
      {initial.depositAmount===0 && <Text style={styles.noDeposit}>Kho này không thu tiền cọc.</Text>}
      {Number(initial.depositAmount)>0 && <Text style={styles.heroCopy}>Tiền cọc không phải tiền thuê. Khi trả kho, cọc được đối chiếu công nợ, chi phí theo hợp đồng và hoàn phần còn lại.</Text>}
      <Text style={styles.heroNote}>Báo giá dự kiến. Thanh toán theo hóa đơn sau khi đơn được xác nhận và hợp đồng đã ký.</Text>
    </View>
    {summary.remaining!==null && <View style={styles.later}><View style={styles.row}><Text style={styles.label}>{summary.remaining>0 ? 'Tổng còn lại, trả ở các kỳ sau' : 'Không còn khoản báo giá này ở kỳ sau'}</Text><Text style={styles.value}>{money(summary.remaining)}</Text></View>{summary.laterCount!==null && <Text style={styles.note}>{summary.laterCount} kỳ còn lại × {money(summary.laterEach)}/kỳ.</Text>}{summary.remaining>0 && <Text style={styles.note}>{summary.laterCount===null ? 'Số tiền từng kỳ được ghi trên hóa đơn tương ứng. ' : ''}Khoản này chưa thu trong lần đầu. Tiền cọc không thu lại.</Text>}</View>}
    <Text style={styles.heading}>Toàn bộ kỳ thuê gồm những khoản nào?</Text>
    {typeof quote.rentalAmount==='number' && <View><View style={styles.row}><Text style={styles.label}>Tiền thuê kho cả kỳ{Number(quote.discountAmount)>0 ? ' (đã trừ ưu đãi)' : ''}</Text><Text style={styles.value}>{formatMoney(quote.rentalAmount)}</Text></View><Text style={styles.note}>{quotePeriod(quote.startDate, quote.endDate)}</Text></View>}
    {Number(quote.addOnTotalAmount)>0 && <View style={styles.row}><Text style={styles.label}>Dịch vụ và vật tư cả kỳ</Text><Text style={styles.value}>{formatMoney(Number(quote.addOnTotalAmount))}</Text></View>}
    {Number(quote.depositAmount)>0 && <View><View style={styles.row}><Text style={styles.label}>Tiền cọc bảo đảm</Text><Text style={styles.value}>{formatMoney(Number(quote.depositAmount))}</Text></View><Text style={styles.note}>Đã tính trong lần đầu; không thu thêm ở các kỳ sau.</Text></View>}
    <View style={styles.row}><Text style={styles.label}>{Number(quote.depositAmount)>0 ? 'Tổng dự kiến cả kỳ, gồm cọc' : 'Tổng dự kiến cả kỳ'}</Text><Text selectable style={styles.total}>{money(summary.total)}</Text></View>
    <Text style={styles.note}>Tổng này đã bao gồm khoản thanh toán lần đầu và các kỳ sau, không phải khoản thu thêm.{summary.monthly && Number(summary.remaining)>0 ? ' Bạn không phải trả toàn bộ số này trong lần đầu.' : ''}</Text>
    <Pressable accessibilityRole="button" accessibilityState={{expanded}} onPress={()=>setExpanded(value=>!value)} style={styles.toggle}><Text style={styles.heading}>{expanded ? 'Thu gọn cách tính' : 'Xem cách tính và chi tiết cả kỳ'}</Text></Pressable>
    {expanded && <View style={styles.wrap}>{typeof quote.monthlyUnitPrice==='number' && <Text style={styles.note}>Đơn giá một kho: {formatMoney(quote.monthlyUnitPrice)}/tháng.</Text>}{rows(quote.lineItems).map((item,index)=><View key={text(item,'code')||index}><View style={styles.row}><Text style={styles.label}>{serviceDisplayName(text(item,'code'),text(item,'label'))}</Text><Text style={styles.value}>{typeof item.amount==='number' ? formatMoney(item.amount) : 'Chờ xác nhận'}</Text></View><Text style={styles.note}>{text(item,'basis')}</Text></View>)}{Number(quote.discountAmount)>0 && <Text style={styles.note}>Ưu đãi chỉ giảm tiền thuê kho; không giảm tiền cọc hoặc dịch vụ.</Text>}{Number(quote.depositAmount)>0 && <Text style={styles.note}>Tiền cọc được đối chiếu, quyết toán khi trả kho theo hợp đồng; không phải tiền thuê.</Text>}</View>}
  </View>;
}
export const quoteFrom = (value: unknown) => object(value);
const styles = StyleSheet.create({
  wrap:{gap:WdpSpacing.sm},
  hero:{gap:12,padding:18,borderRadius:14,backgroundColor:WdpColors.navy},
  heroTitle:{color:'#fff',fontWeight:'700',fontSize:16},
  firstAmount:{color:'#fff',fontSize:32,lineHeight:39,fontWeight:'700'},
  heroCopy:{color:'#e5ecee',fontSize:13,lineHeight:20},
  heroLabel:{color:'#e5ecee',fontSize:12,flex:1},
  heroValue:{color:'#fff',fontSize:13,fontWeight:'600'},
  heroNote:{color:'#dce8e9',fontSize:11,lineHeight:18},
  noDeposit:{color:'#b9ebd3',fontSize:12},
  later:{gap:8,padding:14,borderRadius:10,backgroundColor:WdpColors.tealSubtle},
  row:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:12},
  heading:{color:WdpColors.navy,fontSize:13,fontWeight:'600'},
  label:{color:WdpColors.text,fontSize:13,flex:1},
  value:{color:WdpColors.text,fontSize:13,fontWeight:'600'},
  total:{color:WdpColors.navy,fontSize:16,fontWeight:'700'},
  note:{color:WdpColors.muted,fontSize:12,lineHeight:19},
  toggle:{minHeight:48,justifyContent:'center'},
});
