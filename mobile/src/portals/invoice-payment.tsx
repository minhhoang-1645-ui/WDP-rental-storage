import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { OperationForm, type FormAction } from '@/operations/form';
import { idOf, rows, text, type Row } from '@/operations/model';
import { Button, Facts, Field, Navigation, Panel, money, styles } from '@/operations/ui';
import { buildVietQrPayload } from '@/utils/vietqr';
import { useResource } from '@/operations/use-resource';
import { supportPath } from '@/components/customer-support';
import { useDraftGuard } from '@/services/live-events';
import { isScheduledRenewalInvoice, invoicePaymentBlockedBySchedule, paymentWindowClosed } from '@/utils/payment-state';
import { OnlinePayment } from './online-payment';

export function InvoicePayment({ invoice, refresh, onNotice, onlineOnly: onlineOnlyProp = true, compactSummary = false }: { invoice: Row; refresh: () => void; onNotice: (message: string) => void; onlineOnly?: boolean; compactSummary?: boolean }) {
  const submissions = useResource<Row>('/customer/payment-submissions', true), bank = useResource<Row>('/customer/payment-config');
  const onlineOnly = onlineOnlyProp || bank.data?.cutover === true;
  const gateway = bank.data?.payosConfigured === true ? 'payOS' : 'VNPay';
  const configured = bank.data?.payosConfigured === true || bank.data?.vnpayConfigured === true;
  const [form, setForm] = useState<FormAction>(), [onlinePending, setOnlinePending] = useState(false), [now, setNow] = useState(Date.now);
  const [showTransfer, setShowTransfer] = useState(false);
  const invoiceId = idOf(invoice), balance = Number(invoice.balanceDue);
  const busy = onlinePending;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const [qrAmount, setQrAmount] = useState(String(balance));
  let qrPayload = '';
  try {
    if (Number(qrAmount) <= balance) qrPayload = buildVietQrPayload({ configured: bank.data?.configured === true, bankCode: text(bank.data ?? {}, 'bankCode'), accountNumber: text(bank.data ?? {}, 'accountNumber') }, Number(qrAmount), String(invoice.invoiceCode));
  } catch { /* Invalid configuration or amount is shown below without rendering an unusable QR. */ }
  const pending = rows(submissions.data?.items).some(item => text(item, 'invoice.id') === invoiceId && (item.status === 'PENDING_VERIFICATION' || Boolean(text(item,'reconciliation.status') && text(item,'reconciliation.status') !== 'RECONCILED')));
  const holdExpired = paymentWindowClosed(invoice, now);
  const signing = invoice.signing as Row | undefined;
  const unsigned = signing?.complete === false;
  const scheduled = invoicePaymentBlockedBySchedule(invoice, now);
  const payable = !scheduled && !unsigned && !holdExpired && balance > 0 && ['OPEN', 'PARTIALLY_PAID'].includes(String(invoice.status));
  useDraftGuard(busy || (payable && qrAmount !== String(balance)));
  const transfer = (): FormAction => ({ title: 'Thông báo đã chuyển khoản', path: `/customer/invoices/${encodeURIComponent(invoiceId)}/payment-submissions`, method: 'POST', idempotent: true, description: 'Chỉ gửi sau khi đã chuyển tiền. NestBox sẽ kiểm tra và xác nhận khoản thanh toán.', fields: [
    { name: 'amount', title: 'Số tiền đã chuyển (VND)', numeric: true, minimum: 1, maximum: balance, required: true, initial: qrAmount },
    { name: 'transferReference', title: 'Mã giao dịch ngân hàng (nếu có)', maxLength: 200 }, { name: 'customerNote', title: 'Ghi chú chuyển khoản', multiline: true, maxLength: 1000 }, { name: '_confirmed', title: 'Tôi đã chuyển khoản thực tế cho hóa đơn này', checkbox: true, required: true, clientOnly: true },
  ], transform: input => ({ ...input, method: 'BANK_TRANSFER', transferReference: input.transferReference ?? null, customerNote: input.customerNote ?? null }) });
  return <Panel title="Thanh toán">
    {onlineOnly && <Facts values={[["Còn phải thanh toán", money(invoice.balanceDue)]]}/>}
    {!compactSummary && Boolean(text(invoice, 'dueAt')) && <Text style={styles.copy}>Hạn thanh toán: {new Date(text(invoice, 'dueAt')).toLocaleString('vi-VN', {timeZone: 'Asia/Bangkok'})}</Text>}
    {unsigned && <><Text accessibilityRole="alert" style={styles.copy}>Ký hợp đồng trước để thanh toán.</Text>{rows(signing?.contracts).map(contract => <Navigation key={idOf(contract)} title={`Ký hợp đồng ${text(contract, 'code')}`} path={`/customer/contracts/${encodeURIComponent(idOf(contract))}`} />)}{text(signing ?? {}, 'renewalId') ? <Navigation title="Xem và ký phụ lục gia hạn" path={`/customer/renewals/${encodeURIComponent(text(signing ?? {}, 'renewalId'))}`} /> : <Navigation title="Kiểm tra toàn bộ hợp đồng của đơn" path={`/customer/contracts?reservationId=${encodeURIComponent(text(invoice, 'reservation.id'))}`} />}</>}
    {Boolean(text(invoice, 'reservation.expiresAt')) && <Text style={styles.copy}>Hạn giữ kho: {new Date(text(invoice, 'reservation.expiresAt')).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' })} (UTC+7).</Text>}
    {holdExpired && <Text accessibilityRole="alert" style={styles.error}>Đã hết hạn giữ kho. Kiểm tra trạng thái yêu cầu; nếu đã chuyển tiền, gửi hỗ trợ để NestBox đối chiếu.</Text>}
    {scheduled && <Text style={styles.copy}>Hóa đơn gia hạn chưa đến kỳ thanh toán.</Text>}
    {invoice.closeoutPaymentAllowed === true && balance > 0 && isScheduledRenewalInvoice(invoice, now) && <Text style={styles.copy}>Kho đã được duyệt trả trước hạn. Bạn có thể thanh toán sớm kỳ này để tất toán toàn bộ công nợ trước khi trả kho.</Text>}
    <OnlinePayment paid={invoice.status === 'PAID'} invoiceType={String(invoice.type)} invoiceId={invoiceId} actionTitle={'Thanh toán trực tuyến qua ' + gateway} eligible={configured && payable && ['INITIAL', 'RECURRING', 'RENEWAL'].includes(String(invoice.type))} disabled={pending || submissions.loading || Boolean(submissions.error) || Boolean(form)} refresh={refresh} onWaitingChange={setOnlinePending} />
    {payable && !bank.loading && !bank.error && !configured && <Text accessibilityRole="alert" style={styles.copy}>Thanh toán trực tuyến hiện chưa khả dụng. Vui lòng thử lại hoặc gửi hỗ trợ về hóa đơn.</Text>}
    {payable && !onlineOnly && bank.data?.vnpayConfigured === true && !pending && !onlinePending && <Button title={showTransfer ? 'Ẩn hướng dẫn chuyển khoản' : 'Chuyển khoản ngân hàng'} variant="secondary" disabled={Boolean(form)} onPress={() => setShowTransfer(value => !value)}/>}
    {submissions.loading ? <LoadingState layout="compact" /> : submissions.error ? <ErrorState message={submissions.error} onRetry={submissions.refresh} /> : pending ? <Text style={styles.copy}>Khoản chuyển khoản đang được kiểm tra hoặc đối soát. Không chuyển thêm tiền cho cùng khoản này.</Text> : onlinePending ? <Text style={styles.copy}>Đang theo dõi phiên thanh toán. Vui lòng không chuyển khoản thêm cho cùng hóa đơn.</Text> : payable && !onlineOnly && (showTransfer || bank.data?.vnpayConfigured !== true) && <>
      {bank.loading ? <LoadingState layout="compact" /> : bank.error ? <ErrorState message={bank.error} onRetry={bank.refresh} /> : bank.data?.configured ? <>
        <Facts values={[["Ngân hàng", bank.data.bankName], ["Chủ tài khoản", bank.data.accountName], ["Số tài khoản", bank.data.accountNumber], ["Nội dung chuyển khoản", invoice.invoiceCode]]} />
        <Field title="Số tiền chuyển khoản (đ)" numeric value={qrAmount} onChange={setQrAmount} maxLength={13} disabled={busy || Boolean(form)} />
        {qrPayload ? <View accessible accessibilityLabel={`QR chuyển khoản hóa đơn ${invoice.invoiceCode}, số tiền ${qrAmount} đồng`} style={{ alignItems: 'center', padding: 12, backgroundColor: 'white', borderRadius: 12 }}><QRCode value={qrPayload} size={208} quietZone={12} ecl="M" /><Text style={styles.copy}>{money(Number(qrAmount))}</Text></View> : <Text accessibilityRole="alert" style={styles.error}>Nhập số tiền lớn hơn 0, không vượt khoản còn phải trả. Nếu vẫn chưa có mã QR, hãy gửi hỗ trợ.</Text>}
        <Text style={styles.copy}>Kiểm tra người nhận, số tiền và nội dung trong ứng dụng ngân hàng. Quét QR chưa đồng nghĩa đã thanh toán.</Text>
        {!form && <Button title="Tôi đã chuyển khoản" disabled={busy || !qrPayload} onPress={() => setForm(transfer())} />}
      </> : <Text style={styles.copy}>{bank.data?.vnpayConfigured === true ? 'Chuyển khoản chưa khả dụng. Bạn có thể thanh toán qua VNPay hoặc gửi hỗ trợ.' : 'Thanh toán trực tuyến hiện chưa khả dụng. Bạn có thể thanh toán tại cơ sở hoặc gửi hỗ trợ về hóa đơn để được hướng dẫn. Chỉ khi NestBox xác nhận thu tiền, hóa đơn mới được cập nhật.'}</Text>}
    </>}
    {payable && bank.data?.cutover === true && <Text style={styles.copy}>Thanh toán tiền mặt tại cơ sở.</Text>}
    {form && !onlineOnly ? <OperationForm key={form.title} action={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); onNotice('Đã gửi. NestBox sẽ kiểm tra và cập nhật kết quả.'); refresh(); }} /> : invoiceId ? <Navigation compact title="Hỗ trợ về hóa đơn" path={supportPath + '/new?invoiceId=' + encodeURIComponent(invoiceId)} /> : null}
  </Panel>;
}
