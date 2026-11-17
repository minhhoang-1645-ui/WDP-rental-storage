import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { Field, Navigation, styles } from '@/operations/ui';
import { SectionHeader } from '@/components/customer-ui';
import { recordMatches } from '@/utils/record-search';
import { groups } from '@/constants/customer-menu';
import { customerStyles } from '@/components/customer-premium';

export default function CustomerServicesScreen() {
  const {user,logout} = useAuth();
  const lock = useRef(false);
  const [signingOut,setSigningOut] = useState(false), [error,setError] = useState('');
  const signOut = async () => {if(lock.current)return;lock.current=true;setSigningOut(true);setError('');try{await logout();router.replace('/login');}catch{setError('Chưa đăng xuất được. Bạn thử lại nhé.');}finally{lock.current=false;setSigningOut(false);}};
  const [search, setSearch] = useState('');
  const matching = groups.map(group => ({...group, items: group.items.filter(item => recordMatches(item, search, group.title))})).filter(group => group.items.length);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={customerStyles.page}><Navigation compact title={user?.fullName || 'Tài khoản của tôi'} description="Thông tin liên hệ và tài khoản" path="/customer/account"/><Field title="Tìm dịch vụ" value={search} onChange={setSearch} maxLength={80}/>{matching.map(group => <View key={group.title} style={{gap: 8}}><SectionHeader title={group.title}/><View style={{backgroundColor: 'white', borderRadius: 12}}>{group.items.map(item => <Navigation key={item.path} compact title={item.title} path={item.path}/>)}</View></View>)}{!matching.length && <Text style={styles.copy}>Không tìm thấy dịch vụ phù hợp.</Text>}<Pressable accessibilityRole="button" accessibilityState={{disabled:signingOut,busy:signingOut}} disabled={signingOut} onPress={()=>void signOut()} style={{minHeight:48,paddingVertical:12,borderTopWidth:1,borderColor:'#D0D5DD',justifyContent:'center'}}><Text style={{fontSize:16,fontWeight:'600',color:'#B42318'}}>{signingOut?'Đang đăng xuất…':'Đăng xuất'}</Text></Pressable>{error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}</ScrollView>;
}
