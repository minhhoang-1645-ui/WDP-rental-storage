import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/auth/use-auth';
import { apiRequest, ApiError } from '@/services/api';
import type { AuthSession } from '@/types/api';
import { Button, Field, Panel, styles } from '@/operations/ui';
import { PageHeader } from '@/components/page-header';

const key = 'nestbox-guest-continuation';
const post = <T,>(path: string, body: unknown) => apiRequest<T>(path, { method: 'POST', authenticated: false, body: JSON.stringify(body) });
type Context = { email: string; existingAccount: boolean; bookingCode: string; storage: string; startDate: string; endDate: string; quantity: number };
export default function ContinueBooking() {
  const params = useLocalSearchParams<{ token?: string; continuationToken?: string; bookingCode?: string; resetToken?: string }>();
  const auth = useAuth();
  const [ready, setReady] = useState(false), [proof, setProof] = useState(''), [code, setCode] = useState(params.bookingCode ?? ''), [context, setContext] = useState<Context>();
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [recoveryEmail, setRecoveryEmail] = useState('');
  const lock = useRef(false), boot = useRef<Promise<void> | null>(null), attempted = useRef('');
  useEffect(() => {
    boot.current ??= (async () => {
      let saved: { token?: string; bookingCode?: string; expires?: number } = {};
      try { saved = JSON.parse(await SecureStore.getItemAsync(key) ?? '{}'); } catch { /* Invalid local context is discarded. */ }
      let token = params.continuationToken ?? (saved.expires && saved.expires > Date.now() ? saved.token : '') ?? '';
      let bookingCode = params.bookingCode ?? saved.bookingCode ?? '';
      if (params.token) {
        const result = await post<{ continuationToken: string; bookingCode: string }>('/guest/booking-requests/verify', { token: params.token }); token = result.continuationToken; bookingCode = result.bookingCode;
      }
      if (token) await SecureStore.setItemAsync(key, JSON.stringify({ token, bookingCode, expires: Date.now() + 30 * 60000 }));
      setProof(token); setCode(bookingCode);
      if (token) setContext(await post<Context>('/guest/account/context', { token }));
      router.setParams({ token: undefined, continuationToken: undefined }); setReady(true);
    })();
    boot.current.catch(caught => setError(caught.message));
  }, [params.token, params.continuationToken, params.bookingCode]);
  const claim = async () => {
    if (!code || auth.user?.role !== 'CUSTOMER' || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await apiRequest<{ reservationCode: string }>(`/customer/booking-requests/${encodeURIComponent(code)}/claim`, { method: 'POST', body: '{}' });
      await SecureStore.deleteItemAsync(key);
      router.replace(`/customer/reservations/${encodeURIComponent(result.reservationCode)}` as Href);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa nhận được yêu cầu.'); }
    finally { lock.current = false; setBusy(false); }
  };
  useEffect(() => { if (ready && !busy && !auth.loading && auth.user?.role === 'CUSTOMER' && code && attempted.current !== code) { attempted.current = code; void claim(); } }, [ready, busy, auth.loading, auth.user, code]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (params.resetToken) {
        const result = await post<{ message: string }>('/guest/account/reset-password', { token: params.resetToken, password, confirmPassword: confirm }); setMessage(result.message); await auth.logout(); router.setParams({ resetToken: undefined });
      } else if (context?.existingAccount) await auth.login(context.email, password);
      else {
        if (password !== confirm) throw new Error('Mật khẩu xác nhận không khớp.');
        await auth.acceptSession(await post<AuthSession>('/guest/account/setup', { token: proof, password, confirmPassword: confirm }));
        setContext(previous => previous ? { ...previous, existingAccount: true } : previous);
      }
      setPassword(''); setConfirm('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa thể tiếp tục.'); if (caught instanceof ApiError && caught.status === 409) setContext(previous => previous ? { ...previous, existingAccount: true } : previous); }
    finally { lock.current = false; setBusy(false); }
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}><PageHeader eyebrow="Đặt kho" title={params.resetToken ? 'Đặt lại mật khẩu' : 'Tiếp tục đặt kho'} description="Xác minh email, tạo mật khẩu hoặc đăng nhập để nhận yêu cầu. Chưa giữ kho trước khi hệ thống xác nhận." />
    {context && <Panel title={context.storage}><Text style={styles.copy}>{context.quantity} kho · {context.startDate} – {context.endDate}</Text><Text style={styles.copy}>Chưa giữ kho. Hệ thống kiểm tra lại giá và khả dụng.</Text></Panel>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{message ? <Text style={styles.success}>{message}</Text> : null}
    {auth.user && !params.resetToken ? <><Text style={styles.copy}>{auth.user.email}</Text><Button title="Tiếp tục nhận yêu cầu" disabled={busy || auth.user.role !== 'CUSTOMER'} onPress={() => void claim()} /><Button title="Dùng tài khoản khác" variant="secondary" onPress={() => void auth.logout()} /></> : context || params.resetToken ? <Panel title={params.resetToken ? 'Mật khẩu mới' : context?.existingAccount ? 'Đăng nhập' : 'Tạo mật khẩu'}>
      {context && <Field title="Email đã xác minh" value={context.email} disabled onChange={() => undefined} />}
      <Field title="Mật khẩu" secure value={password} onChange={setPassword} maxLength={128} />
      {(!context?.existingAccount || params.resetToken) && <Field title="Xác nhận mật khẩu" secure value={confirm} onChange={setConfirm} maxLength={128} />}
      <Button title={busy ? 'Đang xử lý…' : 'Tiếp tục'} disabled={busy} onPress={() => void submit()} />
      {context?.existingAccount && <Button title="Quên mật khẩu" variant="secondary" disabled={busy} onPress={() => { setBusy(true); post<{ message: string }>('/guest/account/forgot-password', { email: context.email }).then(value => setMessage(value.message)).catch(caught => setError(caught.message)).finally(() => setBusy(false)); }} />}
    </Panel> : <Text style={styles.copy}>Mở liên kết xác minh từ email hoặc hoàn tất tạo tài khoản trên web, rồi tiếp tục với cùng email trên điện thoại.</Text>}
    {!context && !auth.user && <Panel title="Đăng nhập / Khôi phục tài khoản"><Field title="Email" value={recoveryEmail} onChange={setRecoveryEmail} /><Field title="Mật khẩu đăng nhập" secure value={password} onChange={setPassword} /><Button title="Đăng nhập để tiếp tục" disabled={busy} onPress={() => { setBusy(true); auth.login(recoveryEmail, password).catch(caught => setError(caught.message)).finally(() => setBusy(false)); }} /><Button title="Gửi email đặt lại mật khẩu" disabled={busy} onPress={() => { setBusy(true); post<{ message: string }>('/guest/account/forgot-password', { email: recoveryEmail }).then(value => setMessage(value.message)).catch(caught => setError(caught.message)).finally(() => setBusy(false)); }} /></Panel>}
    {!auth.user && code && <Button title="Gửi lại email xác minh" disabled={busy} variant="secondary" onPress={() => { setBusy(true); post<{ message: string }>('/guest/account/resend', { bookingCode: code, email: context?.email || recoveryEmail }).then(value => setMessage(value.message)).catch(caught => setError(caught.message)).finally(() => setBusy(false)); }} />}
    <Button title="Xem kho khác" variant="secondary" onPress={() => router.push('/customer/discover')} />
  </ScrollView>;
}
