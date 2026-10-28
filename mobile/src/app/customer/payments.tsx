import { ScrollView } from 'react-native';
import { PageHeader } from '@/components/page-header';
import { PaymentCenter } from '@/components/payment-center';
import { styles } from '@/operations/ui';

export default function Screen() {
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}><PageHeader eyebrow="Thanh toán" title="Hóa đơn và thanh toán" description="Trạng thái thanh toán chỉ được cập nhật khi backend WDP xác nhận giao dịch." /><PaymentCenter /></ScrollView>;
}
