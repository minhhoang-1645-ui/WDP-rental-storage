import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowUp, Check, DoorOpen } from 'lucide-react-native';
import type { FloorPlanUnit } from './floor-plan-viewer';

/** Illustrative two-bank selection layout; never presented as surveyed facility geometry. */
export function BookingUnitSelector({units, selected, onSelect}: {units: FloorPlanUnit[]; selected: string[]; onSelect: (unit: FloorPlanUnit) => void}) {
  const ordered = [...units].sort((a,b) => (a.row ?? 99999) - (b.row ?? 99999) || (a.position ?? 99999) - (b.position ?? 99999) || a.code.localeCompare(b.code, 'vi', {numeric:true}));
  const half = Math.ceil(ordered.length/2), left = ordered.slice(0,half), right = ordered.slice(half);
  const tile = (unit?: FloorPlanUnit) => {
    if(!unit) return <View style={s.slot}/>;
    const chosen = selected.includes(unit.id);
    const suffix = unit.code.match(/(?:^|[-_])([0-9]+)$/)?.[1];
    const title = suffix ? 'Ô ' + String(Number(suffix)).padStart(2,'0') : unit.code;
    return <Pressable accessibilityRole="checkbox" accessibilityLabel={unit.code+', '+(chosen?'đã chọn':unit.available?'còn trống':'hết chỗ')} accessibilityState={{checked:chosen,disabled:!unit.available}} disabled={!unit.available} onPress={()=>onSelect(unit)} style={({pressed})=>[s.slot,s.unit,{backgroundColor:chosen?'#315D99':unit.available?'#DDF4E3':'#FBE1E3',borderColor:chosen?'#315D99':unit.available?'#94CDA5':'#E8A5AD'},pressed&&{opacity:0.8}]}>
      {chosen&&<Check size={18} color="white"/>}<Text numberOfLines={2} style={[s.unitLabel,{color:chosen?'white':unit.available?'#173D29':'#8C454F'}]}>{title}</Text>{!unit.available&&<Text style={s.unavailable}>Hết chỗ</Text>}
    </Pressable>;
  };
  return <View style={{gap:12}}>
    <View style={s.heading}><Text style={s.headingText}>Chọn ô kho</Text><Text style={s.count}>{units.filter(unit=>unit.available).length}/{units.length} ô trống</Text></View>
    <View style={s.legend}>{[['Còn trống','#DDF4E3'],['Hết chỗ','#FBE1E3'],['Đã chọn','#315D99']].map(([label,color])=><View key={label} style={s.legendItem}><View style={[s.dot,{backgroundColor:color}]}/><Text style={s.secondary}>{label}</Text></View>)}</View>
    <View style={s.plan}>
      <View style={s.row}><Text style={[s.bankLabel,s.slot]}>Dãy A</Text><View style={s.corridorWidth}/><Text style={[s.bankLabel,s.slot]}>Dãy B</Text></View>
      {left.map((unit,index)=><View key={unit.id} style={s.row}>{tile(unit)}<View accessible accessibilityLabel="Lối đi minh họa" style={[s.corridor,s.corridorWidth]}><ArrowUp size={18} color="#6D849B"/>{index===Math.floor(left.length/2)&&<Text style={s.aisleLabel}>Lối đi</Text>}</View>{tile(right[index])}</View>)}
      <View style={s.entrance}><DoorOpen size={20} color="#315D99"/><Text style={s.entranceLabel}>CỬA VÀO</Text><ArrowUp size={18} color="#315D99"/></View>
    </View>
    <Text style={s.caption}>Bố cục minh họa, không phải sơ đồ vị trí thực tế. Mã ô và tình trạng trống lấy từ hệ thống.</Text>
  </View>;
}
const s=StyleSheet.create({
  heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  headingText:{fontSize:17,lineHeight:24,fontWeight:'600',color:'#17191D'},
  count:{fontSize:14,color:'#475467',fontWeight:'600'},
  legend:{flexDirection:'row',flexWrap:'wrap',gap:12,justifyContent:'space-between'},
  legendItem:{flexDirection:'row',alignItems:'center',gap:6},dot:{width:14,height:14,borderRadius:5,borderWidth:0.5,borderColor:'#CCD4DD'},
  secondary:{fontSize:14,color:'#475467'},plan:{padding:10,gap:8,borderRadius:16,backgroundColor:'#F7F8FC'},
  row:{flexDirection:'row',alignItems:'stretch',gap:8},slot:{flex:1,minWidth:0},corridorWidth:{width:'20%',minWidth:48},
  bankLabel:{textAlign:'center',fontSize:14,color:'#475467',paddingVertical:4},
  unit:{minHeight:76,borderRadius:10,borderWidth:1,justifyContent:'center',alignItems:'center',gap:4,padding:6},
  unitLabel:{fontSize:16,lineHeight:22,fontWeight:'600',textAlign:'center'},unavailable:{fontSize:13,color:'#8C454F'},
  corridor:{backgroundColor:'#E8EEF5',alignItems:'center',justifyContent:'center',gap:6},aisleLabel:{fontSize:13,color:'#526B83'},
  entrance:{minHeight:48,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:8},entranceLabel:{fontSize:14,color:'#315D99',fontWeight:'600'},
  caption:{fontSize:13,lineHeight:19,color:'#667085'},
});
