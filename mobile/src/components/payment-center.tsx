import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';

import { StatusBadge } from '@/components/customer-ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { Button, Navigation, Panel, styles } from '@/operations/ui';
import { useResource } from '@/operations/use-resource';
import { apiRequest } from '@/services/api';
import { type PendingOnlinePayment, readPendingOnlinePayment, removePendingOnlinePayment, savePendingOnlinePayment } from '@/services/online-payment-session';
import { useAuth } from '@/auth/use-auth';
import { formatDate, formatMoney } from '@/utils/format';

type PaymentMode = 'VNPAY' | 'VNPAYQR';

function allowedUrl(value: unknown) {
  try { const url = new URL(String(value)); return url.protocol === 'https:' && /^(?:[a-z0-9-]+\.)*vnpayment\.vn$/i.test(url.hostname) && !url.username && !url.password ? url : null; } catch { return null; }
}

export function PaymentCenter() {
  const { user } = useAuth();
  const invoices = useResource<Row>('/customer/invoices', true);
  const payments = useResource<Row>('/customer/payments', true);
  const submissions = useResource<Row>('/customer/payment-submissions', true);
  const [pending, setPending] = useState<PendingOnlinePayment | null>(null);
  const [outcome, setOutcome] = useState<'SUCCESS' | 'FAILED' | null>(null);
  const [pollIssue, setPollIssue] = useState('');
  const [openingInvoice, setOpeningInvoice] = useState('');
  const lock = useRef(false);
  const refresh = () => { invoices.refresh(); payments.refresh(); submissions.refresh(); };
  useEffect(() => { if (user?.id) void readPendingOnlinePayment(user.id).then(setPending); }, [user?.id]);
  useEffect(() => {
    if (!pending) return;
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
    const poll = async () => {
      controller = new AbortController();
      try {
        const result = await apiRequest<Row>(`/customer/online-payments/${encodeURIComponent(pending.transactionId)}`, { signal: controller.signal });
        if (stopped) return;
        setPollIssue('');
        if (result.status === 'SUCCESS' && text(object(result.invoice), 'status') === 'PAID') { await removePendingOnlinePayment(pending.customerId); if (!stopped) { setPending(null); setOutcome('SUCCESS'); refresh(); } return; }
        if (result.status === 'FAILED') { await removePendingOnlinePayment(pending.customerId); if (!stopped) { setPending(null); setOutcome('FAILED'); } return; }
      } catch (caught) { if (!stopped && !controller.signal.aborted) setPollIssue(caught instanceof Error ? caught.message : 'Tạm thời chưa kiểm tra được trạng thái VNPay.'); }
      if (!stopped) timer = setTimeout(poll, 2500);
    };
    void poll();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void poll(); });
    return () => { stopped = true; controller?.abort(); if (timer) clearTimeout(timer); subscription.remove(); };
  }, [pending]);
  const createOnline = async (invoice: Row, mode: PaymentMode) => {
    if (!user || lock.current || pending) return;
    lock.current = true; setOpeningInvoice(idOf(invoice)); setPollIssue('');
    try {
      const key = `mob-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const created = await apiRequest<Row>(`/customer/invoices/${encodeURIComponent(idOf(invoice))}/online-payment`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ locale: 'vn', ...(mode === 'VNPAYQR' ? { bankCode: 'VNPAYQR' } : {}) }) });
      const url = allowedUrl(created.paymentUrl); if (!url) throw new Error('Đường dẫn thanh toán VNPay không hợp lệ.');
      const payment: PendingOnlinePayment = { customerId: user.id, invoiceId: idOf(invoice), invoiceCode: text(invoice, 'invoiceCode'), transactionId: text(created, 'transactionId'), merchantOrderRef: text(created, 'merchantOrderRef'), amount: Number(created.amount), expiresAt: text(created, 'expiresAt'), mode, createdAt: new Date().toISOString() };
      await savePendingOnlinePayment(payment); setPending(payment); await WebBrowser.openBrowserAsync(url.href);
    } catch (caught) { setPollIssue(caught instanceof Error ? caught.message : 'Không thể mở thanh toán VNPay.'); }
    finally { lock.current = false; setOpeningInvoice(''); }
  };
  const outstanding = rows(invoices.data?.items).filter(invoice => ['OPEN', 'PARTIALLY_PAID'].includes(String(invoice.status)) && Number(invoice.balanceDue) > 0);
  return <View style={{ gap: WdpSpacing.lg }}>
    {pending && <PendingPayment payment={pending} issue={pollIssue} />}
    {outcome && <Panel title={outcome === 'SUCCESS' ? 'Thanh toán đã xác nhận' : 'Thanh toán chưa thành công'}><Text style={outcome === 'SUCCESS' ? styles.success : styles.error}>{outcome === 'SUCCESS' ? 'WDP đã xác nhận giao dịch và hóa đơn đã PAID.' : 'VNPay chưa xác nhận giao dịch. Bạn có thể tạo một phiên thanh toán mới nếu hóa đơn vẫn còn mở.'}</Text><Button title="Đóng thông báo" variant="secondary" onPress={() => setOutcome(null)} /></Panel>}
    <Panel title="Hóa đơn cần xử lý">{invoices.loading && !invoices.data ? <LoadingState /> : invoices.error ? <ErrorState message={invoices.error} onRetry={invoices.refresh} /> : outstanding.length ? <View style={{ gap: WdpSpacing.sm }}>{outstanding.map(invoice => <InvoiceCard key={idOf(invoice)} invoice={invoice} busy={Boolean(openingInvoice) || Boolean(pending)} onOnline={createOnline} />)}</View> : <EmptyState title="Không có hóa đơn cần thanh toán" message="Các khoản WDP đã xác nhận sẽ xuất hiện ở lịch sử thanh toán." />}</Panel>
    <Navigation title="Lịch sử thanh toán" description={`${rows(payments.data?.items).length} giao dịch đã ghi nhận.`} path="/customer/payment-history" />
    <Navigation title="Thông báo chuyển khoản" description={`${rows(submissions.data?.items).filter(item => item.status === 'PENDING_VERIFICATION').length} yêu cầu đang chờ WDP đối chiếu.`} path="/customer/payment-submissions" />
    <Button title="Làm mới thông tin thanh toán" variant="secondary" onPress={refresh} disabled={invoices.loading || payments.loading || submissions.loading} />
  </View>;
}

function InvoiceCard({ invoice, busy, onOnline }: { invoice: Row; busy: boolean; onOnline: (invoice: Row, mode: PaymentMode) => void }) {
  const online = ['INITIAL', 'RECURRING', 'RENEWAL'].includes(String(invoice.type));
  return <View style={local.invoice}><View style={local.invoiceHeading}><View style={{ flex: 1, gap: WdpSpacing.xxs }}><Text selectable style={local.code}>{text(invoice, 'invoiceCode')}</Text><Text style={local.amount}>{formatMoney(Number(invoice.balanceDue))}</Text></View><StatusBadge status={String(invoice.status)} /></View><Text style={local.detail}>Hạn thanh toán: {formatDate(text(invoice, 'dueAt'))}</Text>{online && <View style={local.actions}><Button title="Thanh toán VNPay" onPress={() => onOnline(invoice, 'VNPAY')} disabled={busy} /><Button title="VNPay QR" variant="secondary" onPress={() => onOnline(invoice, 'VNPAYQR')} disabled={busy} /></View>}<Pressable accessibilityRole="button" onPress={() => router.push(`/customer/invoices/${encodeURIComponent(idOf(invoice))}`)}><Text style={local.link}>Xem chi tiết hoặc chuyển khoản VietQR ›</Text></Pressable></View>;
}

function PendingPayment({ payment, issue }: { payment: PendingOnlinePayment; issue: string }) {
  const seconds = Math.max(0, Math.ceil((Date.parse(payment.expiresAt) - Date.now()) / 1000));
  return <View accessibilityRole="status" style={local.pending}><Text style={local.pendingTitle}>Đang chờ VNPay xác nhận</Text><Text selectable style={local.pendingCopy}>{payment.invoiceCode} · {formatMoney(payment.amount)} · {payment.mode === 'VNPAYQR' ? 'VNPay QR' : 'VNPay'}</Text><Text style={local.pendingCopy}>Phiên thanh toán hết hạn sau {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}. Ứng dụng tự kiểm tra trạng thái từ backend.</Text>{issue ? <Text accessibilityRole="alert" style={styles.error}>{issue} Ứng dụng sẽ thử lại.</Text> : null}</View>;
}

const local = StyleSheet.create({
  pending: { gap: WdpSpacing.xs, backgroundColor: WdpColors.tealSubtle, borderColor: WdpColors.teal, borderCurve: 'continuous', borderRadius: WdpRadius.md, borderWidth: 1, padding: WdpSpacing.md }, pendingTitle: { color: WdpColors.teal, fontSize: 16, fontWeight: '700' }, pendingCopy: { color: WdpColors.text, fontSize: 13, lineHeight: 20 },
  invoice: { gap: WdpSpacing.sm, borderColor: WdpColors.border, borderCurve: 'continuous', borderRadius: WdpRadius.md, borderWidth: 1, padding: WdpSpacing.md }, invoiceHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: WdpSpacing.sm, justifyContent: 'space-between' }, code: { color: WdpColors.muted, fontSize: 12, fontWeight: '600' }, amount: { color: WdpColors.navy, fontSize: 20, fontWeight: '700' }, detail: { color: WdpColors.muted, fontSize: 13 }, actions: { gap: WdpSpacing.xs }, link: { color: WdpColors.teal, fontSize: 14, fontWeight: '600' },
});
