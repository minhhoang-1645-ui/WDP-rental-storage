import { View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { destination } from '@/auth/routing';
import { EmptyState } from '@/components/screen-state';
import { Navigation, styles } from '@/operations/ui';

export default function NotFound() {
  const { user } = useAuth();
  return <View style={styles.page}><EmptyState title="Không tìm thấy trang" message="Đường dẫn này không còn tồn tại. Bạn có thể trở lại khu vực của mình." /><Navigation title={user ? 'Về tổng quan' : 'Đến đăng nhập'} path={user ? destination(user.role) : '/login'} /></View>;
}
