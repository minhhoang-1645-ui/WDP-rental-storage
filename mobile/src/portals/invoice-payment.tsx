import { useRef, useState } from 'react';
import { Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { OperationForm, type FormAction } from '@/operations/form';
import { operationMutate } from '@/operations/mutate';
import { idOf, rows, text, type Row } from '@/operations/model';
import { Button, Facts, Navigation, Panel, money, styles } from '@/operations/ui';
import { useResource } from '@/operations/use-resource';
import { customerSupportAction } from './actions';

export function InvoicePayment({ invoice, refresh, onNotice }: { invoice: Row; refresh: () => void; onNotice: (message: string) => void }) {
  const submissions = useResource<Row>('/customer/payment-submissions', true), bank = useResource<Row>('/customer/payment-config');
  const [form, setForm] = useState<FormAction>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), invoiceId = idOf(invoice), balance = Number(invoice.balanceDue);
  const pending = rows(submissions.data?.items).some(item => text(item, 'invoice.id') === invoiceId && item.status === 'PENDING_VERIFICATION');
  const payable = balance > 0 && ['OPEN', 'PARTIALLY_PAID'].includes(String(invoice.status));
  const online = async () => {
    if (lock.current || !payable || pending || submissions.loading || submissions.error) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await operationMutate(`/customer/invoices/${encodeURIComponent(invoiceId)}/online-payment`, 'POST', { locale: 'vn' }, true);
      const url = new URL(String(result.paymentUrl));
      if (url.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*vnpayment\.vn$/i.test(url.hostname) || url.username || url.password) throw new Error('Đường dẫn thanh toán không hợp lệ.');
      await WebBrowser.openBrowserAsync(url.href);
      onNotice('Đã mở VNPay. Quay lại và làm mới hồ sơ để kiểm tra kết quả từ hệ thống.'); refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không mở được thanh toán.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const transfer = (): FormAction => ({ title: 'Thông báo đã chuyển khoản', path: `/customer/invoices/${encodeURIComponent(invoiceId)}/payment-submissions`, method: 'POST', idempotent: true, description: 'Chỉ gửi sau khi đã chuyển tiền thực tế. Thông báo đang chờ WDP đối chiếu, chưa phải khoản thu đã xác nhận.', fields: [
    { name: 'amount', title: 'Số tiền đã chuyển (VND)', numeric: true, minimum: 1, maximum: balance, required: true, initial: String(balance) },
    { name: 'transferReference', title: 'Mã giao dịch ngân hàng (nếu có)', maxLength: 200 }, { name: 'customerNote', title: 'Ghi chú chuyển khoản', multiline: true, maxLength: 1000 }, { name: '_confirmed', title: 'Tôi đã chuyển khoản thực tế cho hóa đơn này', checkbox: true, required: true, clientOnly: true },
  ], transform: input => ({ ...input, method: 'BANK_TRANSFER', transferReference: input.transferReference ?? null, customerNote: input.customerNote ?? null }) });
  return <Panel title="Thanh toán và hỗ trợ">
    <Facts values={[["Còn phải thanh toán", money(invoice.balanceDue)]]} />
    <Navigation title="Xem thông báo chuyển khoản" path="/customer/payment-submissions" />
    {Boolean(error) && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {submissions.loading ? <LoadingState /> : submissions.error ? <ErrorState message={submissions.error} onRetry={submissions.refresh} /> : pending ? <Text style={styles.copy}>Đang có thông báo chuyển khoản chờ đối chiếu cho hóa đơn này.</Text> : payable && <>
      {bank.loading ? <LoadingState /> : bank.error ? <ErrorState message={bank.error} onRetry={bank.refresh} /> : bank.data?.configured ? <>
        <Facts values={[["Ngân hàng", bank.data.bankName], ["Chủ tài khoản", bank.data.accountName], ["Số tài khoản", bank.data.accountNumber], ["Nội dung chuyển khoản", invoice.invoiceCode]]} />
        {!form && <Button title="Tôi đã chuyển khoản" disabled={busy} onPress={() => { setError(''); setForm(transfer()); }} />}
      </> : <Text style={styles.copy}>Chưa có thông tin ngân hàng nhận tiền. Vui lòng gửi yêu cầu hỗ trợ để WDP hướng dẫn.</Text>}
      {!form && ['INITIAL', 'RECURRING', 'RENEWAL'].includes(String(invoice.type)) && <Button title={busy ? 'Đang mở VNPay…' : 'Thanh toán VNPay'} disabled={busy} onPress={() => void online()} />}
    </>}
    {form ? <OperationForm key={form.title} action={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); onNotice('Đã gửi yêu cầu. Xem thông báo chuyển khoản hoặc hỗ trợ để theo dõi trạng thái.'); refresh(); }} /> : Boolean(text(invoice, 'reservation.id')) && <Button title="Hỗ trợ về hóa đơn" variant="secondary" disabled={busy} onPress={() => setForm(customerSupportAction(text(invoice, 'reservation.id'), { invoiceId }))} />}
  </Panel>;
}
