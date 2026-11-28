import { Redirect } from 'expo-router';
import { Text, View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { Button, styles } from '@/operations/ui';
export default function UnsupportedRoleScreen(){
 const {user,logout}=useAuth();
 if(!user)return <Redirect href="/login"/>;
 if(user.role==='STORAGE_CUSTOMER')return <Redirect href="/customer"/>;
 return <View style={styles.page}><Text style={styles.title}>Tài khoản nội bộ dùng trên Web</Text><Text style={styles.copy}>Ứng dụng NestBox dành cho khách thuê kho. Vui lòng dùng trang Web để làm việc với tài khoản nhân sự.</Text><Button title="Đăng xuất" onPress={()=>void logout()}/></View>;
}
