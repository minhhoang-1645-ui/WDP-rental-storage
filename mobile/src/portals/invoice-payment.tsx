import { DocumentFile } from '@/components/document-file';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { OperationForm, type FormAction } from '@/operations/form';
import { idOf, rows, text, type Row } from '@/operations/model';
import { Button, Facts, Field, Navigation, Panel, money, styles } from '@/operations/ui';
import { buildVietQrPayload } from '@/utils/vietqr';
import { useResource } from '@/operations/use-resource';
import { customerSupportAction } from './actions';
import { useDraftGuard } from '@/services/live-events';
import { paymentWindowClosed } from '@/utils/payment-state';
import { OnlinePayment } from './online-payment';

export function InvoicePayment({ invoice, refresh, onNotice }: { invoice: Row; refresh: () => void; onNotice: (message: string) => void }) {
  const submissions = useResource<Row>('/customer/payment-submissions', true), bank = useResource<Row>('/customer/payment-config');
  const [form, setForm] = useState<FormAction>(), [onlinePending, setOnlinePending] = useState(false), [now, setNow] = useState(Date.now);
  const invoiceId = idOf(invoice), balance = Number(invoice.balanceDue);
  const busy = onlinePending;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const [qrAmount, setQrAmount] = useState(String(balance));
  let qrPayload = '';
  try {
    if (Number(qrAmount) <= balance) qrPayload = buildVietQrPayload({ configured: bank.data?.configured === true, bankCode: text(bank.data ?? {}, 'bankCode'), accountNumber: text(bank.data ?? {}, 'accountNumber') }, Number(qrAmount), String(invoice.invoiceCode));
  } catch { /* Invalid configuration or amount is shown below without rendering an unusable QR. */ }
  const pending = rows(submissions.data?.items).some(item => text(item, 'invoice.id') === invoiceId && item.status === 'PENDING_VERIFICATION');
  const holdExpired = paymentWindowClosed(invoice, now);
  const signing = invoice.signing as Row | undefined;
  const unsigned = signing?.complete === false;
  const payable = !unsigned && !holdExpired && balance > 0 && ['OPEN', 'PARTIALLY_PAID'].includes(String(invoice.status));
  useDraftGuard(busy || (payable && qrAmount !== String(balance)));
  const transfer = (): FormAction => ({ title: 'Thông báo đã chuyển khoản', path: `/customer/invoices/${encodeURIComponent(invoiceId)}/payment-submissions`, method: 'POST', idempotent: true, description: 'Chỉ gửi sau khi đã chuyển tiền thực tế. Thông báo đang chờ NestBox đối chiếu, chưa phải khoản thu đã xác nhận.', fields: [
    { name: 'amount', title: 'Số tiền đã chuyển (VND)', numeric: true, minimum: 1, maximum: balance, required: true, initial: qrAmount },
    { name: 'transferReference', title: 'Mã giao dịch ngân hàng (nếu có)', maxLength: 200 }, { name: 'customerNote', title: 'Ghi chú chuyển khoản', multiline: true, maxLength: 1000 }, { name: '_confirmed', title: 'Tôi đã chuyển khoản thực tế cho hóa đơn này', checkbox: true, required: true, clientOnly: true },
  ], transform: input => ({ ...input, method: 'BANK_TRANSFER', transferReference: input.transferReference ?? null, customerNote: input.customerNote ?? null }) });
  return <Panel title="Thanh toán và hỗ trợ"><DocumentFile path={`/customer/documents/invoices/${encodeURIComponent(invoiceId)}`} name={text(invoice, 'invoiceCode')} />
    <Facts values={[["Còn phải thanh toán", money(invoice.balanceDue)]]} />
    {unsigned && <><Text accessibilityRole="alert" style={styles.copy}>Bạn cần ký tài liệu trước khi thanh toán.</Text>{rows(signing?.contracts).map(contract => <Navigation key={idOf(contract)} title={`Ký hợp đồng ${text(contract, 'code')}`} path={`/customer/contracts/${encodeURIComponent(idOf(contract))}`} />)}{text(signing ?? {}, 'renewalId') ? <Navigation title="Xem và ký phụ lục gia hạn" path={`/customer/renewals/${encodeURIComponent(text(signing ?? {}, 'renewalId'))}`} /> : <Navigation title="Kiểm tra toàn bộ hợp đồng của đơn" path="/customer/contracts" />}</>}
    <Navigation title="Xem thông báo chuyển khoản" path="/customer/payment-submissions" />
    {Boolean(text(invoice, 'reservation.expiresAt')) && <Text style={styles.copy}>Hạn giữ kho: {new Date(text(invoice, 'reservation.expiresAt')).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' })} (UTC+7).</Text>}
    {holdExpired && <Text accessibilityRole="alert" style={styles.error}>Đã hết hạn giữ kho. Kiểm tra trạng thái yêu cầu; nếu đã chuyển tiền, gửi hỗ trợ để NestBox đối chiếu.</Text>}
    <OnlinePayment paid={invoice.status === 'PAID'} invoiceType={String(invoice.type)} invoiceId={invoiceId} eligible={bank.data?.vnpayConfigured === true && payable && ['INITIAL', 'RECURRING', 'RENEWAL'].includes(String(invoice.type))} disabled={pending || submissions.loading || Boolean(submissions.error) || Boolean(form)} refresh={refresh} onWaitingChange={setOnlinePending} />
    {payable && !bank.loading && !bank.error && bank.data?.vnpayConfigured !== true && <Text accessibilityRole="alert" style={styles.copy}>VNPay hiện chưa được cấu hình trên hệ thống. Bạn có thể chuyển khoản theo thông tin bên dưới hoặc liên hệ NestBox.</Text>}
    {submissions.loading ? <LoadingState /> : submissions.error ? <ErrorState message={submissions.error} onRetry={submissions.refresh} /> : pending ? <Text style={styles.copy}>Đang có thông báo chuyển khoản chờ đối chiếu cho hóa đơn này.</Text> : onlinePending ? <Text style={styles.copy}>Đang theo dõi phiên VNPay. Vui lòng không chuyển khoản thêm cho cùng hóa đơn.</Text> : payable && <>
      {bank.loading ? <LoadingState /> : bank.error ? <ErrorState message={bank.error} onRetry={bank.refresh} /> : bank.data?.configured ? <>
        <Facts values={[["Ngân hàng", bank.data.bankName], ["Chủ tài khoản", bank.data.accountName], ["Số tài khoản", bank.data.accountNumber], ["Nội dung chuyển khoản", invoice.invoiceCode]]} />
        <Field title="Số tiền tạo QR (VND, tối đa bằng số dư)" numeric value={qrAmount} onChange={setQrAmount} maxLength={13} disabled={busy || Boolean(form)} />
        {qrPayload ? <View accessible accessibilityLabel={`QR chuyển khoản hóa đơn ${invoice.invoiceCode}, số tiền ${qrAmount} đồng`} style={{ alignItems: 'center', padding: 12, backgroundColor: 'white', borderRadius: 12 }}><QRCode value={qrPayload} size={208} quietZone={12} ecl="M" /><Text style={styles.copy}>{money(Number(qrAmount))}</Text></View> : <Text accessibilityRole="alert" style={styles.error}>Chưa thể tạo QR. Kiểm tra số tiền nguyên dương không vượt số dư và thông tin ngân hàng.</Text>}
        <Text style={styles.copy}>Kiểm tra người nhận, số tiền và nội dung trong ứng dụng ngân hàng. Quét QR chưa đồng nghĩa đã thanh toán.</Text>
        {!form && <Button title="Tôi đã chuyển khoản" disabled={busy || !qrPayload} onPress={() => setForm(transfer())} />}
      </> : <Text style={styles.copy}>{bank.data?.vnpayConfigured === true ? 'Chuyển khoản chưa khả dụng. Bạn có thể thanh toán qua VNPay hoặc gửi hỗ trợ.' : 'Thanh toán trực tuyến hiện chưa khả dụng. Bạn có thể thanh toán tại cơ sở hoặc gửi hỗ trợ về hóa đơn để được hướng dẫn. Chỉ khi NestBox xác nhận thu tiền, hóa đơn mới được cập nhật.'}</Text>}
    </>}
    {form ? <OperationForm key={form.title} action={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); onNotice('Đã gửi yêu cầu. Xem thông báo chuyển khoản hoặc hỗ trợ để theo dõi trạng thái.'); refresh(); }} /> : Boolean(text(invoice, 'reservation.id')) && <Button title="Hỗ trợ về hóa đơn" variant="secondary" onPress={() => setForm(customerSupportAction(text(invoice, 'reservation.id'), { invoiceId }))} />}
  </Panel>;
}
