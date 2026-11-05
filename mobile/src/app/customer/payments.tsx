import { ScrollView } from 'react-native';
import { PageHeader } from '@/components/page-header';
import { PaymentCenter } from '@/components/payment-center';
import { styles } from '@/operations/ui';

export default function Screen() {
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}><PageHeader eyebrow="Thanh toán" title="Hóa đơn và thanh toán" description="Xem số tiền còn phải trả và theo dõi kết quả NestBox xác nhận thanh toán." /><PaymentCenter /></ScrollView>;
}
