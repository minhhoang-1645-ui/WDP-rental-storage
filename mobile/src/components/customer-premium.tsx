import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { router, type Href } from 'expo-router';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { CustomerTheme as C } from '@/constants/wdp-theme';

export const customerStyles = StyleSheet.create({
  page: { padding: C.pagePadding, paddingBottom: 28, gap: 16 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: C.text },
  section: { fontSize: 17, lineHeight: 24, fontWeight: '600', color: C.text },
  body: { fontSize: 16, lineHeight: 24, color: C.text },
  secondary: { fontSize: 14, lineHeight: 20, color: C.muted },
  link: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: C.cobalt },
  row: { minHeight: 64, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
});

export function CustomerHero({children,topInset=0,compact=false}: {children: ReactNode;topInset?:number;compact?:boolean}) {
  const [size,setSize]=useState({width:0,height:0});
  const startColor = compact ? '#08429F' : C.cobalt;
  return <View onLayout={({nativeEvent:{layout}})=>setSize(previous=>previous.width===layout.width&&previous.height===layout.height?previous:{width:layout.width,height:layout.height})} style={{backgroundColor:startColor, overflow:'hidden', paddingHorizontal:20,paddingTop:topInset+8,paddingBottom:compact?9:24, gap:compact?8:20}}>
    <Svg pointerEvents="none" width={size.width} height={size.height} style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs><LinearGradient id="customerHero" x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0" stopColor={startColor}/><Stop offset="1" stopColor={compact ? '#072458' : C.deepNavy}/></LinearGradient></Defs>
      <Rect width="100%" height="100%" fill="url(#customerHero)"/>
    </Svg>{children}
  </View>;
}
export function CustomerLink({title, path, onPress}: {title:string; path?:string; onPress?:()=>void}) {
  return <Pressable accessibilityRole="button" onPress={onPress ?? (()=>{if(path)router.push(path as Href);})} style={({pressed})=>({minHeight:44, justifyContent:'center', opacity:pressed?0.65:1})}><Text style={customerStyles.link}>{title}</Text></Pressable>;
}
export function CustomerActionRow({title, subtitle, path, icon:Icon, trailing}: {title:string; subtitle?:string; path:string; icon?:LucideIcon; trailing?:ReactNode}) {
  return <Pressable accessibilityRole="button" onPress={()=>router.push(path as Href)} style={({pressed})=>[customerStyles.row,{opacity:pressed?0.65:1}]}>
    {Icon&&<View style={{width:40,height:40,borderRadius:20,backgroundColor:C.soft,alignItems:'center',justifyContent:'center'}}><Icon size={20} color={C.cobalt}/></View>}
    <View style={{flex:1,gap:4}}><Text style={[customerStyles.body,{fontWeight:'600'}]}>{title}</Text>{subtitle?<Text style={customerStyles.secondary}>{subtitle}</Text>:null}</View>{trailing}<ChevronRight size={18} color={C.muted}/>
  </Pressable>;
}
