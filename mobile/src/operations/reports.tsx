import { ScrollView, Text } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { operationRoot, rows, type Row } from './model';
import { RecordView } from './record-view';
import { useResource } from './use-resource';
import { Button, Facts, Navigation, Panel, money, styles } from './ui';

export function Reports() {
  const { user } = useAuth();
  const root = operationRoot(user?.role ?? '');
  const summary = useResource<Row>('/manager/dashboard/summary');
  const invoices = useResource<Row>('/manager/invoices', true);
  const payments = useResource<Row>('/manager/payments', true);
  const refresh = () => { summary.refresh(); invoices.refresh(); payments.refresh(); };
  const loading = summary.loading || invoices.loading || payments.loading;
  const error = summary.error || invoices.error || payments.error;
  const total = (items: Row[], key: string) => items.reduce((sum, item) => sum + (typeof item[key] === 'number' ? Number(item[key]) : 0), 0);
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}><PageHeader eyebrow="Quản lý vận hành" title="Báo cáo vận hành" description="Tổng hợp dữ liệu thực tế; chưa có API báo cáo theo khoảng ngày." /><Navigation title="Về tổng quan" path={root} /><Button title="Làm mới báo cáo" onPress={refresh} disabled={loading} />{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> : <>
    {summary.data && <Panel title="Tổng quan"><RecordView row={summary.data} root={root} /></Panel>}
    <Panel title="Hóa đơn và khoản thu"><Facts values={[
      ['Số hóa đơn', invoices.data?.total], ['Tổng giá trị hóa đơn', money(total(rows(invoices.data?.items), 'totalAmount'))], ['Đã thanh toán trên hóa đơn', money(total(rows(invoices.data?.items), 'amountPaid'))], ['Còn phải thu', money(total(rows(invoices.data?.items), 'balanceDue'))], ['Khoản thu đã ghi nhận', money(total(rows(payments.data?.items), 'amount'))],
    ]} /><Text style={styles.copy}>Khoản thu gồm tiền thuê, tiền cọc và khoản phí theo hóa đơn; không được coi toàn bộ là doanh thu thuê kho.</Text></Panel>
  </>}</ScrollView>;
}
