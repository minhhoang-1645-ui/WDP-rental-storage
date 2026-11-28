import type { ComponentRef } from 'react';
import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { Check, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { destination } from '@/auth/routing';

export default function LoginScreen() {
  const { user, login } = useAuth();
  const { paymentTransaction, paymentInvoice } = useLocalSearchParams<{ paymentTransaction?: string; paymentInvoice?: string }>();
  const next = (role: Parameters<typeof destination>[0]): Href => role === 'STORAGE_CUSTOMER' &&
    typeof paymentTransaction === 'string' && /^[\w-]{1,100}$/.test(paymentTransaction) &&
    typeof paymentInvoice === 'string' && /^[\w-]{1,100}$/.test(paymentInvoice)
    ? { pathname: '/customer/payment-result', params: { transaction: paymentTransaction, invoiceId: paymentInvoice } }
    : destination(role);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  if (user) return <Redirect href={next(user.role)} />;

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
      const loggedInUser = await login(normalizedEmail, submittedPassword, rememberMe);
      router.replace(next(loggedInUser.role));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đăng nhập.');
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };

  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
      <View style={styles.brand}><View style={styles.wordmark}><View style={styles.brandMark}><Text style={styles.brandMarkText}>N</Text></View><Text style={styles.logo}>NestBox <Text style={styles.logoLight}>Storage</Text></Text></View><Text style={styles.brandCaption}>KHO TỰ QUẢN · MỘT CƠ SỞ</Text></View>
      <View style={styles.card}>
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>Chào mừng trở lại</Text><Text style={styles.description}>Đăng nhập để theo dõi kho thuê và công việc của bạn tại NestBox.</Text></View>
        <View style={styles.form}>
          <View style={styles.field}><Text style={styles.label}>Email</Text><View style={styles.inputRow}><Mail size={19} color={WdpColors.muted} /><TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} editable={!submitting} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" returnKeyType="next" submitBehavior="submit" onSubmitEditing={event => { setEmail(event.nativeEvent.text); passwordInput.current?.focus(); }} maxLength={254} placeholder="name@example.com" placeholderTextColor={WdpColors.muted} underlineColorAndroid="transparent" style={styles.input} /></View></View>
          <View style={styles.field}><Text style={styles.label}>Mật khẩu</Text><View style={styles.inputRow}><LockKeyhole size={19} color={WdpColors.muted} /><TextInput ref={passwordInput} accessibilityLabel="Mật khẩu" value={password} onChangeText={setPassword} editable={!submitting} secureTextEntry={!passwordVisible} clearTextOnFocus={false} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" returnKeyType="done" submitBehavior="submit" maxLength={128} onSubmitEditing={event => void submit(event.nativeEvent.text)} placeholder="Nhập mật khẩu" placeholderTextColor={WdpColors.muted} underlineColorAndroid="transparent" style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} disabled={submitting} onPress={() => setPasswordVisible(value => !value)} style={styles.eye}>{passwordVisible ? <EyeOff size={21} color={WdpColors.muted} /> : <Eye size={21} color={WdpColors.muted} />}</Pressable></View></View>
          <View style={styles.options}><Pressable accessibilityRole="checkbox" accessibilityLabel="Duy trì đăng nhập trong 30 ngày" accessibilityState={{ checked: rememberMe, disabled: submitting }} disabled={submitting} onPress={() => setRememberMe(value => !value)} style={styles.remember}>
            <View style={[styles.checkbox, rememberMe && styles.checked]}>{rememberMe && <Check size={14} color="white" />}</View><Text style={styles.rememberLabel}>Duy trì đăng nhập trong 30 ngày</Text>
          </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/account-access', params: { email: email.trim() } })} style={styles.eye}><Text style={styles.link}>Quên mật khẩu</Text></Pressable></View>
          {error ? <Text accessibilityRole="alert" selectable style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Đăng nhập" accessibilityState={{ disabled: submitting || !email.trim() || !password, busy: submitting }} disabled={submitting || !email.trim() || !password} onPress={() => void submit()} style={styles.submit}><Text style={styles.submitText}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</Text></Pressable>
        </View>
      </View>
      <Pressable accessibilityRole="button" style={styles.eye} onPress={() => router.push({ pathname: '/account-access', params: { mode: 'register' } })}><Text style={styles.link}>Chưa có tài khoản? Đăng ký</Text></Pressable>
      <Text style={styles.hint}>Dùng cùng tài khoản NestBox trên web và điện thoại. </Text>
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
  card: { width: "100%", maxWidth: 420, gap: 26 },
  heading: { gap: 10, alignItems: "center" },

  title: { textAlign: "center", color: WdpColors.text, fontSize: 29, fontWeight: '700', letterSpacing: -0.7 },
  description: { textAlign: "center", color: WdpColors.muted, fontSize: 14, lineHeight: 21 },
  form: { gap: WdpSpacing.md, width: '100%' },
  field: { gap: WdpSpacing.xs },
  options: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", columnGap: 12 },
  remember: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  rememberLabel: { fontSize: 13, color: WdpColors.text, flexShrink: 1 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: WdpColors.muted, alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: WdpColors.navy, borderColor: WdpColors.navy },
  eye: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  link: { color: WdpColors.navy, fontWeight: "700", fontSize: 13 },
  label: { color: WdpColors.text, fontSize: 13, fontWeight: '800' },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 14, paddingHorizontal: 14, backgroundColor: "#F7F9FC" },
  input: { flex: 1, minWidth: 0, minHeight: 50, color: WdpColors.text, fontSize: 16 },
  error: { color: WdpColors.danger, fontSize: 13, lineHeight: 20 },
  submit: { width: '100%', height: 50, borderRadius: 25, backgroundColor: WdpColors.navy, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  hint: { maxWidth: 390, color: WdpColors.muted, fontSize: 11, lineHeight: 18, textAlign: 'center' },
});
