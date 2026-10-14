import { Redirect, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { destination } from '@/auth/routing';

export default function LoginScreen() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const passwordInput = useRef<TextInput>(null);
  if (user) return <Redirect href={destination(user.role)} />;

  const submit = async (submittedPassword = password) => {
    if (lock.current) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError('Vui lòng nhập email hợp lệ.'); return; }
    if (!submittedPassword.trim()) { setError('Vui lòng nhập mật khẩu.'); return; }
    lock.current = true;
    Keyboard.dismiss();
    setSubmitting(true);
    setError('');
    try {
      const loggedInUser = await login(normalizedEmail, submittedPassword);
      router.replace(destination(loggedInUser.role));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đăng nhập.');
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };

  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
      <View style={styles.brand}><Text style={styles.logo}>WDP</Text><Text style={styles.brandCaption}>STORAGE MOBILE</Text></View>
      <View style={styles.card}>
        <View style={styles.heading}><Text style={styles.eyebrow}>KHU VỰC VẬN HÀNH</Text><Text style={styles.title}>Đăng nhập</Text><Text style={styles.description}>Khách hàng, nhân viên, quản lý và quản trị viên sử dụng cùng tài khoản với hệ thống WDP trên web.</Text></View>
        <View style={styles.form}>
          <View style={styles.field}><Text style={styles.label}>Email</Text><TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} editable={!submitting} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" returnKeyType="next" submitBehavior="submit" onSubmitEditing={event => { setEmail(event.nativeEvent.text); passwordInput.current?.focus(); }} maxLength={254} placeholder="name@example.com" placeholderTextColor={WdpColors.muted} underlineColorAndroid="transparent" style={styles.input} /></View>
          <View style={styles.field}><Text style={styles.label}>Mật khẩu</Text><TextInput ref={passwordInput} accessibilityLabel="Mật khẩu" value={password} onChangeText={setPassword} editable={!submitting} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" returnKeyType="done" submitBehavior="submit" maxLength={128} onSubmitEditing={event => void submit(event.nativeEvent.text)} placeholder="Nhập mật khẩu" placeholderTextColor={WdpColors.muted} underlineColorAndroid="transparent" style={styles.input} /></View>
          {error ? <Text accessibilityRole="alert" selectable style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Đăng nhập" accessibilityState={{ disabled: submitting || !email.trim() || !password, busy: submitting }} disabled={submitting || !email.trim() || !password} onPress={() => void submit()} style={styles.submit}><Text style={styles.submitText}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</Text></Pressable>
        </View>
      </View>
      <Text style={styles.hint}>Nếu chạy trên điện thoại thật, hãy cấu hình EXPO_PUBLIC_API_URL bằng IP LAN của máy chạy Backend.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WdpColors.background },
  content: { flexGrow: 1, justifyContent: 'center', gap: WdpSpacing.lg, padding: WdpSpacing.lg },
  brand: { alignItems: 'center' },
  logo: { color: WdpColors.navy, fontSize: 42, fontWeight: '900', letterSpacing: -2 },
  brandCaption: { color: WdpColors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  card: { gap: WdpSpacing.lg, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 22, borderCurve: 'continuous', backgroundColor: WdpColors.surface, padding: WdpSpacing.lg, boxShadow: '0 18px 50px rgba(15, 23, 42, 0.10)' },
  heading: { gap: WdpSpacing.xs },
  eyebrow: { color: WdpColors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: WdpColors.navy, fontSize: 30, fontWeight: '900' },
  description: { color: WdpColors.muted, fontSize: 14, lineHeight: 21 },
  form: { gap: WdpSpacing.md, width: '100%' },
  field: { gap: WdpSpacing.xs },
  label: { color: WdpColors.text, fontSize: 13, fontWeight: '800' },
  input: { width: '100%', height: 50, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#F8FAFC', color: WdpColors.text, fontSize: 14 },
  error: { color: WdpColors.danger, fontSize: 13, lineHeight: 20 },
  submit: { width: '100%', height: 50, borderRadius: 12, backgroundColor: WdpColors.navy, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  hint: { color: WdpColors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
