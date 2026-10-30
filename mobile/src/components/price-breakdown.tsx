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
  const firstLines = [[summary.monthly ? 'Tiền thuê tháng đầu' : 'Tiền thuê cả kỳ','rentalAmount'],['Tiền cọc · chỉ thu một lần','depositAmount'],['Vật tư mua một lần','purchaseAddOnAmount'],['Thiết bị tính phí trong khoản đầu','rentalAddOnAmount']];
  return <View style={styles.wrap}>
    <View style={styles.hero} accessibilityLabel="Khoản thanh toán lần đầu">
      <View style={styles.row}><Text accessibilityRole="header" style={styles.heroTitle}>Thanh toán lần đầu</Text><Text style={styles.heroNote}>Dự kiến</Text></View>
      <Text selectable accessibilityLabel="Số tiền thanh toán lần đầu dự kiến" style={styles.firstAmount}>{money(summary.first)}</Text>
      <Text style={styles.heroCopy}>{summary.plan}{typeof quote.termMonths==='number' ? ` · Thuê ${quote.termMonths} tháng` : ''}</Text>
      {Boolean(period) && <Text style={styles.heroCopy}>Tiền thuê trong khoản này: {period}.</Text>}
      {firstLines.filter(([,key])=>typeof initial[key]==='number' && Number(initial[key])>0).map(([title,key])=><View key={key} style={styles.row}><Text style={styles.heroLabel}>{title}</Text><Text style={styles.heroValue}>{formatMoney(Number(initial[key]))}</Text></View>)}
      {initial.depositAmount===0 && <Text style={styles.noDeposit}>Kho này không thu tiền cọc.</Text>}
      <Text style={styles.heroNote}>Báo giá dự kiến. Thanh toán theo hóa đơn sau khi đơn được xác nhận và hợp đồng đã ký.</Text>
    </View>
    {summary.remaining!==null && <View style={styles.later}><View style={styles.row}><Text style={styles.label}>{summary.remaining>0 ? 'Còn lại trong các kỳ sau' : 'Không còn khoản báo giá này ở kỳ sau'}</Text><Text style={styles.value}>{money(summary.remaining)}</Text></View>{summary.laterCount!==null && <Text style={styles.note}>{summary.laterCount} kỳ còn lại × {money(summary.laterEach)}/kỳ.</Text>}{summary.remaining>0 && <Text style={styles.note}>{summary.laterCount===null ? 'Số tiền từng kỳ được ghi trên hóa đơn tương ứng. ' : ''}Khoản này chưa thu trong lần đầu. Tiền cọc không thu lại.</Text>}</View>}
    <View style={styles.row}><Text style={styles.label}>Tổng chi phí cả kỳ</Text><Text selectable style={styles.total}>{money(summary.total)}</Text></View>
    <Text style={styles.note}>Đã gồm tiền thuê sau ưu đãi, dịch vụ và cọc nếu có. Đây không phải khoản thu thêm.</Text>
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
