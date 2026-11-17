import { useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { Bell, X } from 'lucide-react-native';
import { useActivity } from '@/activity/context';
import { formatDate } from '@/utils/format';
import { CustomerStatusFilters } from './customer-record';
import { customerStyles as s } from './customer-premium';
import { CustomerTheme as C } from '@/constants/wdp-theme';

export function CustomerNotifications({inverse=false,label}: {inverse?:boolean;label?:string}) {
  const activity=useActivity(), [open,setOpen]=useState(false), [filter,setFilter]=useState('');
  const unread=activity.entries.filter(i=>!activity.read.includes(i.token));
  const items=activity.entries.filter(i=>filter==='unread'?!activity.read.includes(i.token):filter==='action'?i.action:true);
  return <><Pressable accessibilityRole="button" accessibilityLabel={label??('Thông báo, '+unread.length+' chưa đọc')} onPress={()=>setOpen(true)} style={({pressed})=>({minWidth:44,minHeight:44,justifyContent:'center',alignItems:label?'flex-start':'center',opacity:pressed?0.65:1})}>{label?<Text style={s.link}>{label}</Text>:<Bell size={22} color={inverse?'white':C.navy}/>}{!label&&unread.length>0&&<View style={{position:'absolute',top:8,right:8,width:8,height:8,borderRadius:4,backgroundColor:C.danger}}/>}</Pressable>
  <Modal visible={open} animationType="slide" onRequestClose={()=>setOpen(false)}><SafeAreaView style={{flex:1,backgroundColor:'white'}}><FlatList data={items} keyExtractor={i=>i.id} contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={activity.checking} onRefresh={activity.refresh}/>} ListHeaderComponent={<View style={{gap:8}}><View style={{flexDirection:'row',alignItems:'center'}}><Text style={[s.title,{flex:1}]}>Thông báo</Text><Pressable accessibilityRole="button" accessibilityLabel="Đóng thông báo" onPress={()=>setOpen(false)} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><X color={C.text}/></Pressable></View><CustomerStatusFilters values={['unread','action']} selected={filter} onChange={setFilter} label={v=>v==='unread'?'Chưa đọc':'Cần thực hiện'}/><Pressable accessibilityRole="button" onPress={()=>activity.markRead(activity.entries.map(i=>i.token))} style={{minHeight:44,justifyContent:'center'}}><Text style={s.link}>Đánh dấu tất cả đã đọc</Text></Pressable>{activity.failed.length>0&&<Text accessibilityRole="alert" style={s.secondary}>Một số cập nhật chưa tải được. Kéo xuống để thử lại.</Text>}</View>} renderItem={({item})=><Pressable accessibilityRole="button" onPress={()=>{activity.markRead([item.token]);setOpen(false);router.push(item.mobile as Href);}} style={({pressed})=>[s.row,{opacity:pressed?0.65:1,alignItems:'flex-start'}]}><View style={{width:8,height:8,borderRadius:4,backgroundColor:activity.read.includes(item.token)?C.border:C.cobalt,marginTop:8}}/><View style={{flex:1,gap:4}}><Text style={[s.body,{fontWeight:'600'}]}>{item.title}</Text><Text numberOfLines={2} style={s.secondary}>{item.message}</Text>{item.at?<Text style={s.secondary}>{formatDate(item.at,true)}</Text>:null}</View></Pressable>} ListEmptyComponent={<Text style={[s.secondary,{paddingVertical:24}]}>{activity.loading?'Đang tải thông báo…':'Chưa có thông báo trong mục này.'}</Text>}/></SafeAreaView></Modal></>;
}
