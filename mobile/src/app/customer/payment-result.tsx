import { useCallback, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Check, Clock, Info } from 'lucide-react-native';
import { apiRequest } from '@/services/api';
import { notifyDataChanged } from '@/services/live-events';
import { Button } from '@/operations/ui';
import { formatDate, formatMoney } from '@/utils/format';

type Result = {
  status: 'SUCCESS' | 'FAILED' | 'PENDING'; providerStatus: string; amount: number;
  invoice: { id: string; invoiceCode: string; status: string; balanceDue: number };
  payment?: { amount: number; receivedAt: string; paymentCode: string } | null;
  reconciliation?: { status: string } | null;
};
const validId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,100}$/.test(value);

export default function PaymentResult() {
  const { transaction, invoiceId } = useLocalSearchParams<{ transaction?: string; invoiceId?: string }>();
  const contextValid = validId(transaction) && validId(invoiceId);
  const key = transaction + ':' + invoiceId;
  const [verified, setVerified] = useState<{ key: string; result: Result }>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [checking, setChecking] = useState(false);
  const result = verified?.key === key ? verified.result : undefined;
  useFocusEffect(useCallback(() => {
    if (!contextValid) return;
    const controller = new AbortController();
    let attempts = 0, active = false, terminal = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      if (active || terminal || controller.signal.aborted || AppState.currentState === 'background') return;
      active = true;
      attempts++;
      setChecking(true);
      try {
        const status = await apiRequest<Result>('/customer/online-payments/' + encodeURIComponent(transaction), { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (status.invoice.id !== invoiceId) { terminal = true; setError('Giao dịch không khớp với hóa đơn.'); return; }
        setVerified({ key, result: status });
        setError('');
        terminal = status.status !== 'PENDING' && (!status.reconciliation || status.reconciliation.status === 'RECONCILED');
        if (terminal) {
          notifyDataChanged('/customer/invoices');
          notifyDataChanged('/customer/payments');
        }
      } catch {
        if (!controller.signal.aborted) { terminal = true; setError('Chưa kiểm tra được giao dịch. Vui lòng thử lại.'); }
      } finally {
        active = false;
        if (!controller.signal.aborted) {
          const retry = !terminal && attempts < 12;
          setChecking(retry);
          if (retry) timer = setTimeout(() => void check(), 2500);
        }
      }
    };
    setError('');
    void check();
    const listener = AppState.addEventListener('change', state => {
      clearTimeout(timer);
      if (state === 'active') { attempts = 0; terminal = false; void check(); }
    });
    return () => { clearTimeout(timer); controller.abort(); listener.remove(); };
  }, [contextValid, transaction, invoiceId, key, revision]));
  const success = result?.status === 'SUCCESS' && Boolean(result.payment);
  const failed = result?.status === 'FAILED' || result?.status === 'SUCCESS' && !result.payment && result.reconciliation?.status === 'RECONCILED';
  const title = success ? 'Thanh toán thành công' : failed ? 'Thanh toán chưa hoàn tất' : checking ? 'Đang xác nhận thanh toán' : 'Chưa xác nhận thanh toán';
  const invoicePath = (contextValid ? '/customer/invoices/' + encodeURIComponent(invoiceId) : '/customer/invoices') as Href;
  return <ScrollView style={s.screen} contentContainerStyle={s.page}>
    <Stack.Screen options={{ title: 'Thanh toán hóa đơn', headerTitleAlign: 'center' }} />
    <View style={[s.icon, success && s.green]}>{success ? <Check size={32} color="#18773A" /> : failed ? <Info size={30} color="#0758DC" /> : <Clock size={30} color="#0758DC" />}</View>
    <Text accessibilityRole="header" style={[s.title, success && { color: '#18773A' }]}>{title}</Text>
    {checking && !success && !failed ? <ActivityIndicator color="#0758DC" /> : null}
    <Text style={s.copy}>{!contextValid ? 'Liên kết giao dịch chưa đầy đủ. Hãy kiểm tra trong mục hóa đơn.' : error || (success ? 'NestBox đã ghi nhận khoản thanh toán.' : failed ? (result?.providerStatus === 'CANCELLED' ? 'Bạn đã hủy phiên VNPay.' : result?.providerStatus === 'EXPIRED' ? 'Phiên thanh toán đã hết hạn.' : 'Giao dịch chưa được ghi nhận.') : result?.reconciliation ? 'NestBox đang đối chiếu giao dịch. Hãy theo dõi kết quả trước khi thanh toán lại.' : checking ? 'NestBox đang kiểm tra giao dịch. Vui lòng đợi trong giây lát.' : 'Bạn có thể kiểm tra lại hoặc trở về hóa đơn.')}</Text>
    {result ? <View style={s.card}>
      <Text style={s.label}>{result.invoice.invoiceCode}</Text>
      <Text style={s.amount}>{formatMoney(result.payment?.amount ?? result.amount)}</Text>
      <Text style={s.label}>VNPay</Text>
      {result.payment?.receivedAt ? <Text style={s.label}>{formatDate(result.payment.receivedAt, true)}</Text> : null}
      {result.payment?.paymentCode ? <Text selectable style={s.label}>{result.payment.paymentCode}</Text> : null}
      {success && result.invoice.status === 'PAID' ? <Text style={s.label}>Hóa đơn đã thanh toán</Text> :
        success && result.invoice.status === 'PARTIALLY_PAID' ? <Text style={s.label}>Đã trả một phần · Còn {formatMoney(result.invoice.balanceDue)}</Text> : null}
    </View> : null}
    {!success && contextValid ? <Button title="Kiểm tra lại" variant="secondary" onPress={() => setRevision(value => value + 1)} /> : null}
    <Button title={success ? 'Xem hóa đơn' : 'Trở về hóa đơn'} onPress={() => router.dismissTo(invoicePath)} />
    {success ? <Button title="Về trang chủ" variant="secondary" onPress={() => router.dismissTo('/customer')} /> : null}
  </ScrollView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' }, page: { padding: 18, gap: 13, maxWidth: 540, width: '100%', alignSelf: 'center' },
  icon: { alignSelf: 'center', width: 68, height: 68, marginTop: 12, borderRadius: 34, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' },
  green: { backgroundColor: '#E1F5E7' }, title: { fontSize: 21, color: '#121F36', fontWeight: '800', textAlign: 'center' },
  copy: { fontSize: 14, lineHeight: 20, textAlign: 'center', color: '#475467' }, card: { borderWidth: 1, borderColor: '#E3EAF5', borderRadius: 13, padding: 13, gap: 6 },
  amount: { fontSize: 26, fontWeight: '800', color: '#0758DC' }, label: { color: '#24334C', fontSize: 14 },
});
