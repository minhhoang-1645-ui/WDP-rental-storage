import { useEffect, useRef, useState } from 'react';
import { AppState, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '@/auth/use-auth';
import { apiRequest } from '@/services/api';
import { paymentStorage } from '@/services/payment-storage';
import { notifyDataChanged } from '@/services/live-events';
import { paymentTimeLeft } from '@/utils/payment-state';
import { Button, Navigation, styles } from '@/operations/ui';
import { readPendingOnlinePayment, removePendingOnlinePayment } from '@/services/online-payment-session';
import { vnpayDestination } from '@/utils/vnpay-destination';

type Session = { transactionId: string; expiresAt: string; paymentUrl: string };
type Result = { transactionId: string; status: 'PENDING' | 'SUCCESS' | 'FAILED'; providerStatus: string; expiresAt: string; invoice: { type: string; status: string }; reconciliation?: { reconciliationCode: string; status: 'PENDING_REVIEW' | 'REFUND_REQUIRED' | 'RECONCILED'; resolutionNote?: string | null } | null };
function destination(value: string) {
  return vnpayDestination(value).href;
}

export function OnlinePayment({ invoiceId, eligible, disabled, paid, invoiceType, refresh, onWaitingChange }: { invoiceId: string; eligible: boolean; disabled: boolean; paid: boolean; invoiceType: string; refresh: () => void; onWaitingChange: (waiting: boolean) => void }) {
  const { user } = useAuth();
  const [session, setSession] = useState<Session>(), [result, setResult] = useState<Result>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [restored, setRestored] = useState(false), [now, setNow] = useState(Date.now);
  const lock = useRef(false), refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  const key = `wdp-payment-${Array.from(`${user?.id}:${invoiceId}`).map(char => char.codePointAt(0)!.toString(16)).join('-')}`;
  useEffect(() => {
    let stopped = false;
    void paymentStorage.get(key).then(async value => {
      if (stopped) return;
      if (!value && user?.id) {
        const legacy = await readPendingOnlinePayment(user.id);
        if (!stopped && legacy?.invoiceId === invoiceId) setSession({ transactionId: legacy.transactionId, expiresAt: legacy.expiresAt, paymentUrl: '' });
        return;
      }
      if (!value) return;
      try {
        const saved = JSON.parse(value) as Session;
        if (typeof saved.transactionId === 'string' && typeof saved.expiresAt === 'string' && typeof saved.paymentUrl === 'string') { destination(saved.paymentUrl); setSession(saved); }
      } catch { /* Discard malformed local session, never infer payment success from it. */ }
    }).catch(() => { if (!stopped) setError('Không đọc được phiên thanh toán đã lưu.'); }).finally(() => { if (!stopped) setRestored(true); });
    return () => { stopped = true; };
  }, [key, user?.id, invoiceId]);
  useEffect(() => {
    // A paid invoice may have another VNPay receipt awaiting reconciliation.
    // Keep its session and poll the server until that receipt is resolved too.
    if (!session) return;
    let stopped = false, inFlight = false, terminal = false;
    let consecutiveErrors = 0;
    const controller = new AbortController();
    const getDelay = () => Math.min(2500 * Math.pow(2, consecutiveErrors), 20000);
    const poll = async () => {
      if (stopped || inFlight || terminal || (AppState.currentState && AppState.currentState !== 'active')) return;
      inFlight = true;
      try {
        const status = await apiRequest<Result>(`/customer/online-payments/${encodeURIComponent(session.transactionId)}`, { signal: controller.signal });
        if (stopped) return;
        setResult(status); setError('');
        consecutiveErrors = 0;
        const unresolved = Boolean(status.reconciliation && status.reconciliation.status !== 'RECONCILED');
        terminal = !unresolved && (status.status === 'FAILED' || (status.status === 'SUCCESS' && status.invoice.status === 'PAID'));
        if (terminal) {
          void paymentStorage.remove(key).catch(() => {});
          if (user?.id) void readPendingOnlinePayment(user.id).then(legacy => { if (legacy?.transactionId === session.transactionId) return removePendingOnlinePayment(user.id); }).catch(() => {});
          refreshRef.current(); notifyDataChanged('/customer/payments');
        }
      } catch (caught) {
        if (!stopped) {
          consecutiveErrors = Math.min(consecutiveErrors + 1, 4);
          setError(caught instanceof Error ? caught.message : 'Chưa kiểm tra được kết quả. Hệ thống sẽ thử lại.');
        }
      }
      finally { inFlight = false; }
      if (!stopped && !terminal) scheduleNext();
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleNext = () => { clearTimeout(timer); timer = setTimeout(() => { setNow(Date.now()); void poll(); }, getDelay()); };
    void poll();
    const listener = AppState.addEventListener('change', state => { clearTimeout(timer); if (state === 'active') { consecutiveErrors = 0; void poll(); } });
    return () => { stopped = true; controller.abort(); clearTimeout(timer); listener.remove(); };
  }, [session, key, paid, user?.id]);
  const waiting = !paid && Boolean(session) && (!result || result.status === 'PENDING');
  const reconciliation = Boolean(result?.reconciliation);
  const unresolved = Boolean(result?.reconciliation && result.reconciliation.status !== 'RECONCILED');
  useEffect(() => { onWaitingChange(waiting || unresolved); return () => onWaitingChange(false); }, [waiting, unresolved, onWaitingChange]);
  const open = async (qr = false) => {
    if (lock.current || reconciliation || !restored || (!waiting && (!eligible || disabled))) return;
    lock.current = true; setBusy(true); setError('');
    try {
      let payment = session;
      if (!waiting) {
        payment = await apiRequest<Session>(`/customer/invoices/${encodeURIComponent(invoiceId)}/online-payment`, { method: 'POST', headers: { 'Idempotency-Key': `mobile-vnpay-${Date.now()}-${Math.random().toString(36).slice(2)}` }, body: JSON.stringify({ locale: 'vn', ...(qr ? { bankCode: 'VNPAYQR' } : {}) }) });
        destination(payment.paymentUrl);
        setSession(payment); setResult(undefined);
        await paymentStorage.set(key, JSON.stringify(payment));
      }
      if (payment?.paymentUrl) await WebBrowser.openBrowserAsync(destination(payment.paymentUrl));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không mở được VNPay.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const success = !reconciliation && (paid || result?.status === 'SUCCESS' && result.invoice.status === 'PAID');
  return <>
    {(!paid || Boolean(session)) && Boolean(error) && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {waiting && <Text accessibilityLiveRegion="polite" style={styles.copy}>Đang chờ VNPay xác nhận. {paymentTimeLeft(result?.expiresAt || session?.expiresAt, now)}. Kết quả sẽ tự cập nhật khi bạn quay lại ứng dụng.</Text>}
    {reconciliation ? unresolved ? <>
      <Text accessibilityRole="alert" style={styles.error}>Khoản VNPay cần đối soát: {result?.reconciliation?.reconciliationCode}. {result?.reconciliation?.status === 'REFUND_REQUIRED' ? 'Đang chờ hoàn tiền và xác nhận kết quả.' : 'NestBox đang kiểm tra.'} Không thanh toán lại cho cùng khoản tiền này.</Text>
      {Boolean(result?.reconciliation?.resolutionNote) && <Text style={styles.copy}>{result?.reconciliation?.resolutionNote}</Text>}
    </> : <>
      <Text accessibilityLiveRegion="polite" style={styles.success}>Đã hoàn tất đối soát {result?.reconciliation?.reconciliationCode}.</Text>
      <Text style={styles.copy}>{result?.reconciliation?.resolutionNote || 'Kết quả xử lý đã được lưu. Vui lòng kiểm tra hóa đơn và lịch sử thanh toán.'}</Text>
      <Navigation title="Xem lịch sử thanh toán" path="/customer/payment-history" />
      <Button title="Đóng kết quả đối soát" variant="secondary" onPress={() => { setSession(undefined); setResult(undefined); setError(''); }} />
    </> : !paid && result?.status === 'FAILED' && <Text accessibilityRole="alert" style={styles.error}>{result.providerStatus === 'EXPIRED' ? 'Phiên thanh toán đã hết hạn.' : result.providerStatus === 'CANCELLED' ? 'Bạn đã hủy thanh toán VNPay.' : 'Chưa ghi nhận thanh toán thành công.'} {result.invoice.status === 'VOID' ? 'Hóa đơn đã hủy. Nếu đã bị trừ tiền, hãy gửi hỗ trợ.' : 'Kiểm tra hóa đơn trước khi thử lại; nếu đã bị trừ tiền, hãy gửi hỗ trợ.'}</Text>}
    {success && <><Text accessibilityLiveRegion="polite" style={styles.success}>Thanh toán đã được xác nhận.</Text><Navigation title={(result?.invoice.type || invoiceType) === 'INITIAL' ? 'Đặt lịch nhận kho' : (result?.invoice.type || invoiceType) === 'RENEWAL' ? 'Xem gia hạn và thời hạn mới' : 'Xem lịch sử thanh toán'} path={(result?.invoice.type || invoiceType) === 'INITIAL' ? '/customer/appointments' : (result?.invoice.type || invoiceType) === 'RENEWAL' ? '/customer/renewals' : '/customer/payment-history'} /></>}
    {!success && !reconciliation && (eligible || waiting) && <Button title={busy ? 'Đang mở VNPay…' : waiting ? 'Mở lại VNPay' : 'Thanh toán VNPay'} disabled={busy || !restored || waiting && !session?.paymentUrl || (!waiting && disabled)} onPress={() => void open()} />}
    {!success && !reconciliation && eligible && !waiting && <Button title="Thanh toán VNPay QR" variant="secondary" disabled={busy || !restored || disabled} onPress={() => void open(true)} />}
  </>;
}
