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
      <View style={styles.brand}><View style={styles.wordmark}><View style={styles.brandMark}><Text style={styles.brandMarkText}>W</Text></View><Text style={styles.logo}>WDP <Text style={styles.logoLight}>Storage</Text></Text></View><Text style={styles.brandCaption}>KHO TỰ QUẢN · MỘT CƠ SỞ</Text></View>
      <View style={styles.card}>
        <View style={styles.heading}><Text style={styles.eyebrow}>KHÔNG GIAN VỪA VỚI BẠN</Text><Text style={styles.title}>Chào mừng trở lại</Text><Text style={styles.description}>Đăng nhập để theo dõi kho thuê và công việc của bạn tại WDP.</Text></View>
        <View style={styles.form}>
          <View style={styles.field}><Text style={styles.label}>Email</Text><TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} editable={!submitting} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" returnKeyType="next" submitBehavior="submit" onSubmitEditing={event => { setEmail(event.nativeEvent.text); passwordInput.current?.focus(); }} maxLength={254} placeholder="name@example.com" placeholderTextColor={WdpColors.muted} underlineColorAndroid="transparent" style={styles.input} /></View>
          <View style={styles.field}><Text style={styles.label}>Mật khẩu</Text><TextInput ref={passwordInput} accessibilityLabel="Mật khẩu" value={password} onChangeText={setPassword} editable={!submitting} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" returnKeyType="done" submitBehavior="submit" maxLength={128} onSubmitEditing={event => void submit(event.nativeEvent.text)} placeholder="Nhập mật khẩu" placeholderTextColor={WdpColors.muted} underlineColorAndroid="transparent" style={styles.input} /></View>
          {error ? <Text accessibilityRole="alert" selectable style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Đăng nhập" accessibilityState={{ disabled: submitting || !email.trim() || !password, busy: submitting }} disabled={submitting || !email.trim() || !password} onPress={() => void submit()} style={styles.submit}><Text style={styles.submitText}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</Text></Pressable>
        </View>
      </View>
      <Text style={styles.hint}>Dùng cùng tài khoản WDP trên web và điện thoại. Bạn sẽ được đưa đến đúng khu vực theo vai trò.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WdpColors.background },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 32, padding: WdpSpacing.lg, paddingVertical: 42 },
  brand: { alignItems: 'center', gap: 12 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: WdpColors.navy, justifyContent: 'center', alignItems: 'center' },
  brandMarkText: { color: 'white', fontSize: 23, fontWeight: '800' },
  logo: { color: WdpColors.navy, fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  logoLight: { fontWeight: '400' },
  brandCaption: { color: WdpColors.orange, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  card: { width: '100%', maxWidth: 480, gap: WdpSpacing.lg, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 24, borderCurve: 'continuous', backgroundColor: WdpColors.surface, padding: WdpSpacing.lg, boxShadow: '0 12px 40px rgba(32, 62, 81, 0.06)' },
  heading: { gap: WdpSpacing.xs },
  eyebrow: { color: WdpColors.orange, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  title: { color: WdpColors.navy, fontSize: 29, fontWeight: '700', letterSpacing: -0.7 },
  description: { color: WdpColors.muted, fontSize: 14, lineHeight: 21 },
  form: { gap: WdpSpacing.md, width: '100%' },
  field: { gap: WdpSpacing.xs },
  label: { color: WdpColors.text, fontSize: 13, fontWeight: '800' },
  input: { width: '100%', height: 52, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 14, paddingHorizontal: 14, backgroundColor: '#FBFCFC', color: WdpColors.text, fontSize: 14 },
  error: { color: WdpColors.danger, fontSize: 13, lineHeight: 20 },
  submit: { width: '100%', height: 50, borderRadius: 25, backgroundColor: WdpColors.navy, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  hint: { maxWidth: 390, color: WdpColors.muted, fontSize: 11, lineHeight: 18, textAlign: 'center' },
});
