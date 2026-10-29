import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { idOf, rows, text, type Row } from '@/operations/model';
import { Button, Navigation, Panel, styles } from '@/operations/ui';
import { useResource } from '@/operations/use-resource';
import { formatMoney } from '@/utils/format';
import { readPendingOnlinePayment, type PendingOnlinePayment } from '@/services/online-payment-session';

/** All payment mutations and polling live in InvoicePayment/OnlinePayment. */
export function PaymentCenter() {
  const { user } = useAuth();
  const invoices = useResource<Row>('/customer/invoices', true);
  const [legacy, setLegacy] = useState<PendingOnlinePayment | null>(null);
  useEffect(() => {
    let stopped = false;
    if (user) void readPendingOnlinePayment(user.id).then(value => { if (!stopped) setLegacy(value); }).catch(() => {});
    return () => { stopped = true; };
  }, [user]);
  const outstanding = rows(invoices.data?.items).filter(invoice => ['OPEN', 'PARTIALLY_PAID'].includes(String(invoice.status)) && Number(invoice.balanceDue) > 0);
  return <View style={{ gap: 16 }}>
    {legacy && <Navigation title="Tiếp tục theo dõi phiên VNPay" path={`/customer/invoices/${encodeURIComponent(legacy.invoiceId)}`} description={`${legacy.invoiceCode} · Mở hóa đơn để kiểm tra kết quả, tránh thanh toán lặp.`} />}
    <Panel title="Hóa đơn cần xử lý">
      <Text style={styles.copy}>Mở từng hóa đơn để ký tài liệu còn thiếu, xem số tiền và chọn VNPay hoặc chuyển khoản.</Text>
      {invoices.loading && !invoices.data ? <LoadingState /> : invoices.error ? <ErrorState message={invoices.error} onRetry={invoices.refresh} /> : outstanding.length ? outstanding.map(invoice => <Navigation key={idOf(invoice)} title={`${text(invoice, 'invoiceCode')} · ${formatMoney(Number(invoice.balanceDue))}`} description={`Đơn ${text(invoice, 'reservation.reference')} · Xem điều kiện và thanh toán`} path={`/customer/invoices/${encodeURIComponent(idOf(invoice))}`} />) : <EmptyState title="Không có hóa đơn cần thanh toán" message="Khoản tiền được xác nhận sẽ xuất hiện trong lịch sử thanh toán." />}
    </Panel>
    <Navigation title="Lịch sử thanh toán" path="/customer/payment-history" />
    <Navigation title="Thông báo chuyển khoản" path="/customer/payment-submissions" />
    <Button title="Làm mới thông tin thanh toán" variant="secondary" onPress={invoices.refresh} disabled={invoices.loading} />
  </View>;
}
