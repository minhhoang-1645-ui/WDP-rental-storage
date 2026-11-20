import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { Button, Field, styles } from '@/operations/ui';
import { apiRequest } from '@/services/api';
import { useAuth } from '@/auth/use-auth';
import { destination } from '@/auth/routing';

export default function AccountAccess() {
  const params = useLocalSearchParams<{ mode?: string; email?: string }>();
  const register = params.mode === 'register';
  const title = register ? 'Đăng ký tài khoản' : 'Quên mật khẩu';
  const { login } = useAuth();
  const [email, setEmail] = useState(params.email ?? '');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);

  async function submit() {
    if (lock.current) return;
    const address = email.trim().toLowerCase();
    setMessage('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return setError('Vui lòng nhập email hợp lệ.');
    if (register && (!fullName.trim() || !phone.trim())) return setError('Vui lòng nhập họ tên và số điện thoại.');
    if (register && password.length < 8) return setError('Mật khẩu cần ít nhất 8 ký tự.');
    if (register && password !== confirm) return setError('Mật khẩu nhập lại chưa khớp.');
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<{ message?: string }>(register ? '/auth/register' : '/guest/account/forgot-password', {
        authenticated: false,
        method: 'POST',
        body: JSON.stringify(register ? { email: address, fullName: fullName.trim(), phone: phone.trim(), password } : { email: address }),
      });
      if (register) {
        try {
          const user = await login(address, password);
          router.replace(destination(user.role));
        } catch {
          setMessage('Tài khoản đã được tạo. Quay lại màn hình đăng nhập để tiếp tục.');
        }
      } else {
        setMessage(result.message || 'Nếu email đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể gửi yêu cầu. Vui lòng thử lại.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Stack.Screen options={{ title }} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      {!register && <Text style={styles.copy}>Nhập email tài khoản NestBox. Chúng tôi sẽ gửi liên kết để bạn đặt mật khẩu mới.</Text>}
      {register && <Field title="Họ và tên" value={fullName} onChange={setFullName} maxLength={120} disabled={busy} />}
      <Field title="Email" value={email} onChange={setEmail} keyboardType="email-address" autoComplete="email" maxLength={254} disabled={busy} />
      {register && <>
        <Field title="Số điện thoại" value={phone} onChange={setPhone} keyboardType="phone-pad" maxLength={20} disabled={busy} />
        <Field title="Mật khẩu (ít nhất 8 ký tự)" value={password} onChange={setPassword} secure autoComplete="new-password" maxLength={128} disabled={busy} />
        <Field title="Nhập lại mật khẩu" value={confirm} onChange={setConfirm} secure maxLength={128} disabled={busy} />
      </>}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{message}</Text> : null}
      {(!register || !message) && <Button title={busy ? 'Đang xử lý…' : register ? 'Đăng ký' : 'Gửi liên kết đặt lại mật khẩu'} disabled={busy} onPress={() => void submit()} />}
      <Button title="Về đăng nhập" variant="secondary" disabled={busy} onPress={() => router.canGoBack() ? router.back() : router.replace('/login')} />
    </ScrollView>
  </KeyboardAvoidingView>;
}
