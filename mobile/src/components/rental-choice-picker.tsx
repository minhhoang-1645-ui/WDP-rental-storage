import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Field } from '@/operations/ui';
import type { Row } from '@/operations/model';
import { WdpColors } from '@/constants/wdp-theme';
import { normalizeRentalSearch, rentalChoice } from '@/utils/rental-choice';

export function RentalChoicePicker({ contracts, value, onChange, disabled=false }: {contracts:Row[];value:string;onChange:(id:string)=>void;disabled?:boolean}) {
  const [search,setSearch]=useState('');
  const choices=contracts.filter(row=>row.status==='ACTIVE').map(rentalChoice), selected=choices.find(row=>row.id===value);
  const shown=choices.filter(row=>row.search.includes(normalizeRentalSearch(search)));
  if(!choices.length)return null;
  return <View style={styles.wrap}>
    <Text accessibilityRole="header" style={styles.title}>Bạn muốn gửi/lấy hàng ở kho nào?</Text>
    <Text style={styles.copy}>Chọn đúng kho đang thuê. Mỗi phiếu áp dụng cho một kho; không cần nhớ mã hợp đồng.</Text>
    {choices.length>1 && <Field title="Tìm kho đang thuê" value={search} onChange={setSearch} maxLength={150} disabled={disabled} />}
    <Text style={styles.copy}>{shown.length} / {choices.length} kho đang thuê</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel="Kho gửi/lấy hàng" style={styles.wrap}>{shown.map(row=><Pressable key={row.id} accessibilityRole="radio" aria-checked={row.id===value} accessibilityLabel={row.label} accessibilityState={{checked:row.id===value,disabled}} disabled={disabled} onPress={()=>{if(row.id!==value)onChange(row.id);}} style={[styles.card,row.id===value && styles.selected]}>
      <Text style={styles.radio}>{row.id===value?'●':'○'}</Text><View style={styles.content}><View style={styles.heading}><Text style={styles.code}>{row.unitCode}</Text>{row.id===value && <Text style={styles.badge}>Đã chọn</Text>}</View><Text style={styles.name}>{row.name}</Text><Text style={styles.copy}>{[row.condition,row.location].filter(Boolean).join(' · ') || 'Vị trí chưa cập nhật'}</Text>{Boolean(row.period) && <Text style={styles.copy}>Thời gian thuê: {row.period}</Text>}<Text style={styles.copy}>Hợp đồng: {row.code || 'Chưa có mã'}</Text></View>
    </Pressable>)}</View>
    {!shown.length && <Text style={styles.copy}>Không tìm thấy kho phù hợp. Thử mã kho hoặc tên khác.</Text>}
    {selected && <Text style={styles.confirm}>Phiếu sẽ gửi cho {selected.unitCode} · {selected.name}. Đổi kho sẽ làm mới các dòng hàng để tránh gửi nhầm kho.</Text>}
  </View>;
}
const styles=StyleSheet.create({
  wrap:{gap:12},title:{fontSize:17,fontWeight:'700',color:WdpColors.navy},copy:{fontSize:12,lineHeight:19,color:WdpColors.muted},
  card:{padding:16,borderWidth:1,borderColor:WdpColors.border,borderRadius:12,backgroundColor:WdpColors.surface,flexDirection:'row',alignItems:'flex-start',gap:12},
  selected:{borderColor:WdpColors.navy,backgroundColor:WdpColors.tealSubtle},radio:{fontSize:22,lineHeight:24,color:WdpColors.navy},
  content:{gap:7,flex:1},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},code:{color:WdpColors.navy,fontWeight:'700',fontSize:18,flexShrink:1},
  name:{fontSize:14,fontWeight:'600',color:WdpColors.navy},badge:{fontSize:10,color:WdpColors.success},confirm:{padding:12,borderRadius:8,backgroundColor:WdpColors.tealSubtle,color:WdpColors.navy,fontSize:12,lineHeight:20},
});
