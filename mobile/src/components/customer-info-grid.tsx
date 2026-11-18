import { Text, View, useWindowDimensions } from 'react-native';

export function CustomerInfoGrid({values}: {values:[string,unknown][]}) {
  const {width,fontScale}=useWindowDimensions();
  const columns=width>=360&&fontScale<1.35;
  const shown=values.filter(([,value])=>value!==null&&value!==undefined&&value!==''&&value!=='—');
  return <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{shown.map(([title,value],index)=><View key={title+':'+index} style={{width:columns?'47%':'100%',gap:4,paddingVertical:4}}><Text style={{fontSize:14,lineHeight:20,color:'#475467'}}>{title}</Text><Text selectable style={{fontSize:16,lineHeight:24,fontWeight:'600',color:'#17191D'}}>{typeof value==='boolean'?value?'Có':'Không':String(value)}</Text></View>)}</View>;
}
